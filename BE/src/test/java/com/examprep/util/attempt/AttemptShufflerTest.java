package com.examprep.util.attempt;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Spec 6.1 rule 3: the paper is shuffled from the attempt's own seed, so the same seed always
 * reproduces the same order and the shuffle never mutates the source list.
 */
class AttemptShufflerTest {

    private static List<Integer> numbers() {
        List<Integer> values = new ArrayList<>();
        for (int i = 1; i <= 40; i++) {
            values.add(i);
        }
        return values;
    }

    @Test
    void theSameSeedReproducesTheSameOrder() {
        List<Integer> first = new AttemptShuffler(42L).shuffle(numbers());
        List<Integer> second = new AttemptShuffler(42L).shuffle(numbers());
        assertEquals(first, second);
    }

    @Test
    void aDifferentSeedProducesADifferentOrder() {
        // 40! orders: a collision would mean the seed is ignored.
        List<Integer> first = new AttemptShuffler(42L).shuffle(numbers());
        List<Integer> second = new AttemptShuffler(43L).shuffle(numbers());
        assertNotEquals(first, second);
    }

    @Test
    void shufflingIsAPermutationAndLeavesTheSourceUntouched() {
        List<Integer> source = numbers();
        List<Integer> shuffled = new AttemptShuffler(7L).shuffle(source);

        assertEquals(source, numbers(), "the source list must not be modified");
        assertEquals(new HashSet<>(source), new HashSet<>(shuffled));
        assertEquals(source.size(), shuffled.size());
    }

    @Test
    void consecutiveShufflesOfTheSameInstanceKeepAdvancing() {
        AttemptShuffler shuffler = new AttemptShuffler(11L);
        List<Integer> options = List.of(1, 2, 3);
        Set<List<Integer>> seen = new HashSet<>();
        for (int i = 0; i < 6; i++) {
            seen.add(shuffler.shuffle(options));
        }
        assertTrue(seen.size() > 1, "the same instance must not repeat one fixed order forever");
    }

    @Test
    void newSeedIsFreshAndNonZeroOnAverage() {
        Set<Long> seeds = new HashSet<>();
        for (int i = 0; i < 20; i++) {
            seeds.add(AttemptShuffler.newSeed());
        }
        assertTrue(seeds.size() > 15, "seeds must not repeat");
    }
}
