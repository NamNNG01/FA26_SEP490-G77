package com.examprep.services;

import com.examprep.dto.discussion.DiscussionManagerDtos;
import com.examprep.dto.student.DiscussionDetailDto;
import com.examprep.dto.student.DiscussionItemDto;
import org.springframework.data.domain.Page;

import java.util.List;

public interface ManagerDiscussionService {

    DiscussionDetailDto createDiscussion(DiscussionManagerDtos.CreateDiscussionRequest request, Long adminId);

    Page<DiscussionItemDto> listDiscussions(
            String approvalStatus,
            String status,
            String tag,
            Boolean hasImage,
            String search,
            String sort,
            int page,
            int size,
            Long adminId
    );

    DiscussionDetailDto getDiscussionDetail(Long discussionId, Long adminId);

    DiscussionItemDto approveDiscussion(Long discussionId, Long adminId);

    DiscussionItemDto rejectDiscussion(Long discussionId, DiscussionManagerDtos.RejectDiscussionRequest request, Long adminId);

    int bulkApproveDiscussions(List<Long> discussionIds, Long adminId);

    int bulkRejectDiscussions(List<Long> discussionIds, String reason, Long adminId);

    DiscussionItemDto updatePin(Long discussionId, DiscussionManagerDtos.UpdatePinRequest request, Long adminId);

    DiscussionItemDto hideDiscussion(Long discussionId, Long adminId);

    DiscussionItemDto restoreDiscussion(Long discussionId, Long adminId);

    DiscussionDetailDto.CommentDto updateCommentStatus(Long commentId, DiscussionManagerDtos.UpdateCommentStatusRequest request, Long adminId);

    void deleteComment(Long commentId, Long adminId);

    DiscussionManagerDtos.ModerationSummaryDto getModerationSummary(Long adminId);

    Page<DiscussionManagerDtos.DiscussionReportItemDto> listReports(String status, int page, int size, Long adminId);

    DiscussionManagerDtos.DiscussionReportItemDto resolveReport(
            Long reportId,
            DiscussionManagerDtos.ResolveReportRequest request,
            Long adminId
    );

    void muteUser(Long targetUserId, DiscussionManagerDtos.MuteUserRequest request, Long adminId);

    void unmuteUser(Long targetUserId, Long adminId);
}
