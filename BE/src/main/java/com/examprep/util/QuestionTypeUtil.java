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
            "MATCHING", "ORDERING", "ESSAY", "CODE", "DIAGRAM", "DIAGRAM_ESSAY");

    public static final Set<String> KINDS = Set.of("QUIZ", "ESSAY", "CODE", "DIAGRAM", "DIAGRAM_ESSAY");

    private static final Set<String> QUIZ_TYPES = Set.of(
            "SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE", "FILL_BLANK", "MATCHING", "ORDERING");

    private static final String KIND_MESSAGE =
            "questionType must be one of QUIZ, ESSAY, CODE, DIAGRAM, DIAGRAM_ESSAY.";

    private QuestionTypeUtil() {
    }

    public static String kindOf(String questionType) {
        if (questionType == null || !QUESTION_TYPES.contains(questionType)) {
            return null;
        }
        if (QUIZ_TYPES.contains(questionType)) return "QUIZ";
        if ("DIAGRAM_ESSAY".equals(questionType)) return "DIAGRAM_ESSAY";
        return questionType;
    }

    /**
     * Kind of an exam built from this question type. DIAGRAM and DIAGRAM_ESSAY fold into ESSAY: both are
     * rubric-graded long answers and the essay exam form holds them together, so an exam
     * with essay and diagram questions is an ESSAY exam, not an unclassified one.
     */
    public static String examKindOf(String questionType) {
        String kind = kindOf(questionType);
        return ("DIAGRAM".equals(kind) || "DIAGRAM_ESSAY".equals(kind)) ? "ESSAY" : kind;
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
