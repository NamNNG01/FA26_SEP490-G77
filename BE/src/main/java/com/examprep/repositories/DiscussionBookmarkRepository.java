package com.examprep.repositories;

import com.examprep.entities.DiscussionBookmark;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface DiscussionBookmarkRepository extends JpaRepository<DiscussionBookmark, Long> {
    Optional<DiscussionBookmark> findByDiscussion_DiscussionIdAndUser_UserId(Long discussionId, Long userId);

    boolean existsByDiscussion_DiscussionIdAndUser_UserId(Long discussionId, Long userId);

    @Query("SELECT db.discussion.discussionId FROM DiscussionBookmark db " +
           "WHERE db.user.userId = :userId AND db.discussion.discussionId IN :discussionIds")
    List<Long> findBookmarkedDiscussionIds(@Param("userId") Long userId, @Param("discussionIds") List<Long> discussionIds);
}
