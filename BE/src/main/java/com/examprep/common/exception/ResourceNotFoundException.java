package com.examprep.common.exception;

import com.examprep.common.response.ResponseCode;

public class ResourceNotFoundException extends BaseException {

    public ResourceNotFoundException(String message) {
        super(ResponseCode.RESOURCE_NOT_FOUND, message);
    }

    public ResourceNotFoundException(ResponseCode responseCode, String message) {
        super(responseCode, message);
    }
}
