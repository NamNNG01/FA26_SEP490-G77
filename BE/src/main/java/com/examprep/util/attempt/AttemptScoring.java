package com.examprep.util.attempt;

import com.examprep.dto.attempt.Snapshots;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

/**
 * Weight to points conversion (spec section 1).
 *
 * <p>All arithmetic is done at {@link #INTERNAL_SCALE} digits; every value that leaves the service
 * is rounded to {@link #OUTPUT_SCALE} digits with {@link RoundingMode#HALF_UP} (spec 0.2).</p>
 *
 * <p>{@code M} is always {@code exam_snapshot.maxScore} and {@code w} is always
 * {@code weight_snapshot}: current exam/question data never takes part (spec 0.3 rule 6).</p>
 */
public final class AttemptScoring {

    /** Internal precision used for every intermediate product. */
    public static final int INTERNAL_SCALE = 4;
    /** Digits handed back to the FE. */
    public static final int OUTPUT_SCALE = 2;

    private static final BigDecimal WEIGHTLESS = BigDecimal.ZERO;

    private AttemptScoring() {
    }

    /** W = Σ weight_snapshot of every question of the attempt. Never negative, never null. */
    public static BigDecimal totalWeight(List<BigDecimal> weights) {
        BigDecimal total = BigDecimal.ZERO;
        if (weights != null) {
            for (BigDecimal weight : weights) {
                if (weight != null && weight.signum() > 0) {
                    total = total.add(weight);
                }
            }
        }
        return total;
    }

    /**
     * P_q = (w_q / W) × M.
     *
     * <p>Returns {@code 0} when the paper carries no weight at all (publish enforces positive
     * weights, so this only guards against a corrupt snapshot).</p>
     */
    public static BigDecimal questionMaxPoints(BigDecimal weight, BigDecimal totalWeight, BigDecimal maxScore) {
        if (weight == null || totalWeight == null || totalWeight.signum() <= 0
                || weight.signum() <= 0 || maxScore == null) {
            return WEIGHTLESS;
        }
        return weight.divide(totalWeight, INTERNAL_SCALE, RoundingMode.HALF_UP)
                .multiply(maxScore)
                .setScale(INTERNAL_SCALE, RoundingMode.HALF_UP);
    }

    /**
     * maxPoints_c = P_q × (w_c / Σ w_c), used by SA-05 for rubric questions and by the AI worker.
     */
    public static BigDecimal criterionMaxPoints(BigDecimal questionMaxPoints,
                                                 BigDecimal criterionWeight,
                                                 BigDecimal totalCriterionWeight) {
        if (questionMaxPoints == null || criterionWeight == null || totalCriterionWeight == null
                || totalCriterionWeight.signum() <= 0 || criterionWeight.signum() <= 0) {
            return WEIGHTLESS;
        }
        return questionMaxPoints
                .multiply(criterionWeight.divide(totalCriterionWeight, INTERNAL_SCALE, RoundingMode.HALF_UP))
                .setScale(INTERNAL_SCALE, RoundingMode.HALF_UP);
    }

    /**
     * pendingPoints = Σ maxPoints of the questions whose score is still null
     * = M × (Σ weight of pending questions) / W.
     */
    public static BigDecimal pendingPoints(BigDecimal pendingWeight, BigDecimal totalWeight, BigDecimal maxScore) {
        return questionMaxPoints(pendingWeight, totalWeight, maxScore);
    }

    /** Total score of an attempt: Σ score_q, counting only the questions that already have a score. */
    public static BigDecimal sumScores(List<BigDecimal> scores) {
        BigDecimal total = BigDecimal.ZERO;
        if (scores != null) {
            for (BigDecimal score : scores) {
                if (score != null) {
                    total = total.add(score);
                }
            }
        }
        return total;
    }

    /** Rounds a value for the response body / the 2-digit {@code score_earned} column. */
    public static BigDecimal output(BigDecimal value) {
        if (value == null) {
            return null;
        }
        return value.setScale(OUTPUT_SCALE, RoundingMode.HALF_UP);
    }

}
