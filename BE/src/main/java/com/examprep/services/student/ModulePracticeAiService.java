package com.examprep.services.student;

import com.examprep.dto.practice.ModulePracticeRequests;
import com.examprep.dto.practice.ModulePracticeResponses;

/**
 * Module Practice student API MP-09: an AI explanation of one practice question.
 *
 * <p>Reuses the platform's AI stack end to end — {@code AiClient} via {@code AiCalls},
 * {@link com.examprep.services.AiQuotaService} for reservation and settlement, and
 * {@code ai_usage_logs} with purpose {@code EXPLANATION} — so a practice explanation is billed and
 * throttled exactly like the exam one.</p>
 */
public interface ModulePracticeAiService {

    /** MP-09: explains the referenced attempt from the session's frozen snapshots. */
    ModulePracticeResponses.Explanation explain(Long userId, Long questionId,
                                                ModulePracticeRequests.Explanation request);
}
