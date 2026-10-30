package com.examprep.repositories;

import com.examprep.entities.Discussion;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface DiscussionRepository extends JpaRepository<Discussion, Long> {

    @Query(
            value = "SELECT d FROM Discussion d " +
                    "JOIN FETCH d.user u " +
                    "LEFT JOIN FETCH d.course c " +
                    "WHERE (:courseId IS NULL OR d.course.courseId = :courseId) " +
                    "AND (:tag IS NULL OR d.tag = :tag) " +
                    "AND (:search = '' OR " +
                    "LOWER(d.title) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
                    "LOWER(d.content) LIKE LOWER(CONCAT('%', :search, '%'))) " +
                    "ORDER BY d.isPinned DESC, " +
                    "CASE WHEN :sort = 'mostCommented' THEN d.commentCount END DESC, " +
                    "CASE WHEN :sort = 'mostUpvoted' THEN d.upvoteCount END DESC, " +
                    "d.createdAt DESC",

            countQuery = "SELECT COUNT(d) FROM Discussion d " +
                    "WHERE (:courseId IS NULL OR d.course.courseId = :courseId) " +
                    "AND (:tag IS NULL OR d.tag = :tag) " +
                    "AND (:search = '' OR " +
                    "LOWER(d.title) LIKE LOWER(CONCAT('%', :search, '%')) OR " +
                    "LOWER(d.content) LIKE LOWER(CONCAT('%', :search, '%')))"
    )
    Page<Discussion> findDiscussions(
            @Param("courseId") Long courseId,
            @Param("tag") String tag,
            @Param("search") String search,
            @Param("sort") String sort,
            Pageable pageable
    );
}
