package com.examprep.services;

import com.examprep.dto.discussion.DiscussionManagerDtos;
import com.examprep.dto.student.DiscussionDetailDto;
import com.examprep.dto.student.DiscussionItemDto;
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
import java.util.Set;

@Service
@RequiredArgsConstructor
@Transactional
public class ManagerDiscussionServiceImpl implements ManagerDiscussionService {

    /** The three tags a discussion may carry (V49). */
    private static final Set<String> TAGS = Set.of("question", "tip", "announcement");

    private final DiscussionRepository discussionRepository;
    private final DiscussionCommentRepository commentRepository;
    private final UserRepository userRepository;

    /**
     * Kiểm tra quyền quản lý discussion global của người dùng.
     * Người dùng được phép thao tác nếu là ADMIN hoặc COURSE_MANAGER.
     */
    private void validateManager(Long userId) {
        if (userId == null) {
            throw new ForbiddenException("Authentication required");
        }
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        if (!User.ROLE_ADMIN.equals(user.getRoleName()) && !User.ROLE_COURSE_MANAGER.equals(user.getRoleName())) {
            throw new ForbiddenException("Manager access required");
        }
    }

    /**
     * Chuyển đổi entity Discussion sang DiscussionItemDto cho danh sách.
     */
    private DiscussionItemDto mapToItemDto(Discussion d, Long currentUserId) {
        User author = d.getUser();

        String excerpt = d.getContent();
        if (excerpt != null && excerpt.length() > 150) {
            excerpt = excerpt.substring(0, 150) + "...";
        }

        boolean isAuthor = currentUserId != null && author.getUserId().equals(currentUserId);
        boolean isClosed = Boolean.TRUE.equals(d.getIsClosed()) || "CLOSED".equalsIgnoreCase(d.getStatus());

        return DiscussionItemDto.builder()
                .discussionId(d.getDiscussionId())
                .title(d.getTitle())
                .excerpt(excerpt)
                .tag(d.getTag())
                .author(DiscussionItemDto.AuthorDto.of(author, Boolean.TRUE.equals(d.getIsAnonymous())))
                .upvoteCount(d.getUpvoteCount() != null ? d.getUpvoteCount() : 0)
                .commentCount(d.getCommentCount() != null ? d.getCommentCount() : 0)
                .isPinned(Boolean.TRUE.equals(d.getIsPinned()))
                .isUpvoted(false)
                .isBookmarked(false)
                .isAuthor(isAuthor)
                .isClosed(isClosed)
                .imageUrl(d.getImageUrl())
                .approvalStatus(d.getApprovalStatus())
                .status(d.getStatus())
                .createdAt(d.getCreatedAt())
                .lastCommentAt(d.getUpdatedAt())
                .build();
    }

    /**
     * Chuyển đổi entity Discussion sang DiscussionDetailDto cho màn hình chi tiết.
     */
    private DiscussionDetailDto mapToDetailDto(Discussion d, Long currentUserId, List<DiscussionComment> comments) {
        User author = d.getUser();

        List<DiscussionDetailDto.CommentDto> commentDtos = comments.stream().map(c -> new DiscussionDetailDto.CommentDto(
                c.getCommentId(),
                c.getContent(),
                DiscussionItemDto.AuthorDto.of(c.getUser(), Boolean.TRUE.equals(c.getIsAnonymous())),
                Boolean.TRUE.equals(c.getIsAccepted()),
                Boolean.TRUE.equals(c.getIsAnonymous()),
                c.getImageUrl(),
                c.getStatus(),
                c.getCreatedAt()
        )).toList();

        boolean isAuthor = currentUserId != null && author.getUserId().equals(currentUserId);
        boolean isClosed = Boolean.TRUE.equals(d.getIsClosed()) || "CLOSED".equalsIgnoreCase(d.getStatus());

        return DiscussionDetailDto.builder()
                .discussionId(d.getDiscussionId())
                .title(d.getTitle())
                .content(d.getContent())
                .tag(d.getTag())
                .author(DiscussionItemDto.AuthorDto.of(author, Boolean.TRUE.equals(d.getIsAnonymous())))
                .upvoteCount(d.getUpvoteCount() != null ? d.getUpvoteCount() : 0)
                .commentCount(d.getCommentCount() != null ? d.getCommentCount() : 0)
                .isPinned(Boolean.TRUE.equals(d.getIsPinned()))
                .isUpvoted(false)
                .isBookmarked(false)
                .isAuthor(isAuthor)
                .isClosed(isClosed)
                .imageUrl(d.getImageUrl())
                .approvalStatus(d.getApprovalStatus())
                .status(d.getStatus())
                .rejectionReason(d.getRejectionReason())
                .createdAt(d.getCreatedAt())
                .updatedAt(d.getUpdatedAt())
                .comments(commentDtos)
                .build();
    }

