package com.examprep.services;

import com.examprep.dto.PageResponse;
import com.examprep.dto.ResponseCode;
import com.examprep.dto.attempt.AttemptResponses;
import com.examprep.dto.student.MaterialRequests;
import com.examprep.dto.student.MaterialResponses;
import com.examprep.dto.student.MaterialResponses.CourseLink;
import com.examprep.dto.student.MaterialResponses.DocumentItem;
import com.examprep.dto.student.MaterialResponses.HistoryItem;
import com.examprep.dto.student.MaterialResponses.JobAccepted;
import com.examprep.dto.student.MaterialResponses.JobBrief;
import com.examprep.dto.student.MaterialResponses.JobState;
import com.examprep.dto.student.MaterialResponses.Lookup;
import com.examprep.dto.student.MaterialResponses.Started;
import com.examprep.dto.student.MaterialResponses.StartedOption;
import com.examprep.dto.student.MaterialResponses.StartedQuestion;
import com.examprep.dto.student.MaterialResponses.Uploaded;
import com.examprep.entities.AiUsageLog;
import com.examprep.entities.Course;
import com.examprep.entities.Document;
import com.examprep.entities.Enrollment;
import com.examprep.entities.ExamAttempt;
import com.examprep.entities.QuizGenerationJob;
import com.examprep.entities.User;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.BaseException;
import com.examprep.exceptions.ForbiddenException;
import com.examprep.exceptions.ResourceConflictException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.AiUsageLogRepository;
import com.examprep.repositories.CourseRepository;
import com.examprep.repositories.DocumentRepository;
import com.examprep.repositories.EnrollmentRepository;
import com.examprep.repositories.ExamAttemptRepository;
import com.examprep.repositories.QuestionRepository;
import com.examprep.repositories.QuizGenerationJobRepository;
import com.examprep.repositories.UserRepository;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * MQ-01 … MQ-06 (spec 13): material upload and the asynchronous material → quiz pipeline.
 *
 * <p>One file is one {@code documents} row per student, identified by the SHA-256 of its bytes.
 * The row is attached to one or more courses through {@code document_courses}; uploading the same
 * file again only links the requested course instead of storing a second copy.</p>
 *
 * <p>{@code generateQuiz} deliberately uses a programmatic transaction (spec 13.3): the reservation
 * and the job row commit first, the worker is dispatched afterwards, and the AI call therefore never
 * runs inside a transaction.</p>
 */
@Service
@RequiredArgsConstructor
public class StudentMaterialServiceImpl implements StudentMaterialService {
    private static final int MAX_BYTES = 20 * 1024 * 1024;
    private static final int MAX_PAGE_SIZE = 100;
    private static final int OUTPUT_BUDGET = 500;
    private static final String STATUS_IN_PROGRESS = "IN_PROGRESS";
    private static final String MODE_MATERIAL_QUIZ = "MATERIAL_QUIZ";
    private static final Pattern SHA256_HEX = Pattern.compile("[0-9a-f]{64}");

    private final DocumentRepository documents;
    private final EnrollmentRepository enrollments;
    private final CourseRepository courses;
    private final UserRepository users;
    private final QuizGenerationJobRepository jobs;
    private final ExamAttemptRepository attempts;
    private final AiUsageLogRepository logs;
    private final QuestionRepository questions;
    private final StudentAttemptService attemptService;
    private final MaterialTextReader reader;
    private final MaterialStorage storage;
    private final AiQuotaService quota;
    private final QuizGenerationWorker worker;
    private final PlatformTransactionManager transactionManager;
    private final EntityManager entityManager;

    // ----------------------------------------------------------------------------------
    // MQ-01
    // ----------------------------------------------------------------------------------

