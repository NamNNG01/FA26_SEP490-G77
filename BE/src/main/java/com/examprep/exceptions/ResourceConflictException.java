package com.examprep.exceptions;

import com.examprep.dto.ResponseCode;

public class ResourceConflictException extends BaseException {

    public ResourceConflictException(String message) {
        super(ResponseCode.CONFLICT, message);
    }
}
