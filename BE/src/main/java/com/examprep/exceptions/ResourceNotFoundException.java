package com.examprep.exceptions;

import com.examprep.dto.ResponseCode;

public class ResourceNotFoundException extends BaseException {

    public ResourceNotFoundException(String message) {
        super(ResponseCode.RESOURCE_NOT_FOUND, message);
    }

    public ResourceNotFoundException(ResponseCode responseCode, String message) {
        super(responseCode, message);
    }
}
