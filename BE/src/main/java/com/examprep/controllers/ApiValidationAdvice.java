package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.exceptions.BaseException;
import com.examprep.services.contest.ContestRules;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Spec §1.2 validation envelope for the Deadline 2 group C/E APIs: a bean-validation failure renders
 * {@code data.code="VALIDATION_FAILED"} plus {@code data.errors[]=[{field,message}]} — the exact
 * envelope {@link ContestRules#invalid(List)} produces for service-level validation (same
 * {@code VALIDATION_ERROR} response code and house message).
 *
 * <p>Scoped with {@code assignableTypes} so the shared {@code GlobalExceptionHandler} (legacy
 * {@code data={field:message}} map) keeps serving every other controller byte-identically: Spring
 * consults {@code @ControllerAdvice} beans in {@code @Order} and skips advices whose
 * {@code assignableTypes} do not include the failing controller, so this advice answers first for
 * exactly these four controllers and is invisible to all others (the AdminSubscriptionPlanApiTest
 * blank-planName HTTP test proves the precedence).</p>
 */
@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = { AdminSubscriptionPlanController.class,
        PublicSubscriptionPlanController.class, AiFlashcardController.class, AiUsageController.class })
public class ApiValidationAdvice {

    /** Aggregates every field error in declaration order into the house errors[] envelope. */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Object>> handleValidation(MethodArgumentNotValidException ex) {
        List<Map<String, String>> errors = new ArrayList<>();
        for (FieldError error : ex.getBindingResult().getFieldErrors()) {
            String message = error.getDefaultMessage() == null ? "Invalid value" : error.getDefaultMessage();
            errors.add(Map.of("field", error.getField(), "message", message));
        }
        BaseException failure = ContestRules.invalid(errors);
        return ResponseEntity.status(failure.getResponseCode().getHttpStatus())
                .body(ApiResponse.builder().success(false).message(failure.getMessage())
                        .data(failure.getData()).build());
    }
}
