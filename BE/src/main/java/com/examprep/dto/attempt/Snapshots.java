package com.examprep.dto.attempt;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.math.BigDecimal;
import java.util.List;

/**
 * The three JSON documents an attempt freezes when it starts (spec 6.1 rule 2, 0.3 rules 4-6).
 *
 * <ul>
 *   <li>{@link ExamSnapshot} → {@code exam_attempts.exam_snapshot}: title, maxScore, duration and
 *       the shuffle seed of <em>this</em> attempt. Every score is computed from it.</li>
 *   <li>{@link DisplayQuestion} → {@code attempt_answers.display_snapshot}: what the student was
 *       shown (content, option order, matching columns). Never the answer.</li>
 *   <li>{@link KeySnapshot} → {@code attempt_answers.key_snapshot}: what is needed to grade and to
 *       review. Never returned before the attempt is submitted (spec 0.3 rule 4).</li>
 * </ul>
 *
 * <p>The records are deliberately {@code @JsonIgnoreProperties(ignoreUnknown = true)} so a snapshot
 * written by another build (with extra fields) still deserializes.</p>
 */
public final class Snapshots {

    private Snapshots() {
    }

    /** Frozen exam data of one attempt. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ExamSnapshot(
            Long examId,
            String title,
            BigDecimal maxScore,
            Integer durationMinutes,
            Long shuffleSeed,
            Integer questionCount) {
    }

    /** One question as the student saw it. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record DisplayQuestion(
            Long questionId,
            Integer orderIndex,
            String questionType,
            String content,
            List<DisplayOption> options,
            Matching matching,
            AnswerSpace answerSpace) {
    }

    /** A shuffled option: id and text only, never {@code is_correct}. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record DisplayOption(Long optionId, String optionText) {
    }

    /** MATCHING renders as two independently shuffled columns; the pairing lives in the key. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Matching(List<String> lefts, List<String> rights) {
    }

    /** ESSAY/CODE only. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record AnswerSpace(Integer maxLength) {
    }

    /** The answer key of one question, as far as grading and review need it. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record KeySnapshot(
            List<Long> correctOptionIds,
            List<Long> correctOrder,
            List<Blank> blanks,
            List<Pair> pairs,
            Rubric rubric) {
    }

    /** FILL_BLANK: one placeholder with its accepted spellings. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Blank(Integer index, List<String> accepted, Boolean caseSensitive) {
    }

    /** MATCHING: the original left/right pairing, independent of the shuffled display. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Pair(String left, String right) {
    }

    /** Rubric criterion weights; the points are derived per attempt from maxPoints (spec 1). */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Rubric(List<Criterion> criteria) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Criterion(String criterionId, String name, BigDecimal weight) {
    }
}
