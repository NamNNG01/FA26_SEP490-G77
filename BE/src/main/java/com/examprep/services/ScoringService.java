package com.examprep.services;

import com.examprep.entities.AnswerOption;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ScoringService {

    private final ObjectMapper objectMapper;

    public ScoreResult calculateScore(String questionType, BigDecimal defaultPoints, String answerKeyJson, List<AnswerOption> options, String responseJson) {
        if (responseJson == null || responseJson.trim().isEmpty()) {
            return new ScoreResult(BigDecimal.ZERO, false);
        }

        try {
            Map<String, Object> respMap = objectMapper.readValue(responseJson, new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});

            switch (questionType) {
                case "SINGLE_CHOICE":
                case "TRUE_FALSE": {
                    List<Number> selectedIds = (List<Number>) respMap.get("selectedOptionIds");
                    if (selectedIds == null || selectedIds.isEmpty()) return new ScoreResult(BigDecimal.ZERO, false);
                    Long selectedId = selectedIds.get(0).longValue();
                    boolean correct = options.stream()
                            .anyMatch(o -> o.getOptionId().equals(selectedId) && Boolean.TRUE.equals(o.getIsCorrect()));
                    return new ScoreResult(correct ? defaultPoints : BigDecimal.ZERO, correct);
                }
                case "MULTIPLE_CHOICE": {
                    List<Number> selectedIds = (List<Number>) respMap.get("selectedOptionIds");
                    if (selectedIds == null || selectedIds.isEmpty()) return new ScoreResult(BigDecimal.ZERO, false);
                    Set<Long> chosen = selectedIds.stream().map(Number::longValue).collect(Collectors.toSet());
                    Set<Long> correctSet = options.stream().filter(o -> Boolean.TRUE.equals(o.getIsCorrect())).map(AnswerOption::getOptionId).collect(Collectors.toSet());

                    long correctChosen = chosen.stream().filter(correctSet::contains).count();
                    long incorrectChosen = chosen.stream().filter(id -> !correctSet.contains(id)).count();

                    double ratio = (double) (correctChosen - incorrectChosen) / correctSet.size();
                    ratio = Math.max(0.0, ratio);
                    BigDecimal score = defaultPoints.multiply(BigDecimal.valueOf(ratio)).setScale(2, RoundingMode.HALF_UP);
                    return new ScoreResult(score, ratio >= 1.0);
                }
                case "MATCHING": {
                    if (answerKeyJson == null) return new ScoreResult(BigDecimal.ZERO, false);
                    Map<String, Object> akMap = objectMapper.readValue(answerKeyJson, Map.class);
                    List<Map<String, String>> pairs = (List<Map<String, String>>) akMap.get("pairs");
                    List<Map<String, String>> matches = (List<Map<String, String>>) respMap.get("matches");
                    if (pairs == null || pairs.isEmpty() || matches == null) return new ScoreResult(BigDecimal.ZERO, false);

                    Map<String, String> correctMap = pairs.stream().collect(Collectors.toMap(p -> p.get("left"), p -> p.get("right")));
                    long correctCount = 0;
                    for (Map<String, String> m : matches) {
                        String left = m.get("left");
                        String right = m.get("right");
                        if (right != null && right.equals(correctMap.get(left))) {
                            correctCount++;
                        }
                    }
                    double ratio = (double) correctCount / pairs.size();
                    BigDecimal score = defaultPoints.multiply(BigDecimal.valueOf(ratio)).setScale(2, RoundingMode.HALF_UP);
                    return new ScoreResult(score, ratio >= 1.0);
                }
                case "FILL_BLANK": {
                    if (answerKeyJson == null) return new ScoreResult(BigDecimal.ZERO, false);
                    Map<String, Object> akMap = objectMapper.readValue(answerKeyJson, Map.class);
                    List<Map<String, Object>> blanks = (List<Map<String, Object>>) akMap.get("blanks");
                    Map<String, String> userBlanks = (Map<String, String>) respMap.get("blanks");
                    if (blanks == null || blanks.isEmpty() || userBlanks == null) return new ScoreResult(BigDecimal.ZERO, false);

                    long correctCount = 0;
                    for (Map<String, Object> blank : blanks) {
                        int idx = (Integer) blank.get("index");
                        List<String> accepted = (List<String>) blank.get("accepted");
                        final boolean isCaseSensitive = Boolean.TRUE.equals(blank.get("caseSensitive"));
                        String rawUserAnswer = userBlanks.get(String.valueOf(idx));
                        if (rawUserAnswer == null) rawUserAnswer = userBlanks.get(idx);
                        final String userAnswer = rawUserAnswer;

                        if (userAnswer != null) {
                            boolean match = accepted.stream().anyMatch(acc -> isCaseSensitive ? acc.equals(userAnswer) : acc.equalsIgnoreCase(userAnswer.trim()));
                            if (match) correctCount++;
                        }
                    }
                    double ratio = (double) correctCount / blanks.size();
                    BigDecimal score = defaultPoints.multiply(BigDecimal.valueOf(ratio)).setScale(2, RoundingMode.HALF_UP);
                    return new ScoreResult(score, ratio >= 1.0);
                }
                default:
                    return new ScoreResult(BigDecimal.ZERO, false);
            }
        } catch (Exception e) {
            return new ScoreResult(BigDecimal.ZERO, false);
        }
    }

    public static class ScoreResult {
        private final BigDecimal score;
        private final boolean isCorrect;

        public ScoreResult(BigDecimal score, boolean isCorrect) {
            this.score = score;
            this.isCorrect = isCorrect;
        }

        public BigDecimal getScore() { return score; }
        public boolean isCorrect() { return isCorrect; }
    }
}
