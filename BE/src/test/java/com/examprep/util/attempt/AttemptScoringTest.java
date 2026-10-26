package com.examprep.util.attempt;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The worked example of spec section 1: M = 10, weights 1 / 2 / 2 → 2.00 / 4.00 / 4.00, and the
 * essay rubric 60 / 40 of a 4.00 question → 2.40 / 1.60.
 */
class AttemptScoringTest {

    private static final BigDecimal TEN = BigDecimal.TEN;

    @Test
    void totalWeightIgnoresNullAndNonPositiveWeights() {
        assertEquals(0, AttemptScoring.totalWeight(List.of(BigDecimal.ONE, BigDecimal.valueOf(2), BigDecimal.valueOf(2)))
                .compareTo(BigDecimal.valueOf(5)));
        assertEquals(0, AttemptScoring.totalWeight(null).signum());
        assertEquals(0, AttemptScoring.totalWeight(Arrays.asList(null, BigDecimal.ZERO, BigDecimal.valueOf(-1))).signum());
    }

    @Test
    void convertsWeightsToPointsExactlyLikeTheSpecExample() {
        BigDecimal total = AttemptScoring.totalWeight(
                List.of(BigDecimal.ONE, BigDecimal.valueOf(2), BigDecimal.valueOf(2)));

        assertEquals(new BigDecimal("2.00"), AttemptScoring.output(
                AttemptScoring.questionMaxPoints(BigDecimal.ONE, total, TEN)));
        assertEquals(new BigDecimal("4.00"), AttemptScoring.output(
                AttemptScoring.questionMaxPoints(BigDecimal.valueOf(2), total, TEN)));
        assertEquals(new BigDecimal("4.00"), AttemptScoring.output(
                AttemptScoring.questionMaxPoints(BigDecimal.valueOf(2), total, TEN)));
    }

    @Test
    void splitsAQuestionIntoRubricCriteria() {
        BigDecimal questionPoints = AttemptScoring.questionMaxPoints(
                BigDecimal.valueOf(2), BigDecimal.valueOf(5), TEN);
        BigDecimal totalCriterionWeight = AttemptScoring.totalWeight(
                List.of(BigDecimal.valueOf(60), BigDecimal.valueOf(40)));

        assertEquals(new BigDecimal("2.40"), AttemptScoring.output(AttemptScoring.criterionMaxPoints(
                questionPoints, BigDecimal.valueOf(60), totalCriterionWeight)));
        assertEquals(new BigDecimal("1.60"), AttemptScoring.output(AttemptScoring.criterionMaxPoints(
                questionPoints, BigDecimal.valueOf(40), totalCriterionWeight)));
    }

    @Test
    void pendingPointsIsTheWeightOfTheUngradedQuestions() {
        // W = 5, pending weight = 2 → 10 × 2/5 = 4.00.
        assertEquals(new BigDecimal("4.00"), AttemptScoring.output(
                AttemptScoring.pendingPoints(BigDecimal.valueOf(2), BigDecimal.valueOf(5), TEN)));
        assertEquals(new BigDecimal("0.00"), AttemptScoring.output(
                AttemptScoring.pendingPoints(BigDecimal.ZERO, BigDecimal.valueOf(5), TEN)));
    }

    @Test
    void outputRoundsHalfUpToTwoDigitsAndKeepsNull() {
        assertEquals(new BigDecimal("3.33"), AttemptScoring.output(new BigDecimal("3.3333")));
        assertEquals(new BigDecimal("3.34"), AttemptScoring.output(new BigDecimal("3.3350")));
        assertEquals(new BigDecimal("2.60"), AttemptScoring.output(new BigDecimal("2.595")));
        assertNull(AttemptScoring.output(null));
    }

    @Test
    void sumScoresSkipsUnscoredQuestions() {
        BigDecimal total = AttemptScoring.sumScores(
                Arrays.asList(BigDecimal.valueOf(2), null, BigDecimal.valueOf(3.2)));
        assertEquals(0, new BigDecimal("5.2").compareTo(total));
    }

    @Test
    void aPaperWithoutWeightCannotDivideByZero() {
        BigDecimal points = AttemptScoring.questionMaxPoints(BigDecimal.ONE, BigDecimal.ZERO, TEN);
        assertTrue(points.signum() == 0);
    }
}
