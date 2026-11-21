package com.examprep.repositories;

import com.examprep.entities.QuestionContribution;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface QuestionContributionRepository extends JpaRepository<QuestionContribution, Long> {

    @Query(value = "SELECT c FROM QuestionContribution c WHERE c.userId = :userId " +
           "AND (:type IS NULL OR c.type = :type) " +
           "AND (:status IS NULL OR c.status = :status) " +
           "ORDER BY c.submittedAt DESC, c.contributionId DESC",
           countQuery = "SELECT COUNT(c) FROM QuestionContribution c WHERE c.userId = :userId " +
           "AND (:type IS NULL OR c.type = :type) " +
           "AND (:status IS NULL OR c.status = :status)")
    Page<QuestionContribution> findByStudentAndFilters(
            @Param("userId") Long userId,
            @Param("type") String type,
            @Param("status") String status,
            Pageable pageable
    );

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT c FROM QuestionContribution c WHERE c.contributionId = :id")
    Optional<QuestionContribution> findForUpdate(@Param("id") Long id);

    @Query(value = "SELECT c FROM QuestionContribution c WHERE " +
           "c.type = 'QUESTION' " +
           "AND (:filterCourses = false OR c.courseId IN :myCourseIds) " +
           "AND (:moduleId IS NULL OR c.moduleId = :moduleId) " +
           "AND (:questionType IS NULL OR c.questionType = :questionType) " +
           "AND (:difficulty IS NULL OR c.difficulty = :difficulty) " +
           "AND (:status IS NULL OR c.status = :status) " +
           "AND (:contributorId IS NULL OR c.userId = :contributorId) " +
           "AND (:keyword IS NULL OR LOWER(c.title) LIKE :keyword ESCAPE '!' OR LOWER(c.content) LIKE :keyword ESCAPE '!') " +
           "AND (cast(:submittedFrom as timestamp) IS NULL OR c.submittedAt >= :submittedFrom) " +
           "AND (cast(:submittedTo as timestamp) IS NULL OR c.submittedAt < :submittedTo) " +
           "ORDER BY c.submittedAt DESC, c.contributionId DESC",
           countQuery = "SELECT COUNT(c) FROM QuestionContribution c WHERE " +
           "c.type = 'QUESTION' " +
           "AND (:filterCourses = false OR c.courseId IN :myCourseIds) " +
           "AND (:moduleId IS NULL OR c.moduleId = :moduleId) " +
           "AND (:questionType IS NULL OR c.questionType = :questionType) " +
           "AND (:difficulty IS NULL OR c.difficulty = :difficulty) " +
           "AND (:status IS NULL OR c.status = :status) " +
           "AND (:contributorId IS NULL OR c.userId = :contributorId) " +
           "AND (:keyword IS NULL OR LOWER(c.title) LIKE :keyword ESCAPE '!' OR LOWER(c.content) LIKE :keyword ESCAPE '!') " +
           "AND (cast(:submittedFrom as timestamp) IS NULL OR c.submittedAt >= :submittedFrom) " +
           "AND (cast(:submittedTo as timestamp) IS NULL OR c.submittedAt < :submittedTo)")
    Page<QuestionContribution> findManagedContributions(
            @Param("filterCourses") boolean filterCourses,
            @Param("myCourseIds") List<Long> myCourseIds,
            @Param("moduleId") Long moduleId,
            @Param("questionType") String questionType,
            @Param("difficulty") String difficulty,
            @Param("status") String status,
            @Param("contributorId") Long contributorId,
            @Param("keyword") String keyword,
            @Param("submittedFrom") Instant submittedFrom,
            @Param("submittedTo") Instant submittedTo,
            Pageable pageable
    );

    default Page<QuestionContribution> findManagedContributions(
            List<Long> myCourseIds,
            Long moduleId,
            String questionType,
            String difficulty,
            String status,
            Long contributorId,
            String keyword,
            Instant submittedFrom,
            Instant submittedTo,
            Pageable pageable
    ) {
        boolean filterCourses = myCourseIds != null;
        List<Long> safeCourseIds = (myCourseIds == null || myCourseIds.isEmpty()) ? List.of(-1L) : myCourseIds;
        return findManagedContributions(filterCourses, safeCourseIds, moduleId, questionType, difficulty, status, contributorId, keyword, submittedFrom, submittedTo, pageable);
    }

    @Query("SELECT COUNT(c) FROM QuestionContribution c WHERE c.status = 'PENDING' AND (:filterCourses = false OR c.courseId IN :myCourseIds)")
    long countPending(@Param("filterCourses") boolean filterCourses, @Param("myCourseIds") List<Long> myCourseIds);

    default long countPending(List<Long> myCourseIds) {
        boolean filterCourses = myCourseIds != null;
        List<Long> safeCourseIds = (myCourseIds == null || myCourseIds.isEmpty()) ? List.of(-1L) : myCourseIds;
        return countPending(filterCourses, safeCourseIds);
    }

    @Query("SELECT COUNT(c) FROM QuestionContribution c WHERE c.status = 'ACCEPTED' AND c.reviewedAt >= :since AND (:filterCourses = false OR c.courseId IN :myCourseIds)")
    long countApprovedSince(@Param("filterCourses") boolean filterCourses, @Param("myCourseIds") List<Long> myCourseIds, @Param("since") Instant since);

    default long countApprovedSince(List<Long> myCourseIds, Instant since) {
        boolean filterCourses = myCourseIds != null;
        List<Long> safeCourseIds = (myCourseIds == null || myCourseIds.isEmpty()) ? List.of(-1L) : myCourseIds;
        return countApprovedSince(filterCourses, safeCourseIds, since);
    }

    @Query("SELECT COUNT(c) FROM QuestionContribution c WHERE c.status = 'REJECTED' AND c.reviewedAt >= :since AND (:filterCourses = false OR c.courseId IN :myCourseIds)")
    long countRejectedSince(@Param("filterCourses") boolean filterCourses, @Param("myCourseIds") List<Long> myCourseIds, @Param("since") Instant since);

    default long countRejectedSince(List<Long> myCourseIds, Instant since) {
        boolean filterCourses = myCourseIds != null;
        List<Long> safeCourseIds = (myCourseIds == null || myCourseIds.isEmpty()) ? List.of(-1L) : myCourseIds;
        return countRejectedSince(filterCourses, safeCourseIds, since);
    }

    @Query("SELECT co.courseId, co.title, COUNT(c) FROM QuestionContribution c JOIN Course co ON co.courseId = c.courseId " +
           "WHERE c.status = 'PENDING' AND (:filterCourses = false OR c.courseId IN :myCourseIds) " +
           "GROUP BY co.courseId, co.title")
    List<Object[]> countPendingByCourse(@Param("filterCourses") boolean filterCourses, @Param("myCourseIds") List<Long> myCourseIds);

    default List<Object[]> countPendingByCourse(List<Long> myCourseIds) {
        boolean filterCourses = myCourseIds != null;
        List<Long> safeCourseIds = (myCourseIds == null || myCourseIds.isEmpty()) ? List.of(-1L) : myCourseIds;
        return countPendingByCourse(filterCourses, safeCourseIds);
    }
}
