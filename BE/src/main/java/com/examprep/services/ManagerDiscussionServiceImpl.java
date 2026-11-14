package com.examprep.services;

import com.examprep.dto.discussion.DiscussionManagerDtos;
import com.examprep.dto.student.DiscussionDetailDto;
import com.examprep.dto.student.DiscussionItemDto;
import com.examprep.dto.student.UpdateDiscussionRequestDto;
import com.examprep.entities.*;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.ForbiddenException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional
public class ManagerDiscussionServiceImpl implements ManagerDiscussionService {

    private final DiscussionRepository discussionRepository;
    private final DiscussionCommentRepository commentRepository;
    private final CourseRepository courseRepository;
    private final UserRepository userRepository;
    private final CourseManagerRepository courseManagerRepository;

    /**
     * Kiểm tra quyền quản lý khóa học của người dùng.
     * Người dùng được phép thao tác nếu là ADMIN, hoặc là Manager chính của khóa học,
     * hoặc được phân công làm Co-Manager trong bảng course_managers.
     */
    private Course validateCourseManager(Long courseId, Long userId) {
        if (userId == null) {
            throw new ForbiddenException("Authentication required");
        }
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        Course course = courseRepository.findById(courseId)
                .orElseThrow(() -> new ResourceNotFoundException("Course not found"));

        // 1. Quản trị viên (ADMIN) có toàn quyền
        if (User.ROLE_ADMIN.equals(user.getRoleName())) {
            return course;
        }

        // 2. Manager chính của khóa học
        if (course.getManager() != null && course.getManager().getUserId().equals(userId)) {
            return course;
        }

        // 3. Co-Manager được phân quyền
        boolean isCoManager = courseManagerRepository.existsByCourse_CourseIdAndUser_UserId(courseId, userId);
        if (isCoManager) {
            return course;
        }

        throw new ForbiddenException("Course is outside your management scope");
    }

    /**
     * Chuyển đổi entity Discussion sang DiscussionItemDto cho danh sách.
     */
    private DiscussionItemDto mapToItemDto(Discussion d, Long currentUserId) {
        User author = d.getUser();
        String displayName = Boolean.TRUE.equals(d.getIsAnonymous()) ? "Học sinh ẩn danh" : author.getFullName();
        String avatarUrl = Boolean.TRUE.equals(d.getIsAnonymous()) ? null : author.getAvatarUrl();

        String excerpt = d.getContent();
        if (excerpt != null && excerpt.length() > 150) {
            excerpt = excerpt.substring(0, 150) + "...";
        }

        DiscussionItemDto.AuthorDto authorDto = new DiscussionItemDto.AuthorDto(
                author.getUserId(),
                displayName,
                avatarUrl,
                author.getRoleName()
        );

        DiscussionItemDto.CourseRefDto courseRef = new DiscussionItemDto.CourseRefDto(
                d.getCourse().getCourseId(),
                d.getCourse().getTitle()
        );

        boolean isAuthor = currentUserId != null && author.getUserId().equals(currentUserId);
        boolean isClosed = Boolean.TRUE.equals(d.getIsClosed()) || "CLOSED".equalsIgnoreCase(d.getStatus());

        return DiscussionItemDto.builder()
                .discussionId(d.getDiscussionId())
                .title(d.getTitle())
                .tag(d.getTag())
                .excerpt(excerpt)
                .author(authorDto)
                .upvoteCount(d.getUpvoteCount() != null ? d.getUpvoteCount() : 0)
                .commentCount(d.getCommentCount() != null ? d.getCommentCount() : 0)
                .isPinned(Boolean.TRUE.equals(d.getIsPinned()))
                .isUpvoted(false)
                .isAuthor(isAuthor)
                .isClosed(isClosed)
                .imageUrl(d.getImageUrl())
                .approvalStatus(d.getApprovalStatus())
                .createdAt(d.getCreatedAt())
                .lastCommentAt(d.getUpdatedAt())
                .course(courseRef)
                .build();
    }

