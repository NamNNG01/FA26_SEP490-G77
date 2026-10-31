package com.examprep.services;

import com.examprep.dto.AiFlashcardDtos;
import com.examprep.dto.AiFlashcardDtos.GenerateAccepted;
import com.examprep.dto.AiFlashcardDtos.GenerationDetail;
import com.examprep.dto.AiFlashcardDtos.UsageInfo;
import com.examprep.dto.ResponseCode;
import com.examprep.entities.AiUsageLog;
import com.examprep.entities.Course;
import com.examprep.entities.Document;
import com.examprep.entities.Enrollment;
import com.examprep.entities.User;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.BaseException;
import com.examprep.repositories.AiUsageLogRepository;
import com.examprep.repositories.CourseRepository;
import com.examprep.repositories.DocumentRepository;
import com.examprep.repositories.EnrollmentRepository;
import com.examprep.repositories.UserRepository;
import com.examprep.security.UserPrincipal;
import com.examprep.services.contest.ContestRules;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * API 31: turn one text or uploaded file into a queued flashcard generation.
 *
 * <p>Validation and content extraction run outside any transaction; the quota reservation and both
 * rows (documents + ai_usage_logs) are written in one short transaction, exactly like the MQ-03
 * quiz flow. The worker is only dispatched after that transaction returns (committed), so it can
 * never see a half-written job.</p>
 */
@Service
@RequiredArgsConstructor
public class AiFlashcardServiceImpl implements AiFlashcardService {
    private static final Set<String> EXTENSIONS = Set.of("pdf", "docx", "txt");
    private static final Set<String> LANGUAGES = Set.of("AUTO", "VI", "EN");
    private static final Set<String> STYLES = Set.of("QA", "TERM_DEFINITION");
    private static final int MAX_FILE_BYTES = 10 * 1024 * 1024;
    private static final int MAX_CONTENT_CHARS = 20_000;
    private static final int MAX_FOCUS_TOPIC_CHARS = 200;
    private static final int DEFAULT_CARDS = 20;
    private static final int TITLE_CHARS = 255;
    private static final String PURPOSE = "FLASHCARD_GENERATE";
    private static final String STATUS_PENDING = "PENDING";
    private static final String STATUS_PROCESSING = "PROCESSING";

    private final DocumentRepository documents;
    private final CourseRepository courses;
    private final EnrollmentRepository enrollments;
    private final AiUsageLogRepository logs;
    private final UserRepository users;
    private final AiQuotaService quota;
    private final MaterialTextReader reader;
    private final FlashcardGenerationWorker worker;
    private final ObjectMapper json;
    private final PlatformTransactionManager transactionManager;

    /** Per-user sliding one-minute window; in memory, so per app instance (same trade-off as SE-01/SE-02). */
    private final Map<String, Deque<Long>> calls = new ConcurrentHashMap<>();

    @Value("${app.ai.flashcard.rate-per-minute:5}") private int ratePerMinute;
    @Value("${app.ai.flashcard.min-content-chars:20}") private int minContentChars;
    @Value("${app.ai.flashcard.max-cards:50}") private int maxCards;
    @Value("${app.ai.flashcard.output-budget-per-card:120}") private int outputBudgetPerCard;

    // ---------------------------------------------------------------- API 31

