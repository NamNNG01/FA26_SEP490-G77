package com.examprep.services.manager.review;

import com.examprep.entities.User;

import java.time.Instant;
import java.util.Map;

public interface ContributionReviewService {

    Map<String, Object> listContributions(Long managerId, Long courseId, Long moduleId, String questionType,
                                          String difficulty, String status, Long contributorId,
                                          String keyword, Instant submittedFrom, Instant submittedTo,
                                          int page, int size, String sort);

    Map<String, Object> getContributionDetail(Long managerId, Long id);

    Map<String, Object> approve(Long managerId, Long id, Long requestVersion, String note);

    Map<String, Object> approve(User manager, Long id, Long requestVersion, String note);

    Map<String, Object> reject(Long managerId, Long id, Long requestVersion, String reason);

    Map<String, Object> reject(User manager, Long id, Long requestVersion, String reason);

    Map<String, Object> stats(Long managerId, Long courseId);

    Map<String, Object> stats(User manager, Long courseId);
}
