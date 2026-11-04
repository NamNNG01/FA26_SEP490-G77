package com.examprep.services.student;

import com.examprep.dto.practice.ModulePracticeRequests;
import com.examprep.dto.practice.ModulePracticeResponses;
import org.springframework.data.domain.Page;

/**
 * Module Practice student APIs MP-01 … MP-04, MP-07, MP-08, MP-11 and MP-12: the session lifecycle,
 * the frozen paper, the session result, the review list and the practice-only reset.
 *
 * <p>Answer submission and answer history live in {@link ModulePracticeAnswerService}; the AI
 * explanation lives in {@link ModulePracticeAiService}.</p>
 */
public interface ModulePracticeService {

    /** MP-01: practice situation of one module for the authenticated student. */
    ModulePracticeResponses.Overview overview(Long userId, Long moduleId);

    /**
     * MP-02: starts a practice run, or returns the one already open on that module. Idempotent for
     * concurrent calls: the partial unique index on (user, module) WHERE status = 'IN_PROGRESS'
     * decides who wins, and the loser reads the winner's session back.
     */
    ModulePracticeResponses.SessionDetail startOrResume(Long userId, Long moduleId,
                                                        ModulePracticeRequests.StartSession request);

    /** MP-03: the session with its persisted question order and current progress. */
    ModulePracticeResponses.SessionDetail session(Long userId, Long sessionId);

    /** MP-04: one question of the session with the student's own attempts. */
    ModulePracticeResponses.QuestionView question(Long userId, Long sessionId, Long sessionQuestionId);

    /** MP-07: closes the session, keeping unanswered questions unanswered. Idempotent. */
    ModulePracticeResponses.SessionDetail complete(Long userId, Long sessionId);

    /** MP-08: unique-question statistics beside attempt statistics. */
    ModulePracticeResponses.Result result(Long userId, Long sessionId);

    /** MP-11: paged questions of one module whose latest finalized attempt is wrong. */
    Page<ModulePracticeResponses.ReviewItem> reviewQuestions(Long userId, Long moduleId, int page, int size);

    /** MP-12: deletes only this student's Module Practice data of this module. */
    ModulePracticeResponses.ResetResult resetProgress(Long userId, Long moduleId);
}
