package com.examprep.services.manager.review;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import com.examprep.entities.QuestionContribution;
import com.examprep.entities.User;

import java.time.Instant;
import java.util.Map;

public interface ContributionReviewService {
    Page<QuestionContribution> listContributions(User manager, Long courseId, Long moduleId, String questionType,
                                                String difficulty, String status, Long contributorId,
                                                String keyword, Instant submittedFrom, Instant submittedTo, Pageable pageable);

    QuestionContribution getContributionDetail(User manager, Long id);

    Map<String, Object> approve(User manager, Long id, Long requestVersion, String note);

    Map<String, Object> reject(User manager, Long id, Long requestVersion, String reason);

    Map<String, Object> stats(User manager, Long courseId);
}
