package com.examprep.exceptions;

import com.examprep.dto.ResponseCode;
import com.examprep.validation.ValidationError;
import lombok.Getter;

import java.util.List;

@Getter
public class QuestionValidationException extends BaseException {
    private final List<ValidationError> errors;

    public QuestionValidationException(List<ValidationError> errors) {
        super(ResponseCode.VALIDATION_ERROR, "Question validation failed");
        this.errors = errors;
    }
}
