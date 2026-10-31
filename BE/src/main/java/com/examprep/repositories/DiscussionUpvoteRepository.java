package com.examprep.repositories;

import com.examprep.entities.DiscussionUpvote;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface DiscussionUpvoteRepository extends JpaRepository<DiscussionUpvote, Long> {
    Optional<DiscussionUpvote> findByDiscussion_DiscussionIdAndUser_UserId(Long discussionId, Long userId);
    boolean existsByDiscussion_DiscussionIdAndUser_UserId(Long discussionId, Long userId);

    @Query("SELECT u.discussion.discussionId FROM DiscussionUpvote u WHERE u.user.userId = :userId AND u.discussion.discussionId IN :discussionIds")
    List<Long> findUpvotedDiscussionIds(@Param("userId") Long userId, @Param("discussionIds") Collection<Long> discussionIds);
}
