package com.examprep.repositories;

import com.examprep.entities.Discussion;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface DiscussionRepository extends JpaRepository<Discussion, Long> {

    long countByUser_UserIdAndCreatedAtAfter(Long userId, Instant after);

    long countByUser_UserIdAndApprovalStatus(Long userId, String approvalStatus);

    long countByApprovalStatus(String approvalStatus);

    @Query(
            value = "SELECT d FROM Discussion d " +
                    "JOIN FETCH d.user u " +
                    "WHERE (:tag IS NULL OR d.tag = :tag) " +
                    "AND (d.approvalStatus = 'APPROVED' AND d.status <> 'HIDDEN') " +
                    "AND (:search IS NULL OR :search = '' OR " +
                    "LOWER(d.title) LIKE LOWER(CONCAT('%', :search, '%')) ESCAPE '!' OR " +
                    "LOWER(d.content) LIKE LOWER(CONCAT('%', :search, '%')) ESCAPE '!') " +
                    "ORDER BY d.isPinned DESC, " +
                    "CASE WHEN :sort = 'mostCommented' THEN d.commentCount END DESC, " +
                    "CASE WHEN :sort = 'mostUpvoted' THEN d.upvoteCount END DESC, " +
                    "d.createdAt DESC",

            countQuery = "SELECT COUNT(d) FROM Discussion d " +
                    "WHERE (:tag IS NULL OR d.tag = :tag) " +
                    "AND (d.approvalStatus = 'APPROVED' AND d.status <> 'HIDDEN') " +
                    "AND (:search IS NULL OR :search = '' OR " +
                    "LOWER(d.title) LIKE LOWER(CONCAT('%', :search, '%')) ESCAPE '!' OR " +
                    "LOWER(d.content) LIKE LOWER(CONCAT('%', :search, '%')) ESCAPE '!')")
    Page<Discussion> findDiscussions(
            @Param("tag") String tag,
            @Param("search") String search,
            @Param("sort") String sort,
            Pageable pageable
    );

    @Query(
            value = "SELECT d FROM Discussion d " +
                    "JOIN FETCH d.user u " +
                    "WHERE (:tag IS NULL OR d.tag = :tag) " +
                    "AND d.approvalStatus = 'APPROVED' AND d.status <> 'HIDDEN' " +
                    "AND (:answerFilter IS NULL " +
                    "  OR (:answerFilter = 'UNANSWERED' AND d.commentCount = 0) " +
                    "  OR (:answerFilter = 'ACCEPTED' AND EXISTS (SELECT 1 FROM DiscussionComment c WHERE c.discussion = d AND c.isAccepted = true AND c.status = 'VISIBLE'))) " +
                    "AND (:search IS NULL OR :search = '' OR " +
                    "LOWER(d.title) LIKE LOWER(CONCAT('%', :search, '%')) ESCAPE '!' OR " +
                    "LOWER(d.content) LIKE LOWER(CONCAT('%', :search, '%')) ESCAPE '!') " +
                    "ORDER BY d.isPinned DESC, " +
                    "CASE WHEN :sort = 'mostCommented' THEN d.commentCount END DESC, " +
                    "CASE WHEN :sort = 'mostUpvoted' THEN d.upvoteCount END DESC, " +
                    "d.createdAt DESC",
            countQuery = "SELECT COUNT(d) FROM Discussion d " +
                    "WHERE (:tag IS NULL OR d.tag = :tag) " +
                    "AND d.approvalStatus = 'APPROVED' AND d.status <> 'HIDDEN' " +
                    "AND (:answerFilter IS NULL " +
                    "  OR (:answerFilter = 'UNANSWERED' AND d.commentCount = 0) " +
                    "  OR (:answerFilter = 'ACCEPTED' AND EXISTS (SELECT 1 FROM DiscussionComment c WHERE c.discussion = d AND c.isAccepted = true AND c.status = 'VISIBLE'))) " +
                    "AND (:search IS NULL OR :search = '' OR " +
                    "LOWER(d.title) LIKE LOWER(CONCAT('%', :search, '%')) ESCAPE '!' OR " +
                    "LOWER(d.content) LIKE LOWER(CONCAT('%', :search, '%')) ESCAPE '!')")
    Page<Discussion> findAllDiscussions(
            @Param("tag") String tag,
            @Param("answerFilter") String answerFilter,
            @Param("search") String search,
            @Param("sort") String sort,
            Pageable pageable
    );

    @Query(
            value = "SELECT d FROM Discussion d " +
                    "JOIN FETCH d.user u " +
                    "WHERE d.user.userId = :userId " +
                    "AND (:tag IS NULL OR d.tag = :tag) " +
                    "AND (:approvalStatus IS NULL OR d.approvalStatus = :approvalStatus) " +
                    "AND (:status IS NULL OR d.status = :status) " +
                    "AND (:search IS NULL OR :search = '' OR " +
                    "LOWER(d.title) LIKE LOWER(CONCAT('%', :search, '%')) ESCAPE '!' OR " +
                    "LOWER(d.content) LIKE LOWER(CONCAT('%', :search, '%')) ESCAPE '!') " +
                    "ORDER BY d.isPinned DESC, " +
                    "CASE WHEN :sort = 'mostCommented' THEN d.commentCount END DESC, " +
                    "CASE WHEN :sort = 'mostUpvoted' THEN d.upvoteCount END DESC, " +
                    "d.createdAt DESC",
            countQuery = "SELECT COUNT(d) FROM Discussion d " +
                    "WHERE d.user.userId = :userId " +
                    "AND (:tag IS NULL OR d.tag = :tag) " +
                    "AND (:approvalStatus IS NULL OR d.approvalStatus = :approvalStatus) " +
                    "AND (:status IS NULL OR d.status = :status) " +
                    "AND (:search IS NULL OR :search = '' OR " +
                    "LOWER(d.title) LIKE LOWER(CONCAT('%', :search, '%')) ESCAPE '!' OR " +
                    "LOWER(d.content) LIKE LOWER(CONCAT('%', :search, '%')) ESCAPE '!')")
    Page<Discussion> findMineDiscussions(
            @Param("userId") Long userId,
            @Param("tag") String tag,
            @Param("approvalStatus") String approvalStatus,
            @Param("status") String status,
            @Param("search") String search,
            @Param("sort") String sort,
            Pageable pageable
    );

    @Query(
            value = "SELECT d FROM Discussion d " +
                    "JOIN FETCH d.user u " +
                    "WHERE (:approvalStatus IS NULL OR d.approvalStatus = :approvalStatus) " +
                    "AND (:status IS NULL OR d.status = :status) " +
                    "AND (:search = '' OR " +
                    "LOWER(d.title) LIKE LOWER(CONCAT('%', :search, '%')) ESCAPE '!' OR " +
                    "LOWER(d.content) LIKE LOWER(CONCAT('%', :search, '%')) ESCAPE '!') " +
                    "ORDER BY d.isPinned DESC, d.createdAt DESC",

            countQuery = "SELECT COUNT(d) FROM Discussion d " +
                    "WHERE (:approvalStatus IS NULL OR d.approvalStatus = :approvalStatus) " +
                    "AND (:status IS NULL OR d.status = :status) " +
                    "AND (:search = '' OR " +
                    "LOWER(d.title) LIKE LOWER(CONCAT('%', :search, '%')) ESCAPE '!' OR " +
                    "LOWER(d.content) LIKE LOWER(CONCAT('%', :search, '%')) ESCAPE '!')"
    )
    Page<Discussion> findDiscussionsForManager(
            @Param("approvalStatus") String approvalStatus,
            @Param("status") String status,
            @Param("search") String search,
            Pageable pageable
    );

    @Query(
            value = "SELECT d FROM Discussion d " +
                    "JOIN FETCH d.user u " +
                    "WHERE (:approvalStatus IS NULL OR d.approvalStatus = :approvalStatus) " +
                    "AND (:status IS NULL OR d.status = :status) " +
                    "AND (:tag IS NULL OR d.tag = :tag) " +
                    "AND (:hasImage IS NULL " +
                    "  OR (:hasImage = true AND d.imageUrl IS NOT NULL AND d.imageUrl <> '') " +
                    "  OR (:hasImage = false AND (d.imageUrl IS NULL OR d.imageUrl = ''))) " +
                    "AND (:search = '' OR " +
                    "LOWER(d.title) LIKE LOWER(CONCAT('%', :search, '%')) ESCAPE '!' OR " +
                    "LOWER(d.content) LIKE LOWER(CONCAT('%', :search, '%')) ESCAPE '!') " +
                    "ORDER BY d.isPinned DESC, " +
                    "CASE WHEN :sort = 'oldest' THEN d.createdAt END ASC, " +
                    "CASE WHEN :sort <> 'oldest' THEN d.createdAt END DESC",
            countQuery = "SELECT COUNT(d) FROM Discussion d " +
                    "WHERE (:approvalStatus IS NULL OR d.approvalStatus = :approvalStatus) " +
                    "AND (:status IS NULL OR d.status = :status) " +
                    "AND (:tag IS NULL OR d.tag = :tag) " +
                    "AND (:hasImage IS NULL " +
                    "  OR (:hasImage = true AND d.imageUrl IS NOT NULL AND d.imageUrl <> '') " +
                    "  OR (:hasImage = false AND (d.imageUrl IS NULL OR d.imageUrl = ''))) " +
                    "AND (:search = '' OR " +
                    "LOWER(d.title) LIKE LOWER(CONCAT('%', :search, '%')) ESCAPE '!' OR " +
                    "LOWER(d.content) LIKE LOWER(CONCAT('%', :search, '%')) ESCAPE '!')"
    )
    Page<Discussion> findDiscussionsForAdmin(
            @Param("approvalStatus") String approvalStatus,
            @Param("status") String status,
            @Param("tag") String tag,
            @Param("hasImage") Boolean hasImage,
            @Param("search") String search,
            @Param("sort") String sort,
            Pageable pageable
    );

    /**
     * List discussions bookmarked by user, ordered by most recent bookmark
     */
    @Query(
            value = "SELECT d FROM Discussion d " +
                    "JOIN FETCH d.user u " +
                    "INNER JOIN DiscussionBookmark db ON d.discussionId = db.discussion.discussionId " +
                    "WHERE db.user.userId = :userId " +
                    "AND (u.userId = :userId OR (d.status <> 'HIDDEN' AND (d.approvalStatus IS NULL OR d.approvalStatus = 'APPROVED'))) " +
                    "ORDER BY db.createdAt DESC",

            countQuery = "SELECT COUNT(d) FROM Discussion d " +
                    "INNER JOIN DiscussionBookmark db ON d.discussionId = db.discussion.discussionId " +
                    "WHERE db.user.userId = :userId " +
                    "AND (d.user.userId = :userId OR (d.status <> 'HIDDEN' AND (d.approvalStatus IS NULL OR d.approvalStatus = 'APPROVED')))"
    )
    Page<Discussion> findBookmarkedByUser(@Param("userId") Long userId, Pageable pageable);
}
