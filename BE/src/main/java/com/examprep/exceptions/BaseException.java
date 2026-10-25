package com.examprep.exceptions;

import com.examprep.dto.ResponseCode;
import lombok.Getter;

@Getter
public class BaseException extends RuntimeException {

    private final ResponseCode responseCode;
    // Optional payload returned as the envelope's data (e.g. quota numbers on 402).
    private final transient Object data;

    public BaseException(ResponseCode responseCode) {
        this(responseCode, responseCode.getMessage(), null);
    }

    public BaseException(ResponseCode responseCode, String message) {
        this(responseCode, message, null);
    }

    public BaseException(ResponseCode responseCode, String message, Object data) {
        super(message);
        this.responseCode = responseCode;
        this.data = data;
    }
}
