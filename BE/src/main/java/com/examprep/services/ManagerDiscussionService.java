package com.examprep.services;

import com.examprep.dto.discussion.DiscussionManagerDtos;
import com.examprep.dto.student.DiscussionDetailDto;
import com.examprep.dto.student.DiscussionItemDto;
import com.examprep.dto.student.UpdateDiscussionRequestDto;
import org.springframework.data.domain.Page;

public interface ManagerDiscussionService {

    /**
     * Manager tạo bài thảo luận / thông báo mới trong khóa học.
     * Bài tạo bởi Manager sẽ tự động được phê duyệt (APPROVED) và hiển thị ngay.
     */
    DiscussionDetailDto createDiscussion(Long courseId, DiscussionManagerDtos.CreateDiscussionRequest request, Long managerId);

    /**
     * Manager lấy danh sách thảo luận trong khóa học (có thể lọc theo trạng thái duyệt PENDING, APPROVED, REJECTED).
     */
    Page<DiscussionItemDto> listDiscussions(Long courseId, String approvalStatus, String status, String search, int page, int size, Long managerId);

    /**
     * Manager xem chi tiết một bài thảo luận kèm toàn bộ bình luận (kể cả bình luận đã bị ẩn).
     */
    DiscussionDetailDto getDiscussionDetail(Long discussionId, Long managerId);

    /**
     * Manager phê duyệt bài thảo luận của học sinh.
     */
    DiscussionItemDto approveDiscussion(Long discussionId, Long managerId);

    /**
     * Manager từ chối bài thảo luận của học sinh kèm lý do.
     */
    DiscussionItemDto rejectDiscussion(Long discussionId, DiscussionManagerDtos.RejectDiscussionRequest request, Long managerId);

    /**
     * Manager ghim hoặc bỏ ghim bài thảo luận lên đầu danh sách khóa học.
     */
    DiscussionItemDto updatePin(Long discussionId, DiscussionManagerDtos.UpdatePinRequest request, Long managerId);

    /**
     * Manager đóng hoặc mở lại bài thảo luận bất kỳ trong khóa học quản lý.
     */
    DiscussionItemDto updateClose(Long discussionId, UpdateDiscussionRequestDto request, Long managerId);

    /**
     * Manager xóa bài thảo luận vi phạm.
     */
    void deleteDiscussion(Long discussionId, Long managerId);

    /**
     * Manager ẩn hoặc hiện lại bình luận vi phạm.
     */
    DiscussionDetailDto.CommentDto updateCommentStatus(Long commentId, DiscussionManagerDtos.UpdateCommentStatusRequest request, Long managerId);

    /**
     * Manager xóa hẳn bình luận vi phạm.
     */
    void deleteComment(Long commentId, Long managerId);
}
