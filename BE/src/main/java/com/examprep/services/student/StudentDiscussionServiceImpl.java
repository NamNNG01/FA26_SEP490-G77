package com.examprep.services.student;

import com.examprep.dto.ResponseCode;
import com.examprep.dto.student.*;
import com.examprep.entities.*;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.BaseException;
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
import java.util.*;

@Service
@RequiredArgsConstructor
@Transactional
public class StudentDiscussionServiceImpl implements StudentDiscussionService {

    private static final String TAG_QUESTION = "question";
    private static final String TAG_TIP = "tip";
    private static final String TAG_ANNOUNCEMENT = "announcement";
    private static final Set<String> TAGS = Set.of(TAG_QUESTION, TAG_TIP, TAG_ANNOUNCEMENT);

    private final DiscussionRepository discussionRepository;
    private final DiscussionCommentRepository commentRepository;
    private final DiscussionUpvoteRepository upvoteRepository;
    private final DiscussionBookmarkRepository bookmarkRepository;
    private final CourseRepository courseRepository;
    private final EnrollmentRepository enrollmentRepository;
    private final UserRepository userRepository;
    private final CourseManagerRepository courseManagerRepository;

    private boolean isManagerOrAdmin(Long courseId, Long userId) {
        if (userId == null) {
            return false;
        }
        User user = userRepository.findById(userId).orElse(null);
        if (user == null) {
            return false;
        }
        if ("ADMIN".equals(user.getRoleName())) {
            return true;
        }
        return courseId != null && courseManagerRepository.existsByCourse_CourseIdAndUser_UserId(courseId, userId);
    }

    private void validateActiveEnrollment(Long courseId, Long userId) {
        if (userId == null) {
            throw new ForbiddenException("Authentication required");
        }
        boolean active = enrollmentRepository.existsByCourse_CourseIdAndUser_UserIdAndStatus(courseId, userId, "ACTIVE");
        if (!active) {
            throw new ForbiddenException("Student is not actively enrolled in this course");
        }
    }

    /** question, tip or announcement (case-insensitive); null or blank means question. */
    private static String normalizeTag(String tag) {
        if (tag == null || tag.isBlank()) {
            return TAG_QUESTION;
        }
        String normalized = tag.trim().toLowerCase();
        if (!TAGS.contains(normalized)) {
            throw new BadRequestException("Unknown discussion tag: " + tag);
        }
        return normalized;
    }

