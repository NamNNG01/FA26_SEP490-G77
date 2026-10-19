package com.examprep.exceptions;

import com.examprep.dto.ResponseCode;

public class ForbiddenException extends BaseException {

    public ForbiddenException(String message) {
        super(ResponseCode.FORBIDDEN, message);
    }
}
