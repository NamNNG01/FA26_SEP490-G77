package com.examprep.dto;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public enum ResponseCode {

    // 2xx Success
    SUCCESS(HttpStatus.OK, "SUCCESS", "Operation completed successfully"),
    CREATED(HttpStatus.CREATED, "CREATED", "Resource created successfully"),

    // 4xx Client Errors
    BAD_REQUEST(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "Invalid request parameters"),
    UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Authentication required or invalid token"),
    FORBIDDEN(HttpStatus.FORBIDDEN, "FORBIDDEN", "Access denied."),
    RESOURCE_NOT_FOUND(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "Requested resource was not found"),
    METHOD_NOT_ALLOWED(HttpStatus.METHOD_NOT_ALLOWED, "METHOD_NOT_ALLOWED", "HTTP method not supported"),
    CONFLICT(HttpStatus.CONFLICT, "RESOURCE_CONFLICT", "Resource already exists or state conflict"),
    VALIDATION_ERROR(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Request payload validation failed"),
    /** Same business code as {@link #VALIDATION_ERROR} but for a payload the server understands and refuses (SA-01: exam has no questions). */
    UNPROCESSABLE_VALIDATION_ERROR(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", "Request payload validation failed"),
    /** SA-01: student already owns an IN_PROGRESS attempt of this exam. {@code data} carries {@code activeAttemptId} and {@code deadlineAt}. */
    ATTEMPT_IN_PROGRESS(HttpStatus.CONFLICT, "ATTEMPT_IN_PROGRESS", "An attempt is already in progress for this exam"),
    /** SA-01: the exam links questions that are no longer ACTIVE/APPROVED (or were deleted). */
    EXAM_INVALID_QUESTIONS(HttpStatus.CONFLICT, "EXAM_INVALID_QUESTIONS", "Some questions of this exam are no longer valid"),
    /** SA-05: the attempt has not been submitted yet, so no result exists. */
    ATTEMPT_NOT_SUBMITTED(HttpStatus.CONFLICT, "ATTEMPT_NOT_SUBMITTED", "Attempt has not been submitted yet"),
    /** SA-03: the deadline passed, the server already auto-submitted the attempt. */
    ATTEMPT_EXPIRED(HttpStatus.GONE, "ATTEMPT_EXPIRED", "The attempt deadline has passed"),
    AI_RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS, "AI_RATE_LIMITED", "AI daily quota exceeded"),
    AI_UPSTREAM_ERROR(HttpStatus.BAD_GATEWAY, "AI_UPSTREAM_ERROR", "AI provider could not generate a draft"),
    AI_TIMEOUT(HttpStatus.GATEWAY_TIMEOUT, "AI_TIMEOUT", "AI generation timed out"),
    QUOTA_EXCEEDED(HttpStatus.PAYMENT_REQUIRED, "QUOTA_EXCEEDED", "Not enough AI quota"),
    NOTHING_TO_GRADE(HttpStatus.CONFLICT, "NOTHING_TO_GRADE", "No question can be graded"),

    // Domain Specific Errors
    EXAM_NOT_FOUND(HttpStatus.NOT_FOUND, "EXAM_NOT_FOUND", "Exam with the specified ID does not exist"),
    EXAM_ALREADY_SUBMITTED(HttpStatus.BAD_REQUEST, "EXAM_ALREADY_SUBMITTED", "This exam attempt has already been submitted"),
    EXAM_SESSION_EXPIRED(HttpStatus.BAD_REQUEST, "EXAM_SESSION_EXPIRED", "Exam attempt time limit has expired"),
    QUESTION_NOT_FOUND(HttpStatus.NOT_FOUND, "QUESTION_NOT_FOUND", "Question not found"),
    USER_NOT_FOUND(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "User not found"),

    // 5xx Server Errors
    INTERNAL_SERVER_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "An unexpected internal server error occurred");

    private final HttpStatus httpStatus;
    private final String code;
    private final String message;

    ResponseCode(HttpStatus httpStatus, String code, String message) {
        this.httpStatus = httpStatus;
        this.code = code;
        this.message = message;
    }
}
