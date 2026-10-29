package com.examprep.repositories;

import com.examprep.entities.DiscussionComment;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface DiscussionCommentRepository extends JpaRepository<DiscussionComment, Long> {
    @Query("SELECT c FROM DiscussionComment c JOIN FETCH c.user u WHERE c.discussion.discussionId = :discussionId AND c.status = 'VISIBLE' ORDER BY c.createdAt DESC")
    List<DiscussionComment> findLatestCommentsByDiscussionId(@Param("discussionId") Long discussionId, Pageable pageable);
}
