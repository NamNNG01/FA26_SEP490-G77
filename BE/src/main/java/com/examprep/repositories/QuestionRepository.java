package com.examprep.repositories;

import com.examprep.entities.Question;
import com.examprep.dto.IdCount;
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

    @Query("SELECT q FROM Question q LEFT JOIN q.course qc LEFT JOIN q.module m LEFT JOIN q.group g LEFT JOIN g.module gm " +
            "WHERE q.status = 'ACTIVE' AND q.deletedAt IS NULL AND (qc.courseId = :courseId OR m.course.courseId = :courseId OR (q.module IS NULL AND " +
            "(g.course.courseId = :courseId OR (g.course IS NULL AND gm.course.courseId = :courseId)))) " +
            "AND (:moduleId IS NULL OR m.moduleId = :moduleId OR (q.module IS NULL AND gm.moduleId = :moduleId)) " +
            "ORDER BY q.questionId")
    List<Question> findAiBank(@Param("courseId") Long courseId, @Param("moduleId") Long moduleId);

    List<Question> findByGroupGroupIdOrderByQuestionIdAsc(Long groupId);
    List<Question> findByModuleModuleId(Long moduleId);

    @Query("SELECT q FROM Question q LEFT JOIN q.course qc LEFT JOIN q.module m LEFT JOIN q.group g LEFT JOIN g.module gm " +
            "WHERE q.deletedAt IS NULL AND (qc.courseId = :courseId OR m.course.courseId = :courseId OR (q.module IS NULL AND (g.course.courseId = :courseId OR (g.course IS NULL AND gm.course.courseId = :courseId)))) " +
            "AND (:moduleId IS NULL OR m.moduleId = :moduleId OR (q.module IS NULL AND gm.moduleId = :moduleId)) ORDER BY q.questionId")
    List<Question> findImportBank(@Param("courseId") Long courseId, @Param("moduleId") Long moduleId);
    boolean existsByModuleModuleId(Long moduleId);
    boolean existsByModuleCourseCourseId(Long courseId);
    boolean existsByCourseCourseIdOrModuleCourseCourseId(Long courseId, Long moduleCourseId);

    @Query("SELECT new com.examprep.dto.IdCount(q.module.moduleId, COUNT(q)) FROM Question q WHERE q.module.moduleId IN :ids GROUP BY q.module.moduleId")
    List<IdCount> countByModules(@Param("ids") List<Long> ids);

    @Query("SELECT q.group.groupId, COUNT(q) FROM Question q " +
            "WHERE q.group.groupId IN :groupIds " +
            "GROUP BY q.group.groupId")
    List<Object[]> countByGroupIds(@Param("groupIds") Collection<Long> groupIds);

    @Query("SELECT DISTINCT q.questionType FROM Question q " +
            "WHERE q.group.groupId = :groupId AND q.deletedAt IS NULL")
    List<String> findDistinctQuestionTypesByGroupId(@Param("groupId") Long groupId);

    @Modifying
    @Query("UPDATE Question q SET q.group = null WHERE q.group.groupId = :groupId")
    int detachFromGroup(@Param("groupId") Long groupId);
}