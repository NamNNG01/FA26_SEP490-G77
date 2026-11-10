package com.examprep.services;

import com.examprep.dto.QuestionIssueDtos.*;
import com.examprep.entities.*;
import com.examprep.repositories.QuestionIssueRepository;
import com.examprep.util.attempt.AttemptGrader;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * What a manager needs to judge a ticket without leaving it: how the reports split, how students actually
 * answered the question (a low correct rate or a crowd on one wrong option points at a bad key), where the
 * question is used, what a fix would re-score, and earlier tickets on the same question. Also the stored
 * priority. Read-only; the caller holds the transaction.
 */
@Component
@RequiredArgsConstructor
class QuestionIssueInsights {
    static final Set<String> FINISHED = QuestionRegrader.FINISHED;
    static final String HIGH = "HIGH", MEDIUM = "MEDIUM", LOW = "LOW";

    private final QuestionIssueRepository issues;
    private final QuestionRegrader regrader;
    private final ObjectMapper objectMapper;

    /**
     * 10 per report, 1 per finished answer (max 50: how many students it touches), 20 when a published exam
     * holds it, 15 when someone says the key is wrong (scores are at stake).
     * ponytail: a snapshot taken on report/withdraw, not live; recompute on read if answers pile up between reports.
     */
    int priorityScore(Question question, List<QuestionIssueReport> reports) {
        Long id = question.getQuestionId();
        int score = 10 * reports.size();
        score += (int) Math.min(50, issues.countExamAnswers(id, FINISHED));
        if (issues.inPublishedExam(id)) score += 20;
        if (reports.stream().anyMatch(r -> "WRONG_ANSWER".equals(r.getIssueType()))) score += 15;
        return score;
    }

    static String level(Integer score) {
        int s = score == null ? 0 : score;
        return s >= 60 ? HIGH : s >= 30 ? MEDIUM : LOW;
    }

    Insights build(QuestionIssue issue, List<QuestionIssueReport> reports, List<AnswerOption> options) {
        Question q = issue.getQuestion();
        Map<Long, AnswerOption> byId = options.stream().collect(Collectors.toMap(AnswerOption::getOptionId, Function.identity()));
        return new Insights(summary(reports, byId, q.getLockVersion()), answers(q.getQuestionId(), options), exams(q.getQuestionId()),
                impact(q), related(issue));
    }

    private ReportSummary summary(List<QuestionIssueReport> reports, Map<Long, AnswerOption> options, Long lockVersion) {
        Map<Long, Long> picks = new LinkedHashMap<>();
        List<String> texts = new ArrayList<>();
        long outdated = 0;
        for (QuestionIssueReport r : reports) {
            optionIds(r.getSuggestedOptionIds()).forEach(id -> picks.merge(id, 1L, Long::sum));
            if (r.getSuggestedAnswer() != null) texts.add(r.getSuggestedAnswer());
            if (outdated(r, lockVersion)) outdated++;
        }
        List<SuggestedOption> suggested = picks.entrySet().stream()
                .sorted(Map.Entry.<Long, Long>comparingByValue().reversed())
                .map(e -> {
                    AnswerOption o = options.get(e.getKey());
                    return new SuggestedOption(e.getKey(), o == null ? null : o.getOptionText(), o == null ? null : o.getIsCorrect(), e.getValue());
                }).toList();
        return new ReportSummary(counts(reports, QuestionIssueReport::getIssueType), counts(reports, r -> r.getSource() == null ? "UNKNOWN" : r.getSource()),
                suggested, texts, outdated);
    }

    static boolean outdated(QuestionIssueReport r, Long lockVersion) {
        return r.getQuestionLockVersion() != null && !r.getQuestionLockVersion().equals(lockVersion);
    }

    private static List<Count> counts(List<QuestionIssueReport> reports, Function<QuestionIssueReport, String> key) {
        return reports.stream().collect(Collectors.groupingBy(key, TreeMap::new, Collectors.counting()))
                .entrySet().stream().sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .map(e -> new Count(e.getKey(), e.getValue())).toList();
    }

