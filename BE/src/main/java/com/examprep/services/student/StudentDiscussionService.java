package com.examprep.services.student;

import com.examprep.dto.student.*;
import org.springframework.data.domain.Page;

import java.util.Map;

public interface StudentDiscussionService {
    Page<DiscussionItemDto> listDiscussions(Long courseId, String tag, String search, String sort, int page, int size, Long userId);
    DiscussionDetailDto getDiscussionDetail(Long discussionId, Long userId);
    DiscussionItemDto createDiscussion(CreateDiscussionRequestDto request, Long userId);
    DiscussionDetailDto.CommentDto createComment(Long discussionId, CreateCommentRequestDto request, Long userId);
    Map<String, Object> toggleUpvote(Long discussionId, Long userId);
    Map<String, Object> toggleBookmark(Long discussionId, Long userId);
    Page<DiscussionItemDto> listTips(Long courseId, int page, int size, Long userId);
    DiscussionItemDto updateDiscussion(Long discussionId, UpdateDiscussionRequestDto request, Long userId);
}