    /**
     * Chuyển đổi entity Discussion sang DiscussionDetailDto cho màn hình chi tiết.
     */
    private DiscussionDetailDto mapToDetailDto(Discussion d, Long currentUserId, List<DiscussionComment> comments) {
        User author = d.getUser();
        String displayName = Boolean.TRUE.equals(d.getIsAnonymous()) ? "Học sinh ẩn danh" : author.getFullName();
        String avatarUrl = Boolean.TRUE.equals(d.getIsAnonymous()) ? null : author.getAvatarUrl();

        DiscussionItemDto.AuthorDto authorDto = new DiscussionItemDto.AuthorDto(
                author.getUserId(),
                displayName,
                avatarUrl,
                author.getRoleName()
        );

        List<DiscussionDetailDto.CommentDto> commentDtos = comments.stream().map(c -> {
            User cAuthor = c.getUser();
            String cName = Boolean.TRUE.equals(c.getIsAnonymous()) ? "Học sinh ẩn danh" : cAuthor.getFullName();
            String cAvatar = Boolean.TRUE.equals(c.getIsAnonymous()) ? null : cAuthor.getAvatarUrl();

            return new DiscussionDetailDto.CommentDto(
                    c.getCommentId(),
                    c.getContent(),
                    new DiscussionItemDto.AuthorDto(cAuthor.getUserId(), cName, cAvatar, cAuthor.getRoleName()),
                    Boolean.TRUE.equals(c.getIsAccepted()),
                    Boolean.TRUE.equals(c.getIsAnonymous()),
                    c.getImageUrl(),
                    c.getStatus(),
                    c.getCreatedAt()
            );
        }).toList();

        boolean isAuthor = currentUserId != null && author.getUserId().equals(currentUserId);
        boolean isClosed = Boolean.TRUE.equals(d.getIsClosed()) || "CLOSED".equalsIgnoreCase(d.getStatus());

        return DiscussionDetailDto.builder()
                .discussionId(d.getDiscussionId())
                .title(d.getTitle())
                .content(d.getContent())
                .tag(d.getTag())
                .author(authorDto)
                .upvoteCount(d.getUpvoteCount() != null ? d.getUpvoteCount() : 0)
                .commentCount(d.getCommentCount() != null ? d.getCommentCount() : 0)
                .isPinned(Boolean.TRUE.equals(d.getIsPinned()))
                .isUpvoted(false)
                .isBookmarked(false)
                .isAuthor(isAuthor)
                .isClosed(isClosed)
                .imageUrl(d.getImageUrl())
                .approvalStatus(d.getApprovalStatus())
                .rejectionReason(d.getRejectionReason())
                .createdAt(d.getCreatedAt())
                .updatedAt(d.getUpdatedAt())
                .comments(commentDtos)
                .build();
    }

    @Override
    public DiscussionDetailDto createDiscussion(Long courseId, DiscussionManagerDtos.CreateDiscussionRequest request, Long managerId) {
        Course course = validateCourseManager(courseId, managerId);
        User manager = userRepository.findById(managerId)
                .orElseThrow(() -> new ResourceNotFoundException("Manager not found"));

        if (request.getTitle() == null || request.getTitle().isBlank()) {
            throw new BadRequestException("Title is required");
        }
        if (request.getContent() == null || request.getContent().isBlank()) {
            throw new BadRequestException("Content is required");
        }

        String tag = (request.getTag() != null && !request.getTag().isBlank())
                ? request.getTag().trim().toLowerCase()
                : "announcement";

        boolean isPinned = Boolean.TRUE.equals(request.getIsPinned());

        // Manager tạo thảo luận/thông báo thì tự động phê duyệt (APPROVED) và hiển thị ngay
        Discussion discussion = Discussion.builder()
                .course(course)
                .user(manager)
                .title(request.getTitle().trim())
                .content(request.getContent().trim())
                .tag(tag)
                .isAnonymous(false)
                .status("OPEN")
                .isPinned(isPinned)
                .viewCount(0)
                .commentCount(0)
                .upvoteCount(0)
                .isClosed(false)
                .imageUrl(request.getImageUrl())
                .approvalStatus(Discussion.APPROVAL_APPROVED)
                .reviewedBy(manager)
                .reviewedAt(Instant.now())
                .build();

        Discussion saved = discussionRepository.save(discussion);
        return mapToDetailDto(saved, managerId, List.of());
    }