    // ponytail: loads every response of the question to count option picks in Java; move to jsonb SQL if one question gets ~10k answers.
    private AnswerStats answers(Long questionId, List<AnswerOption> options) {
        Map<Long, long[]> picks = new LinkedHashMap<>();
        options.stream().sorted(Comparator.comparing(AnswerOption::getOrderIndex, Comparator.nullsLast(Comparator.naturalOrder())))
                .forEach(o -> picks.put(o.getOptionId(), new long[2]));

        long examCorrect = 0;
        BigDecimal scoreSum = BigDecimal.ZERO;
        long scored = 0;
        List<Object[]> exam = issues.examAnswers(questionId, FINISHED);
        for (Object[] row : exam) {
            if (Boolean.TRUE.equals(row[1])) examCorrect++;
            if (row[2] != null) {
                scoreSum = scoreSum.add((BigDecimal) row[2]);
                scored++;
            }
            countPicks((String) row[0], picks, 0);
        }
        long practiceCorrect = 0;
        List<Object[]> practice = issues.practiceAnswers(questionId);
        for (Object[] row : practice) {
            if (Boolean.TRUE.equals(row[1])) practiceCorrect++;
            countPicks((String) row[0], picks, 1);
        }
        long total = exam.size() + practice.size();
        Map<Long, AnswerOption> byId = options.stream().collect(Collectors.toMap(AnswerOption::getOptionId, Function.identity()));
        List<OptionPick> optionPicks = picks.entrySet().stream().map(e -> {
            AnswerOption o = byId.get(e.getKey());
            long[] n = e.getValue();
            return new OptionPick(e.getKey(), o.getOptionText(), o.getIsCorrect(), n[0], n[1], rate(n[0] + n[1], total));
        }).toList();
        BigDecimal average = scored == 0 ? null : scoreSum.divide(BigDecimal.valueOf(scored), 2, RoundingMode.HALF_UP);
        return new AnswerStats(exam.size(), examCorrect, rate(examCorrect, exam.size()), average,
                practice.size(), practiceCorrect, rate(practiceCorrect, practice.size()), optionPicks);
    }

    private void countPicks(String response, Map<Long, long[]> picks, int column) {
        JsonNode ids = read(response).path("selectedOptionIds");
        if (!ids.isArray()) return;
        Set<Long> seen = new HashSet<>();
        ids.forEach(id -> {
            long[] n = picks.get(id.asLong());
            if (n != null && seen.add(id.asLong())) n[column]++;
        });
    }

    private static Double rate(long part, long total) {
        return total == 0 ? null : Math.round(part * 1000.0 / total) / 10.0;
    }

    private List<ExamRef> exams(Long questionId) {
        Map<Long, Long> attempts = new HashMap<>();
        issues.attemptsPerExam(questionId).forEach(r -> attempts.put((Long) r[0], ((Number) r[1]).longValue()));
        Map<Long, Exam> exams = new LinkedHashMap<>();
        Set<Long> inPaper = new HashSet<>();
        for (Exam e : issues.examsWithQuestion(questionId)) {
            exams.put(e.getExamId(), e);
            inPaper.add(e.getExamId());
        }
        Set<Long> missing = new HashSet<>(attempts.keySet());
        missing.removeAll(exams.keySet());
        if (!missing.isEmpty()) {
            issues.findExams(missing).forEach(e -> exams.put(e.getExamId(), e));
        }
        return exams.values().stream()
                .map(e -> new ExamRef(e.getExamId(), e.getTitle(), e.getStatus(), e.getMode(), inPaper.contains(e.getExamId()),
                        attempts.getOrDefault(e.getExamId(), 0L)))
                .sorted(Comparator.comparingLong(ExamRef::attempts).reversed().thenComparing(ExamRef::examId))
                .toList();
    }

    private RegradeImpact impact(Question q) {
        int next = (q.getScoringVersion() == null ? 1 : q.getScoringVersion()) + 1;
        return new RegradeImpact(regrader.countPending(q.getQuestionId(), next), issues.countExamAnswers(q.getQuestionId(), Set.of("IN_PROGRESS")),
                AttemptGrader.isAutoGraded(q.getQuestionType()));
    }

    private List<RelatedIssue> related(QuestionIssue issue) {
        List<QuestionIssue> others = issues.findByQuestion_QuestionIdAndIssueIdNotOrderByCreatedAtDesc(issue.getQuestion().getQuestionId(), issue.getIssueId());
        if (others.isEmpty()) return List.of();
        Map<Long, Long> counts = new HashMap<>();
        issues.countReports(others.stream().map(QuestionIssue::getIssueId).toList())
                .forEach(r -> counts.put((Long) r[0], ((Number) r[1]).longValue()));
        return others.stream().map(i -> new RelatedIssue(i.getIssueId(), i.getIssueType(), i.getStatus(), i.getResolutionType(),
                counts.getOrDefault(i.getIssueId(), 0L), i.getCreatedAt(), i.getResolvedAt())).toList();
    }

    List<Long> optionIds(String json) {
        JsonNode node = read(json);
        if (!node.isArray()) return List.of();
        List<Long> ids = new ArrayList<>();
        node.forEach(n -> ids.add(n.asLong()));
        return ids;
    }

    JsonNode read(String json) {
        if (json == null || json.isBlank()) return objectMapper.missingNode();
        try {
            return objectMapper.readTree(json);
        } catch (Exception e) {
            return objectMapper.missingNode();
        }
    }
}
