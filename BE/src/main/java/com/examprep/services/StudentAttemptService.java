package com.examprep.services;

import com.examprep.dto.PageResponse;
import com.examprep.dto.attempt.AttemptRequests;
import com.examprep.dto.attempt.AttemptResponses;

/**
 * The student attempt APIs (spec 6.1-6.5, 5.2, SA-Practice):
 * SA-01 start, SA-02 reload, SA-03 save drafts, SA-04 submit, SA-05 result, SA-06 history,
 * SA-07 cancel, SA-Practice check answer.
 */
public interface StudentAttemptService {

    /** SA-01: creates (or replays) the attempt and returns the frozen paper. */
    AttemptResponses.Session start(Long userId, Long examId, String idempotencyKey);

    /** SA-02: the frozen paper plus the drafts already stored. */
    AttemptResponses.Session get(Long userId, Long attemptId);

    /** SA-03: batch draft save with per-entry outcome. */
    AttemptResponses.DraftSaved saveDrafts(Long userId, Long attemptId, AttemptRequests.DraftSave body);

    /** SA-04: applies the last drafts, grades and closes the attempt. */
    AttemptResponses.Submitted submit(Long userId, Long attemptId, AttemptRequests.Submit body);

    /** SA-05: the graded result of one attempt. */
    AttemptResponses.Result result(Long userId, Long attemptId);

    /** SA-06: every attempt of one exam, newest first, paged inside the database. */
    PageResponse<AttemptResponses.HistoryItem> history(Long userId, Long examId, int page, int size);

    /** SA-07: discards an attempt still in progress, keeping nothing of it. */
    AttemptResponses.Cancelled cancel(Long userId, Long attemptId);

    /** SA-08: acknowledges review result and deletes review attempt data. */
    void acknowledgeReview(Long userId, Long attemptId);

    /**
     * SA-Practice: checks a single question's answer immediately on a practice attempt and locks it.
     */
    AttemptResponses.CheckResult checkAnswer(Long userId, Long attemptId, Long questionId, AttemptRequests.Check body);
}
