package com.examprep.services;

import com.examprep.ai.AiResponse;
import com.examprep.entities.AiUsageLog;
import com.examprep.entities.UserSubscription;
import com.examprep.repositories.AiUsageLogRepository;
import com.examprep.repositories.UserSubscriptionRepository;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

/**
 * Student AI quota (spec section 9): a daily FREE allowance first, then the active PLAN.
 * Remaining = limit - settled usage - open reservations. Callers reserve inside a transaction holding {@link #lock}.
 */
@Service
@RequiredArgsConstructor
public class AiQuotaService {
    public static final ZoneId ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    public static final String FREE = "FREE";
    public static final String PLAN = "PLAN";

    private final AiUsageLogRepository logs;
    private final UserSubscriptionRepository subscriptions;
    private final EntityManager entityManager;
    @Value("${app.student-ai.free-daily-tokens:20000}") private long freeDailyTokens;

    /** planName is null when the student has no active plan. */
    public record Snapshot(long freeLimit, long freeUsed, long freeReserved, Instant freeResetAt,
                           String planName, long planLimit, Instant planStart, Instant planEnd,
                           long planUsed, long planReserved) {
        public long freeRemaining() { return Math.max(0, freeLimit - freeUsed - freeReserved); }
        public long planRemaining() { return planName == null ? 0 : Math.max(0, planLimit - planUsed - planReserved); }
        public long available() { return freeRemaining() + planRemaining(); }
    }

    @Transactional(readOnly = true)
    public Snapshot snapshot(Long userId) {
        LocalDate today = LocalDate.now(ZONE);
        Instant dayStart = today.atStartOfDay(ZONE).toInstant();
        Instant nextDay = today.plusDays(1).atStartOfDay(ZONE).toInstant();
        long[] free = usage(userId, FREE, dayStart, nextDay);
        UserSubscription plan = subscriptions.findActiveSubscriptionByUser(userId, Instant.now()).orElse(null);
        // A plan's end date is inclusive.
        long[] paid = plan == null ? new long[2] : usage(userId, PLAN, plan.getStartDate(), plan.getEndDate().plusSeconds(1));
        return plan == null
                ? new Snapshot(freeDailyTokens, free[0], free[1], nextDay, null, 0, null, null, 0, 0)
                : new Snapshot(freeDailyTokens, free[0], free[1], nextDay, plan.getPlan().getPlanName(),
                        plan.getPlan().getAiTokenLimit(), plan.getStartDate(), plan.getEndDate(), paid[0], paid[1]);
    }

    /** Serialises quota decisions of one user until the surrounding transaction ends. */
    public void lock(Long userId) {
        entityManager.createNativeQuery("SELECT pg_advisory_xact_lock(:userId)").setParameter("userId", userId).getResultList();
    }

    /** FREE or PLAN for each estimate, in order; null when any of them does not fit (nothing is partially funded). */
    public List<String> allocate(Snapshot snapshot, List<Long> estimates) {
        long free = snapshot.freeRemaining();
        long plan = snapshot.planRemaining();
        List<String> sources = new ArrayList<>(estimates.size());
        for (long estimate : estimates) {
            if (estimate <= free) {
                free -= estimate;
                sources.add(FREE);
            } else if (estimate <= plan) {
                plan -= estimate;
                sources.add(PLAN);
            } else {
                return null;
            }
        }
        return sources;
    }

    /** Closes a reservation. SUCCESS/PARTIAL charge the real tokens; FAILED/TIMEOUT refund everything. */
    public void settle(AiUsageLog log, String status, AiResponse response, long durationMillis, String error) {
        log.setStatus(status);
        log.setReservedTokens(0);
        log.setDurationMs((int) Math.min(Integer.MAX_VALUE, durationMillis));
        log.setErrorMessage(error);
        if (response != null) {
            log.setModel(response.getModel());
            log.setInputTokens(response.getInputTokens());
            log.setOutputTokens(response.getOutputTokens());
        }
        logs.save(log);
    }

    /** Spec 8.1 rule 4: ceil(promptChars / 2.5) x 1.3 + output budget. */
    public static long estimate(int promptChars, int outputBudget) {
        return (long) Math.ceil(Math.ceil(promptChars / 2.5) * 1.3) + outputBudget;
    }

    private long[] usage(Long userId, String source, Instant from, Instant to) {
        Object[] row = logs.sumStudentUsage(userId, source, from, to).get(0);
        return new long[]{((Number) row[0]).longValue(), ((Number) row[1]).longValue()};
    }
}
