package com.examprep.common.exception;

import com.examprep.common.response.ResponseCode;

public class UnauthorizedException extends BaseException {

    public UnauthorizedException(String message) {
        super(ResponseCode.UNAUTHORIZED, message);
    }
}
