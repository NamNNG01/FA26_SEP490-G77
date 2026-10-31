package com.examprep.services;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Group E async worker (API 31/32). The generate endpoint only queues a row; this worker will claim
 * it, call the model outside any transaction and settle the reservation.
 *
 * <p>Skeleton: the class exists so the service and its tests can wire it; the pipeline lands in
 * Task 10.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class FlashcardGenerationWorker {

    /** Queues one job; called by the service right after its transaction commits. */
    public void dispatch(Long logId) {
        // skeleton — logic lands in Task 10
    }

    /** Re-dispatches jobs stranded in PENDING and fails ones stuck in PROCESSING. */
    @Scheduled(initialDelayString = "${app.ai.flashcard.sweep-ms:60000}",
            fixedDelayString = "${app.ai.flashcard.sweep-ms:60000}")
    void sweep() {
        // skeleton — logic lands in Task 10
    }
}
