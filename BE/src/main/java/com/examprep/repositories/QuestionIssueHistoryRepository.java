package com.examprep.repositories;

import com.examprep.entities.QuestionIssueHistory;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface QuestionIssueHistoryRepository extends JpaRepository<QuestionIssueHistory, Long> {

    @EntityGraph(attributePaths = "actor")
    List<QuestionIssueHistory> findByIssue_IssueIdOrderByCreatedAtAscHistoryIdAsc(Long issueId);
}
