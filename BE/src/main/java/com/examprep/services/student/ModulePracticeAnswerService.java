package com.examprep.services.student;

import com.examprep.dto.practice.ModulePracticeRequests;
import com.examprep.dto.practice.ModulePracticeResponses;

/**
 * Module Practice student APIs MP-05 (submit one attempt) and MP-06 (read the attempt history).
 *
 * <p>Attempts are append-only: a submission always stores a new row with the next
 * {@code attempt_number} and never rewrites an earlier one.</p>
 */
public interface ModulePracticeAnswerService {

    /** MP-05: stores one attempt, grades it and answers with the outcome. */
    ModulePracticeResponses.AnswerSubmitted submit(Long userId, Long sessionId, Long sessionQuestionId,
                                                   ModulePracticeRequests.SubmitAnswer request);

    /** MP-06: every attempt of one session question, oldest first. */
    ModulePracticeResponses.AnswerHistory history(Long userId, Long sessionId, Long sessionQuestionId);
}
