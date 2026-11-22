package com.examprep.services;

import com.examprep.dto.discussion.DiscussionManagerDtos;
import com.examprep.dto.student.DiscussionDetailDto;
import com.examprep.dto.student.DiscussionItemDto;
import com.examprep.entities.Discussion;
import com.examprep.entities.DiscussionComment;
import com.examprep.entities.User;
import com.examprep.exceptions.ForbiddenException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ManagerDiscussionServiceTest {

    @Mock
    private DiscussionRepository discussionRepository;
    @Mock
    private DiscussionCommentRepository commentRepository;
    @Mock
    private DiscussionReportRepository reportRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private CommunityHelper communityHelper;

    @InjectMocks
    private ManagerDiscussionServiceImpl managerDiscussionService;

    private User manager;
    private User student;
    private Discussion discussion;
    private DiscussionComment comment;

    @BeforeEach
    void setUp() {
        manager = User.builder().userId(10L).fullName("Admin User").roleName(User.ROLE_ADMIN).build();
        student = User.builder().userId(20L).fullName("Student User").roleName(User.ROLE_STUDENT).build();
        discussion = Discussion.builder()
                .discussionId(1L)
                .user(student)
                .title("Student Question")
                .content("Question Content")
                .tag("question")
                .status("OPEN")
                .approvalStatus(Discussion.APPROVAL_PENDING)
                .isClosed(false)
                .isPinned(false)
                .commentCount(1)
                .upvoteCount(0)
                .createdAt(Instant.now())
                .updatedAt(Instant.now())
                .build();

        comment = DiscussionComment.builder()
                .commentId(5L)
                .discussion(discussion)
                .user(student)
                .content("Inappropriate comment")
                .status(DiscussionComment.STATUS_VISIBLE)
                .createdAt(Instant.now())
                .build();
    }

    @Test
    void createDiscussion_asManager_autoApproved() {
        when(userRepository.findById(10L)).thenReturn(Optional.of(manager));
        when(discussionRepository.save(any(Discussion.class))).thenAnswer(inv -> inv.getArgument(0));

        DiscussionManagerDtos.CreateDiscussionRequest req = DiscussionManagerDtos.CreateDiscussionRequest.builder()
                .title("Class Announcement")
                .content("Exam is on Monday")
                .tag("announcement")
                .imageUrl("https://images.com/schedule.png")
                .isPinned(true)
                .build();

        DiscussionDetailDto res = managerDiscussionService.createDiscussion(req, 10L);

        assertNotNull(res);
        assertEquals("Class Announcement", res.getTitle());
        assertEquals(Discussion.APPROVAL_APPROVED, res.getApprovalStatus());
        assertTrue(res.isPinned());
        assertEquals("https://images.com/schedule.png", res.getImageUrl());
    }

    @Test
    void createDiscussion_asCourseManager_throwsForbidden() {
        User cmUser = User.builder().userId(98L).fullName("Course Manager").roleName(User.ROLE_COURSE_MANAGER).build();
        when(userRepository.findById(98L)).thenReturn(Optional.of(cmUser));
        DiscussionManagerDtos.CreateDiscussionRequest req = DiscussionManagerDtos.CreateDiscussionRequest.builder()
                .title("Test")
                .content("Content")
                .build();

        assertThrows(ForbiddenException.class, () -> managerDiscussionService.createDiscussion(req, 98L));
    }

    @Test
    void createDiscussion_notCourseManager_throwsForbidden() {
        User otherUser = User.builder().userId(99L).fullName("Other User").roleName(User.ROLE_STUDENT).build();
        when(userRepository.findById(99L)).thenReturn(Optional.of(otherUser));
        DiscussionManagerDtos.CreateDiscussionRequest req = DiscussionManagerDtos.CreateDiscussionRequest.builder()
                .title("Test")
                .content("Content")
                .build();

        assertThrows(ForbiddenException.class, () -> managerDiscussionService.createDiscussion(req, 99L));
    }

    @Test
    void listDiscussions_success() {
        when(userRepository.findById(10L)).thenReturn(Optional.of(manager));
        Page<Discussion> page = new PageImpl<>(List.of(discussion));
        when(discussionRepository.findDiscussionsForAdmin(eq("PENDING"), isNull(), isNull(), isNull(), eq(""), eq("oldest"), any())).thenReturn(page);

        Page<DiscussionItemDto> res = managerDiscussionService.listDiscussions("PENDING", null, null, null, "", "oldest", 0, 20, 10L);

        assertNotNull(res);
        assertEquals(1, res.getTotalElements());
        assertEquals(1L, res.getContent().get(0).getDiscussionId());
    }

    @Test
    void approveDiscussion_success() {
        when(discussionRepository.findById(1L)).thenReturn(Optional.of(discussion));
        when(userRepository.findById(10L)).thenReturn(Optional.of(manager));
        when(discussionRepository.save(any(Discussion.class))).thenAnswer(inv -> inv.getArgument(0));

        DiscussionItemDto res = managerDiscussionService.approveDiscussion(1L, 10L);

        assertNotNull(res);
        assertEquals(Discussion.APPROVAL_APPROVED, res.getApprovalStatus());
        assertEquals(Discussion.APPROVAL_APPROVED, discussion.getApprovalStatus());
        assertEquals(manager, discussion.getReviewedBy());
        assertNotNull(discussion.getReviewedAt());
    }

    @Test
    void rejectDiscussion_success() {
        when(discussionRepository.findById(1L)).thenReturn(Optional.of(discussion));
        when(userRepository.findById(10L)).thenReturn(Optional.of(manager));
        when(discussionRepository.save(any(Discussion.class))).thenAnswer(inv -> inv.getArgument(0));

        DiscussionManagerDtos.RejectDiscussionRequest req = new DiscussionManagerDtos.RejectDiscussionRequest("Not relevant");
        DiscussionItemDto res = managerDiscussionService.rejectDiscussion(1L, req, 10L);

        assertNotNull(res);
        assertEquals(Discussion.APPROVAL_REJECTED, res.getApprovalStatus());
        assertEquals("Not relevant", discussion.getRejectionReason());
    }

    @Test
    void updatePin_success() {
        when(discussionRepository.findById(1L)).thenReturn(Optional.of(discussion));
        discussion.setApprovalStatus(Discussion.APPROVAL_APPROVED);
        when(userRepository.findById(10L)).thenReturn(Optional.of(manager));
        when(discussionRepository.save(any(Discussion.class))).thenAnswer(inv -> inv.getArgument(0));

        DiscussionManagerDtos.UpdatePinRequest req = new DiscussionManagerDtos.UpdatePinRequest(true);
        DiscussionItemDto res = managerDiscussionService.updatePin(1L, req, 10L);

        assertNotNull(res);
        assertTrue(res.isPinned());
        assertTrue(discussion.getIsPinned());
    }

    @Test
    void hideDiscussion_success() {
        when(discussionRepository.findById(1L)).thenReturn(Optional.of(discussion));
        when(userRepository.findById(10L)).thenReturn(Optional.of(manager));
        when(discussionRepository.save(any(Discussion.class))).thenAnswer(inv -> inv.getArgument(0));

        DiscussionItemDto result = managerDiscussionService.hideDiscussion(1L, 10L);

        assertEquals("HIDDEN", result.getStatus());
        assertTrue(discussion.getIsClosed());
        assertFalse(discussion.getIsPinned());
        verify(discussionRepository).save(discussion);
    }

    @Test
    void restoreDiscussion_success() {
        discussion.setStatus("HIDDEN");
        discussion.setIsClosed(true);
        when(discussionRepository.findById(1L)).thenReturn(Optional.of(discussion));
        when(userRepository.findById(10L)).thenReturn(Optional.of(manager));
        when(discussionRepository.save(any(Discussion.class))).thenAnswer(inv -> inv.getArgument(0));

        DiscussionItemDto result = managerDiscussionService.restoreDiscussion(1L, 10L);

        assertEquals("OPEN", result.getStatus());
        assertFalse(discussion.getIsClosed());
        verify(discussionRepository).save(discussion);
    }

    @Test
    void updateCommentStatus_hide_success() {
        when(commentRepository.findById(5L)).thenReturn(Optional.of(comment));
        when(userRepository.findById(10L)).thenReturn(Optional.of(manager));
        when(commentRepository.save(any(DiscussionComment.class))).thenAnswer(inv -> inv.getArgument(0));

        DiscussionManagerDtos.UpdateCommentStatusRequest req = new DiscussionManagerDtos.UpdateCommentStatusRequest("HIDDEN", "Spam comment");
        DiscussionDetailDto.CommentDto res = managerDiscussionService.updateCommentStatus(5L, req, 10L);

        assertNotNull(res);
        assertEquals("HIDDEN", res.getStatus());
        assertEquals("HIDDEN", comment.getStatus());
        assertEquals(manager, comment.getHiddenBy());
        assertEquals("Spam comment", comment.getHiddenReason());
    }

    @Test
    void deleteComment_decrementsCount() {
        when(commentRepository.findById(5L)).thenReturn(Optional.of(comment));
        when(userRepository.findById(10L)).thenReturn(Optional.of(manager));
        managerDiscussionService.deleteComment(5L, 10L);

        verify(commentRepository).delete(comment);
        assertEquals(0, discussion.getCommentCount());
        verify(discussionRepository).save(discussion);
    }
}
