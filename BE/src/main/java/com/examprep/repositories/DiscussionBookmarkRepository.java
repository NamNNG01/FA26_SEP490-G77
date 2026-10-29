package com.examprep.repositories;

import com.examprep.entities.DiscussionBookmark;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface DiscussionBookmarkRepository extends JpaRepository<DiscussionBookmark, Long> {
    Optional<DiscussionBookmark> findByDiscussion_DiscussionIdAndUser_UserId(Long discussionId, Long userId);
    boolean existsByDiscussion_DiscussionIdAndUser_UserId(Long discussionId, Long userId);
}
