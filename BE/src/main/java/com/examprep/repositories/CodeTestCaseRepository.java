package com.examprep.repositories;

import com.examprep.entities.CodeTestCase;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

@Repository
public interface CodeTestCaseRepository extends JpaRepository<CodeTestCase, Long> {
    List<CodeTestCase> findByQuestionQuestionIdAndHiddenOrderByOrderIndexAscTestCaseIdAsc(Long questionId, Boolean hidden);
    List<CodeTestCase> findByQuestionQuestionIdOrderByOrderIndexAscTestCaseIdAsc(Long questionId);

    /** CD-03/CD-05: every fixture of several questions in one query, in judging order. */
    @Query("SELECT c FROM CodeTestCase c WHERE c.question.questionId IN :ids "
            + "ORDER BY c.question.questionId, c.orderIndex, c.testCaseId")
    List<CodeTestCase> findByQuestionIds(@Param("ids") Collection<Long> ids);
}
