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
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
@Transactional
public class ManagerDiscussionServiceImpl implements ManagerDiscussionService {

    /** The three tags a discussion may carry (V49). */
    private static final Set<String> TAGS = Set.of("question", "tip", "announcement");

    private static final List<String> REJECTION_TEMPLATES = List.of(
            "Nội dung không liên quan đến học tập",
            "Chứa thông tin cá nhân, link lạ hoặc quảng cáo",
            "Hình ảnh mờ, không đọc được hoặc không phù hợp",
            "Ngôn từ thiếu chuẩn mực, không tôn trọng cộng đồng",
            "Nội dung quá ngắn hoặc chưa rõ câu hỏi"
    );

    private final DiscussionRepository discussionRepository;
    private final DiscussionCommentRepository commentRepository;
    private final DiscussionReportRepository reportRepository;
    private final UserRepository userRepository;
    private final CommunityHelper communityHelper;

    /**
     * Chỉ Admin mới có quyền kiểm duyệt cộng đồng.
     */
    private User validateAdmin(Long userId) {
        if (userId == null) {
            throw new ForbiddenException("Authentication required");
        }
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        if (!User.ROLE_ADMIN.equals(user.getRoleName())) {
            throw new ForbiddenException("Admin access required");
        }
        return user;
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
        boolean isClosed = d.isClosed();

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
                Boolean.TRUE.equals(c.getIsAnonymous()),
                c.getImageUrl(),
                c.getStatus(),
                c.getCreatedAt()
        )).toList();

        boolean isAuthor = currentUserId != null && author.getUserId().equals(currentUserId);
        boolean isClosed = d.isClosed();

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
    public DiscussionDetailDto createDiscussion(DiscussionManagerDtos.CreateDiscussionRequest request, Long adminId) {
        User admin = validateAdmin(adminId);

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

        Discussion discussion = Discussion.builder()
                .user(admin)
                .title(request.getTitle().trim())
                .content(request.getContent().trim())
                .tag(tag)
                .isAnonymous(false)
                .status(Discussion.STATUS_OPEN)
                .isPinned(isPinned)
                .viewCount(0)
                .commentCount(0)
                .upvoteCount(0)
                .imageUrl(validateImageUrl(request.getImageUrl()))
                .approvalStatus(Discussion.APPROVAL_APPROVED)
                .reviewedBy(admin)
                .reviewedAt(Instant.now())
                .build();

        Discussion saved = discussionRepository.save(discussion);
        return mapToDetailDto(saved, adminId, List.of());
    }

    @Override
    @Transactional(readOnly = true)
    public Page<DiscussionItemDto> listDiscussions(
            String approvalStatus,
            String status,
            String tag,
            Boolean hasImage,
            String search,
            String sort,
            int page,
            int size,
            Long adminId
    ) {
        validateAdmin(adminId);
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

        String normalizedTag = (tag != null && !tag.isBlank() && !"ALL".equalsIgnoreCase(tag.trim()))
                ? tag.trim().toLowerCase()
                : null;

        String normalizedSort = "oldest".equalsIgnoreCase(sort) ? "oldest" : "latest";

        String rawSearch = (search != null && !search.isBlank()) ? search.trim() : "";
        if (rawSearch.length() > 100) {
            rawSearch = rawSearch.substring(0, 100);
        }
        String searchTerm = rawSearch.isEmpty() ? "" : escapeLikePattern(rawSearch);

        Page<Discussion> discussions = discussionRepository.findDiscussionsForAdmin(
                normalizedApproval, normalizedStatus, normalizedTag, hasImage, searchTerm, normalizedSort, pageable);

        return discussions.map(d -> mapToItemDto(d, adminId));
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
    public DiscussionDetailDto getDiscussionDetail(Long discussionId, Long adminId) {
        Discussion discussion = discussionRepository.findById(discussionId)
                .orElseThrow(() -> new ResourceNotFoundException("Discussion not found"));

        validateAdmin(adminId);

        Pageable commentPageable = PageRequest.of(0, 50);
        Page<DiscussionComment> commentPage = commentRepository.findAllCommentsForManager(discussionId, commentPageable);

        return mapToDetailDto(discussion, adminId, commentPage.getContent());
    }

    private Discussion applyApprove(Discussion discussion, User admin) {
        discussion.setApprovalStatus(Discussion.APPROVAL_APPROVED);
        discussion.setReviewedBy(admin);
        discussion.setReviewedAt(Instant.now());
        discussion.setRejectionReason(null);
        Discussion saved = discussionRepository.save(discussion);

        communityHelper.sendNotification(
                discussion.getUser(),
                "Bài viết cộng đồng đã được duyệt",
                "Bài viết \"" + discussion.getTitle() + "\" của bạn đã được Admin phê duyệt và hiển thị công khai.",
                "COMMUNITY_APPROVED",
                discussion.getDiscussionId()
        );
        return saved;
    }

    private Discussion applyReject(Discussion discussion, User admin, String reason) {
        discussion.setApprovalStatus(Discussion.APPROVAL_REJECTED);
        discussion.setIsPinned(false);
        discussion.setReviewedBy(admin);
        discussion.setReviewedAt(Instant.now());
        discussion.setRejectionReason(reason);
        Discussion saved = discussionRepository.save(discussion);

        communityHelper.sendNotification(
                discussion.getUser(),
                "Bài viết cộng đồng chưa được duyệt",
                "Bài viết \"" + discussion.getTitle() + "\" bị từ chối. Lý do: " + reason + ". Bạn có thể chỉnh sửa và gửi duyệt lại.",
                "COMMUNITY_REJECTED",
                discussion.getDiscussionId()
        );
        return saved;
    }

    @Override
    public DiscussionItemDto approveDiscussion(Long discussionId, Long adminId) {
        User admin = validateAdmin(adminId);
        Discussion discussion = discussionRepository.findById(discussionId)
                .orElseThrow(() -> new ResourceNotFoundException("Discussion not found"));
        return mapToItemDto(applyApprove(discussion, admin), adminId);
    }

    @Override
    public DiscussionItemDto rejectDiscussion(Long discussionId, DiscussionManagerDtos.RejectDiscussionRequest request, Long adminId) {
        User admin = validateAdmin(adminId);
        Discussion discussion = discussionRepository.findById(discussionId)
                .orElseThrow(() -> new ResourceNotFoundException("Discussion not found"));

        if (request == null || request.getReason() == null || request.getReason().isBlank()) {
            throw new BadRequestException("Rejection reason is required");
        }
        return mapToItemDto(applyReject(discussion, admin, request.getReason().trim()), adminId);
    }

    @Override
    public int bulkApproveDiscussions(List<Long> discussionIds, Long adminId) {
        User admin = validateAdmin(adminId);
        if (discussionIds == null || discussionIds.isEmpty()) {
            return 0;
        }
        int count = 0;
        List<Discussion> list = discussionRepository.findAllById(discussionIds);
        for (Discussion d : list) {
            if (!Discussion.APPROVAL_APPROVED.equals(d.getApprovalStatus())) {
                applyApprove(d, admin);
                count++;
            }
        }
        return count;
    }

    @Override
    public int bulkRejectDiscussions(List<Long> discussionIds, String reason, Long adminId) {
        User admin = validateAdmin(adminId);
        if (reason == null || reason.isBlank()) {
            throw new BadRequestException("Rejection reason is required");
        }
        if (discussionIds == null || discussionIds.isEmpty()) {
            return 0;
        }
        String trimmedReason = reason.trim();
        int count = 0;
        List<Discussion> list = discussionRepository.findAllById(discussionIds);
        for (Discussion d : list) {
            if (!Discussion.APPROVAL_REJECTED.equals(d.getApprovalStatus())) {
                applyReject(d, admin, trimmedReason);
                count++;
            }
        }
        return count;
    }

    @Override
    public DiscussionItemDto updatePin(Long discussionId, DiscussionManagerDtos.UpdatePinRequest request, Long adminId) {
        validateAdmin(adminId);
        Discussion discussion = discussionRepository.findById(discussionId)
                .orElseThrow(() -> new ResourceNotFoundException("Discussion not found"));

        if (!Discussion.APPROVAL_APPROVED.equals(discussion.getApprovalStatus())
                || "HIDDEN".equals(discussion.getStatus())) {
            throw new BadRequestException("Only an approved, visible discussion can be pinned");
        }
        if (request == null || request.getIsPinned() == null) {
            throw new BadRequestException("isPinned is required");
        }

        discussion.setIsPinned(request.getIsPinned());
        Discussion saved = discussionRepository.save(discussion);
        return mapToItemDto(saved, adminId);
    }

    @Override
    public DiscussionItemDto hideDiscussion(Long discussionId, Long adminId) {
        validateAdmin(adminId);
        Discussion discussion = discussionRepository.findById(discussionId)
                .orElseThrow(() -> new ResourceNotFoundException("Discussion not found"));

        if ("HIDDEN".equals(discussion.getStatus())) {
            throw new BadRequestException("Discussion is already hidden");
        }

        discussion.setStatus(Discussion.STATUS_HIDDEN);
        discussion.setIsPinned(false);
        Discussion saved = discussionRepository.save(discussion);
        return mapToItemDto(saved, adminId);
    }

    @Override
    public DiscussionItemDto restoreDiscussion(Long discussionId, Long adminId) {
        validateAdmin(adminId);
        Discussion discussion = discussionRepository.findById(discussionId)
                .orElseThrow(() -> new ResourceNotFoundException("Discussion not found"));

        if (!"HIDDEN".equals(discussion.getStatus())) {
            throw new BadRequestException("Discussion is not hidden");
        }

        discussion.setStatus(Discussion.STATUS_OPEN);
        Discussion saved = discussionRepository.save(discussion);
        return mapToItemDto(saved, adminId);
    }

    @Override
    public DiscussionDetailDto.CommentDto updateCommentStatus(Long commentId, DiscussionManagerDtos.UpdateCommentStatusRequest request, Long adminId) {
        User admin = validateAdmin(adminId);
        DiscussionComment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new ResourceNotFoundException("Comment not found"));

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
            comment.setHiddenBy(admin);
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
                anonymous,
                saved.getImageUrl(),
                saved.getStatus(),
                saved.getCreatedAt()
        );
    }

    @Override
    public void deleteComment(Long commentId, Long adminId) {
        validateAdmin(adminId);
        DiscussionComment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new ResourceNotFoundException("Comment not found"));

        Discussion discussion = comment.getDiscussion();
        commentRepository.delete(comment);
        if (DiscussionComment.STATUS_VISIBLE.equals(comment.getStatus())) {
            int currentCount = discussion.getCommentCount() != null ? discussion.getCommentCount() : 0;
            discussion.setCommentCount(Math.max(0, currentCount - 1));
        }
        discussionRepository.save(discussion);
    }

    @Override
    @Transactional(readOnly = true)
    public DiscussionManagerDtos.ModerationSummaryDto getModerationSummary(Long adminId) {
        validateAdmin(adminId);
        long pendingDiscussions = discussionRepository.countByApprovalStatus(Discussion.APPROVAL_PENDING);
        long pendingReports = reportRepository.countByStatus(DiscussionReport.STATUS_PENDING);
        return DiscussionManagerDtos.ModerationSummaryDto.builder()
                .pendingDiscussionsCount(pendingDiscussions)
                .pendingReportsCount(pendingReports)
                .rejectionTemplates(REJECTION_TEMPLATES)
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public Page<DiscussionManagerDtos.DiscussionReportItemDto> listReports(String status, int page, int size, Long adminId) {
        validateAdmin(adminId);
        if (page < 0 || size < 1 || size > 100) {
            throw new BadRequestException("Invalid page or size");
        }
        String normalizedStatus = (status != null && !status.isBlank() && !"ALL".equalsIgnoreCase(status.trim()))
                ? status.trim().toUpperCase()
                : null;
        Page<DiscussionReport> reports = reportRepository.findByStatusFilter(normalizedStatus, PageRequest.of(page, size));
        return reports.map(this::mapReportToDto);
    }

    @Override
    public DiscussionManagerDtos.DiscussionReportItemDto resolveReport(
            Long reportId,
            DiscussionManagerDtos.ResolveReportRequest request,
            Long adminId
    ) {
        User admin = validateAdmin(adminId);
        DiscussionReport report = reportRepository.findById(reportId)
                .orElseThrow(() -> new ResourceNotFoundException("Report not found"));

        if (!DiscussionReport.STATUS_PENDING.equals(report.getStatus())) {
            throw new BadRequestException("Report has already been processed");
        }

        String action = request.getAction().trim().toUpperCase();
        if (!"HIDE_AND_RESOLVE".equals(action) && !"DISMISS".equals(action)) {
            throw new BadRequestException("action must be HIDE_AND_RESOLVE or DISMISS");
        }

        if ("HIDE_AND_RESOLVE".equals(action)) {
            if (DiscussionReport.TARGET_COMMENT.equals(report.getTargetType()) && report.getComment() != null) {
                DiscussionComment comment = report.getComment();
                if (!DiscussionComment.STATUS_HIDDEN.equals(comment.getStatus())) {
                    comment.setStatus(DiscussionComment.STATUS_HIDDEN);
                    comment.setHiddenBy(admin);
                    comment.setHiddenAt(Instant.now());
                    comment.setHiddenReason(request.getNote() != null ? request.getNote().trim() : report.getReason());
                    commentRepository.save(comment);

                    Discussion d = comment.getDiscussion();
                    int currentCount = d.getCommentCount() != null ? d.getCommentCount() : 0;
                    d.setCommentCount(Math.max(0, currentCount - 1));
                    discussionRepository.save(d);
                }
            } else {
                Discussion d = report.getDiscussion();
                if (!Discussion.STATUS_HIDDEN.equals(d.getStatus())) {
                    d.setStatus(Discussion.STATUS_HIDDEN);
                    d.setIsPinned(false);
                    discussionRepository.save(d);
                }
            }
            report.setStatus(DiscussionReport.STATUS_RESOLVED);
        } else {
            report.setStatus(DiscussionReport.STATUS_DISMISSED);
        }

        report.setResolvedBy(admin);
        report.setResolvedAt(Instant.now());
        report.setResolutionNote(request.getNote() != null ? request.getNote().trim() : null);
        return mapReportToDto(reportRepository.save(report));
    }

    @Override
    public void muteUser(Long targetUserId, DiscussionManagerDtos.MuteUserRequest request, Long adminId) {
        validateAdmin(adminId);
        User target = userRepository.findById(targetUserId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        Instant mutedUntil = Instant.now().plus(request.getDays(), ChronoUnit.DAYS);
        target.setCommunityMutedUntil(mutedUntil);
        target.setCommunityMuteReason(request.getReason().trim());
        userRepository.save(target);

        communityHelper.sendNotification(
                target,
                "Tài khoản bị tạm khóa tương tác cộng đồng",
                "Bạn bị tạm khóa đăng bài và bình luận trong " + request.getDays() + " ngày. Lý do: " + request.getReason().trim(),
                "COMMUNITY_MUTED",
                0L
        );
    }

    @Override
    public void unmuteUser(Long targetUserId, Long adminId) {
        validateAdmin(adminId);
        User target = userRepository.findById(targetUserId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        target.setCommunityMutedUntil(null);
        target.setCommunityMuteReason(null);
        userRepository.save(target);
    }

    private DiscussionManagerDtos.DiscussionReportItemDto mapReportToDto(DiscussionReport r) {
        boolean isComment = DiscussionReport.TARGET_COMMENT.equals(r.getTargetType()) && r.getComment() != null;
        User targetAuthor = isComment ? r.getComment().getUser() : r.getDiscussion().getUser();
        String targetContent = isComment ? r.getComment().getContent() : r.getDiscussion().getContent();
        if (targetContent != null && targetContent.length() > 200) {
            targetContent = targetContent.substring(0, 200) + "...";
        }
        return DiscussionManagerDtos.DiscussionReportItemDto.builder()
                .reportId(r.getReportId())
                .targetType(r.getTargetType())
                .discussionId(r.getDiscussion().getDiscussionId())
                .discussionTitle(r.getDiscussion().getTitle())
                .commentId(isComment ? r.getComment().getCommentId() : null)
                .targetContent(targetContent)
                .targetAuthorId(targetAuthor != null ? targetAuthor.getUserId() : null)
                .targetAuthorName(targetAuthor != null ? targetAuthor.getFullName() : null)
                .reporterId(r.getReporter().getUserId())
                .reporterName(r.getReporter().getFullName())
                .reason(r.getReason())
                .status(r.getStatus())
                .resolutionNote(r.getResolutionNote())
                .createdAt(r.getCreatedAt())
                .resolvedAt(r.getResolvedAt())
                .build();
    }
}