    @Override
    public Uploaded upload(Long userId, String fileName, byte[] bytes, Long courseId, String title) {
        if (fileName == null || fileName.isBlank()) {
            throw new BadRequestException("file is required");
        }
        String lower = fileName.toLowerCase(Locale.ROOT);
        if (!lower.endsWith(".pdf") && !lower.endsWith(".docx")) {
            throw new BaseException(ResponseCode.UNSUPPORTED_FILE_TYPE, "Only PDF and DOCX files are supported");
        }
        if (bytes == null || bytes.length == 0) {
            throw new BadRequestException("File must contain data");
        }
        if (bytes.length > MAX_BYTES) {
            throw new BaseException(ResponseCode.FILE_TOO_LARGE, "Material must not exceed 20MB");
        }
        // Checked before the file is read or stored: an unknown course is a 404, another course a 403.
        requireEnrolledCourse(userId, courseId);
        String sha256 = sha256(bytes);
        Uploaded existing = attachExisting(userId, sha256, courseId);
        if (existing != null) {
            return existing;
        }

        String text = reader.read(fileName, bytes);
        Integer pageCount = reader.pageCount(fileName, bytes);
        String cleanTitle = title == null || title.isBlank() ? fileName : title.strip();
        if (cleanTitle.length() > 255) {
            cleanTitle = cleanTitle.substring(0, 255);
        }
        String cleanFileName = fileName.length() > 255 ? fileName.substring(fileName.length() - 255) : fileName;
        String publicId = storage.newPublicId(userId, fileName);
        // Storage is an external call: it runs before the transaction, never inside it (spec 0.3 rule 4).
        String fileUrl = storage.store(publicId, fileName, bytes);
        String storedTitle = cleanTitle;
        String storedFileName = cleanFileName;
        Uploaded uploaded;
        try {
            uploaded = new TransactionTemplate(transactionManager).execute(status -> {
                Course course = requireEnrolledCourse(userId, courseId);
                // Two uploads of the same file may race past the check above; the unique index decides.
                Optional<Document> concurrent = documents.findByUserUserIdAndSha256(userId, sha256);
                if (concurrent.isPresent()) {
                    Document document = concurrent.get();
                    document.getCourses().add(course);
                    documents.save(document);
                    return uploadedView(document, true);
                }
                User student = users.findById(userId)
                        .orElseThrow(() -> new ResourceNotFoundException("User not found"));
                Document document = Document.builder()
                        .user(student)
                        .courses(new LinkedHashSet<>(Set.of(course)))
                        .generationType("MATERIAL")
                        .extractedContent(text)
                        .status("UPLOADED")
                        .title(storedTitle)
                        .fileName(storedFileName)
                        .fileUrl(fileUrl)
                        .fileSizeKb((bytes.length + 1023) / 1024)
                        .pageCount(pageCount)
                        .sha256(sha256)
                        .storageKey(publicId)
                        .createdAt(Instant.now())
                        .build();
                documents.save(document);
                return uploadedView(document, false);
            });
        } catch (DataIntegrityViolationException ex) {
            // Another request stored the same file between our check and this insert.
            storage.delete(publicId);
            Uploaded raced = attachExisting(userId, sha256, courseId);
            if (raced != null) {
                return raced;
            }
            throw ex;
        } catch (RuntimeException ex) {
            // The file was stored outside the transaction; without a documents row it is an orphan.
            storage.delete(publicId);
            throw ex;
        }
        if (uploaded == null) {
            throw new BaseException(ResponseCode.INTERNAL_SERVER_ERROR, "Material could not be saved");
        }
        if (Boolean.TRUE.equals(uploaded.duplicate())) {
            // A concurrent upload of the same content won the insert: the copy stored above is unused.
            storage.delete(publicId);
        }
        return uploaded;
    }

