package com.examprep.exceptions;

import com.examprep.dto.ResponseCode;

public class UnauthorizedException extends BaseException {

    public UnauthorizedException(String message) {
        super(ResponseCode.UNAUTHORIZED, message);
    }
}
