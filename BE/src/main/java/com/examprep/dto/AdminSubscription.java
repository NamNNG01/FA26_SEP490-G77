package com.examprep.dto;
import com.examprep.entities.UserSubscription;
import java.time.Instant;
public record AdminSubscription(Long planId, String planName, Instant endDate, String status) {
    public static AdminSubscription from(UserSubscription s) {
        return new AdminSubscription(s.getPlan().getPlanId(), s.getPlan().getPlanName(), s.getEndDate(), s.getStatus());
    }
}
