package com.examprep.services;

import com.examprep.dto.AiFlashcardDtos.UsageInfo;
import com.examprep.dto.ResponseCode;
import com.examprep.entities.AiUsageLog;
import com.examprep.entities.Course;
import com.examprep.entities.Question;
import com.examprep.entities.SystemSetting;
import com.examprep.entities.User;
import com.examprep.exceptions.BaseException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.AiUsageLogRepository;
import com.examprep.repositories.SystemSettingRepository;
import com.examprep.repositories.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;

/**
 * Monthly AI token quota for Course Managers (Global Default in {@code system_settings.platform.ai.managerMonthlyTokenLimit}
 * + optional per-manager override on {@code users.manager_monthly_ai_token_limit}).
 *
 * <p>Uses calendar month boundaries in {@link AiQuotaService#ZONE} and tracks reservations/settled
 * usage in {@code ai_usage_logs} with {@code billing_source = 'MANAGER'}.</p>
 */
@Service
@RequiredArgsConstructor
public class ManagerAiQuotaService {

    public static final String BILLING_MANAGER = "MANAGER";
    public static final String USAGE_GLOBAL_DEFAULT = "GLOBAL_DEFAULT";
    public static final String USAGE_CUSTOM_OVERRIDE = "CUSTOM_OVERRIDE";
    private static final int EXPLANATION_LOT_SIZE = 10;
    private static final int LOT_OVERHEAD_CHARS = 600;
    private static final int QUESTION_OVERHEAD_CHARS = 300;
    private static final int EXPLANATION_OUTPUT_BUDGET = 400;

    private final AiUsageLogRepository logs;
    private final UserRepository users;
    private final SystemSettingRepository settings;
    private final ObjectMapper json;

    @Value("${app.question-ai.monthly-token-limit:1000000}")
    private long fallbackMonthlyLimit;

    public record Snapshot(
            long globalDefaultLimit,
            Long overrideLimit,
            long effectiveLimit,
            long usedTokens,
            long reservedTokens,
            Instant periodStart,
            Instant periodEnd) {
        public long remainingTokens() {
            return Math.max(0L, effectiveLimit - usedTokens - reservedTokens);
        }

        public boolean isCustomOverride() {
            return overrideLimit != null;
        }
    }

    @Transactional(readOnly = true)
    public long globalDefaultLimit() {
        return settings.findById(AdminSettingsService.PLATFORM_SETTINGS_KEY)
                .map(SystemSetting::getSettingValue)
                .map(this::extractConfiguredLimit)
                .orElse(fallbackMonthlyLimit);
    }

    @Transactional(readOnly = true)
    public Snapshot snapshot(Long userId) {
        User user = users.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found."));
        return snapshotForUser(user);
    }

    @Transactional(readOnly = true)
    public Snapshot snapshotForUser(User user) {
        YearMonth month = YearMonth.now(AiQuotaService.ZONE);
        Instant monthStart = month.atDay(1).atStartOfDay(AiQuotaService.ZONE).toInstant();
        Instant nextMonth = month.plusMonths(1).atDay(1).atStartOfDay(AiQuotaService.ZONE).toInstant();
        long globalDefault = globalDefaultLimit();
        Long override = user.getManagerMonthlyAiTokenLimit();
        long effective = override != null ? override : globalDefault;
        long[] usage = usage(user.getUserId(), monthStart, nextMonth);
        return new Snapshot(globalDefault, override, effective, usage[0], usage[1], monthStart, nextMonth);
    }

    @Transactional(readOnly = true)
    public UsageInfo usageInfo(Long userId) {
        Snapshot snap = snapshot(userId);
        return new UsageInfo(
                snap.isCustomOverride() ? USAGE_CUSTOM_OVERRIDE : USAGE_GLOBAL_DEFAULT,
                snap.isCustomOverride() ? "Custom Override" : "Global Default",
                snap.effectiveLimit(),
                snap.usedTokens(),
                snap.reservedTokens(),
                snap.remainingTokens(),
                snap.periodStart(),
                snap.periodEnd());
    }

