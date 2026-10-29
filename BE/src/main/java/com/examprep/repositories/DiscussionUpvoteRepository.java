package com.examprep.repositories;

import com.examprep.entities.DiscussionUpvote;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface DiscussionUpvoteRepository extends JpaRepository<DiscussionUpvote, Long> {
    Optional<DiscussionUpvote> findByDiscussion_DiscussionIdAndUser_UserId(Long discussionId, Long userId);
    boolean existsByDiscussion_DiscussionIdAndUser_UserId(Long discussionId, Long userId);
}
