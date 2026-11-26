package com.examprep.services.student;

import com.examprep.dto.student.QuestionCandidate;
import org.junit.jupiter.api.Test;

import java.util.*;
import java.util.stream.LongStream;

import static org.assertj.core.api.Assertions.assertThat;

class StudyPlannerTest {

    private static List<QuestionCandidate> bank(long moduleId, long firstId, int size) {
        return LongStream.range(firstId, firstId + size)
                .mapToObj(id -> new QuestionCandidate(id, moduleId, "M" + moduleId, "MEDIUM", "SINGLE_CHOICE", "q" + id)).toList();
    }

    @Test
    void profileLevels() {
        assertThat(new StudyPlanner.Profile(1L, "a", 10, 0, 0, 0, List.of()).mastery()).isEqualTo("NOT_STARTED");
        assertThat(new StudyPlanner.Profile(1L, "a", 10, 10, 3, 5, List.of()).mastery()).isEqualTo("WEAK");
        assertThat(new StudyPlanner.Profile(1L, "a", 10, 10, 10, 0, List.of()).mastery()).isEqualTo("MASTERED");
        // weak with notebook mistakes (80) > unexplored (75) > mastered (floor 10)
        int weak = new StudyPlanner.Profile(1L, "a", 10, 10, 3, 5, List.of()).priority();
        int fresh = new StudyPlanner.Profile(1L, "a", 10, 0, 0, 0, List.of()).priority();
        int mastered = new StudyPlanner.Profile(1L, "a", 10, 10, 10, 0, List.of()).priority();
        assertThat(weak).isGreaterThan(fresh);
        assertThat(fresh).isGreaterThan(mastered);
        assertThat(mastered).isEqualTo(10);
    }

    @Test
    void allocateFollowsPriorityAndCapsAtBank() {
        var weak = new StudyPlanner.Profile(1L, "weak", 30, 10, 2, 6, List.of());     // priority 100
        var strong = new StudyPlanner.Profile(2L, "strong", 30, 30, 29, 0, List.of()); // priority 10
        var tiny = new StudyPlanner.Profile(3L, "tiny", 2, 0, 0, 0, List.of());       // priority 75, only 2 questions
        List<Integer> split = StudyPlanner.allocate(List.of(weak, tiny, strong), 20);
        assertThat(split.stream().mapToInt(Integer::intValue).sum()).isEqualTo(20);
        assertThat(split.get(1)).isEqualTo(2);
        assertThat(split.get(0)).isGreaterThan(split.get(2));
        assertThat(split.get(2)).isGreaterThanOrEqualTo(1);
        // more than the pool holds: everything, no more
        assertThat(StudyPlanner.allocate(List.of(tiny), 5)).containsExactly(2);
    }

    @Test
    void drawPutsMistakesAndUnseenFirst() {
        List<QuestionCandidate> bank = bank(1, 1, 20);
        Map<Long, Boolean> latest = new HashMap<>();
        for (long id = 1; id <= 16; id++) latest.put(id, id > 6);        // 1..6 wrong, 7..16 right, 17..20 unseen
        Set<Long> stillWrong = Set.of(1L, 2L, 3L, 4L, 5L, 6L);
        var snapshot = new StudyPlanner.Snapshot(List.of(new StudyPlanner.Profile(1L, "M1", 20, 16, 10, 6, bank)), latest, stillWrong);
        List<Long> ids = StudyPlanner.draw(snapshot, List.of(8)).stream().map(QuestionCandidate::questionId).toList();
        assertThat(ids).hasSize(8).doesNotHaveDuplicates();
        assertThat(ids.stream().filter(stillWrong::contains)).hasSize(4 + 0); // half the share from the notebook ...
        assertThat(ids).contains(17L, 18L, 19L, 20L);                          // ... then every unseen question
    }
}