    /** Attaches the course to a material with the same content, or returns null when none exists. */
    private Uploaded attachExisting(Long userId, String sha256, Long courseId) {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        try {
            return tx.execute(status -> {
                Document document = documents.findByUserUserIdAndSha256(userId, sha256).orElse(null);
                if (document == null) {
                    return null;
                }
                Course course = requireEnrolledCourse(userId, courseId);
                document.getCourses().add(course);
                documents.save(document);
                return uploadedView(document, true);
            });
        } catch (DataIntegrityViolationException ex) {
            // A concurrent request linked the same (material, course) pair first.
            return tx.execute(status -> documents.findByUserUserIdAndSha256(userId, sha256)
                    .map(document -> uploadedView(document, true))
                    .orElse(null));
        }
    }

    private Uploaded uploadedView(Document document, boolean duplicate) {
        List<Long> courseIds = document.getCourses().stream()
                .map(Course::getCourseId)
                .sorted()
                .toList();
        return new Uploaded(document.getDocId(), document.getFileName(), document.getPageCount(),
                document.getTitle(), duplicate, courseIds);
    }

    // ----------------------------------------------------------------------------------
    // MQ-02
    // ----------------------------------------------------------------------------------

    @Override
    @Transactional(readOnly = true)
    public PageResponse<DocumentItem> list(Long userId, Long courseId, int page, int size) {
        validatePage(page, size);
        Page<Document> result = courseId == null
                ? documents.findByUserUserIdOrderByCreatedAtDesc(userId, PageRequest.of(page, size))
                : documents.findByUserUserIdAndCoursesCourseIdOrderByCreatedAtDesc(userId, courseId,
                        PageRequest.of(page, size));
        List<Long> docIds = result.getContent().stream().map(Document::getDocId).toList();
        Map<Long, List<JobBrief>> jobsByDoc = docIds.isEmpty() ? Map.of()
                : jobs.findByUserUserIdAndDocumentDocIdInOrderByCreatedAtDesc(userId, docIds).stream()
                .collect(Collectors.groupingBy(
                        job -> job.getDocument().getDocId(),
                        Collectors.mapping(job -> new JobBrief(job.getJobId(), job.getQuestionCount(),
                                job.getStatus(), job.getCourse() == null ? null : job.getCourse().getCourseId()),
                                Collectors.toList())));
        List<DocumentItem> items = result.getContent().stream()
                .map(document -> new DocumentItem(document.getDocId(), document.getTitle(),
                        document.getFileName(), document.getPageCount(), document.getCreatedAt(),
                        jobsByDoc.getOrDefault(document.getDocId(), List.of()),
                        courseLinks(document)))
                .toList();
        return PageResponse.of(result, items);
    }

    // ----------------------------------------------------------------------------------
    // lookup / attach course / delete
    // ----------------------------------------------------------------------------------

    @Override
    @Transactional(readOnly = true)
    public Lookup lookup(Long userId, String sha256) {
        String normalized = normalizeSha256(sha256);
        Document document = documents.findByUserUserIdAndSha256(userId, normalized)
                .orElseThrow(() -> new ResourceNotFoundException("Material not found"));
        return lookupView(document);
    }

    @Override
    public Lookup attachCourse(Long userId, Long documentId, Long courseId) {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        try {
            return tx.execute(status -> {
                Document document = documents.findOwned(documentId, userId)
                        .orElseThrow(() -> new ResourceNotFoundException("Material not found"));
                Course course = requireEnrolledCourse(userId, courseId);
                // Adding an existing element is a no-op, so a repeated call stays idempotent.
                document.getCourses().add(course);
                documents.save(document);
                return lookupView(document);
            });
        } catch (DataIntegrityViolationException ex) {
            // A concurrent call inserted the same (document, course) row first.
            return tx.execute(status -> documents.findOwned(documentId, userId)
                    .map(this::lookupView)
                    .orElseThrow(() -> new ResourceNotFoundException("Material not found")));
        }
    }

