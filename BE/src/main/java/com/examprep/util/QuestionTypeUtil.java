package com.examprep.util;

import com.examprep.dto.ResponseCode;
import com.examprep.exceptions.BadRequestException;

import java.util.Set;

/**
 * Maps the supported question types onto the four kinds a question group can hold.
 * A group holds exactly one kind, so it can never mix quizzes with essays, code or diagrams.
 */
public final class QuestionTypeUtil {

    public static final Set<String> QUESTION_TYPES = Set.of(
            "SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE", "FILL_BLANK",
            "MATCHING", "ORDERING", "ESSAY", "CODE", "DIAGRAM");

    public static final Set<String> KINDS = Set.of("QUIZ", "ESSAY", "CODE", "DIAGRAM");

    private static final Set<String> QUIZ_TYPES = Set.of(
            "SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE", "FILL_BLANK", "MATCHING", "ORDERING");

    private static final String KIND_MESSAGE =
            "questionType must be one of QUIZ, ESSAY, CODE, DIAGRAM.";

    private QuestionTypeUtil() {
    }

    public static String kindOf(String questionType) {
        if (questionType == null || !QUESTION_TYPES.contains(questionType)) {
            return null;
        }
        return QUIZ_TYPES.contains(questionType) ? "QUIZ" : questionType;
    }

    public static boolean isValidKind(String value) {
        return value != null && KINDS.contains(value);
    }

    public static String requireKind(String value) {
        if (!isValidKind(value)) {
            throw new BadRequestException(ResponseCode.VALIDATION_ERROR, KIND_MESSAGE);
        }
        return value;
    }
}
