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

    @Query("SELECT r FROM StudentQuestionReview r JOIN FETCH r.question q " +
           "WHERE r.student.userId = :studentId " +
           "AND (:type = 'all' OR (:type = 'wrong' AND r.status = 'WRONG_BOOKMARKED') OR (:type = 'bookmarked' AND r.bookmark = true)) " +
           "AND (:search IS NULL OR LOWER(q.content) LIKE LOWER(CONCAT('%', :search, '%'))) " +
           "ORDER BY r.lastPracticedAt DESC")
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
           "WHERE r.student.userId = :studentId AND r.status = 'WRONG_BOOKMARKED' " +
           "ORDER BY r.wrongCount DESC, r.lastPracticedAt ASC")
    List<StudentQuestionReview> findWeakSpots(@Param("studentId") Long studentId, Pageable pageable);
}
