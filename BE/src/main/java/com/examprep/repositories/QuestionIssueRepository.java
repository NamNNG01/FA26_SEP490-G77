package com.examprep.repositories;

import com.examprep.entities.Question;
import com.examprep.entities.QuestionIssue;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface QuestionIssueRepository extends JpaRepository<QuestionIssue, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT i FROM QuestionIssue i WHERE i.issueId = :id")
    Optional<QuestionIssue> lockById(@Param("id") Long id);

    /** Serialises reports of one question so two first reports cannot open two tickets. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT q FROM Question q WHERE q.questionId = :id")
    Optional<Question> lockQuestion(@Param("id") Long id);

    Optional<QuestionIssue> findFirstByQuestion_QuestionIdAndStatusIn(Long questionId, Collection<String> statuses);

    @Query("SELECT COUNT(a) > 0 FROM AttemptAnswer a WHERE a.question.questionId = :questionId AND a.attempt.user.userId = :userId")
    boolean answeredBy(@Param("questionId") Long questionId, @Param("userId") Long userId);

    @EntityGraph(attributePaths = {"question", "course", "assignedTo"})
    @Query("""
            SELECT i FROM QuestionIssue i LEFT JOIN i.course c LEFT JOIN c.manager m
            WHERE (:admin = true OR m.userId = :userId
                   OR EXISTS (SELECT cm FROM CourseManager cm WHERE cm.course = c AND cm.user.userId = :userId))
              AND (:status IS NULL OR i.status = :status)
              AND (:issueType IS NULL OR i.issueType = :issueType)
              AND (:courseId IS NULL OR c.courseId = :courseId)
              AND (:questionId IS NULL OR i.question.questionId = :questionId)
              AND (:search IS NULL OR LOWER(i.question.content) LIKE :search ESCAPE '!'
                   OR EXISTS (SELECT r FROM QuestionIssueReport r WHERE r.issue = i AND LOWER(r.description) LIKE :search ESCAPE '!'))
            """)
    Page<QuestionIssue> searchManaged(@Param("admin") boolean admin, @Param("userId") Long userId,
                                      @Param("status") String status, @Param("issueType") String issueType,
                                      @Param("courseId") Long courseId, @Param("questionId") Long questionId,
                                      @Param("search") String search, Pageable pageable);

    @EntityGraph(attributePaths = {"question", "course"})
    @Query("""
            SELECT i FROM QuestionIssue i
            WHERE EXISTS (SELECT r FROM QuestionIssueReport r WHERE r.issue = i AND r.user.userId = :userId)
              AND (:status IS NULL OR i.status = :status)
            """)
    Page<QuestionIssue> reportedBy(@Param("userId") Long userId, @Param("status") String status, Pageable pageable);

    @Query("SELECT r.issue.issueId, COUNT(r) FROM QuestionIssueReport r WHERE r.issue.issueId IN :ids GROUP BY r.issue.issueId")
    List<Object[]> countReports(@Param("ids") Collection<Long> ids);
}
