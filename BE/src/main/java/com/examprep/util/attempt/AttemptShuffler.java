package com.examprep.util.attempt;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;

/**
 * Deterministic shuffling for one attempt (spec 6.1 rule 3).
 *
 * <p>One {@link Random} is created from the attempt's own {@code shuffleSeed} and consumed in a
 * fixed order: question list first, then the option list of every question in paper order, then
 * the two columns of every matching question. Because the sequence of calls is the same every
 * time, a seed always reproduces the same paper.</p>
 *
 * <p>The seed is stored in {@code exam_snapshot.shuffleSeed} and never re-used by another
 * attempt, so every student sees a different order.</p>
 */
public final class AttemptShuffler {

    private static final SecureRandom SEED_SOURCE = new SecureRandom();

    private final Random random;

    public AttemptShuffler(long seed) {
        this.random = new Random(seed);
    }

    /** A fresh seed for a new attempt. */
    public static long newSeed() {
        return SEED_SOURCE.nextLong();
    }

    /**
     * Returns a shuffled copy of {@code items}. The input list is never modified, so callers can
     * keep using the natural (database) order for anything else.
     */
    public <T> List<T> shuffle(List<T> items) {
        List<T> copy = new ArrayList<>(items);
        Collections.shuffle(copy, random);
        return copy;
    }
}