    @Override
    @Transactional(readOnly = true)
    public Page<DiscussionItemDto> listDiscussions(Long courseId, String approvalStatus, String status, String search, int page, int size, Long managerId) {
        validateCourseManager(courseId, managerId);

        Pageable pageable = PageRequest.of(page, size);

        String normalizedApproval = (approvalStatus != null && !approvalStatus.isBlank() && !"ALL".equalsIgnoreCase(approvalStatus.trim()))
                ? approvalStatus.trim().toUpperCase()
                : null;

        String normalizedStatus = (status != null && !status.isBlank() && !"ALL".equalsIgnoreCase(status.trim()))
                ? status.trim().toUpperCase()
                : null;

        String searchTerm = (search != null && !search.isBlank()) ? search.trim() : "";
        if (searchTerm.length() > 100) {
            searchTerm = searchTerm.substring(0, 100);
        }

        Page<Discussion> discussions = discussionRepository.findDiscussionsForManager(
                courseId, normalizedApproval, normalizedStatus, searchTerm, pageable);

        return discussions.map(d -> mapToItemDto(d, managerId));
    }

    @Override
    @Transactional(readOnly = true)
    public DiscussionDetailDto getDiscussionDetail(Long discussionId, Long managerId) {
        Discussion discussion = discussionRepository.findById(discussionId)
                .orElseThrow(() -> new ResourceNotFoundException("Discussion not found"));

        validateCourseManager(discussion.getCourse().getCourseId(), managerId);

        // Manager xem toàn bộ bình luận (kể cả bình luận đã bị ẩn)
        Pageable commentPageable = PageRequest.of(0, 50);
        Page<DiscussionComment> commentPage = commentRepository.findAllCommentsForManager(discussionId, commentPageable);

        return mapToDetailDto(discussion, managerId, commentPage.getContent());
    }

    @Override
    public DiscussionItemDto approveDiscussion(Long discussionId, Long managerId) {
        Discussion discussion = discussionRepository.findById(discussionId)
                .orElseThrow(() -> new ResourceNotFoundException("Discussion not found"));

        Course course = validateCourseManager(discussion.getCourse().getCourseId(), managerId);
        User manager = userRepository.findById(managerId)
                .orElseThrow(() -> new ResourceNotFoundException("Manager not found"));

        discussion.setApprovalStatus(Discussion.APPROVAL_APPROVED);
        discussion.setReviewedBy(manager);
        discussion.setReviewedAt(Instant.now());
        discussion.setRejectionReason(null);

        Discussion saved = discussionRepository.save(discussion);
        return mapToItemDto(saved, managerId);
    }

    @Override
    public DiscussionItemDto rejectDiscussion(Long discussionId, DiscussionManagerDtos.RejectDiscussionRequest request, Long managerId) {
        Discussion discussion = discussionRepository.findById(discussionId)
                .orElseThrow(() -> new ResourceNotFoundException("Discussion not found"));

        validateCourseManager(discussion.getCourse().getCourseId(), managerId);
        User manager = userRepository.findById(managerId)
                .orElseThrow(() -> new ResourceNotFoundException("Manager not found"));

        if (request == null || request.getReason() == null || request.getReason().isBlank()) {
            throw new BadRequestException("Rejection reason is required");
        }

        discussion.setApprovalStatus(Discussion.APPROVAL_REJECTED);
        discussion.setReviewedBy(manager);
        discussion.setReviewedAt(Instant.now());
        discussion.setRejectionReason(request.getReason().trim());

        Discussion saved = discussionRepository.save(discussion);
        return mapToItemDto(saved, managerId);
    }

    @Override
    public DiscussionItemDto updatePin(Long discussionId, DiscussionManagerDtos.UpdatePinRequest request, Long managerId) {
        Discussion discussion = discussionRepository.findById(discussionId)
                .orElseThrow(() -> new ResourceNotFoundException("Discussion not found"));

        validateCourseManager(discussion.getCourse().getCourseId(), managerId);

        if (request == null || request.getIsPinned() == null) {
            throw new BadRequestException("isPinned is required");
        }

        discussion.setIsPinned(request.getIsPinned());
        Discussion saved = discussionRepository.save(discussion);
        return mapToItemDto(saved, managerId);
    }

