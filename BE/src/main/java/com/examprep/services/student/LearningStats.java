package com.examprep.services.student;

import com.examprep.repositories.LearningStatsRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

/** Per-module (the API calls them categories) and per-type accuracy of one student in one course, with a 7-day trend. */
@Component
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class LearningStats {
    public static final Instant ALL_TIME = Instant.EPOCH;
    private static final Instant FOREVER = Instant.parse("9999-01-01T00:00:00Z");
    private static final int TREND_POINTS = 5;

    private final LearningStatsRepository repository;

    /** categoryId/name are the module's id/title; null/"Chung" for questions outside any module. */
    public record ModuleStat(Long categoryId, String name, int accuracy, int questionCount, int correctCount, String trend) { }

    public record TypeStat(String questionType, int accuracy, int questionCount, String trend) { }

    public record Stats(int finishedAttempts, int wrongAnswers, List<ModuleStat> modules, List<TypeStat> types) { }

    public Stats forStudent(Long userId, Long courseId, Instant from) {
        Instant now = Instant.now();
        Instant weekAgo = now.minus(7, ChronoUnit.DAYS), twoWeeksAgo = now.minus(14, ChronoUnit.DAYS);
        Map<Object, long[]> recent = totals(repository.moduleTotals(userId, courseId, weekAgo, FOREVER), 2);
        Map<Object, long[]> before = totals(repository.moduleTotals(userId, courseId, twoWeeksAgo, weekAgo), 2);
        List<ModuleStat> modules = new ArrayList<>();
        for (Object[] row : repository.moduleTotals(userId, courseId, from, FOREVER)) {
            long answered = ((Number) row[2]).longValue(), correct = ((Number) row[3]).longValue();
            modules.add(new ModuleStat((Long) row[0], row[1] == null ? "Chung" : (String) row[1], percent(correct, answered),
                    (int) answered, (int) correct, trend(recent.get(key(row[0])), before.get(key(row[0])))));
        }
        modules.sort(Comparator.comparingInt(ModuleStat::accuracy).thenComparing(ModuleStat::name));
        Map<Object, long[]> typeRecent = totals(repository.typeTotals(userId, courseId, weekAgo, FOREVER), 1);
        Map<Object, long[]> typeBefore = totals(repository.typeTotals(userId, courseId, twoWeeksAgo, weekAgo), 1);
        List<TypeStat> types = new ArrayList<>();
        for (Object[] row : repository.typeTotals(userId, courseId, from, FOREVER)) {
            long answered = ((Number) row[1]).longValue(), correct = ((Number) row[2]).longValue();
            types.add(new TypeStat((String) row[0], percent(correct, answered), (int) answered,
                    trend(typeRecent.get(row[0]), typeBefore.get(row[0]))));
        }
        types.sort(Comparator.comparing(TypeStat::questionType));
        return new Stats((int) repository.finishedAttempts(userId, courseId, from),
                (int) repository.wrongCount(userId, courseId, from), modules, types);
    }

    /** Last 7 days against the 7 before: a change of 5 accuracy points or more; no data on either side is STABLE. */
    static String trend(long[] recent, long[] before) {
        if (recent == null || before == null || recent[0] == 0 || before[0] == 0) return "STABLE";
        int delta = percent(recent[1], recent[0]) - percent(before[1], before[0]);
        return delta >= TREND_POINTS ? "IMPROVING" : delta <= -TREND_POINTS ? "DECLINING" : "STABLE";
    }

    static int percent(long part, long whole) { return whole == 0 ? 0 : (int) Math.round(100.0 * part / whole); }

    /** first column -> [answered, correct], the answered count being at column countAt. */
    private static Map<Object, long[]> totals(List<Object[]> rows, int countAt) {
        Map<Object, long[]> map = new HashMap<>();
        for (Object[] row : rows) {
            map.put(key(row[0]), new long[]{((Number) row[countAt]).longValue(), ((Number) row[countAt + 1]).longValue()});
        }
        return map;
    }

    private static Object key(Object value) { return value == null ? "none" : value; }
}
