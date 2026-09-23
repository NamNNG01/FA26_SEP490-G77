package com.examprep.common.exception;

import com.examprep.common.response.ApiResponse;
import com.examprep.common.response.ResponseCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(BaseException.class)
    public ResponseEntity<ApiResponse<Object>> handleBaseException(BaseException ex) {
        log.warn("Business Exception: [{}] {}", ex.getResponseCode().getCode(), ex.getMessage());
        ResponseCode code = ex.getResponseCode();
        return ResponseEntity.status(code.getHttpStatus())
                .body(ApiResponse.error(code, ex.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Map<String, String>>> handleValidationExceptions(MethodArgumentNotValidException ex) {
        Map<String, String> errors = new HashMap<>();
        ex.getBindingResult().getAllErrors().forEach((error) -> {
            String fieldName = ((FieldError) error).getField();
            String errorMessage = error.getDefaultMessage();
            errors.put(fieldName, errorMessage);
        });
        log.warn("Validation Error: {}", errors);
        return ResponseEntity.status(ResponseCode.VALIDATION_ERROR.getHttpStatus())
                .body(ApiResponse.<Map<String, String>>builder()
                        .success(false)
                        .message("Validation failed for request parameters")
                        .data(errors)
                        .build());
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResponse<Object>> handleAccessDeniedException(AccessDeniedException ex) {
        log.warn("Access Denied: {}", ex.getMessage());
        return ResponseEntity.status(ResponseCode.FORBIDDEN.getHttpStatus())
                .body(ApiResponse.error(ResponseCode.FORBIDDEN));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiResponse<Object>> handleNoResourceFound(NoResourceFoundException ex) {
        log.warn("Resource Not Found: {}", ex.getMessage());
        return ResponseEntity.status(ResponseCode.RESOURCE_NOT_FOUND.getHttpStatus())
                .body(ApiResponse.error(ResponseCode.RESOURCE_NOT_FOUND));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponse<Object>> handleHttpMessageNotReadable(HttpMessageNotReadableException ex) {
        log.warn("Malformed Request Body: {}", ex.getMessage());
        return ResponseEntity.status(ResponseCode.BAD_REQUEST.getHttpStatus())
                .body(ApiResponse.error(ResponseCode.BAD_REQUEST, "Malformed request body"));
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiResponse<Object>> handleMethodNotSupported(HttpRequestMethodNotSupportedException ex) {
        log.warn("Method Not Allowed: {}", ex.getMessage());
        return ResponseEntity.status(ResponseCode.METHOD_NOT_ALLOWED.getHttpStatus())
                .body(ApiResponse.error(ResponseCode.METHOD_NOT_ALLOWED));
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiResponse<Object>> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        log.warn("Type Mismatch: {}", ex.getMessage());
        return ResponseEntity.status(ResponseCode.BAD_REQUEST.getHttpStatus())
                .body(ApiResponse.error(ResponseCode.BAD_REQUEST, "Invalid request parameter"));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiResponse<Object>> handleDataIntegrityViolation(DataIntegrityViolationException ex) {
        log.warn("Data Integrity Violation: {}", ex.getMessage());
        return ResponseEntity.status(ResponseCode.CONFLICT.getHttpStatus())
                .body(ApiResponse.error(ResponseCode.CONFLICT, "Resource already exists or state conflict"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Object>> handleGenericException(Exception ex) {
        log.error("Unhandled Internal Server Error: ", ex);
        return ResponseEntity.status(ResponseCode.INTERNAL_SERVER_ERROR.getHttpStatus())
                .body(ApiResponse.error(ResponseCode.INTERNAL_SERVER_ERROR, "An unexpected server error occurred"));
    }
}
