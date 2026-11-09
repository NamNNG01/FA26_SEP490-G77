package com.examprep.repositories;

import com.examprep.entities.QuestionIssueReport;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface QuestionIssueReportRepository extends JpaRepository<QuestionIssueReport, Long> {

    boolean existsByIssue_IssueIdAndUser_UserId(Long issueId, Long userId);

    long countByIssue_IssueId(Long issueId);

    @EntityGraph(attributePaths = "user")
    List<QuestionIssueReport> findByIssue_IssueIdOrderByCreatedAtAscReportIdAsc(Long issueId);

    List<QuestionIssueReport> findByIssue_IssueIdAndUser_UserIdOrderByCreatedAtAscReportIdAsc(Long issueId, Long userId);
}
