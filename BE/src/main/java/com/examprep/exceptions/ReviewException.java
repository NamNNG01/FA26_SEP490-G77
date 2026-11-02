package com.examprep.exceptions;

import com.examprep.dto.ResponseCode;
import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public class ReviewException extends RuntimeException {
    private final HttpStatus status;
    private final String code;
    private final String subCode;
    private final Object details;

    public ReviewException(HttpStatus status, String code, String subCode, String message, Object details) {
        super(message);
        this.status = status;
        this.code = code;
        this.subCode = subCode;
        this.details = details;
    }

    public ReviewException(HttpStatus status, String code, String subCode, String message) {
        this(status, code, subCode, message, null);
    }
}