    @Override
    public GenerateAccepted generate(UserPrincipal user, MultipartFile file, String text, Integer numberOfCards,
            String language, String style, String focusTopic, Long courseId) {
        Long userId = user.getId();
        // 1. Rate limit first: every call counts, whatever else is wrong with it.
        throttle(userId);

        // 2. Exactly one input.
        boolean hasFile = file != null && !file.isEmpty();
        boolean hasText = text != null && !text.isBlank();
        if (hasFile && hasText) {
            throw ContestRules.error(ResponseCode.BAD_REQUEST, "INPUT_CONFLICT", "Chỉ được truyền text hoặc file, không truyền cả hai");
        }
        if (!hasFile && !hasText) {
            throw ContestRules.error(ResponseCode.BAD_REQUEST, "INPUT_REQUIRED", "Cần truyền text hoặc file");
        }

        // 3. File extension and size.
        String fileName = hasFile ? originalName(file) : null;
        if (hasFile) validateFile(file, fileName);

        // 4. Generation options.
        int cards = numberOfCards == null ? DEFAULT_CARDS : numberOfCards;
        if (cards < 1 || cards > maxCards) {
            throw ContestRules.invalid("numberOfCards", "numberOfCards phải từ 1 đến " + maxCards);
        }
        String lang = language == null ? "AUTO" : language.strip().toUpperCase(Locale.ROOT);
        if (!LANGUAGES.contains(lang)) throw ContestRules.invalid("language", "language phải là AUTO, VI hoặc EN");
        String cardStyle = style == null ? "QA" : style.strip().toUpperCase(Locale.ROOT);
        if (!STYLES.contains(cardStyle)) throw ContestRules.invalid("style", "style phải là QA hoặc TERM_DEFINITION");
        String focus = focusTopic == null ? "" : focusTopic.strip();
        if (focus.length() > MAX_FOCUS_TOPIC_CHARS) {
            throw ContestRules.invalid("focusTopic", "focusTopic tối đa " + MAX_FOCUS_TOPIC_CHARS + " ký tự");
        }

        // 5. Optional course: it must exist and the caller must be allowed to use it.
        Course course = courseId == null ? null : requireCourse(courseId, user);

        // 6. Content extraction + size checks.
        String content = (hasFile ? extract(file, fileName) : text).strip();
        if (content.length() < minContentChars) {
            throw ContestRules.error(ResponseCode.UNPROCESSABLE_VALIDATION_ERROR, "EMPTY_CONTENT", "Nội dung quá ngắn");
        }
        if (content.length() > MAX_CONTENT_CHARS) {
            throw ContestRules.error(ResponseCode.UNPROCESSABLE_VALIDATION_ERROR, "CONTENT_TOO_LONG",
                    "Nội dung tối đa " + MAX_CONTENT_CHARS + " ký tự");
        }

        String title = clip(hasFile ? fileName : "AI text input", TITLE_CHARS);
        Integer fileSizeKb = hasFile ? (int) ((file.getSize() + 1023) / 1024) : null;
        String clippedName = fileName == null ? null : clip(fileName, TITLE_CHARS);

        // 7. One short transaction: quota reservation + documents row + job row.
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        GenerateAccepted accepted = tx.execute(status -> {
            quota.lock(userId);
            AiQuotaService.Snapshot snapshot = quota.snapshot(userId);
            long estimate = AiQuotaService.estimate(content.length(), cards * outputBudgetPerCard + 500);
            List<String> source = quota.allocate(snapshot, List.of(estimate));
            if (source == null) {
                throw new BaseException(ResponseCode.FLASHCARD_QUOTA_EXCEEDED, "Not enough AI quota", Map.of(
                        "code", "AI_QUOTA_EXCEEDED",
                        "estimatedTokens", estimate,
                        "tokenRemaining", snapshot.available(),
                        "tokenLimit", snapshot.planName() != null ? snapshot.planLimit() : snapshot.freeLimit()));
            }
            User owner = users.getReferenceById(userId);
            Document document = documents.save(Document.builder()
                    .user(owner)
                    .generationType("FLASHCARD")
                    .status("COMPLETED")
                    .extractedContent(content)
                    .title(title)
                    .fileName(clippedName)
                    .fileSizeKb(fileSizeKb)
                    .createdAt(Instant.now())
                    .build());
            AiUsageLog job = logs.save(AiUsageLog.builder()
                    .user(owner)
                    .course(course)
                    .purpose(PURPOSE)
                    .status(STATUS_PENDING)
                    .reservedTokens((int) estimate)
                    .billingSource(source.get(0))
                    .questionCount(cards)
                    // request_params is the designated carrier of the document link (no column for it).
                    .requestParams(requestParams(cards, lang, cardStyle, focus, hasFile, clippedName, document.getDocId()))
                    .build());
            return new GenerateAccepted(job.getLogId(), STATUS_PENDING, (int) estimate);
        });
        // The reservation is committed: the worker can now claim the job row.
        worker.dispatch(accepted.generationId());
        return accepted;
    }

    // ---------------------------------------------------------------- API 32/33 (Task 10/11)

