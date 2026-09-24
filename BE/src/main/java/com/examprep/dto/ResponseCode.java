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
