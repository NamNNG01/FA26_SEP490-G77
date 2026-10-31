package com.examprep.services.admin;

import com.examprep.dto.AdminPlanDtos;
import com.examprep.dto.AdminPlanDtos.PlanDetail;
import com.examprep.dto.AdminPlanDtos.PlanItem;
import com.examprep.dto.AdminPlanDtos.PlanWriteRequest;
import com.examprep.dto.AdminPlanDtos.PublicPlanItem;
import com.examprep.dto.AdminPlanDtos.ReorderRequest;
import com.examprep.dto.AdminPlanDtos.StatusUpdateRequest;
import com.examprep.dto.AdminPlanDtos.StatusUpdateResponse;
import com.examprep.dto.PageResponse;
import com.examprep.dto.ResponseCode;
import com.examprep.entities.SubscriptionPlan;
import com.examprep.repositories.SubscriptionPlanRepository;
import com.examprep.repositories.UserSubscriptionRepository;
import com.examprep.services.contest.ContestRules;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;

/**
 * Group C (admin subscription-plan config) — Deadline 2 API 20/21 list + detail, and the public
 * plan list that feeds API 27. Mirrors {@code AdminDiscountService}: entity never leaves the
 * service, errors go through {@link ContestRules#error} so {@code data.code} is machine readable.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class AdminSubscriptionPlanService {

    private static final Set<String> SORTABLE = Set.of("planId", "planName", "price", "sortOrder", "createdAt");
    private static final int MAX_PAGE_SIZE = 100;
    private static final int MAX_FEATURES = 20;
    private static final int MAX_FEATURE_LENGTH = 200;

    private final SubscriptionPlanRepository planRepository;
    private final UserSubscriptionRepository userSubscriptionRepository;
    private final ObjectMapper objectMapper;

    @Transactional(readOnly = true)
    public Page<PlanItem> list(String keyword, Boolean isActive, int page, int size, String sort) {
        String kw = (keyword != null && !keyword.isBlank())
                ? "%" + keyword.trim().toLowerCase(Locale.ROOT) + "%"
                : null;

        Page<SubscriptionPlan> plans = planRepository.search(kw, isActive, pageable(page, size, sort));

        // One count query for the whole page (no N+1).
        List<Long> planIds = plans.getContent().stream().map(SubscriptionPlan::getPlanId).toList();
        Map<Long, Long> activeCounts = planIds.isEmpty()
                ? Map.of()
                : toCountMap(userSubscriptionRepository.countActiveByPlanIds(planIds, Instant.now()));

        return plans.map(p -> toItem(p, readFeatures(p.getFeaturesJson()),
                activeCounts.getOrDefault(p.getPlanId(), 0L)));
    }

    /** Convenience mapper used by the controller (API 20). */
    @Transactional(readOnly = true)
    public PageResponse<PlanItem> listPage(String keyword, Boolean isActive, int page, int size, String sort) {
        return PageResponse.of(list(keyword, isActive, page, size, sort));
    }

    @Transactional(readOnly = true)
    public PlanDetail detail(Long id) {
        SubscriptionPlan plan = planRepository.findAvailable(id)
                .orElseThrow(() -> ContestRules.error(ResponseCode.RESOURCE_NOT_FOUND, "PLAN_NOT_FOUND", "Subscription plan not found"));

        Map<Long, Long> activeCounts = toCountMap(userSubscriptionRepository.countActiveByPlanIds(List.of(id), Instant.now()));
        Map<Long, Long> totalCounts = toCountMap(userSubscriptionRepository.countTotalByPlanIds(List.of(id)));

        return toDetail(plan, readFeatures(plan.getFeaturesJson()),
                activeCounts.getOrDefault(id, 0L), totalCounts.getOrDefault(id, 0L));
    }

    /** API 27: only sellable plans, in display order, no paging. */
    @Transactional(readOnly = true)
    public List<PublicPlanItem> publicList() {
        return planRepository.findByIsActiveTrueAndDeletedAtIsNullOrderBySortOrderAscPlanIdAsc().stream()
                .map(p -> toPublic(p, readFeatures(p.getFeaturesJson())))
                .toList();
    }

    // ------------------------------------------------------------------ create / update (API 22, 23)

    public PlanDetail create(PlanWriteRequest req) {
        String planName = planName(req);
        if (planRepository.findByPlanNameIgnoreCaseAndDeletedAtIsNull(planName).isPresent()) {
            throw ContestRules.error(ResponseCode.CONFLICT, "PLAN_NAME_EXISTS", "Subscription plan name already exists");
        }

        SubscriptionPlan plan = SubscriptionPlan.builder()
                .planName(planName)
                .description(req.description())
                .price(req.price())
                .durationDays(req.durationDays())
                .aiTokenLimit(req.aiTokenLimit())
                .featuresJson(writeFeatures(validateFeatures(req.features())))
                .isActive(req.isActive() != null ? req.isActive() : true)
                .sortOrder(req.sortOrder() != null ? req.sortOrder() : 0)
                .build();

        SubscriptionPlan saved = planRepository.save(plan);
        return detail(saved.getPlanId());
    }

    /** Full replace — running subscriptions keep their {@code paid_amount} snapshot (separate table). */
    public PlanDetail update(Long id, PlanWriteRequest req) {
        SubscriptionPlan plan = planRepository.findAvailable(id)
                .orElseThrow(() -> ContestRules.error(ResponseCode.RESOURCE_NOT_FOUND, "PLAN_NOT_FOUND", "Subscription plan not found"));

        String planName = planName(req);
        planRepository.findByPlanNameIgnoreCaseAndDeletedAtIsNull(planName)
                .filter(other -> !other.getPlanId().equals(id))
                .ifPresent(other -> {
                    throw ContestRules.error(ResponseCode.CONFLICT, "PLAN_NAME_EXISTS", "Subscription plan name already exists");
                });
        // A case-only self-rename keeps the stored casing (the unique index is on LOWER(plan_name)).
        if (plan.getPlanName().equalsIgnoreCase(planName)) planName = plan.getPlanName();

        plan.setPlanName(planName);
        plan.setDescription(req.description());
        plan.setPrice(req.price());
        plan.setDurationDays(req.durationDays());
        plan.setAiTokenLimit(req.aiTokenLimit());
        plan.setFeaturesJson(writeFeatures(validateFeatures(req.features())));
        // Null keeps the current value on update; defaults only apply on create.
        if (req.isActive() != null) plan.setIsActive(req.isActive());
        if (req.sortOrder() != null) plan.setSortOrder(req.sortOrder());

        planRepository.save(plan);
        return detail(id);
    }

    // ------------------------------------------------------------------ status / reorder / delete (API 24, 25, 26)

    /** API 24: deactivating only hides the plan from the purchase screen — no other side effects. */
    public StatusUpdateResponse setStatus(Long id, StatusUpdateRequest req) {
        SubscriptionPlan plan = planRepository.findAvailable(id)
                .orElseThrow(() -> ContestRules.error(ResponseCode.RESOURCE_NOT_FOUND, "PLAN_NOT_FOUND", "Subscription plan not found"));

        plan.setIsActive(req.isActive());
        planRepository.save(plan);
        return new StatusUpdateResponse(id, plan.getIsActive());
    }

    /**
     * API 25: {@code orderedPlanIds} must list every non-deleted plan exactly once (no missing, no
     * extra, no duplicates). Validation happens before any write, so a bad request leaves the DB
     * untouched; a valid one assigns {@code sort_order = index}.
     */
    public List<PlanItem> reorder(ReorderRequest req) {
        List<SubscriptionPlan> plans = planRepository.findAllAvailable();
        Map<Long, SubscriptionPlan> byId = new LinkedHashMap<>();
        for (SubscriptionPlan plan : plans) byId.put(plan.getPlanId(), plan);

        List<Long> ordered = req.orderedPlanIds() == null ? List.of() : req.orderedPlanIds();
        Set<Long> requested = new HashSet<>(ordered);
        boolean complete = ordered.size() == plans.size()
                && requested.size() == ordered.size()
                && requested.equals(byId.keySet());
        if (!complete) {
            throw ContestRules.invalid("orderedPlanIds", "Phải truyền đủ toàn bộ gói chưa xoá");
        }

        List<SubscriptionPlan> reordered = new ArrayList<>(ordered.size());
        for (int i = 0; i < ordered.size(); i++) {
            SubscriptionPlan plan = byId.get(ordered.get(i));
            plan.setSortOrder(i);
            reordered.add(plan);
        }
        planRepository.saveAll(reordered);

        Map<Long, Long> activeCounts = toCountMap(userSubscriptionRepository.countActiveByPlanIds(ordered, Instant.now()));
        return reordered.stream()
                .map(p -> toItem(p, readFeatures(p.getFeaturesJson()),
                        activeCounts.getOrDefault(p.getPlanId(), 0L)))
                .toList();
    }

    /**
     * API 26: soft delete. Blocked while any subscription row is still flagged ACTIVE (window is
     * irrelevant — conservative, so no ACTIVE row is ever stranded on a deleted plan).
     */
    public void delete(Long id) {
        SubscriptionPlan plan = planRepository.findAvailable(id)
                .orElseThrow(() -> ContestRules.error(ResponseCode.RESOURCE_NOT_FOUND, "PLAN_NOT_FOUND", "Subscription plan not found"));

        if (userSubscriptionRepository.countActiveByPlan(id) > 0) {
            throw ContestRules.error(ResponseCode.CONFLICT, "PLAN_HAS_ACTIVE_SUBSCRIBERS",
                    "Plan still has active subscribers; deactivate it instead");
        }

        plan.setDeletedAt(Instant.now());
        planRepository.save(plan);
    }

    // ------------------------------------------------------------------ mapping

    public static PlanItem toItem(SubscriptionPlan plan, List<String> features, long activeSubscribers) {
        return new PlanItem(
                plan.getPlanId(),
                plan.getPlanName(),
                plan.getDescription(),
                plan.getPrice(),
                AdminPlanDtos.CURRENCY,
                plan.getDurationDays(),
                plan.getAiTokenLimit(),
                features,
                plan.getIsActive(),
                plan.getSortOrder(),
                activeSubscribers);
    }

    public static PlanDetail toDetail(SubscriptionPlan plan, List<String> features,
                                      long activeSubscribers, long totalSubscribers) {
        return new PlanDetail(
                plan.getPlanId(),
                plan.getPlanName(),
                plan.getDescription(),
                plan.getPrice(),
                AdminPlanDtos.CURRENCY,
                plan.getDurationDays(),
                plan.getAiTokenLimit(),
                features,
                plan.getIsActive(),
                plan.getSortOrder(),
                activeSubscribers,
                totalSubscribers,
                plan.getCreatedAt(),
                plan.getUpdatedAt());
    }

    public static PublicPlanItem toPublic(SubscriptionPlan plan, List<String> features) {
        return new PublicPlanItem(
                plan.getPlanId(),
                plan.getPlanName(),
                plan.getDescription(),
                plan.getPrice(),
                AdminPlanDtos.CURRENCY,
                plan.getDurationDays(),
                plan.getAiTokenLimit(),
                features,
                plan.getIsActive(),
                plan.getSortOrder());
    }

    // ------------------------------------------------------------------ features JSON

    /** {@code features_json} → trimmed, non-blank, bounded list; malformed/null JSON reads as empty. */
    public List<String> readFeatures(String featuresJson) {
        if (featuresJson == null || featuresJson.isBlank()) return List.of();
        try {
            JsonNode root = objectMapper.readTree(featuresJson);
            if (root == null || !root.isArray()) return List.of();
            List<String> features = new ArrayList<>();
            for (JsonNode node : root) {
                if (node == null || node.isNull()) continue;
                String value = node.asText("").trim();
                if (value.isEmpty()) continue;
                if (value.length() > MAX_FEATURE_LENGTH) value = value.substring(0, MAX_FEATURE_LENGTH);
                features.add(value);
                if (features.size() >= MAX_FEATURES) break;
            }
            return List.copyOf(features);
        } catch (JsonProcessingException e) {
            return List.of();
        }
    }

    /** {@code List<String>} → {@code features_json}; trims, drops null/blank entries and bounds the list. */
    public String writeFeatures(List<String> features) {
        if (features == null || features.isEmpty()) return "[]";
        List<String> normalized = new ArrayList<>();
        for (String feature : features) {
            if (feature == null) continue;
            String value = feature.trim();
            if (value.isEmpty()) continue;
            if (value.length() > MAX_FEATURE_LENGTH) value = value.substring(0, MAX_FEATURE_LENGTH);
            normalized.add(value);
            if (normalized.size() >= MAX_FEATURES) break;
        }
        try {
            return objectMapper.writeValueAsString(normalized);
        } catch (JsonProcessingException e) {
            return "[]";
        }
    }

    // ------------------------------------------------------------------ helpers

    private static String planName(PlanWriteRequest req) {
        String name = req.planName() == null ? "" : req.planName().trim();
        if (name.isEmpty()) {
            throw ContestRules.invalid("planName", "Tên gói không được để trống");
        }
        return name;
    }

    /** Trims, drops null/blank entries, then rejects >20 items or >200 chars instead of truncating silently. */
    private static List<String> validateFeatures(List<String> features) {
        if (features == null) return List.of();
        List<String> normalized = new ArrayList<>();
        for (String feature : features) {
            if (feature == null) continue;
            String value = feature.trim();
            if (value.isEmpty()) continue;
            if (value.length() > MAX_FEATURE_LENGTH) {
                throw ContestRules.invalid("features", "Mỗi mục tối đa " + MAX_FEATURE_LENGTH + " ký tự");
            }
            normalized.add(value);
        }
        if (normalized.size() > MAX_FEATURES) {
            throw ContestRules.invalid("features", "Tối đa " + MAX_FEATURES + " mục");
        }
        return normalized;
    }

    private static Pageable pageable(int page, int size, String sort) {
        int safeSize = Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
        int safePage = Math.max(page, 0);
        return PageRequest.of(safePage, safeSize, sort(sort));
    }

    /** Whitelisted properties only; anything else falls back to the display order. */
    private static Sort sort(String sort) {
        String property = null;
        Sort.Direction direction = Sort.Direction.DESC;
        if (sort != null && !sort.isBlank()) {
            String[] parts = sort.split(",");
            String requested = parts[0].trim();
            if (SORTABLE.contains(requested)) {
                property = requested;
                if (parts.length > 1 && "asc".equalsIgnoreCase(parts[1].trim())) direction = Sort.Direction.ASC;
            }
        }
        if (property == null) {
            return Sort.by(Sort.Direction.ASC, "sortOrder").and(Sort.by(Sort.Direction.ASC, "planId"));
        }
        Sort result = Sort.by(direction, property);
        return "planId".equals(property) ? result : result.and(Sort.by(Sort.Direction.ASC, "planId"));
    }

    private static Map<Long, Long> toCountMap(List<Object[]> rows) {
        Map<Long, Long> counts = new HashMap<>();
        for (Object[] row : rows) {
            counts.put(((Number) row[0]).longValue(), ((Number) row[1]).longValue());
        }
        return counts;
    }
}
