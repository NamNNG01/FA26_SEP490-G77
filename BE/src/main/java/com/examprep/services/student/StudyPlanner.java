package com.examprep.services.student;

import com.examprep.dto.student.QuestionCandidate;
import com.examprep.repositories.LearningStatsRepository;
import com.examprep.repositories.StudentQuestionReviewRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * Where one student stands in each module of a course, and how a personalized practice exam spreads its questions over
 * the modules. Pure numbers from the student's answers and mistake notebook: no AI, no quota.
 * A question counts by its latest graded answer, like {@link LearningStats}.
 */
@Component
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class StudyPlanner {
    private final LearningStatsRepository stats;
    private final StudentQuestionReviewRepository reviews;

    /** One module (moduleId null = course questions outside any module) restricted to the given question pool. */
    public record Profile(Long moduleId, String name, int bankSize, int answered, int correct, int stillWrong,
                          List<QuestionCandidate> bank) {
        public int accuracy() { return LearningStats.percent(correct, answered); }

        public int coverage() { return LearningStats.percent(answered, bankSize); }

        public String mastery() {
            if (answered == 0) return "NOT_STARTED";
            if (answered < LearningStats.MIN_QUESTIONS) return "LEARNING";
            int accuracy = accuracy();
            if (accuracy < PersonalizationService.WEAK_BELOW) return "WEAK";
            if (accuracy < PersonalizationService.STRONG_FROM) return "LEARNING";
            return accuracy >= 90 && stillWrong == 0 && coverage() >= 80 ? "MASTERED" : "STRONG";
        }

        /**
         * 10..100, higher = needs more practice: the share answered wrong (an unexplored module counts as 60, below a
         * clearly weak one; thin data leans towards that), plus 2 per still-wrong notebook question (max +20), plus up
         * to 15 for the unseen share. The floor of 10 keeps strong modules in rotation (about a tenth of the questions).
         */
        public int priority() {
            double need = answered == 0 ? 60 : 100 - accuracy();
            if (answered > 0 && answered < LearningStats.MIN_QUESTIONS) need = (need + 60) / 2;
            need += 2 * Math.min(stillWrong, 10) + 15 * (1 - (double) answered / Math.max(1, bankSize));
            return (int) Math.max(10, Math.min(100, Math.round(need)));
        }
    }

    /** Modules by priority (highest first), plus the latest verdict per question and the still-wrong question ids. */
    public record Snapshot(List<Profile> modules, Map<Long, Boolean> latest, Set<Long> stillWrong) { }

    public Snapshot snapshot(Long userId, Long courseId, List<QuestionCandidate> pool) {
        Map<Long, Boolean> latest = new HashMap<>();
        for (Object[] r : stats.verdicts(userId, courseId, LearningStats.ALL_TIME)) latest.put((Long) r[0], (Boolean) r[5]);
        List<Long> ids = pool.stream().map(QuestionCandidate::questionId).toList();
        // ponytail: one IN over the whole pool; page it if a course bank grows past a few thousand questions.
        Set<Long> stillWrong = ids.isEmpty() ? Set.of() : new HashSet<>(reviews.findWrongQuestionIdsIn(userId, ids));
        Map<Long, List<QuestionCandidate>> byModule = new LinkedHashMap<>();
        for (QuestionCandidate c : pool) byModule.computeIfAbsent(c.moduleId(), k -> new ArrayList<>()).add(c);
        List<Profile> modules = new ArrayList<>();
        byModule.forEach((moduleId, bank) -> {
            int answered = 0, correct = 0, wrong = 0;
            for (QuestionCandidate c : bank) {
                Boolean verdict = latest.get(c.questionId());
                if (verdict != null) {
                    answered++;
                    if (verdict) correct++;
                }
                if (stillWrong.contains(c.questionId())) wrong++;
            }
            String name = bank.get(0).moduleTitle() == null ? "General" : bank.get(0).moduleTitle();
            modules.add(new Profile(moduleId, name, bank.size(), answered, correct, wrong, bank));
        });
        // Priority caps at 100, so ties go to the module with more open mistakes, then more evidence.
        modules.sort(Comparator.comparingInt(Profile::priority).reversed()
                .thenComparing(Comparator.comparingInt(Profile::stillWrong).reversed())
                .thenComparing(Comparator.comparingInt(Profile::answered).reversed())
                .thenComparing(Profile::name));
        return new Snapshot(modules, latest, stillWrong);
    }

    /**
     * Questions per module, aligned with {@code modules}: D'Hondt over the priorities, so each question goes to the module
     * with the highest priority / (questions it already got + 1) that still has unused questions.
     */
    public static List<Integer> allocate(List<Profile> modules, int count) {
        int[] given = new int[modules.size()];
        for (int q = 0; q < count; q++) {
            int best = -1;
            double bestScore = -1;
            for (int i = 0; i < modules.size(); i++) {
                if (given[i] >= modules.get(i).bankSize()) continue;
                double score = (double) modules.get(i).priority() / (given[i] + 1);
                if (score > bestScore) {
                    best = i;
                    bestScore = score;
                }
            }
            if (best < 0) break;
            given[best]++;
        }
        return Arrays.stream(given).boxed().toList();
    }

    /**
     * Draws each module's share: still-wrong notebook questions up to half of it, then never-answered ones, then the
     * other still-wrong ones, then those last answered wrong, then the rest; random inside each tier, shuffled at the end.
     */
    public static List<QuestionCandidate> draw(Snapshot snapshot, List<Integer> split) {
        List<QuestionCandidate> drawn = new ArrayList<>();
        for (int i = 0; i < split.size(); i++) {
            int share = split.get(i);
            if (share == 0) continue;
            List<QuestionCandidate> bank = new ArrayList<>(snapshot.modules().get(i).bank());
            Collections.shuffle(bank);
            int wrongCap = (share + 1) / 2, wrongTaken = 0;
            Map<Long, Integer> tier = new HashMap<>();
            for (QuestionCandidate c : bank) {
                Boolean last = snapshot.latest().get(c.questionId());
                int t;
                if (snapshot.stillWrong().contains(c.questionId())) t = wrongTaken++ < wrongCap ? 0 : 2;
                else t = last == null ? 1 : !last ? 3 : 4;
                tier.put(c.questionId(), t);
            }
            bank.sort(Comparator.comparingInt(c -> tier.get(c.questionId())));
            drawn.addAll(bank.subList(0, Math.min(share, bank.size())));
        }
        Collections.shuffle(drawn);
        return drawn;
    }
}