    @Override
    public GenerationDetail generation(Long userId, Long generationId) {
        // Ownership is part of the lookup: a foreign job is indistinguishable from a missing one (404).
        AiUsageLog job = logs.findByLogIdAndUserUserId(generationId, userId)
                .orElseThrow(() -> ContestRules.error(ResponseCode.FLASHCARD_GENERATION_NOT_FOUND,
                        "GENERATION_NOT_FOUND", "Không tìm thấy lượt tạo flashcard"));
        if (!PURPOSE.equals(job.getPurpose())) {
            // A log id of another AI purpose is not a generation, even when the caller owns it.
            throw ContestRules.error(ResponseCode.FLASHCARD_GENERATION_NOT_FOUND,
                    "GENERATION_NOT_FOUND", "Không tìm thấy lượt tạo flashcard");
        }
        boolean saved = job.getSavedAt() != null;
        String status = job.getStatus();

        if (STATUS_PENDING.equals(status) || STATUS_PROCESSING.equals(status)) {
            return new GenerationDetail(generationId, status, null, null, saved, null, null);
        }
        if (!"SUCCESS".equals(status) && !"PARTIAL".equals(status)) {
            // FAILED/TIMEOUT: the reserve was refunded; error_message holds the API 32 machine code.
            return new GenerationDetail(generationId, "FAILED", List.of(), null, saved, errorCode(job.getErrorMessage()), null);
        }
        // House status SUCCESS maps to the spec's COMPLETED.
        long remaining = quota.snapshot(userId).available();
        return new GenerationDetail(generationId, "COMPLETED", cards(job.getResult()),
                new AiFlashcardDtos.GenerationUsage(job.getInputTokens(), job.getOutputTokens(), remaining),
                saved, null, null);
    }

    /** Result JSON → cards; a malformed/absent payload degrades to an empty list instead of a 500. */
    private List<AiFlashcardDtos.GenerationCard> cards(String result) {
        if (result == null || result.isBlank()) {
            return List.of();
        }
        try {
            JsonNode root = json.readTree(result);
            List<AiFlashcardDtos.GenerationCard> cards = new ArrayList<>();
            for (JsonNode row : root.path("cards")) {
                String tempId = row.path("tempId").asText("");
                cards.add(new AiFlashcardDtos.GenerationCard(
                        tempId.isBlank() ? "c" + (cards.size() + 1) : tempId,
                        row.path("frontText").asText(""),
                        row.path("backText").asText("")));
            }
            return cards;
        } catch (JsonProcessingException ex) {
            return List.of();
        }
    }

    /** A sweep-failed reservation is reported as a timeout; anything unexpected is a provider error. */
    private static String errorCode(String errorMessage) {
        if ("AI_TIMEOUT".equals(errorMessage) || "TIMEOUT".equals(errorMessage)
                || "RESERVATION_EXPIRED".equals(errorMessage)) {
            return "AI_TIMEOUT";
        }
        return "AI_INVALID_OUTPUT".equals(errorMessage) ? "AI_INVALID_OUTPUT" : "AI_PROVIDER_ERROR";
    }

    /**
     * API 33: one quota window, the one currently enforced. A student with an ACTIVE plan is billed
     * against the plan pool (period = the subscription window); everybody else against the daily FREE
     * allowance (period = today in the house zone up to {@code freeResetAt}, deviation log #2). The DB
     * keeps FREE/PLAN (D1); only this DTO renames them to FREE_QUOTA/SUBSCRIPTION.
     */
    @Override
    public UsageInfo usage(Long userId) {
        AiQuotaService.Snapshot snapshot = quota.snapshot(userId);
        if (snapshot.planName() != null) {
            return new UsageInfo("SUBSCRIPTION", snapshot.planName(), snapshot.planLimit(), snapshot.planUsed(),
                    snapshot.planReserved(), snapshot.planRemaining(), snapshot.planStart(), snapshot.planEnd());
        }
        // The FREE window is the daily one the reservation actually enforces: [today 00:00, freeResetAt).
        Instant periodStart = LocalDate.now(AiQuotaService.ZONE).atStartOfDay(AiQuotaService.ZONE).toInstant();
        return new UsageInfo("FREE_QUOTA", null, snapshot.freeLimit(), snapshot.freeUsed(), snapshot.freeReserved(),
                snapshot.freeRemaining(), periodStart, snapshot.freeResetAt());
    }

    // ---------------------------------------------------------------- validation

