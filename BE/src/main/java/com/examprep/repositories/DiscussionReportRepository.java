package com.examprep.repositories;

import com.examprep.entities.DiscussionReport;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface DiscussionReportRepository extends JpaRepository<DiscussionReport, Long> {

    boolean existsByReporter_UserIdAndDiscussion_DiscussionIdAndCommentIsNullAndStatus(
            Long reporterId, Long discussionId, String status);

    boolean existsByReporter_UserIdAndComment_CommentIdAndStatus(
            Long reporterId, Long commentId, String status);

    long countByStatus(String status);

    @Query(
            value = "SELECT r FROM DiscussionReport r " +
                    "JOIN FETCH r.reporter rep " +
                    "JOIN FETCH r.discussion d " +
                    "JOIN FETCH d.user du " +
                    "LEFT JOIN FETCH r.comment c " +
                    "LEFT JOIN FETCH c.user cu " +
                    "WHERE (:status IS NULL OR r.status = :status) " +
                    "ORDER BY r.createdAt DESC",
            countQuery = "SELECT COUNT(r) FROM DiscussionReport r " +
                    "WHERE (:status IS NULL OR r.status = :status)"
    )
    Page<DiscussionReport> findByStatusFilter(@Param("status") String status, Pageable pageable);
}
