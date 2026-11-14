package com.examprep.services.student;

import com.examprep.dto.student.CreateDiscussionRequestDto;
import com.examprep.dto.student.DiscussionDetailDto;
import com.examprep.dto.student.DiscussionItemDto;
import com.examprep.entities.*;
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
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class StudentDiscussionServiceTest {

    @Mock
    private DiscussionRepository discussionRepository;
    @Mock
    private DiscussionCommentRepository commentRepository;
    @Mock
    private DiscussionUpvoteRepository upvoteRepository;
    @Mock
    private DiscussionBookmarkRepository bookmarkRepository;
    @Mock
    private CourseRepository courseRepository;
    @Mock
    private EnrollmentRepository enrollmentRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private CourseManagerRepository courseManagerRepository;

    @InjectMocks
    private StudentDiscussionServiceImpl discussionService;

    private User author;
    private Course course;
    private Discussion discussion1;

    @BeforeEach
    void setUp() {
        author = User.builder().userId(200L).fullName("Author User").avatarUrl("http://avatar").roleName("STUDENT").build();
        course = Course.builder().courseId(50L).title("Course 50").build();
        discussion1 = Discussion.builder()
                .discussionId(1L)
                .course(course)
                .user(author)
                .title("Discussion Title")
                .content("Discussion Content")
                .tag("question")
                .isAnonymous(false)
                .status("OPEN")
                .isPinned(false)
                .commentCount(2)
                .upvoteCount(5)
                .isClosed(false)
                .createdAt(Instant.now())
                .updatedAt(Instant.now())
                .build();
    }

    @Test
    void listDiscussions_batchUpvotes() {
        Page<Discussion> page = new PageImpl<>(List.of(discussion1));
        when(discussionRepository.findDiscussions(eq(50L), eq("question"), eq(""), eq("latest"), any())).thenReturn(page);
        when(upvoteRepository.findUpvotedDiscussionIds(eq(200L), eq(List.of(1L)))).thenReturn(List.of(1L));

        Page<DiscussionItemDto> res = discussionService.listDiscussions(50L, "question", "", "latest", 0, 10, 200L);

        assertNotNull(res);
        assertEquals(1, res.getTotalElements());
        DiscussionItemDto item = res.getContent().get(0);
        assertEquals(1L, item.getDiscussionId());
        assertTrue(item.isUpvoted());
        assertTrue(item.isAuthor());
        verify(upvoteRepository, times(1)).findUpvotedDiscussionIds(eq(200L), any());
    }

    @Test
    void listTips_batchUpvotes() {
        discussion1.setTag("tip");
        Page<Discussion> page = new PageImpl<>(List.of(discussion1));
        when(discussionRepository.findDiscussions(eq(50L), eq("tip"), isNull(), eq("latest"), any())).thenReturn(page);
        when(upvoteRepository.findUpvotedDiscussionIds(eq(200L), eq(List.of(1L)))).thenReturn(List.of());

        Page<DiscussionItemDto> res = discussionService.listTips(50L, 0, 10, 200L);

        assertNotNull(res);
        assertEquals(1, res.getTotalElements());
        DiscussionItemDto item = res.getContent().get(0);
        assertEquals("tip", item.getTag());
        assertFalse(item.isUpvoted());
    }

    @Test
    void getDiscussionDetail_success_authorMatches() {
        when(discussionRepository.findById(1L)).thenReturn(Optional.of(discussion1));
        when(upvoteRepository.existsByDiscussion_DiscussionIdAndUser_UserId(1L, 200L)).thenReturn(true);
        when(bookmarkRepository.existsByDiscussion_DiscussionIdAndUser_UserId(1L, 200L)).thenReturn(false);
        when(commentRepository.findLatestCommentsByDiscussionId(eq(1L), any())).thenReturn(List.of());

        DiscussionDetailDto dto = discussionService.getDiscussionDetail(1L, 200L);

        assertNotNull(dto);
        assertEquals(1L, dto.getDiscussionId());
        assertTrue(dto.isUpvoted());
        assertFalse(dto.isBookmarked());
        assertTrue(dto.isAuthor()); // Verified: author ID 200 matches caller ID 200
    }

    @Test
    void toggleUpvote_addAndRemove() {
        when(discussionRepository.findById(1L)).thenReturn(Optional.of(discussion1));
        DiscussionUpvote upvote = DiscussionUpvote.builder().discussion(discussion1).user(author).build();
        when(upvoteRepository.findByDiscussion_DiscussionIdAndUser_UserId(1L, 200L)).thenReturn(Optional.of(upvote));

        Map<String, Object> res = discussionService.toggleUpvote(1L, 200L);

        assertNotNull(res);
        assertEquals(false, res.get("isUpvoted"));
        assertEquals(4, res.get("upvoteCount"));
        verify(upvoteRepository).delete(upvote);
    }

    @Test
    void updateDiscussion_close_returnsIsClosedTrue() {
        when(discussionRepository.findById(1L)).thenReturn(Optional.of(discussion1));
        when(discussionRepository.save(any(Discussion.class))).thenAnswer(inv -> inv.getArgument(0));

        com.examprep.dto.student.UpdateDiscussionRequestDto req = new com.examprep.dto.student.UpdateDiscussionRequestDto(true);
        DiscussionItemDto dto = discussionService.updateDiscussion(1L, req, 200L);

        assertNotNull(dto);
        assertTrue(dto.isClosed());
    }

    @Test
    void createDiscussion_asStudent_setsPendingApproval() {
        when(enrollmentRepository.existsByCourse_CourseIdAndUser_UserIdAndStatus(50L, 200L, "ACTIVE")).thenReturn(true);
        when(courseRepository.findById(50L)).thenReturn(Optional.of(course));
        when(userRepository.findById(200L)).thenReturn(Optional.of(author));
        when(discussionRepository.save(any(Discussion.class))).thenAnswer(inv -> inv.getArgument(0));

        CreateDiscussionRequestDto req = CreateDiscussionRequestDto.builder()
                .courseId(50L)
                .title("New Student Question")
                .content("Need help with Java")
                .tag("question")
                .imageUrl("https://image.url/photo.png")
                .build();

        DiscussionItemDto dto = discussionService.createDiscussion(req, 200L);

        assertNotNull(dto);
        assertEquals("PENDING", dto.getApprovalStatus());
        assertEquals("https://image.url/photo.png", dto.getImageUrl());
    }
}