    @Override
    public void delete(Long userId, Long documentId) {
        String storageKey = new TransactionTemplate(transactionManager).execute(status -> {
            Document document = documents.findOwned(documentId, userId)
                    .orElseThrow(() -> new ResourceNotFoundException("Material not found"));
            if (jobs.existsByUserUserIdAndDocumentDocIdAndStatusIn(userId, documentId,
                    List.of(QuizGenerationWorker.STATUS_PENDING, QuizGenerationWorker.STATUS_PROCESSING))) {
                throw new ResourceConflictException("A quiz is being generated from this material");
            }
            // Questions stay (their exams remain readable), they only stop pointing at the material.
            questions.clearSourceDocument(documentId);
            jobs.deleteByDocumentDocId(documentId);
            documents.delete(document);
            // Flush now so a foreign-key failure surfaces here, inside the transaction.
            documents.flush();
            return document.getStorageKey();
        });
        // Best effort and outside the transaction: the row is already gone.
        storage.delete(storageKey);
    }

    private Lookup lookupView(Document document) {
        return new Lookup(document.getDocId(), document.getTitle(), document.getFileName(),
                courseLinks(document));
    }

    private List<CourseLink> courseLinks(Document document) {
        return document.getCourses().stream()
                .sorted(Comparator.comparing(Course::getCourseId))
                .map(course -> new CourseLink(course.getCourseId(), course.getTitle()))
                .toList();
    }

    // ----------------------------------------------------------------------------------
    // MQ-03
    // ----------------------------------------------------------------------------------

    @Override
    public JobAccepted generateQuiz(Long userId, Long documentId, MaterialRequests.GenerateQuiz request) {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        JobAccepted created;
        try {
            created = tx.execute(status -> reserve(userId, documentId, request));
        } catch (DataIntegrityViolationException ex) {
            // The partial unique index is the authoritative guard when two requests race.
            throw new BaseException(ResponseCode.DUPLICATE_REQUEST,
                    "A quiz is already being generated for this material");
        }
        if (created == null) {
            throw new BaseException(ResponseCode.INTERNAL_SERVER_ERROR, "Quiz generation could not be queued");
        }
        // The reservation is committed at this point: the worker can see the job row.
        try {
            worker.dispatch(created.jobId());
        } catch (RuntimeException ex) {
            worker.fail(created.jobId(), "Quiz generation worker could not be started");
            throw new BaseException(ResponseCode.INTERNAL_SERVER_ERROR, "Quiz generation could not be started");
        }
        return created;
    }