    @Override
    public DiscussionItemDto updateClose(Long discussionId, UpdateDiscussionRequestDto request, Long managerId) {
        Discussion discussion = discussionRepository.findById(discussionId)
                .orElseThrow(() -> new ResourceNotFoundException("Discussion not found"));

        validateCourseManager(discussion.getCourse().getCourseId(), managerId);

        if (request == null || request.getIsClosed() == null) {
            throw new BadRequestException("isClosed is required");
        }

        discussion.setIsClosed(request.getIsClosed());
        discussion.setStatus(request.getIsClosed() ? "CLOSED" : "OPEN");

        Discussion saved = discussionRepository.save(discussion);
        return mapToItemDto(saved, managerId);
    }

    @Override
    public void deleteDiscussion(Long discussionId, Long managerId) {
        Discussion discussion = discussionRepository.findById(discussionId)
                .orElseThrow(() -> new ResourceNotFoundException("Discussion not found"));

        validateCourseManager(discussion.getCourse().getCourseId(), managerId);

        discussionRepository.delete(discussion);
    }

    @Override
    public DiscussionDetailDto.CommentDto updateCommentStatus(Long commentId, DiscussionManagerDtos.UpdateCommentStatusRequest request, Long managerId) {
        DiscussionComment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new ResourceNotFoundException("Comment not found"));

        validateCourseManager(comment.getDiscussion().getCourse().getCourseId(), managerId);
        User manager = userRepository.findById(managerId)
                .orElseThrow(() -> new ResourceNotFoundException("Manager not found"));

        if (request == null || request.getStatus() == null || request.getStatus().isBlank()) {
            throw new BadRequestException("Status is required (VISIBLE or HIDDEN)");
        }

        String targetStatus = request.getStatus().trim().toUpperCase();
        if (!DiscussionComment.STATUS_VISIBLE.equals(targetStatus) && !DiscussionComment.STATUS_HIDDEN.equals(targetStatus)) {
            throw new BadRequestException("Status must be VISIBLE or HIDDEN");
        }

        comment.setStatus(targetStatus);
        if (DiscussionComment.STATUS_HIDDEN.equals(targetStatus)) {
            comment.setHiddenBy(manager);
            comment.setHiddenAt(Instant.now());
            comment.setHiddenReason(request.getReason() != null ? request.getReason().trim() : null);
        } else {
            comment.setHiddenBy(null);
            comment.setHiddenAt(null);
            comment.setHiddenReason(null);
        }

        DiscussionComment saved = commentRepository.save(comment);

        User cAuthor = saved.getUser();
        String cName = Boolean.TRUE.equals(saved.getIsAnonymous()) ? "Học sinh ẩn danh" : cAuthor.getFullName();
        String cAvatar = Boolean.TRUE.equals(saved.getIsAnonymous()) ? null : cAuthor.getAvatarUrl();

        return new DiscussionDetailDto.CommentDto(
                saved.getCommentId(),
                saved.getContent(),
                new DiscussionItemDto.AuthorDto(cAuthor.getUserId(), cName, cAvatar, cAuthor.getRoleName()),
                Boolean.TRUE.equals(saved.getIsAccepted()),
                Boolean.TRUE.equals(saved.getIsAnonymous()),
                saved.getImageUrl(),
                saved.getStatus(),
                saved.getCreatedAt()
        );
    }

    @Override
    public void deleteComment(Long commentId, Long managerId) {
        DiscussionComment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new ResourceNotFoundException("Comment not found"));

        Discussion discussion = comment.getDiscussion();
        validateCourseManager(discussion.getCourse().getCourseId(), managerId);

        commentRepository.delete(comment);

        // Giảm commentCount trên bài thảo luận
        int currentCount = discussion.getCommentCount() != null ? discussion.getCommentCount() : 0;
        discussion.setCommentCount(Math.max(0, currentCount - 1));
        discussionRepository.save(discussion);
    }
}
