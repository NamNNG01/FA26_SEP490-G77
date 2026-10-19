package com.examprep.exceptions;

import com.examprep.dto.ResponseCode;

public class ResourceConflictException extends BaseException {
<<<<<<< HEAD
=======

>>>>>>> 8f5e334b0d9ac0ee2ecc4224cff5cc244055773b
    public ResourceConflictException(String message) {
        super(ResponseCode.CONFLICT, message);
    }
}
