package com.examprep.services.student;

import com.examprep.repositories.LearningStatsRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.function.Function;

/**
 * Per-module (the API calls them categories), per-type and per-difficulty accuracy of one student in one course, with a
 * 7-day trend. A question counts once, by its latest graded answer, so retrying it does not pile up and a mistake the
 * student has since fixed no longer drags the module down.
 */
@Component
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class LearningStats {
    public static final Instant ALL_TIME = Instant.EPOCH;
    /** Fewer distinct questions than this and a module is too thin to call strong or weak. */
    public static final int MIN_QUESTIONS = 3;
    private static final int TREND_POINTS = 5;
    private static final List<String> DIFFICULTIES = List.of("EASY", "MEDIUM", "HARD");

    private final LearningStatsRepository repository;

    /** categoryId/name are the module's id/title; null/"Chung" for questions outside any module. Counts are distinct questions. */
    public record ModuleStat(Long categoryId, String name, int accuracy, int questionCount, int correctCount, String trend) {
        public boolean enoughData() { return questionCount >= MIN_QUESTIONS; }
    }

    public record TypeStat(String questionType, int accuracy, int questionCount, String trend) { }

    public record DifficultyStat(String difficulty, int accuracy, int questionCount, String trend) { }

    /** A visible module with live questions the student has not answered in the period. */
    public record Topic(Long categoryId, String name) { }

    public record Stats(int finishedAttempts, int wrongAnswers, List<ModuleStat> modules, List<TypeStat> types,
                        List<DifficultyStat> difficulties, List<Topic> notPracticed) { }

    private record Verdict(Long questionId, Long moduleId, String moduleName, String type, String difficulty, boolean correct, Instant at) { }

    public Stats forStudent(Long userId, Long courseId, Instant from) {
        Instant now = Instant.now();
        Instant weekAgo = now.minus(7, ChronoUnit.DAYS), twoWeeksAgo = now.minus(14, ChronoUnit.DAYS);
        // ponytail: loads every graded answer of the student in the course into memory; aggregate in SQL if one student
        // ever reaches hundreds of thousands of answers in a course.
        List<Verdict> all = repository.verdicts(userId, courseId, from.isBefore(twoWeeksAgo) ? from : twoWeeksAgo).stream()
                .map(r -> new Verdict((Long) r[0], (Long) r[1], (String) r[2], (String) r[3], (String) r[4], (Boolean) r[5], (Instant) r[6]))
                .toList();
        Collection<Verdict> period = latest(all, v -> !v.at().isBefore(from));
        Collection<Verdict> recent = latest(all, v -> !v.at().isBefore(weekAgo));
        Collection<Verdict> before = latest(all, v -> !v.at().isBefore(twoWeeksAgo) && v.at().isBefore(weekAgo));

        Function<Verdict, Object> byModule = v -> v.moduleId() == null ? "none" : v.moduleId();
        Map<Object, int[]> moduleRecent = tally(recent, byModule), moduleBefore = tally(before, byModule);
        Map<Object, String> names = new HashMap<>();
        period.forEach(v -> names.put(byModule.apply(v), v.moduleName() == null ? "Chung" : v.moduleName()));
        List<ModuleStat> modules = new ArrayList<>();
        tally(period, byModule).forEach((key, t) -> modules.add(new ModuleStat(key instanceof Long id ? id : null, names.get(key),
                percent(t[1], t[0]), t[0], t[1], trend(moduleRecent.get(key), moduleBefore.get(key)))));
        modules.sort(Comparator.comparingInt(ModuleStat::accuracy).thenComparing(ModuleStat::name));

        Map<Object, int[]> typeRecent = tally(recent, Verdict::type), typeBefore = tally(before, Verdict::type);
        List<TypeStat> types = new ArrayList<>();
        tally(period, Verdict::type).forEach((type, t) -> types.add(new TypeStat((String) type, percent(t[1], t[0]), t[0],
                trend(typeRecent.get(type), typeBefore.get(type)))));
        types.sort(Comparator.comparing(TypeStat::questionType));

        Function<Verdict, Object> byDifficulty = v -> v.difficulty() == null ? "" : v.difficulty().toUpperCase(Locale.ROOT);
        Map<Object, int[]> diffPeriod = tally(period, byDifficulty), diffRecent = tally(recent, byDifficulty), diffBefore = tally(before, byDifficulty);
        List<DifficultyStat> difficulties = new ArrayList<>();
        for (String d : DIFFICULTIES) {
            int[] t = diffPeriod.get(d);
            if (t != null) difficulties.add(new DifficultyStat(d, percent(t[1], t[0]), t[0], trend(diffRecent.get(d), diffBefore.get(d))));
        }

        Set<Object> practised = names.keySet();
        List<Topic> notPracticed = repository.practicableModules(courseId).stream()
                .filter(r -> !practised.contains(r[0])).map(r -> new Topic((Long) r[0], (String) r[1])).toList();

        return new Stats((int) repository.finishedAttempts(userId, courseId, from),
                (int) repository.wrongCount(userId, courseId, from), modules, types, difficulties, notPracticed);
    }

    /** The latest verdict per question among those kept (verdicts come oldest first). */
    private static Collection<Verdict> latest(List<Verdict> verdicts, java.util.function.Predicate<Verdict> keep) {
        Map<Long, Verdict> byQuestion = new LinkedHashMap<>();
        for (Verdict v : verdicts) if (keep.test(v)) byQuestion.put(v.questionId(), v);
        return byQuestion.values();
    }

    /** key -> [questions, correct]. */
    private static Map<Object, int[]> tally(Collection<Verdict> verdicts, Function<Verdict, Object> key) {
        Map<Object, int[]> map = new LinkedHashMap<>();
        for (Verdict v : verdicts) {
            int[] t = map.computeIfAbsent(key.apply(v), k -> new int[2]);
            t[0]++;
            if (v.correct()) t[1]++;
        }
        return map;
    }

    /** Last 7 days against the 7 before: a change of 5 accuracy points or more; no data on either side is STABLE. */
    static String trend(int[] recent, int[] before) {
        if (recent == null || before == null || recent[0] == 0 || before[0] == 0) return "STABLE";
        int delta = percent(recent[1], recent[0]) - percent(before[1], before[0]);
        return delta >= TREND_POINTS ? "IMPROVING" : delta <= -TREND_POINTS ? "DECLINING" : "STABLE";
    }

    static int percent(long part, long whole) { return whole == 0 ? 0 : (int) Math.round(100.0 * part / whole); }
}
