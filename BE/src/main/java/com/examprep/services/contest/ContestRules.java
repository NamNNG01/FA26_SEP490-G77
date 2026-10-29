package com.examprep.services.contest;

import com.examprep.dto.ContestDtos.Issue;
import com.examprep.dto.ResponseCode;
import com.examprep.entities.Contest;
import com.examprep.entities.Discount;
import com.examprep.exceptions.BaseException;
import com.examprep.repositories.UserDiscountRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;

/** Contest status rules (Deadline 2 sections 1.5, 6.2) shared by the manager APIs, the ranker and reward payment. */
@Component
@RequiredArgsConstructor
public class ContestRules {
    public static final String DRAFT = "DRAFT";
    public static final String PUBLISHED = "PUBLISHED";
    public static final String REWARDED = "REWARDED";
    public static final String CANCELLED = "CANCELLED";
    public static final String UPCOMING = "UPCOMING";
    public static final String ONGOING = "ONGOING";
    public static final String PENDING_REWARD = "PENDING_REWARD";
    public static final List<String> DERIVED = List.of(DRAFT, UPCOMING, ONGOING, PENDING_REWARD, REWARDED, CANCELLED);

    private final UserDiscountRepository userDiscounts;

    /** Section 1.5: PUBLISHED splits by time into UPCOMING, ONGOING and PENDING_REWARD. */
    public static String status(Contest c, Instant now) {
        if (!PUBLISHED.equals(c.getStatus())) return c.getStatus();
        if (now.isBefore(c.getStartTime())) return UPCOMING;
        return now.isBefore(c.getEndTime()) ? ONGOING : PENDING_REWARD;
    }

    /** null before the end, CALCULATING until the ranker ran, READY after (always READY once rewarded). */
    public static String rankingStatus(Contest c, Instant now) {
        if (REWARDED.equals(c.getStatus())) return "READY";
        if (!PUBLISHED.equals(c.getStatus()) || now.isBefore(c.getEndTime())) return null;
        return c.getRankedAt() == null ? "CALCULATING" : "READY";
    }

    /** Section 6.2: usage_limit - used_count - assigned but unused, per discount id. */
    public Map<Long, Long> remaining(Collection<Discount> discounts) {
        Map<Long, Long> held = new HashMap<>();
        List<Long> ids = discounts.stream().map(Discount::getDiscountId).distinct().toList();
        if (!ids.isEmpty()) userDiscounts.countUnused(ids).forEach(r -> held.put((Long) r[0], ((Number) r[1]).longValue()));
        Map<Long, Long> remaining = new HashMap<>();
        for (Discount d : discounts) {
            remaining.put(d.getDiscountId(), (long) d.getUsageLimit() - d.getUsedCount() - held.getOrDefault(d.getDiscountId(), 0L));
        }
        return remaining;
    }

    /** PERCENT discounts may keep their number in the legacy percent column. */
    public static BigDecimal value(Discount d) {
        BigDecimal value = d.getValue() != null ? d.getValue() : d.getPercent();
        return value == null ? null : value.stripTrailingZeros().scale() < 0 ? value.setScale(0) : value.stripTrailingZeros();
    }

    /** Derived discount validity of Deadline 2 section 1.5. */
    public static String validity(Discount d, long remaining, Instant now) {
        if (d.getDeletedAt() != null || !Boolean.TRUE.equals(d.getIsActive())) return "INACTIVE";
        if (d.getStartAt() != null && d.getStartAt().isAfter(now)) return "UPCOMING";
        if (d.getExpiresAt() != null && !d.getExpiresAt().isAfter(now)) return "EXPIRED";
        return remaining <= 0 ? "EXHAUSTED" : "ACTIVE";
    }

    /**
     * Reasons the given ranks cannot receive their discounts. forPayment adds "not started yet";
     * forPayment=false (publish, prize edits) adds "not usable for courses" (appliesTo).
     */
    public List<Issue> issues(SortedMap<Integer, Discount> ranks, Instant now, boolean forPayment) {
        List<Issue> issues = new ArrayList<>();
        Map<Long, Long> remaining = remaining(ranks.values());
        Map<Long, List<Integer>> ranksByDiscount = new TreeMap<>();
        ranks.forEach((rank, d) -> ranksByDiscount.computeIfAbsent(d.getDiscountId(), k -> new ArrayList<>()).add(rank));
        Set<Long> unavailable = new HashSet<>();
        ranks.forEach((rank, d) -> {
            String reason = d.getDeletedAt() != null ? "DISCOUNT_DELETED"
                    : !Boolean.TRUE.equals(d.getIsActive()) ? "DISCOUNT_INACTIVE"
                    : d.getExpiresAt() != null && !d.getExpiresAt().isAfter(now) ? "DISCOUNT_EXPIRED"
                    : forPayment && d.getStartAt() != null && d.getStartAt().isAfter(now) ? "DISCOUNT_NOT_STARTED"
                    : !forPayment && !Set.of("COURSE", "ALL").contains(d.getAppliesTo()) ? "DISCOUNT_NOT_APPLICABLE"
                    : null;
            if (reason != null) {
                unavailable.add(d.getDiscountId());
                issues.add(new Issue(rank, d.getDiscountId(), d.getCode(), reason, null, null));
            }
        });
        ranksByDiscount.forEach((discountId, list) -> {
            long left = remaining.get(discountId);
            if (!unavailable.contains(discountId) && list.size() > left) {
                Discount d = ranks.get(list.get(list.size() - 1));
                issues.add(new Issue(list.get(list.size() - 1), discountId, d.getCode(), "DISCOUNT_QUOTA_NOT_ENOUGH",
                        (long) list.size(), Math.max(0, left)));
            }
        });
        issues.sort(Comparator.comparing(Issue::rankPosition));
        return issues;
    }

    // ------------------------------------------------------------------ errors with data.code (section 1.2)

    public static BaseException error(ResponseCode status, String code, String message) {
        return new BaseException(status, message, Map.of("code", code));
    }

    public static BaseException error(ResponseCode status, String code, String message, String key, Object value) {
        return new BaseException(status, message, Map.of("code", code, key, value));
    }

    public static BaseException invalid(String field, String message) {
        return new BaseException(ResponseCode.VALIDATION_ERROR, "Dữ liệu không hợp lệ",
                Map.of("code", "VALIDATION_FAILED", "errors", List.of(Map.of("field", field, "message", message))));
    }

    public static BaseException invalid(List<Map<String, String>> errors) {
        return new BaseException(ResponseCode.VALIDATION_ERROR, "Dữ liệu không hợp lệ", Map.of("code", "VALIDATION_FAILED", "errors", errors));
    }

    public static BaseException notFound() {
        return error(ResponseCode.RESOURCE_NOT_FOUND, "CONTEST_NOT_FOUND", "Contest not found");
    }

    public static BaseException locked(String message) {
        return error(ResponseCode.CONFLICT, "CONTEST_LOCKED", message);
    }
}