    private DiscussionItemDto mapToDto(Discussion d, Long userId, Set<Long> upvotedIds, Set<Long> bookmarkedIds) {
        boolean isUpvoted = userId != null && upvotedIds.contains(d.getDiscussionId());
        boolean isBookmarked = userId != null && bookmarkedIds.contains(d.getDiscussionId());
        boolean isAuthor = userId != null && d.getUser().getUserId().equals(userId);

        String excerpt = d.getContent();
        if (excerpt != null && excerpt.length() > 150) {
            excerpt = excerpt.substring(0, 150) + "...";
        }

        DiscussionItemDto.CourseRefDto courseRef = new DiscussionItemDto.CourseRefDto(
                d.getCourse().getCourseId(),
                d.getCourse().getTitle()
        );

        return DiscussionItemDto.builder()
                .discussionId(d.getDiscussionId())
                .title(d.getTitle())
                .excerpt(excerpt)
                .tag(d.getTag())
                .author(DiscussionItemDto.AuthorDto.of(d.getUser(), Boolean.TRUE.equals(d.getIsAnonymous())))
                .upvoteCount(d.getUpvoteCount())
                .commentCount(d.getCommentCount())
                .isPinned(Boolean.TRUE.equals(d.getIsPinned()))
                .isUpvoted(isUpvoted)
                .isBookmarked(isBookmarked)
                .isAuthor(isAuthor)
                .isClosed(Boolean.TRUE.equals(d.getIsClosed()) || "CLOSED".equals(d.getStatus()))
                .imageUrl(d.getImageUrl())
                .approvalStatus(d.getApprovalStatus())
                .createdAt(d.getCreatedAt())
                .lastCommentAt(d.getUpdatedAt())
                .course(courseRef)
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public Page<DiscussionItemDto> listDiscussions(Long courseId, String tag, String search, String sort, int page, int size, Long userId) {
        if (sort == null || sort.isBlank()) {
            sort = "latest";
        }
        Pageable pageable = PageRequest.of(page, size);
        // A blank tag means "every tag"; anything else must be one of the three known tags.
        String tagFilter = tag == null || tag.isBlank() ? null : normalizeTag(tag);
        String searchTerm = search != null && !search.isBlank()
                ? search.trim()
                : "";
        if (searchTerm.length() > 100) {
            searchTerm = searchTerm.substring(0, 100);
        }

        Page<Discussion> discussions = discussionRepository.findDiscussions(courseId, tagFilter, searchTerm, sort, pageable);
        List<Long> discussionIds = discussions.getContent().stream().map(Discussion::getDiscussionId).toList();
        Set<Long> upvotedIds = (userId != null && !discussionIds.isEmpty())
                ? new HashSet<>(upvoteRepository.findUpvotedDiscussionIds(userId, discussionIds))
                : Collections.emptySet();
        Set<Long> bookmarkedIds = (userId != null && !discussionIds.isEmpty())
                ? new HashSet<>(bookmarkRepository.findBookmarkedDiscussionIds(userId, discussionIds))
                : Collections.emptySet();

        return discussions.map(d -> mapToDto(d, userId, upvotedIds, bookmarkedIds));
    }

    @Override
    @Transactional(readOnly = true)
    public DiscussionDetailDto getDiscussionDetail(Long discussionId, Long userId) {
        Discussion d = discussionRepository.findById(discussionId)
                .orElseThrow(() -> new ResourceNotFoundException("Discussion not found"));

        boolean isAuthor = userId != null && d.getUser().getUserId().equals(userId);
        boolean isManager = isManagerOrAdmin(d.getCourse().getCourseId(), userId);

        if (d.getApprovalStatus() != null && !Discussion.APPROVAL_APPROVED.equals(d.getApprovalStatus())) {
            if (!isAuthor && !isManager) {
                throw new ResourceNotFoundException("Discussion not found");
            }
        }

        boolean isUpvoted = userId != null && upvoteRepository.existsByDiscussion_DiscussionIdAndUser_UserId(discussionId, userId);
        boolean isBookmarked = userId != null && bookmarkRepository.existsByDiscussion_DiscussionIdAndUser_UserId(discussionId, userId);

        // An anonymous author is masked on every read path: the real id never leaves the server.
        DiscussionItemDto.AuthorDto authorDto =
                DiscussionItemDto.AuthorDto.of(d.getUser(), Boolean.TRUE.equals(d.getIsAnonymous()));

        List<DiscussionComment> comments = commentRepository.findLatestCommentsByDiscussionId(discussionId, PageRequest.of(0, 20));
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

        return DiscussionDetailDto.builder()
                .discussionId(d.getDiscussionId())
                .title(d.getTitle())
                .content(d.getContent())
                .tag(d.getTag())
                .author(authorDto)
                .upvoteCount(d.getUpvoteCount())
                .commentCount(d.getCommentCount())
                .isPinned(Boolean.TRUE.equals(d.getIsPinned()))
                .isUpvoted(isUpvoted)
                .isBookmarked(isBookmarked)
                .isAuthor(isAuthor)
                .isClosed(Boolean.TRUE.equals(d.getIsClosed()) || "CLOSED".equals(d.getStatus()))
                .imageUrl(d.getImageUrl())
                .approvalStatus(d.getApprovalStatus())
                .rejectionReason(d.getRejectionReason())
                .createdAt(d.getCreatedAt())
                .updatedAt(d.getUpdatedAt())
                .comments(commentDtos)
                .build();
    }

    @Override
    public DiscussionItemDto createDiscussion(CreateDiscussionRequestDto request, Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        if (request.getCourseId() == null) {
            throw new BadRequestException("Course is required");
        }
        // The post belongs to the course the client picked, never to "whichever enrollment comes
        // first": a request for course B must not be stored under course A.
        Course course = courseRepository.findById(request.getCourseId())
                .orElseThrow(() -> new ResourceNotFoundException("Course not found"));

        boolean isManager = isManagerOrAdmin(course.getCourseId(), userId);
        if (!isManager) {
            validateActiveEnrollment(course.getCourseId(), userId);
        }

        if (request.getTitle() == null || request.getTitle().isBlank()) {
            throw new BadRequestException("Title is required");
        }
        if (request.getContent() == null || request.getContent().isBlank()) {
            throw new BadRequestException("Content is required");
        }

        String tag = normalizeTag(request.getTag());
        if (TAG_ANNOUNCEMENT.equals(tag) && !isManager) {
            throw new BadRequestException("Only course managers can post announcements");
        }

        String approvalStatus = isManager ? Discussion.APPROVAL_APPROVED : Discussion.APPROVAL_PENDING;

        Discussion d = Discussion.builder()
                .course(course)
                .user(user)
                .title(request.getTitle().trim())
                .content(request.getContent().trim())
                .tag(tag)
                .isAnonymous(Boolean.TRUE.equals(request.getIsAnonymous()))
                .status("OPEN")
                .isPinned(false)
                .viewCount(0)
                .commentCount(0)
                .upvoteCount(0)
                .isClosed(false)
                .imageUrl(request.getImageUrl())
                .approvalStatus(approvalStatus)
                .build();

        Discussion saved = discussionRepository.save(d);
        return mapToDto(saved, userId, Collections.emptySet(), Collections.emptySet());
    }

    @Override
    public DiscussionDetailDto.CommentDto createComment(Long discussionId, CreateCommentRequestDto request, Long userId) {
        Discussion d = discussionRepository.findById(discussionId)
                .orElseThrow(() -> new ResourceNotFoundException("Discussion not found"));

        if (Boolean.TRUE.equals(d.getIsClosed()) || "CLOSED".equals(d.getStatus())) {
            throw new BaseException(ResponseCode.CONFLICT, "Discussion closed");
        }

        if (d.getApprovalStatus() != null && !Discussion.APPROVAL_APPROVED.equals(d.getApprovalStatus())) {
            throw new BadRequestException("Cannot comment on an unapproved discussion");
        }

        boolean isManager = isManagerOrAdmin(d.getCourse().getCourseId(), userId);
        if (!isManager) {
            validateActiveEnrollment(d.getCourse().getCourseId(), userId);
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        DiscussionComment comment = DiscussionComment.builder()
                .discussion(d)
                .user(user)
                .content(request.getContent().trim())
                .isAnonymous(Boolean.TRUE.equals(request.getIsAnonymous()))
                .status("VISIBLE")
                .imageUrl(request.getImageUrl())
                .isAccepted(false)
                .build();
        commentRepository.save(comment);

        d.setCommentCount(d.getCommentCount() + 1);
        discussionRepository.save(d);

        return new DiscussionDetailDto.CommentDto(
                comment.getCommentId(),
                comment.getContent(),
                DiscussionItemDto.AuthorDto.of(user, Boolean.TRUE.equals(comment.getIsAnonymous())),
                false,
                comment.getIsAnonymous(),
                comment.getImageUrl(),
                comment.getStatus(),
                comment.getCreatedAt()
        );
    }

    @Override
    public Map<String, Object> toggleUpvote(Long discussionId, Long userId) {
        Discussion d = discussionRepository.findById(discussionId)
                .orElseThrow(() -> new ResourceNotFoundException("Discussion not found"));

        Optional<DiscussionUpvote> existing = upvoteRepository.findByDiscussion_DiscussionIdAndUser_UserId(discussionId, userId);
        boolean isUpvoted;
        if (existing.isPresent()) {
            upvoteRepository.delete(existing.get());
            d.setUpvoteCount(Math.max(0, d.getUpvoteCount() - 1));
            isUpvoted = false;
        } else {
            User user = userRepository.findById(userId).orElseThrow();
            DiscussionUpvote upvote = DiscussionUpvote.builder().discussion(d).user(user).build();
            upvoteRepository.save(upvote);
            d.setUpvoteCount(d.getUpvoteCount() + 1);
            isUpvoted = true;
        }
        discussionRepository.save(d);

        return Map.of(
                "discussionId", discussionId,
                "upvoteCount", d.getUpvoteCount(),
                "isUpvoted", isUpvoted
        );
    }

    @Override
    public Map<String, Object> toggleBookmark(Long discussionId, Long userId) {
        Discussion d = discussionRepository.findById(discussionId)
                .orElseThrow(() -> new ResourceNotFoundException("Discussion not found"));

        Optional<DiscussionBookmark> existing = bookmarkRepository.findByDiscussion_DiscussionIdAndUser_UserId(discussionId, userId);
        boolean isBookmarked;
        if (existing.isPresent()) {
            bookmarkRepository.delete(existing.get());
            isBookmarked = false;
        } else {
            User user = userRepository.findById(userId).orElseThrow();
            DiscussionBookmark bookmark = DiscussionBookmark.builder().discussion(d).user(user).build();
            bookmarkRepository.save(bookmark);
            isBookmarked = true;
        }

        return Map.of(
                "discussionId", discussionId,
                "isBookmarked", isBookmarked
        );
    }

    @Override
    @Transactional(readOnly = true)
    public Page<DiscussionItemDto> listBookmarkedDiscussions(int page, int size, Long userId) {
        if (userId == null) {
            throw new ForbiddenException("Authentication required");
        }
        Pageable pageable = PageRequest.of(page, size);
        Page<Discussion> discussions = discussionRepository.findBookmarkedByUser(userId, pageable);
        List<Long> discussionIds = discussions.getContent().stream().map(Discussion::getDiscussionId).toList();
        Set<Long> upvotedIds = !discussionIds.isEmpty()
                ? new HashSet<>(upvoteRepository.findUpvotedDiscussionIds(userId, discussionIds))
                : Collections.emptySet();
        Set<Long> bookmarkedIds = new HashSet<>(discussionIds); // Tất cả đều bookmarked

        return discussions.map(d -> mapToDto(d, userId, upvotedIds, bookmarkedIds));
    }

    @Override
    @Transactional(readOnly = true)
    public Page<DiscussionItemDto> listTips(Long courseId, int page, int size, Long userId) {
        Pageable pageable = PageRequest.of(page, size);
        // Tips are the APPROVED discussions tagged "tip" (the tag filter also keeps them out of
        // the announcement / question tabs).
        Page<Discussion> discussions = discussionRepository.findDiscussions(courseId, TAG_TIP, null, "latest", pageable);
        List<Long> discussionIds = discussions.getContent().stream().map(Discussion::getDiscussionId).toList();
        Set<Long> upvotedIds = (userId != null && !discussionIds.isEmpty())
                ? new HashSet<>(upvoteRepository.findUpvotedDiscussionIds(userId, discussionIds))
                : Collections.emptySet();
        Set<Long> bookmarkedIds = (userId != null && !discussionIds.isEmpty())
                ? new HashSet<>(bookmarkRepository.findBookmarkedDiscussionIds(userId, discussionIds))
                : Collections.emptySet();

        return discussions.map(d -> mapToDto(d, userId, upvotedIds, bookmarkedIds));
    }

    @Override
    public DiscussionItemDto updateDiscussion(Long discussionId, UpdateDiscussionRequestDto request, Long userId) {
        Discussion d = discussionRepository.findById(discussionId)
                .orElseThrow(() -> new ResourceNotFoundException("Discussion not found"));

        boolean isAuthor = d.getUser().getUserId().equals(userId);

        // Chỉ author mới có thể update (close/open) discussion của mình
        if (!isAuthor) {
            throw new ForbiddenException("Only author can update their discussion");
        }

        if (request.getIsClosed() != null) {
            d.setIsClosed(request.getIsClosed());
            d.setStatus(request.getIsClosed() ? "CLOSED" : "OPEN");
        }

        Discussion saved = discussionRepository.save(d);
        Set<Long> upvotedIds = upvoteRepository.existsByDiscussion_DiscussionIdAndUser_UserId(discussionId, userId)
                ? Set.of(discussionId)
                : Collections.emptySet();
        Set<Long> bookmarkedIds = bookmarkRepository.existsByDiscussion_DiscussionIdAndUser_UserId(discussionId, userId)
                ? Set.of(discussionId)
                : Collections.emptySet();
        return mapToDto(saved, userId, upvotedIds, bookmarkedIds);
    }
}