    private void validateFile(MultipartFile file, String fileName) {
        int dot = fileName.lastIndexOf('.');
        String extension = dot >= 0 ? fileName.substring(dot + 1).toLowerCase(Locale.ROOT) : "";
        if (!EXTENSIONS.contains(extension)) {
            throw ContestRules.error(ResponseCode.FLASHCARD_UNSUPPORTED_FILE_TYPE, "UNSUPPORTED_FILE_TYPE",
                    "Chỉ hỗ trợ tệp PDF, DOCX và TXT");
        }
        if (file.getSize() > MAX_FILE_BYTES) {
            throw ContestRules.error(ResponseCode.PAYLOAD_TOO_LARGE, "FILE_TOO_LARGE", "Tệp tối đa 10MB");
        }
    }

    /** STUDENT needs an ACTIVE enrollment; COURSE_MANAGER must own (or co-manage) the course. */
    private Course requireCourse(Long courseId, UserPrincipal user) {
        if (!courses.existsById(courseId)) {
            throw ContestRules.error(ResponseCode.RESOURCE_NOT_FOUND, "COURSE_NOT_FOUND", "Không tìm thấy khoá học");
        }
        boolean allowed = User.ROLE_STUDENT.equals(user.getRole())
                ? enrollments.existsByCourse_CourseIdAndUser_UserIdAndStatus(courseId, user.getId(), Enrollment.STATUS_ACTIVE)
                : courses.countOwnedCourse(courseId, user.getId()) > 0;
        if (!allowed) {
            throw ContestRules.error(ResponseCode.FORBIDDEN, "FORBIDDEN_COURSE", "Bạn không có quyền dùng khoá học này");
        }
        return courses.getReferenceById(courseId);
    }

    /** A PDF without a text layer and any other unreadable file both map to 422, with distinct codes. */
    private String extract(MultipartFile file, String fileName) {
        try {
            return reader.read(fileName, file.getBytes());
        } catch (BadRequestException ex) {
            if (fileName.toLowerCase(Locale.ROOT).endsWith(".pdf")) {
                throw ContestRules.error(ResponseCode.UNPROCESSABLE_VALIDATION_ERROR, "PDF_NO_TEXT_LAYER",
                        "PDF không có lớp văn bản để đọc");
            }
            throw ContestRules.error(ResponseCode.UNPROCESSABLE_VALIDATION_ERROR, "EMPTY_CONTENT",
                    "Không đọc được nội dung tệp");
        } catch (IOException ex) {
            throw ContestRules.error(ResponseCode.UNPROCESSABLE_VALIDATION_ERROR, "EMPTY_CONTENT",
                    "Không đọc được nội dung tệp");
        }
    }

    private String requestParams(int cards, String language, String style, String focus, boolean hasFile, String fileName,
            Long docId) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("numberOfCards", cards);
        params.put("language", language);
        params.put("style", style);
        params.put("focusTopic", focus);
        params.put("inputType", hasFile ? "FILE" : "TEXT");
        params.put("fileName", hasFile ? fileName : "");
        params.put("docId", docId);
        try {
            return json.writeValueAsString(params);
        } catch (JsonProcessingException ex) {
            throw new BaseException(ResponseCode.INTERNAL_SERVER_ERROR, "Flashcard request could not be encoded");
        }
    }

    // ---------------------------------------------------------------- shared

    /** Per-user sliding one-minute window. ponytail: in memory, so per app instance; move to Redis if we scale out. */
    private void throttle(Long userId) {
        long now = System.currentTimeMillis();
        Deque<Long> window = calls.computeIfAbsent("FC:" + userId, k -> new ArrayDeque<>());
        synchronized (window) {
            while (!window.isEmpty() && now - window.peekFirst() >= 60_000) window.pollFirst();
            if (window.size() >= ratePerMinute) {
                throw ContestRules.error(ResponseCode.FLASHCARD_RATE_LIMITED, "RATE_LIMITED",
                        "Too many generation requests. Try again in a minute.");
            }
            window.addLast(now);
        }
    }

    private static String originalName(MultipartFile file) {
        return file.getOriginalFilename() == null ? "" : file.getOriginalFilename();
    }

    private static String clip(String value, int max) {
        return value.length() <= max ? value : value.substring(0, max);
    }
}
