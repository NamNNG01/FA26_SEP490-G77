package com.examprep.exceptions;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.ResponseCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
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
                .body(ApiResponse.builder().success(false).message(ex.getMessage()).data(ex.getData()).build());
    }

    @ExceptionHandler(org.springframework.orm.ObjectOptimisticLockingFailureException.class)
    public ResponseEntity<ApiResponse<Object>> handleOptimisticLock(org.springframework.orm.ObjectOptimisticLockingFailureException ex) {
        log.warn("Optimistic lock failure: {}", ex.getMessage());
        Map<String, Object> errorData = Map.of(
                "code", "RESOURCE_CONFLICT",
                "subCode", "VERSION_CONFLICT"
        );
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ApiResponse.builder()
                        .success(false)
                        .message("Nội dung vừa được người khác thay đổi, vui lòng tải lại.")
                        .data(errorData)
                        .build());
    }

    @ExceptionHandler(ReviewException.class)
    public ResponseEntity<ApiResponse<Object>> handleReviewException(ReviewException ex) {
        log.warn("Review Exception: [{}] {} - {}", ex.getCode(), ex.getSubCode(), ex.getMessage());
        Map<String, Object> errorData = new HashMap<>();
        errorData.put("code", ex.getCode());
        if (ex.getSubCode() != null) {
            errorData.put("subCode", ex.getSubCode());
        }
        if (ex.getDetails() != null) {
            errorData.put("details", ex.getDetails());
        }
        return ResponseEntity.status(ex.getStatus())
                .body(ApiResponse.builder()
                        .success(false)
                        .message(ex.getMessage())
                        .data(errorData)
                        .build());
    }

    @ExceptionHandler(QuestionValidationException.class)
    public ResponseEntity<ApiResponse<Object>> handleQuestionValidationException(QuestionValidationException ex) {
        log.warn("Question Validation Exception: {}", ex.getErrors());
        ResponseCode code = ex.getResponseCode();
        return ResponseEntity.status(code.getHttpStatus())
                .body(ApiResponse.<Object>builder()
                        .success(false)
                        .message(ex.getMessage())
                        .data(ex.getErrors())
                        .build());
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

    @ExceptionHandler(HandlerMethodValidationException.class)
    public ResponseEntity<ApiResponse<Object>> handleHandlerMethodValidation(HandlerMethodValidationException ex) {
        Map<String, String> errors = new HashMap<>();
        ex.getAllErrors().forEach(error -> {
            String msg = error.getDefaultMessage();
            errors.put("error", msg);
        });
        log.warn("Handler Method Validation Error: {}", errors);
        return ResponseEntity.status(ResponseCode.VALIDATION_ERROR.getHttpStatus())
                .body(ApiResponse.error(ResponseCode.VALIDATION_ERROR, "Validation failed"));
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

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiResponse<Object>> handleMaxUploadSize(MaxUploadSizeExceededException ex) {
        log.warn("Upload rejected by the multipart limit: {}", ex.getMessage());
        return ResponseEntity.status(ResponseCode.FILE_TOO_LARGE.getHttpStatus())
                .body(ApiResponse.builder().success(false).message("File is too large")
                        .data(Map.of("code", "FILE_TOO_LARGE")).build());
    }

    @ExceptionHandler({MissingServletRequestParameterException.class, MissingServletRequestPartException.class})
    public ResponseEntity<ApiResponse<Object>> handleMissingParameter(Exception ex) {
        log.warn("Missing request parameter: {}", ex.getMessage());
        return ResponseEntity.status(ResponseCode.BAD_REQUEST.getHttpStatus())
                .body(ApiResponse.error(ResponseCode.BAD_REQUEST, ex.getMessage()));
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
