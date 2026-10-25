package com.examprep.services;

import com.examprep.dto.PageResponse;
import com.examprep.dto.attempt.AttemptRequests;
import com.examprep.dto.attempt.AttemptResponses;

/**
 * The six student attempt APIs (spec 6.1-6.5, 5.2):
 * SA-01 start, SA-02 reload, SA-03 save drafts, SA-04 submit, SA-05 result, SA-06 history.
 */
public interface StudentAttemptService {

    /** SA-01: creates (or replays) the attempt and returns the frozen paper. */
    AttemptResponses.Session start(Long userId, Long examId, String idempotencyKey);
}
