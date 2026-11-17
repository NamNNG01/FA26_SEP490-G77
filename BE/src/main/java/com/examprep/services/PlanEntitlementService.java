package com.examprep.services;

import com.examprep.dto.ResponseCode;
import com.examprep.entities.SubscriptionPlan;
import com.examprep.exceptions.BaseException;
import com.examprep.repositories.SubscriptionPlanRepository;
import com.examprep.repositories.UserSubscriptionRepository;
import com.examprep.services.admin.AdminSubscriptionPlanService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class PlanEntitlementService {
    private final UserSubscriptionRepository subscriptions;
    private final SubscriptionPlanRepository plans;

    @Transactional(readOnly = true)
    public List<String> keys(Long userId) {
        return subscriptions.findActiveSubscriptionByUser(userId, Instant.now())
            .map(s -> AdminSubscriptionPlanService.featureKeys(s.getPlan()))
            .orElseGet(() -> plans.findByPlanNameIgnoreCaseAndDeletedAtIsNull("Free Plan")
                .map(AdminSubscriptionPlanService::featureKeys).orElse(List.of()));
    }

    public void require(Long userId, String key) {
        if (!keys(userId).contains(key))
            throw new BaseException(ResponseCode.FORBIDDEN, "Your plan does not include this feature",
                Map.of("code", "PLAN_FEATURE_REQUIRED", "details", Map.of("featureKey", key)));
    }
}
