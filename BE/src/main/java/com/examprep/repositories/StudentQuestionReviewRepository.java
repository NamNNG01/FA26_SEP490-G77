package com.examprep.repositories;

import com.examprep.entities.StudentQuestionReview;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface StudentQuestionReviewRepository extends JpaRepository<StudentQuestionReview, Long> {

    Optional<StudentQuestionReview> findByStudent_UserIdAndQuestion_QuestionId(Long studentId, Long questionId);

    boolean existsByStudent_UserIdAndQuestion_QuestionIdAndBookmarkTrue(Long studentId, Long questionId);

    @Query("SELECT r.question.questionId FROM StudentQuestionReview r "
            + "WHERE r.student.userId = :studentId AND r.bookmark = true "
            + "AND r.question.module.moduleId = :moduleId "
            + "AND r.question.deletedAt IS NULL AND r.question.status = 'ACTIVE' "
            + "AND r.question.approvalStatus = 'APPROVED' AND r.question.sourceDocumentId IS NULL")
    List<Long> findBookmarkedQuestionIds(@Param("studentId") Long studentId, @Param("moduleId") Long moduleId);

    /** MP-02 (General, BOOKMARKED mode): the same bookmarks, for the course's questions without a module. */
    @Query("SELECT r.question.questionId FROM StudentQuestionReview r "
            + "WHERE r.student.userId = :studentId AND r.bookmark = true "
            + "AND r.question.course.courseId = :courseId AND r.question.module IS NULL "
            + "AND r.question.deletedAt IS NULL AND r.question.status = 'ACTIVE' "
            + "AND r.question.approvalStatus = 'APPROVED' AND r.question.sourceDocumentId IS NULL")
    List<Long> findGeneralBookmarkedQuestionIds(@Param("studentId") Long studentId,
                                                @Param("courseId") Long courseId);

    @Query(value = "SELECT r FROM StudentQuestionReview r JOIN FETCH r.question q " +
           "WHERE r.student.userId = :studentId " +
           "AND (:type = 'all' OR (:type = 'wrong' AND r.status = 'WRONG_BOOKMARKED') OR (:type = 'bookmarked' AND r.bookmark = true)) " +
           "AND (:search = '' OR LOWER(q.content) LIKE LOWER(CONCAT('%', :search, '%'))) " +
           "ORDER BY r.lastPracticedAt DESC",
           countQuery = "SELECT COUNT(r) FROM StudentQuestionReview r " +
           "WHERE r.student.userId = :studentId " +
           "AND (:type = 'all' OR (:type = 'wrong' AND r.status = 'WRONG_BOOKMARKED') OR (:type = 'bookmarked' AND r.bookmark = true)) " +
           "AND (:search = '' OR LOWER(r.question.content) LIKE LOWER(CONCAT('%', :search, '%')))")
    Page<StudentQuestionReview> findSavedQuestions(
            @Param("studentId") Long studentId,
            @Param("type") String type,
            @Param("search") String search,
            Pageable pageable
    );

    @Query("SELECT r FROM StudentQuestionReview r JOIN FETCH r.question q " +
           "WHERE r.student.userId = :studentId " +
           "AND (:type = 'all' OR (:type = 'wrong' AND r.status = 'WRONG_BOOKMARKED') OR (:type = 'bookmarked' AND r.bookmark = true)) " +
           "ORDER BY r.wrongCount DESC, r.lastPracticedAt DESC")
    List<StudentQuestionReview> findReviewCandidates(
            @Param("studentId") Long studentId,
            @Param("type") String type,
            Pageable pageable
    );

    @Query("SELECT r FROM StudentQuestionReview r JOIN FETCH r.question q " +
           "WHERE r.student.userId = :studentId " +
           "AND (:type = 'all' OR (:type = 'wrong' AND r.status = 'WRONG_BOOKMARKED') OR (:type = 'bookmarked' AND r.bookmark = true)) " +
           "AND (:examType = 'ESSAY' AND q.questionType IN ('ESSAY', 'DIAGRAM') OR :examType = 'QUIZ' AND q.questionType NOT IN ('ESSAY', 'DIAGRAM')) " +
           "ORDER BY r.wrongCount DESC, r.lastPracticedAt DESC")
    List<StudentQuestionReview> findReviewCandidatesForExamType(
            @Param("studentId") Long studentId,
            @Param("type") String type,
            @Param("examType") String examType,
            Pageable pageable
    );

    @Query("SELECT r FROM StudentQuestionReview r JOIN FETCH r.question q " +
           "WHERE r.student.userId = :studentId AND r.status = 'WRONG_BOOKMARKED' " +
           "ORDER BY r.wrongCount DESC, r.lastPracticedAt ASC")
    List<StudentQuestionReview> findWeakSpots(@Param("studentId") Long studentId, Pageable pageable);
}
