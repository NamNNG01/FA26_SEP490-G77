package com.examprep.exceptions;

import com.examprep.dto.ResponseCode;

public class BadRequestException extends BaseException {

    public BadRequestException(String message) {
        super(ResponseCode.BAD_REQUEST, message);
    }

    public BadRequestException(ResponseCode responseCode, String message) {
        super(responseCode, message);
    }
}