    @Override
    public DiscussionDetailDto createDiscussion(DiscussionManagerDtos.CreateDiscussionRequest request, Long managerId) {
        validateManager(managerId);
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
        if (!TAGS.contains(tag)) {
            throw new BadRequestException("Unknown discussion tag: " + request.getTag());
        }

        boolean isPinned = Boolean.TRUE.equals(request.getIsPinned());

        // Manager tạo thảo luận/thông báo thì tự động phê duyệt (APPROVED) và hiển thị ngay
        Discussion discussion = Discussion.builder()
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
                .imageUrl(validateImageUrl(request.getImageUrl()))
                .approvalStatus(Discussion.APPROVAL_APPROVED)
                .reviewedBy(manager)
                .reviewedAt(Instant.now())
                .build();

        Discussion saved = discussionRepository.save(discussion);
        return mapToDetailDto(saved, managerId, List.of());
    }

    @Override
    @Transactional(readOnly = true)
    public Page<DiscussionItemDto> listDiscussions(String approvalStatus, String status, String search, int page, int size, Long managerId) {
        validateManager(managerId);
        if (page < 0 || size < 1 || size > 100) {
            throw new BadRequestException("Invalid page or size");
        }

        Pageable pageable = PageRequest.of(page, size);

        String normalizedApproval = (approvalStatus != null && !approvalStatus.isBlank() && !"ALL".equalsIgnoreCase(approvalStatus.trim()))
                ? approvalStatus.trim().toUpperCase()
                : null;

        String normalizedStatus = (status != null && !status.isBlank() && !"ALL".equalsIgnoreCase(status.trim()))
                ? status.trim().toUpperCase()
                : null;

        String rawSearch = (search != null && !search.isBlank()) ? search.trim() : "";
        if (rawSearch.length() > 100) {
            rawSearch = rawSearch.substring(0, 100);
        }
        String searchTerm = rawSearch.isEmpty() ? "" : escapeLikePattern(rawSearch);

        Page<Discussion> discussions = discussionRepository.findDiscussionsForManager(
                normalizedApproval, normalizedStatus, searchTerm, pageable);

        return discussions.map(d -> mapToItemDto(d, managerId));
    }

    private static String escapeLikePattern(String value) {
        return value.replace("!", "!!").replace("%", "!%").replace("_", "!_");
    }

