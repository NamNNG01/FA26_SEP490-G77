package com.examprep.util;

import com.examprep.exceptions.BadRequestException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class QuestionTypeUtilTest {

    @Test
    void mapsEveryObjectiveTypeToQuiz() {
        assertEquals("QUIZ", QuestionTypeUtil.kindOf("SINGLE_CHOICE"));
        assertEquals("QUIZ", QuestionTypeUtil.kindOf("MULTIPLE_CHOICE"));
        assertEquals("QUIZ", QuestionTypeUtil.kindOf("TRUE_FALSE"));
        assertEquals("QUIZ", QuestionTypeUtil.kindOf("FILL_BLANK"));
        assertEquals("QUIZ", QuestionTypeUtil.kindOf("MATCHING"));
        assertEquals("QUIZ", QuestionTypeUtil.kindOf("ORDERING"));
    }

    @Test
    void keepsEssayCodeAndDiagramAsTheirOwnKind() {
        assertEquals("ESSAY", QuestionTypeUtil.kindOf("ESSAY"));
        assertEquals("CODE", QuestionTypeUtil.kindOf("CODE"));
        assertEquals("DIAGRAM", QuestionTypeUtil.kindOf("DIAGRAM"));
    }

    @Test
    void unknownTypesHaveNoKind() {
        assertNull(QuestionTypeUtil.kindOf(null));
        assertNull(QuestionTypeUtil.kindOf("MIXED"));
        assertNull(QuestionTypeUtil.kindOf("essay"));
    }

    @Test
    void diagramQuestionsCountAsEssayForExamKind() {
        assertEquals("QUIZ", QuestionTypeUtil.examKindOf("SINGLE_CHOICE"));
        assertEquals("ESSAY", QuestionTypeUtil.examKindOf("ESSAY"));
        assertEquals("ESSAY", QuestionTypeUtil.examKindOf("DIAGRAM"));
        assertEquals("CODE", QuestionTypeUtil.examKindOf("CODE"));
        assertNull(QuestionTypeUtil.examKindOf("MIXED"));
    }

    @Test
    void everyQuestionTypeIsKnown() {
        assertEquals(9, QuestionTypeUtil.QUESTION_TYPES.size());
        assertTrue(QuestionTypeUtil.QUESTION_TYPES.contains("ESSAY"));
        assertTrue(QuestionTypeUtil.QUESTION_TYPES.contains("CODE"));
        assertTrue(QuestionTypeUtil.QUESTION_TYPES.contains("DIAGRAM"));
        assertFalse(QuestionTypeUtil.QUESTION_TYPES.contains("QUIZ"));
        assertEquals(4, QuestionTypeUtil.KINDS.size());
    }

    @Test
    void onlyTheFourConcreteKindsAreValid() {
        assertTrue(QuestionTypeUtil.isValidKind("QUIZ"));
        assertTrue(QuestionTypeUtil.isValidKind("ESSAY"));
        assertTrue(QuestionTypeUtil.isValidKind("CODE"));
        assertTrue(QuestionTypeUtil.isValidKind("DIAGRAM"));

        assertFalse(QuestionTypeUtil.isValidKind("MIXED"));
        assertFalse(QuestionTypeUtil.isValidKind(null));
        assertFalse(QuestionTypeUtil.isValidKind("quiz"));
    }

    @Test
    void requireKindRejectsMixedAndUnknownValues() {
        assertEquals("QUIZ", QuestionTypeUtil.requireKind("QUIZ"));
        assertThrows(BadRequestException.class, () -> QuestionTypeUtil.requireKind("MIXED"));
        assertThrows(BadRequestException.class, () -> QuestionTypeUtil.requireKind(null));
        assertThrows(BadRequestException.class, () -> QuestionTypeUtil.requireKind("SINGLE_CHOICE"));
    }
}
