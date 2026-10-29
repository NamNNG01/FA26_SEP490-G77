package com.examprep.services;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Pure rules of the student AI quota (spec section 9 / 25): the token estimate, the FREE-then-PLAN
 * allocation and the remaining-token arithmetic. Database settlement/reservation is covered by the
 * MQ-03 and AI integration suites.
 */
class AiQuotaServiceTest {

    private final AiQuotaService quota = new AiQuotaService(null, null, null);

    // ----------------------------------------------------------------------------------
    // estimate: ceil(promptChars / 2.5) x 1.3 + output budget
    // ----------------------------------------------------------------------------------

    @Test
    void estimateMatchesTheSpecFormula() {
        assertEquals(0, AiQuotaService.estimate(0, 0));
        assertEquals(300, AiQuotaService.estimate(0, 300));
        // 1 char -> ceil(0.4) = 1 -> 1.3 -> ceil = 2
        assertEquals(302, AiQuotaService.estimate(1, 300));
        // 3 chars -> ceil(1.2) = 2 -> 2.6 -> ceil = 3
        assertEquals(303, AiQuotaService.estimate(3, 300));
        // 11 chars -> ceil(4.4) = 5 -> 6.5 -> ceil = 7
        assertEquals(307, AiQuotaService.estimate(11, 300));
        // The output budget is added after the prompt estimate, never scaled.
        assertEquals(607, AiQuotaService.estimate(11, 600));
    }

    @Test
    void estimateGrowsWithThePrompt() {
        assertTrue(AiQuotaService.estimate(10_000, 300) > AiQuotaService.estimate(1_000, 300));
        assertTrue(AiQuotaService.estimate(1_000, 600) > AiQuotaService.estimate(1_000, 300));
    }

    // ----------------------------------------------------------------------------------
    // Snapshot arithmetic
    // ----------------------------------------------------------------------------------

    @Test
    void remainingNeverGoesNegativeAndSumsBothSources() {
        Instant start = Instant.parse("2026-10-01T00:00:00Z");
        AiQuotaService.Snapshot noPlan = new AiQuotaService.Snapshot(
                20_000, 5_000, 1_000, start.plusSeconds(86_400), null, 0, null, null, 0, 0);
        assertEquals(14_000, noPlan.freeRemaining());
        assertEquals(0, noPlan.planRemaining());
        assertEquals(14_000, noPlan.available());

        AiQuotaService.Snapshot withPlan = new AiQuotaService.Snapshot(
                20_000, 25_000, 0, start.plusSeconds(86_400), "PRO", 100_000, start,
                start.plusSeconds(2_592_000), 40_000, 10_000);
        assertEquals(0, withPlan.freeRemaining()); // over the daily limit floors at zero
        assertEquals(50_000, withPlan.planRemaining());
        assertEquals(50_000, withPlan.available());

        AiQuotaService.Snapshot exhaustedPlan = new AiQuotaService.Snapshot(
                20_000, 20_000, 0, start, "PRO", 100_000, start, start.plusSeconds(2_592_000),
                90_000, 10_000);
        assertEquals(0, exhaustedPlan.freeRemaining());
        assertEquals(0, exhaustedPlan.planRemaining());
        assertEquals(0, exhaustedPlan.available());
    }

    // ----------------------------------------------------------------------------------
    // allocate: FREE first, then PLAN, all-or-nothing
    // ----------------------------------------------------------------------------------

    private AiQuotaService.Snapshot snapshot(long freeLimit, long freeUsed, long planLimit,
                                             long planUsed, long planReserved) {
        return new AiQuotaService.Snapshot(freeLimit, freeUsed, 0, Instant.parse("2026-10-02T00:00:00Z"),
                planLimit > 0 ? "PRO" : null, planLimit, Instant.parse("2026-10-01T00:00:00Z"),
                Instant.parse("2026-11-01T00:00:00Z"), planUsed, planReserved);
    }

    @Test
    void allocateFillsFreeFirstThenPlan() {
        AiQuotaService.Snapshot snapshot = snapshot(100, 20, 1_000, 0, 0); // free 80, plan 1000
        assertEquals(List.of(AiQuotaService.FREE, AiQuotaService.FREE),
                quota.allocate(snapshot, List.of(30L, 50L)));
        assertEquals(List.of(AiQuotaService.FREE, AiQuotaService.PLAN),
                quota.allocate(snapshot, List.of(80L, 50L)));
        assertEquals(List.of(AiQuotaService.FREE, AiQuotaService.PLAN),
                quota.allocate(snapshot, List.of(30L, 500L)));
        assertEquals(List.of(AiQuotaService.PLAN),
                quota.allocate(snapshot, List.of(81L)));
        assertEquals(List.of(AiQuotaService.FREE),
                quota.allocate(snapshot, List.of(80L)));
        assertEquals(List.of(AiQuotaService.PLAN),
                quota.allocate(snapshot, List.of(1_000L)));
    }

    @Test
    void allocateRejectsTheWholeRequestWhenOneEstimateDoesNotFit() {
        AiQuotaService.Snapshot freeOnly = snapshot(100, 0, 0, 0, 0);
        assertNull(quota.allocate(freeOnly, List.of(60L, 60L)));
        assertNull(quota.allocate(freeOnly, List.of(101L)));

        AiQuotaService.Snapshot withPlan = snapshot(100, 0, 500, 0, 0);
        assertNull(quota.allocate(withPlan, List.of(100L, 501L)));
    }

    @Test
    void allocateWithNoEstimatesReturnsAnEmptyPlan() {
        assertEquals(List.of(), quota.allocate(snapshot(100, 0, 0, 0, 0), List.of()));
    }

    @Test
    void allocateFallsBackToPlanWhenFreeIsAlreadyExhausted() {
        AiQuotaService.Snapshot snapshot = snapshot(100, 100, 500, 100, 0); // free 0, plan 400
        assertEquals(List.of(AiQuotaService.PLAN), quota.allocate(snapshot, List.of(400L)));
        assertNull(quota.allocate(snapshot, List.of(401L)));
    }
}