    private static String validateImageUrl(String imageUrl) {
        if (imageUrl == null || imageUrl.isBlank()) return imageUrl;
        try {
            java.net.URI uri = java.net.URI.create(imageUrl.trim());
            String scheme = uri.getScheme();
            if (scheme == null || (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme))
                    || uri.getHost() == null || uri.getHost().isBlank()) {
                throw new BadRequestException("Invalid image URL");
            }
            return imageUrl.trim();
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Invalid image URL");
        }
    }

    @Override
    @Transactional(readOnly = true)
    public DiscussionDetailDto getDiscussionDetail(Long discussionId, Long managerId) {
        Discussion discussion = discussionRepository.findById(discussionId)
                .orElseThrow(() -> new ResourceNotFoundException("Discussion not found"));

        validateManager(managerId);

        // Manager xem toàn bộ bình luận (kể cả bình luận đã bị ẩn)
        Pageable commentPageable = PageRequest.of(0, 50);
        Page<DiscussionComment> commentPage = commentRepository.findAllCommentsForManager(discussionId, commentPageable);

        return mapToDetailDto(discussion, managerId, commentPage.getContent());
    }

    @Override
    public DiscussionItemDto approveDiscussion(Long discussionId, Long managerId) {
        Discussion discussion = discussionRepository.findById(discussionId)
                .orElseThrow(() -> new ResourceNotFoundException("Discussion not found"));

        validateManager(managerId);
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

        validateManager(managerId);
        User manager = userRepository.findById(managerId)
                .orElseThrow(() -> new ResourceNotFoundException("Manager not found"));

        if (request == null || request.getReason() == null || request.getReason().isBlank()) {
            throw new BadRequestException("Rejection reason is required");
        }

        discussion.setApprovalStatus(Discussion.APPROVAL_REJECTED);
        discussion.setIsPinned(false);
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

        validateManager(managerId);
        if (!Discussion.APPROVAL_APPROVED.equals(discussion.getApprovalStatus())
                || "HIDDEN".equals(discussion.getStatus())) {
            throw new BadRequestException("Only an approved, visible discussion can be pinned");
        }

        if (request == null || request.getIsPinned() == null) {
            throw new BadRequestException("isPinned is required");
        }

        discussion.setIsPinned(request.getIsPinned());
        Discussion saved = discussionRepository.save(discussion);
        return mapToItemDto(saved, managerId);
    }

    @Override
    public DiscussionItemDto hideDiscussion(Long discussionId, Long managerId) {
        Discussion discussion = discussionRepository.findById(discussionId)
                .orElseThrow(() -> new ResourceNotFoundException("Discussion not found"));

        validateManager(managerId);

        if ("HIDDEN".equals(discussion.getStatus())) {
            throw new BadRequestException("Discussion is already hidden");
        }

        discussion.setStatus("HIDDEN");
        discussion.setIsClosed(true);
        discussion.setIsPinned(false);
        Discussion saved = discussionRepository.save(discussion);
        return mapToItemDto(saved, managerId);
    }

    @Override
    public DiscussionItemDto restoreDiscussion(Long discussionId, Long managerId) {
        Discussion discussion = discussionRepository.findById(discussionId)
                .orElseThrow(() -> new ResourceNotFoundException("Discussion not found"));

        validateManager(managerId);

        if (!"HIDDEN".equals(discussion.getStatus())) {
            throw new BadRequestException("Discussion is not hidden");
        }

        discussion.setStatus("OPEN");
        discussion.setIsClosed(false);
        Discussion saved = discussionRepository.save(discussion);
        return mapToItemDto(saved, managerId);
    }

    @Override
    public DiscussionDetailDto.CommentDto updateCommentStatus(Long commentId, DiscussionManagerDtos.UpdateCommentStatusRequest request, Long managerId) {
        DiscussionComment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new ResourceNotFoundException("Comment not found"));

        validateManager(managerId);
        User manager = userRepository.findById(managerId)
                .orElseThrow(() -> new ResourceNotFoundException("Manager not found"));

        if (request == null || request.getStatus() == null || request.getStatus().isBlank()) {
            throw new BadRequestException("Status is required (VISIBLE or HIDDEN)");
        }

        String targetStatus = request.getStatus().trim().toUpperCase();
        if (!DiscussionComment.STATUS_VISIBLE.equals(targetStatus) && !DiscussionComment.STATUS_HIDDEN.equals(targetStatus)) {
            throw new BadRequestException("Status must be VISIBLE or HIDDEN");
        }

        String previousStatus = comment.getStatus();
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
        if (!targetStatus.equals(previousStatus)) {
            int currentCount = comment.getDiscussion().getCommentCount() != null
                    ? comment.getDiscussion().getCommentCount()
                    : 0;
            comment.getDiscussion().setCommentCount(
                    DiscussionComment.STATUS_VISIBLE.equals(targetStatus)
                            ? currentCount + 1
                            : Math.max(0, currentCount - 1));
            discussionRepository.save(comment.getDiscussion());
        }

        boolean anonymous = Boolean.TRUE.equals(saved.getIsAnonymous());

        return new DiscussionDetailDto.CommentDto(
                saved.getCommentId(),
                saved.getContent(),
                DiscussionItemDto.AuthorDto.of(saved.getUser(), anonymous),
                Boolean.TRUE.equals(saved.getIsAccepted()),
                anonymous,
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
        validateManager(managerId);

        commentRepository.delete(comment);
        if (DiscussionComment.STATUS_VISIBLE.equals(comment.getStatus())) {
            int currentCount = discussion.getCommentCount() != null ? discussion.getCommentCount() : 0;
            discussion.setCommentCount(Math.max(0, currentCount - 1));
        }
        discussionRepository.save(discussion);
    }
}
