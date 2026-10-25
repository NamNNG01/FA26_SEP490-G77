package com.examprep.services;

import com.examprep.dto.StudentAiRequests;
import com.examprep.dto.StudentAiResponse;
import com.examprep.security.UserPrincipal;

public interface StudentAiService {
    StudentAiResponse.ExplanationBatch explain(UserPrincipal user, Long attemptId, StudentAiRequests.ExplanationBatch request);

    StudentAiResponse.Grading grade(UserPrincipal user, Long attemptId, StudentAiRequests.Grading request);

    StudentAiResponse.Quota quota(UserPrincipal user);
}