    /**
     * Locks the manager's user row inside the caller's transaction, verifies remaining monthly
     * token budget against the batch estimate, and saves a {@code PENDING} reservation log.
     */
    @Transactional
    public AiUsageLog reserveForExplanationJob(Long userId, List<Question> toQueue) {
        User lockedUser = users.findForUpdate(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found."));
        Snapshot snap = snapshotForUser(lockedUser);
        long estimate = estimateExplanationBatch(toQueue);
        long remaining = snap.remainingTokens();
        if (remaining < estimate) {
            throw new BaseException(
                    ResponseCode.QUOTA_EXCEEDED,
                    String.format(
                            "Monthly AI token quota exceeded (%d tokens remaining, %d estimated).",
                            remaining, estimate),
                    Map.of(
                            "remainingTokens", remaining,
                            "estimatedTokens", estimate,
                            "monthlyLimit", snap.effectiveLimit(),
                            "usedTokens", snap.usedTokens(),
                            "reservedTokens", snap.reservedTokens()));
        }

        Course singleCourse = resolveSingleCourse(toQueue);
        return logs.save(AiUsageLog.builder()
                .user(lockedUser)
                .course(singleCourse)
                .purpose("EXPLANATION")
                .billingSource(BILLING_MANAGER)
                .status("PENDING")
                .reservedTokens((int) Math.min(Integer.MAX_VALUE, estimate))
                .questionCount(toQueue.size())
                .build());
    }

    @Transactional
    public void markProcessing(Long logId) {
        if (logId == null) {
            return;
        }
        logs.lockById(logId).ifPresent(log -> {
            if ("PENDING".equals(log.getStatus())) {
                log.setStatus("PROCESSING");
                logs.save(log);
            }
        });
    }

    @Transactional
    public void settle(Long logId, String status, String model, int inputTokens, int outputTokens,
                       long durationMillis, String errorMessage) {
        if (logId == null) {
            return;
        }
        logs.lockById(logId).ifPresent(log -> {
            log.setStatus(status);
            log.setReservedTokens(0);
            log.setDurationMs((int) Math.min(Integer.MAX_VALUE, Math.max(0L, durationMillis)));
            log.setErrorMessage(errorMessage != null && errorMessage.length() > 500
                    ? errorMessage.substring(0, 500)
                    : errorMessage);
            if (model != null && !model.isBlank()) {
                log.setModel(model);
            }
            if (inputTokens > 0 || outputTokens > 0) {
                log.setInputTokens(inputTokens);
                log.setOutputTokens(outputTokens);
            } else {
                log.setInputTokens(null);
                log.setOutputTokens(null);
            }
            logs.save(log);
        });
    }

    public static long estimateExplanationBatch(List<Question> questions) {
        int count = questions == null ? 0 : questions.size();
        if (count == 0) {
            return 0L;
        }
        long totalChars = 0;
        for (Question q : questions) {
            int contentLen = q.getContent() == null ? 0 : q.getContent().length();
            totalChars += contentLen + QUESTION_OVERHEAD_CHARS;
        }
        int lots = (count + EXPLANATION_LOT_SIZE - 1) / EXPLANATION_LOT_SIZE;
        long promptChars = Math.min(Integer.MAX_VALUE, totalChars + (long) lots * LOT_OVERHEAD_CHARS);
        return AiQuotaService.estimate((int) promptChars, count * EXPLANATION_OUTPUT_BUDGET);
    }

    private long extractConfiguredLimit(String rawJson) {
        if (rawJson == null || rawJson.isBlank()) {
            return fallbackMonthlyLimit;
        }
        try {
            JsonNode doc = json.readTree(rawJson);
            JsonNode limitNode = doc.path("ai").path("managerMonthlyTokenLimit");
            long parsed = AdminSettingsService.parseNonNegativeLimit(limitNode);
            return parsed >= 0 ? parsed : fallbackMonthlyLimit;
        } catch (Exception ex) {
            return fallbackMonthlyLimit;
        }
    }

    private long[] usage(Long userId, Instant from, Instant to) {
        Object[] row = logs.sumManagerUsage(userId, from, to).get(0);
        return new long[]{((Number) row[0]).longValue(), ((Number) row[1]).longValue()};
    }

    private static Course resolveSingleCourse(List<Question> toQueue) {
        if (toQueue == null || toQueue.isEmpty()) {
            return null;
        }
        Course first = toQueue.get(0).getCourse();
        if (first == null) {
            return null;
        }
        Long courseId = first.getCourseId();
        for (int i = 1; i < toQueue.size(); i++) {
            Course c = toQueue.get(i).getCourse();
            if (c == null || !c.getCourseId().equals(courseId)) {
                return null;
            }
        }
        return first;
    }
}
