package com.examprep.repositories;

import com.examprep.entities.Question;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface QuestionRepository extends JpaRepository<Question, Long>, JpaSpecificationExecutor<Question> {

    @Query("SELECT q FROM Question q WHERE q.questionId = :id AND q.deletedAt IS NULL")
    Optional<Question> findActiveById(@Param("id") Long id);

    @Query("SELECT COUNT(o) FROM AnswerOption o WHERE o.question.questionId = :questionId")
    long countOptionsByQuestionId(@Param("questionId") Long questionId);

    @Query("SELECT q.questionId FROM Question q WHERE q.course.courseId = :courseId " +
            "AND q.status = 'ACTIVE' AND q.approvalStatus = 'APPROVED' AND q.deletedAt IS NULL " +
            "AND (:questionType IS NULL OR q.questionType = :questionType) " +
            "AND (:difficulty IS NULL OR q.difficulty = :difficulty) " +
            "AND (:moduleId IS NULL OR q.module.moduleId = :moduleId)")
    List<Long> findActiveIdsByCriteria(@Param("courseId") Long courseId,
                                       @Param("questionType") String questionType,
                                       @Param("difficulty") String difficulty,
                                       @Param("moduleId") Long moduleId);

    @Query("SELECT q.group.groupId, COUNT(q) FROM Question q " +
            "WHERE q.group.groupId IN :groupIds " +
            "GROUP BY q.group.groupId")
    List<Object[]> countByGroupIds(@Param("groupIds") Collection<Long> groupIds);

    @Modifying
    @Query("UPDATE Question q SET q.group = null WHERE q.group.groupId = :groupId")
    int detachFromGroup(@Param("groupId") Long groupId);
}