    private JobAccepted reserve(Long userId, Long documentId, MaterialRequests.GenerateQuiz request) {
        Document document = documents.findOwned(documentId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Material not found"));
        if (jobs.existsByUserUserIdAndDocumentDocIdAndStatusIn(userId, documentId,
                List.of(QuizGenerationWorker.STATUS_PENDING, QuizGenerationWorker.STATUS_PROCESSING))) {
            throw new BaseException(ResponseCode.DUPLICATE_REQUEST,
                    "A quiz is already being generated for this material");
        }
        String content = document.getExtractedContent();
        if (content == null || content.isBlank()) {
            throw new BadRequestException("Material contains no readable text");
        }
        Course quizCourse = quizCourse(document, request.courseId(), userId);
        if (request.sourceLessonId() != null
                && !lessonBelongsToCourse(request.sourceLessonId(), quizCourse)) {
            throw new BadRequestException("sourceLessonId does not belong to the course of this material");
        }
        long estimated = AiQuotaService.estimate(content.length(), OUTPUT_BUDGET);
        quota.lock(userId);
        AiQuotaService.Snapshot snapshot = quota.snapshot(userId);
        List<String> sources = quota.allocate(snapshot, List.of(estimated));
        if (sources == null) {
            throw new BaseException(ResponseCode.AI_QUOTA_EXCEEDED,
                    "Not enough AI quota to generate this quiz",
                    Map.of("estimatedTokens", estimated,
                            "availableTokens", snapshot.available(),
                            "quota", snapshot.freeLimit() + snapshot.planLimit()));
        }
        User student = users.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        AiUsageLog log = logs.save(AiUsageLog.builder()
                .user(student)
                .course(quizCourse)
                .purpose("QUIZ_GENERATION")
                .status("PENDING")
                .reservedTokens((int) estimated)
                .billingSource(sources.get(0))
                .build());
        Instant now = Instant.now();
        QuizGenerationJob job = jobs.saveAndFlush(QuizGenerationJob.builder()
                .user(student)
                .document(document)
                .course(quizCourse)
                .questionCount(request.questionCount())
                .difficulty(request.difficulty())
                .sourceLessonId(request.sourceLessonId())
                .status(QuizGenerationWorker.STATUS_PENDING)
                .progress(0)
                .estimatedTokens((int) estimated)
                .aiUsageLog(log)
                .createdAt(now)
                .updatedAt(now)
                .build());
        return new JobAccepted(job.getJobId(), QuizGenerationWorker.STATUS_PROCESSING, job.getQuestionCount());
    }

    /** The requested course of the material, or its first course when the body omits one. */
    private Course quizCourse(Document document, Long requestedCourseId, Long userId) {
        List<Course> linked = document.getCourses().stream()
                .sorted(Comparator.comparing(Course::getCourseId))
                .toList();
        if (linked.isEmpty()) {
            throw new BadRequestException("Material is not attached to a course");
        }
        Course course = requestedCourseId == null
                ? linked.get(0)
                : linked.stream()
                .filter(candidate -> candidate.getCourseId().equals(requestedCourseId))
                .findFirst()
                .orElseThrow(() -> new BadRequestException("courseId is not one of the material's courses"));
        requireEnrollment(userId, course.getCourseId());
        return course;
    }

    // ----------------------------------------------------------------------------------
    // MQ-04
    // ----------------------------------------------------------------------------------

    @Override
    @Transactional(readOnly = true)
    public JobState job(Long userId, Long jobId) {
        QuizGenerationJob row = jobs.findByJobIdAndUserUserId(jobId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Quiz job not found"));
        return new JobState(row.getJobId(), row.getStatus(), row.getProgress(), row.getQuestionCount(),
                row.getErrorMessage(),
                row.getResultExam() == null ? null : row.getResultExam().getExamId());
    }

    // ----------------------------------------------------------------------------------
    // MQ-05
    // ----------------------------------------------------------------------------------

    @Override
    public Started start(Long userId, Long jobId) {
        QuizGenerationJob job = jobs.findByJobIdAndUserUserId(jobId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Quiz job not found"));
        if (!QuizGenerationWorker.STATUS_COMPLETED.equals(job.getStatus()) || job.getResultExam() == null) {
            throw new ResourceConflictException("Quiz generation has not completed yet");
        }
        Long examId = job.getResultExam().getExamId();
        AttemptResponses.Session session;
        try {
            session = attemptService.start(userId, examId, null);
        } catch (BaseException ex) {
            // A quiz already in progress is resumed instead of rejected (spec 13.5 returns the attempt).
            if (!ResponseCode.ATTEMPT_IN_PROGRESS.equals(ex.getResponseCode())) {
                throw ex;
            }
            ExamAttempt active = attempts.findActiveAttempt(examId, userId, STATUS_IN_PROGRESS)
                    .orElseThrow(() -> ex);
            session = attemptService.get(userId, active.getAttemptId());
        }
        // No surrounding transaction here: catching ATTEMPT_IN_PROGRESS from the transactional
        // attempt service would otherwise mark this transaction rollback-only and fail at commit.
        markMaterialQuiz(session.attemptId());
        List<StartedQuestion> questions = session.questions().stream()
                .map(question -> new StartedQuestion(
                        question.questionId(),
                        question.orderIndex(),
                        question.questionType(),
                        question.content(),
                        question.options() == null ? List.of()
                                : question.options().stream()
                                .map(option -> new StartedOption(option.optionId(), option.optionText()))
                                .toList()))
                .toList();
        return new Started(session.attemptId(), questions);
    }

    /** Marks the (already committed) attempt as a material quiz in its own short transaction. */
    private void markMaterialQuiz(Long attemptId) {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            ExamAttempt attempt = attempts.findById(attemptId).orElse(null);
            if (attempt != null && !MODE_MATERIAL_QUIZ.equals(attempt.getMode())) {
                attempt.setMode(MODE_MATERIAL_QUIZ);
                attempts.save(attempt);
            }
        });
    }

    // ----------------------------------------------------------------------------------
    // MQ-06
    // ----------------------------------------------------------------------------------

    @Override
    @Transactional(readOnly = true)
    public PageResponse<HistoryItem> history(Long userId, int page, int size) {
        validatePage(page, size);
        Page<QuizGenerationJob> result = jobs.findByUserUserIdAndStatusOrderByCreatedAtDesc(userId,
                QuizGenerationWorker.STATUS_COMPLETED, PageRequest.of(page, size));
        List<Long> examIds = result.getContent().stream()
                .filter(job -> job.getResultExam() != null)
                .map(job -> job.getResultExam().getExamId())
                .toList();
        Map<Long, Object[]> stats = examIds.isEmpty() ? Map.of()
                : jobs.statsByExams(userId, examIds).stream()
                .collect(Collectors.toMap(row -> (Long) row[0], row -> row));
        List<HistoryItem> items = result.getContent().stream().map(job -> {
            Object[] row = job.getResultExam() == null ? null : stats.get(job.getResultExam().getExamId());
            BigDecimal best = row == null || row[2] == null ? null : new BigDecimal(row[2].toString());
            int attemptCount = row == null ? 0 : ((Number) row[1]).intValue();
            return new HistoryItem(job.getJobId(), job.getDocument().getDocId(),
                    job.getDocument().getTitle(), job.getQuestionCount(), best, attemptCount,
                    job.getCreatedAt(), job.getResultExam() == null ? null : job.getResultExam().getExamId(),
                    job.getCourse() == null ? null : job.getCourse().getCourseId());
        }).toList();
        return PageResponse.of(result, items);
    }

    private void validatePage(int page, int size) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new BadRequestException("page must be >= 0 and size must be between 1 and " + MAX_PAGE_SIZE);
        }
    }

    private Course requireEnrolledCourse(Long userId, Long courseId) {
        if (courseId == null) {
            throw new BadRequestException("courseId is required");
        }
        Course course = courses.findById(courseId)
                .orElseThrow(() -> new ResourceNotFoundException("Course not found"));
        requireEnrollment(userId, courseId);
        return course;
    }

    private void requireEnrollment(Long userId, Long courseId) {
        if (!enrollments.existsByCourse_CourseIdAndUser_UserIdAndStatus(courseId, userId, Enrollment.STATUS_ACTIVE)) {
            throw new ForbiddenException("You are not enrolled in this course");
        }
    }

    private String normalizeSha256(String sha256) {
        if (sha256 == null) {
            throw new BadRequestException("sha256 is required");
        }
        String normalized = sha256.strip().toLowerCase(Locale.ROOT);
        if (!SHA256_HEX.matcher(normalized).matches()) {
            throw new BadRequestException("sha256 must be 64 hexadecimal characters");
        }
        return normalized;
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is not available", ex);
        }
    }

    private boolean lessonBelongsToCourse(Long lessonId, Course course) {
        if (course == null) {
            return false;
        }
        Number count = (Number) entityManager.createNativeQuery(
                        "SELECT COUNT(*) FROM lessons l JOIN modules m ON m.module_id = l.module_id "
                                + "WHERE l.lesson_id = :lessonId AND m.course_id = :courseId")
                .setParameter("lessonId", lessonId)
                .setParameter("courseId", course.getCourseId())
                .getSingleResult();
        return count.longValue() > 0;
    }
}
