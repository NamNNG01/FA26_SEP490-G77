package com.examprep.repositories;

import com.examprep.entities.ManagerExplanationJobItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

@Repository
public interface ManagerExplanationJobItemRepository extends JpaRepository<ManagerExplanationJobItem, Long> {

    List<ManagerExplanationJobItem> findByJob_JobIdOrderByItemIdAsc(Long jobId);

    @Query("SELECT DISTINCT i.question.questionId FROM ManagerExplanationJobItem i "
            + "WHERE i.question.questionId IN :questionIds "
            + "AND i.status = 'PENDING' "
            + "AND i.job.status IN ('PENDING', 'PROCESSING')")
    List<Long> findPendingQuestionIds(@Param("questionIds") Collection<Long> questionIds);

    @Query("SELECT i.question.questionId, i.status FROM ManagerExplanationJobItem i "
            + "WHERE i.itemId IN ("
            + "  SELECT MAX(i2.itemId) FROM ManagerExplanationJobItem i2 "
            + "  WHERE i2.question.questionId IN :questionIds GROUP BY i2.question.questionId"
            + ")")
    List<Object[]> findLatestItemStatusesByQuestionIds(@Param("questionIds") Collection<Long> questionIds);
}
