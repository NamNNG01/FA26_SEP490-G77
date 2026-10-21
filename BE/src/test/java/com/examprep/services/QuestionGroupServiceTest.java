package com.examprep.services;

import com.examprep.dto.PageResponse;
import com.examprep.dto.QuestionGroupCreateRequest;
import com.examprep.dto.QuestionGroupResponse;
import com.examprep.dto.QuestionGroupUpdateRequest;
import com.examprep.entities.Course;
import com.examprep.entities.Module;
import com.examprep.entities.QuestionGroup;
import com.examprep.entities.User;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.ForbiddenException;
import com.examprep.exceptions.ResourceConflictException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.CourseRepository;
import com.examprep.repositories.ExamGroupRepository;
import com.examprep.repositories.ExamQuestionRepository;
import com.examprep.repositories.ModuleRepository;
import com.examprep.repositories.QuestionGroupRepository;
import com.examprep.repositories.QuestionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;

import java.util.Collections;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class QuestionGroupServiceTest {

    @Mock
    private QuestionGroupRepository questionGroupRepository;

    @Mock
    private QuestionRepository questionRepository;

    @Mock
    private ExamGroupRepository examGroupRepository;

    @Mock
    private ExamQuestionRepository examQuestionRepository;

    @Mock
    private CourseRepository courseRepository;

    @Mock
    private ModuleRepository moduleRepository;

    @InjectMocks
    private QuestionGroupServiceImpl questionGroupService;

    private User manager;
    private Course course;
    private Module module;
    private QuestionGroup group;

    @BeforeEach
    void setUp() {
        manager = User.builder()
                .userId(101L)
                .email("manager@gmail.com")
                .passwordHash("hashed")
                .fullName("Manager One")
                .roleName(User.ROLE_COURSE_MANAGER)
                .status(User.STATUS_ACTIVE)
                .build();
        course = Course.builder()
                .courseId(12L)
                .manager(manager)
                .title("Python for Data Science")
                .slug("python-for-data-science")
                .isPublished(true)
                .build();
        module = Module.builder()
                .moduleId(3L)
                .course(course)
                .title("Python Basics")
                .build();
        group = QuestionGroup.builder()
                .groupId(7L)
                .course(course)
                .module(module)
                .questionType("QUIZ")
                .title("Reading Passage 1")
                .passageText("Đoạn văn...")
                .build();
    }

    @Test
    void getQuestionGroups_AdminWithoutCourseFilter_SkipsOwnershipAndMapsCounts() {
        Page<QuestionGroup> page = new PageImpl<>(List.of(group), PageRequest.of(0, 20), 1);
        when(questionGroupRepository.findAll(any(Specification.class), any(Pageable.class))).thenReturn(page);
        when(questionRepository.countByGroupIds(List.of(7L))).thenReturn(Collections.singletonList(new Object[]{7L, 5L}));

        PageResponse<QuestionGroupResponse> response =
                questionGroupService.getQuestionGroups(999L, User.ROLE_ADMIN, null, null, null, null, 0, 20);

        assertEquals(1, response.getContent().size());
        QuestionGroupResponse item = response.getContent().get(0);
        assertEquals(7L, item.getGroupId());
        assertEquals(12L, item.getCourseId());
        assertEquals(3L, item.getModuleId());
        assertEquals("Reading Passage 1", item.getTitle());
        assertEquals("Đoạn văn...", item.getPassageText());
        assertEquals(5L, item.getQuestionCount());
        assertEquals(0, response.getPage());
        assertEquals(20, response.getSize());
        assertEquals(1L, response.getTotalElements());
        assertEquals(1, response.getTotalPages());
        assertTrue(response.isFirst());
        assertTrue(response.isLast());

        verifyNoInteractions(courseRepository);
    }

    @Test
    void getQuestionGroups_ManagerOwnedCourseFilter_ChecksOwnership() {
        when(courseRepository.countOwnedCourse(12L, 101L)).thenReturn(1L);
        when(questionGroupRepository.findAll(any(Specification.class), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(group), PageRequest.of(0, 20), 1));
        when(questionRepository.countByGroupIds(List.of(7L))).thenReturn(List.of());

        PageResponse<QuestionGroupResponse> response = questionGroupService.getQuestionGroups(
                101L, User.ROLE_COURSE_MANAGER, 12L, null, null, null, 0, 20);

        assertEquals(1, response.getContent().size());
        assertEquals(0L, response.getContent().get(0).getQuestionCount());
    }

    @Test
    void getQuestionGroups_ManagerForeignCourseFilter_ThrowsForbidden() {
        when(courseRepository.countOwnedCourse(12L, 101L)).thenReturn(0L);

        assertThrows(ForbiddenException.class, () -> questionGroupService.getQuestionGroups(
                101L, User.ROLE_COURSE_MANAGER, 12L, null, null, null, 0, 20));

        verifyNoInteractions(questionGroupRepository);
    }

    @Test
    void getQuestionGroups_EmptyPage_ReturnsEmptyContentWithoutCountQuery() {
        when(questionGroupRepository.findAll(any(Specification.class), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        PageResponse<QuestionGroupResponse> response = questionGroupService.getQuestionGroups(
                101L, User.ROLE_COURSE_MANAGER, null, null, null, null, 0, 20);

        assertTrue(response.getContent().isEmpty());
        assertEquals(0L, response.getTotalElements());
        assertTrue(response.isFirst());
        assertTrue(response.isLast());
        verifyNoInteractions(questionRepository);
    }

    @Test
    void getQuestionGroups_NegativePageAndZeroSize_ClampedWithDescendingGroupIdSort() {
        when(questionGroupRepository.findAll(any(Specification.class), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        questionGroupService.getQuestionGroups(999L, User.ROLE_ADMIN, null, null, null, null, -3, 0);

        ArgumentCaptor<Pageable> captor = ArgumentCaptor.forClass(Pageable.class);
        verify(questionGroupRepository).findAll(any(Specification.class), captor.capture());
        assertEquals(0, captor.getValue().getPageNumber());
        assertEquals(20, captor.getValue().getPageSize());
        Sort.Order order = captor.getValue().getSort().getOrderFor("groupId");
        assertEquals(Sort.Direction.DESC, order.getDirection());
    }

    @Test
    void createQuestionGroup_Success() {
        when(courseRepository.findById(12L)).thenReturn(Optional.of(course));
        when(moduleRepository.findById(3L)).thenReturn(Optional.of(module));
        when(questionGroupRepository.save(any(QuestionGroup.class))).thenAnswer(invocation -> {
            QuestionGroup saved = invocation.getArgument(0);
            saved.setGroupId(7L);
            return saved;
        });
        QuestionGroupCreateRequest request = QuestionGroupCreateRequest.builder()
                .questionType("QUIZ")
                .courseId(12L)
                .moduleId(3L)
                .title("  Reading Passage 1  ")
                .passageText("Đoạn văn dùng chung...")
                .build();

        QuestionGroupResponse response =
                questionGroupService.createQuestionGroup(101L, User.ROLE_COURSE_MANAGER, request);

        assertEquals(7L, response.getGroupId());
        assertEquals(12L, response.getCourseId());
        assertEquals(3L, response.getModuleId());
        assertEquals("QUIZ", response.getQuestionType());
        assertEquals("Reading Passage 1", response.getTitle());
        assertEquals("Đoạn văn dùng chung...", response.getPassageText());
        assertEquals(0L, response.getQuestionCount());
        verifyNoInteractions(questionRepository);
    }

    @Test
    void createQuestionGroup_CourseNotFound_ThrowsResourceNotFound() {
        when(courseRepository.findById(99L)).thenReturn(Optional.empty());
        QuestionGroupCreateRequest request = QuestionGroupCreateRequest.builder()
                .questionType("QUIZ")
                .courseId(99L)
                .title("Reading Passage 1")
                .build();

        assertThrows(ResourceNotFoundException.class, () ->
                questionGroupService.createQuestionGroup(101L, User.ROLE_COURSE_MANAGER, request));

        verifyNoInteractions(questionGroupRepository);
    }

    @Test
    void createQuestionGroup_ForeignCourse_ThrowsForbidden() {
        User otherManager = User.builder().userId(555L).roleName(User.ROLE_COURSE_MANAGER).build();
        Course foreignCourse = Course.builder().courseId(12L).manager(otherManager).build();
        when(courseRepository.findById(12L)).thenReturn(Optional.of(foreignCourse));
        QuestionGroupCreateRequest request = QuestionGroupCreateRequest.builder()
                .questionType("QUIZ")
                .courseId(12L)
                .title("Reading Passage 1")
                .build();

        assertThrows(ForbiddenException.class, () ->
                questionGroupService.createQuestionGroup(101L, User.ROLE_COURSE_MANAGER, request));

        verify(questionGroupRepository, never()).save(any(QuestionGroup.class));
    }

    @Test
    void createQuestionGroup_AdminForeignCourse_Success() {
        User otherManager = User.builder().userId(555L).roleName(User.ROLE_COURSE_MANAGER).build();
        Course foreignCourse = Course.builder().courseId(12L).manager(otherManager).build();
        when(courseRepository.findById(12L)).thenReturn(Optional.of(foreignCourse));
        when(questionGroupRepository.save(any(QuestionGroup.class))).thenAnswer(invocation -> {
            QuestionGroup saved = invocation.getArgument(0);
            saved.setGroupId(7L);
            return saved;
        });
        QuestionGroupCreateRequest request = QuestionGroupCreateRequest.builder()
                .questionType("QUIZ")
                .courseId(12L)
                .title("Reading Passage 1")
                .build();

        QuestionGroupResponse response =
                questionGroupService.createQuestionGroup(1L, User.ROLE_ADMIN, request);

        assertEquals(7L, response.getGroupId());
        assertEquals(12L, response.getCourseId());
        verify(courseRepository, never()).countOwnedCourse(any(), any());
    }

    @Test
    void createQuestionGroup_ModuleOutsideCourse_ThrowsResourceNotFound() {
        Course otherCourse = Course.builder().courseId(50L).manager(manager).build();
        Module foreignModule = Module.builder().moduleId(3L).course(otherCourse).build();
        when(courseRepository.findById(12L)).thenReturn(Optional.of(course));
        when(moduleRepository.findById(3L)).thenReturn(Optional.of(foreignModule));
        QuestionGroupCreateRequest request = QuestionGroupCreateRequest.builder()
                .questionType("QUIZ")
                .courseId(12L)
                .moduleId(3L)
                .title("Reading Passage 1")
                .build();

        assertThrows(ResourceNotFoundException.class, () ->
                questionGroupService.createQuestionGroup(101L, User.ROLE_COURSE_MANAGER, request));

        verify(questionGroupRepository, never()).save(any(QuestionGroup.class));
    }

    @Test
    void createQuestionGroup_ModuleNotFound_ThrowsResourceNotFound() {
        when(courseRepository.findById(12L)).thenReturn(Optional.of(course));
        when(moduleRepository.findById(3L)).thenReturn(Optional.empty());
        QuestionGroupCreateRequest request = QuestionGroupCreateRequest.builder()
                .questionType("QUIZ")
                .courseId(12L)
                .moduleId(3L)
                .title("Reading Passage 1")
                .build();

        assertThrows(ResourceNotFoundException.class, () ->
                questionGroupService.createQuestionGroup(101L, User.ROLE_COURSE_MANAGER, request));

        verify(questionGroupRepository, never()).save(any(QuestionGroup.class));
    }

    @Test
    void createQuestionGroup_BlankTitleAndPassage_ThrowsValidationError() {
        when(courseRepository.findById(12L)).thenReturn(Optional.of(course));
        QuestionGroupCreateRequest request = QuestionGroupCreateRequest.builder()
                .questionType("QUIZ")
                .courseId(12L)
                .title("   ")
                .passageText("")
                .build();

        assertThrows(BadRequestException.class, () ->
                questionGroupService.createQuestionGroup(101L, User.ROLE_COURSE_MANAGER, request));

        verify(questionGroupRepository, never()).save(any(QuestionGroup.class));
    }

    @Test
    void updateQuestionGroup_NullFields_KeepExistingValues() {
        when(questionGroupRepository.findById(7L)).thenReturn(Optional.of(group));
        when(courseRepository.countOwnedCourse(12L, 101L)).thenReturn(1L);
        when(questionGroupRepository.save(any(QuestionGroup.class))).thenReturn(group);
        when(questionRepository.countByGroupIds(List.of(7L))).thenReturn(Collections.singletonList(new Object[]{7L, 5L}));

        QuestionGroupResponse response = questionGroupService.updateQuestionGroup(
                101L, User.ROLE_COURSE_MANAGER, 7L, QuestionGroupUpdateRequest.builder().build());

        assertEquals("Reading Passage 1", response.getTitle());
        assertEquals("Đoạn văn...", response.getPassageText());
        assertEquals(5L, response.getQuestionCount());
    }

    @Test
    void updateQuestionGroup_EmptyStrings_ClearsFields() {
        when(questionGroupRepository.findById(7L)).thenReturn(Optional.of(group));
        when(courseRepository.countOwnedCourse(12L, 101L)).thenReturn(1L);
        when(questionGroupRepository.save(any(QuestionGroup.class))).thenReturn(group);
        when(questionRepository.countByGroupIds(List.of(7L))).thenReturn(List.of());

        QuestionGroupResponse response = questionGroupService.updateQuestionGroup(
                101L, User.ROLE_COURSE_MANAGER, 7L,
                QuestionGroupUpdateRequest.builder().title("").passageText("Đoạn văn mới...").build());

        assertNull(response.getTitle());
        assertEquals("Đoạn văn mới...", response.getPassageText());
        assertEquals(0L, response.getQuestionCount());
    }

    @Test
    void updateQuestionGroup_ClearingBothFields_ThrowsValidationError() {
        when(questionGroupRepository.findById(7L)).thenReturn(Optional.of(group));
        when(courseRepository.countOwnedCourse(12L, 101L)).thenReturn(1L);

        assertThrows(BadRequestException.class, () -> questionGroupService.updateQuestionGroup(
                101L, User.ROLE_COURSE_MANAGER, 7L,
                QuestionGroupUpdateRequest.builder().title("").passageText("  ").build()));

        verify(questionGroupRepository, never()).save(any(QuestionGroup.class));
    }

    @Test
    void updateQuestionGroup_NotFound_ThrowsResourceNotFound() {
        when(questionGroupRepository.findById(404L)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class, () -> questionGroupService.updateQuestionGroup(
                101L, User.ROLE_COURSE_MANAGER, 404L,
                QuestionGroupUpdateRequest.builder().title("New").build()));
    }

    @Test
    void updateQuestionGroup_ForeignGroup_ThrowsForbidden() {
        when(questionGroupRepository.findById(7L)).thenReturn(Optional.of(group));
        when(courseRepository.countOwnedCourse(12L, 101L)).thenReturn(0L);

        assertThrows(ForbiddenException.class, () -> questionGroupService.updateQuestionGroup(
                101L, User.ROLE_COURSE_MANAGER, 7L,
                QuestionGroupUpdateRequest.builder().title("New").build()));

        verify(questionGroupRepository, never()).save(any(QuestionGroup.class));
    }

    @Test
    void updateQuestionGroup_AdminForeignGroup_SkipsOwnershipCheck() {
        when(questionGroupRepository.findById(7L)).thenReturn(Optional.of(group));
        when(questionGroupRepository.save(any(QuestionGroup.class))).thenReturn(group);
        when(questionRepository.countByGroupIds(List.of(7L))).thenReturn(List.of());

        QuestionGroupResponse response = questionGroupService.updateQuestionGroup(
                1L, User.ROLE_ADMIN, 7L,
                QuestionGroupUpdateRequest.builder().title("Reading Passage 1 v2").build());

        assertEquals("Reading Passage 1 v2", response.getTitle());
        verifyNoInteractions(courseRepository);
    }

    @Test
    void deleteQuestionGroup_UsedByPublishedExamGroup_ThrowsConflict() {
        when(questionGroupRepository.findById(7L)).thenReturn(Optional.of(group));
        when(courseRepository.countOwnedCourse(12L, 101L)).thenReturn(1L);
        when(examGroupRepository.countByGroupIdAndExamStatus(7L, "PUBLISHED")).thenReturn(1L);

        assertThrows(ResourceConflictException.class, () ->
                questionGroupService.deleteQuestionGroup(101L, User.ROLE_COURSE_MANAGER, 7L));

        verify(questionGroupRepository, never()).delete(any(QuestionGroup.class));
        verifyNoInteractions(questionRepository);
    }

    @Test
    void deleteQuestionGroup_QuestionInPublishedExam_ThrowsConflict() {
        when(questionGroupRepository.findById(7L)).thenReturn(Optional.of(group));
        when(courseRepository.countOwnedCourse(12L, 101L)).thenReturn(1L);
        when(examGroupRepository.countByGroupIdAndExamStatus(7L, "PUBLISHED")).thenReturn(0L);
        when(examQuestionRepository.countByQuestionGroupIdAndExamStatus(7L, "PUBLISHED")).thenReturn(2L);

        assertThrows(ResourceConflictException.class, () ->
                questionGroupService.deleteQuestionGroup(101L, User.ROLE_COURSE_MANAGER, 7L));

        verify(questionGroupRepository, never()).delete(any(QuestionGroup.class));
        verifyNoInteractions(questionRepository);
    }

    @Test
    void deleteQuestionGroup_Success_DeletesLinksDetachesQuestionsThenGroup() {
        when(questionGroupRepository.findById(7L)).thenReturn(Optional.of(group));
        when(courseRepository.countOwnedCourse(12L, 101L)).thenReturn(1L);
        when(examGroupRepository.countByGroupIdAndExamStatus(7L, "PUBLISHED")).thenReturn(0L);
        when(examQuestionRepository.countByQuestionGroupIdAndExamStatus(7L, "PUBLISHED")).thenReturn(0L);

        questionGroupService.deleteQuestionGroup(101L, User.ROLE_COURSE_MANAGER, 7L);

        InOrder inOrder = inOrder(examGroupRepository, questionRepository, questionGroupRepository);
        inOrder.verify(examGroupRepository).deleteByGroupId(7L);
        inOrder.verify(questionRepository).detachFromGroup(7L);
        inOrder.verify(questionGroupRepository).delete(group);
    }

    @Test
    void deleteQuestionGroup_NotFound_ThrowsResourceNotFound() {
        when(questionGroupRepository.findById(404L)).thenReturn(Optional.empty());

        assertThrows(ResourceNotFoundException.class, () ->
                questionGroupService.deleteQuestionGroup(101L, User.ROLE_COURSE_MANAGER, 404L));

        verify(questionGroupRepository, never()).delete(any(QuestionGroup.class));
    }

    @Test
    void deleteQuestionGroup_ForeignGroup_ThrowsForbidden() {
        when(questionGroupRepository.findById(7L)).thenReturn(Optional.of(group));
        when(courseRepository.countOwnedCourse(12L, 101L)).thenReturn(0L);

        assertThrows(ForbiddenException.class, () ->
                questionGroupService.deleteQuestionGroup(101L, User.ROLE_COURSE_MANAGER, 7L));

        verifyNoInteractions(questionRepository);
        verify(questionGroupRepository, never()).delete(any(QuestionGroup.class));
    }

    @Test
    void deleteQuestionGroup_Admin_SkipsOwnershipCheck() {
        when(questionGroupRepository.findById(7L)).thenReturn(Optional.of(group));
        when(examGroupRepository.countByGroupIdAndExamStatus(7L, "PUBLISHED")).thenReturn(0L);
        when(examQuestionRepository.countByQuestionGroupIdAndExamStatus(7L, "PUBLISHED")).thenReturn(0L);

        questionGroupService.deleteQuestionGroup(1L, User.ROLE_ADMIN, 7L);

        verify(questionGroupRepository).delete(group);
        verifyNoInteractions(courseRepository);
    }

    @Test
    void getQuestionGroups_GroupWithoutCourse_FallsBackToModuleCourse() {
        QuestionGroup legacyGroup = QuestionGroup.builder()
                .groupId(9L)
                .course(null)
                .module(module)
                .title("Legacy group")
                .passageText("Legacy passage")
                .build();
        when(courseRepository.countOwnedCourse(12L, 101L)).thenReturn(1L);
        when(questionGroupRepository.findAll(any(Specification.class), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(legacyGroup), PageRequest.of(0, 20), 1));
        when(questionRepository.countByGroupIds(List.of(9L))).thenReturn(Collections.singletonList(new Object[]{9L, 2L}));

        PageResponse<QuestionGroupResponse> response = questionGroupService.getQuestionGroups(
                101L, User.ROLE_COURSE_MANAGER, 12L, null, null, null, 0, 20);

        QuestionGroupResponse item = response.getContent().get(0);
        assertEquals(9L, item.getGroupId());
        assertEquals(12L, item.getCourseId());
        assertEquals(3L, item.getModuleId());
        assertEquals(2L, item.getQuestionCount());
    }

    @Test
    void deleteQuestionGroup_LegacyGroupWithoutCourse_UsesModuleCourseOwnership() {
        QuestionGroup legacyGroup = QuestionGroup.builder()
                .groupId(9L)
                .course(null)
                .module(module)
                .title("Legacy group")
                .passageText("Legacy passage")
                .build();
        when(questionGroupRepository.findById(9L)).thenReturn(Optional.of(legacyGroup));
        when(courseRepository.countOwnedCourse(12L, 101L)).thenReturn(1L);
        when(examGroupRepository.countByGroupIdAndExamStatus(9L, "PUBLISHED")).thenReturn(0L);
        when(examQuestionRepository.countByQuestionGroupIdAndExamStatus(9L, "PUBLISHED")).thenReturn(0L);

        questionGroupService.deleteQuestionGroup(101L, User.ROLE_COURSE_MANAGER, 9L);

        verify(questionGroupRepository).delete(legacyGroup);
    }

    @Test
    void deleteQuestionGroup_GlobalGroupWithoutCourseOrModule_ManagerForbidden() {
        QuestionGroup globalGroup = QuestionGroup.builder()
                .groupId(11L)
                .title("Global group")
                .passageText("Global passage")
                .build();
        when(questionGroupRepository.findById(11L)).thenReturn(Optional.of(globalGroup));

        assertThrows(ForbiddenException.class, () ->
                questionGroupService.deleteQuestionGroup(101L, User.ROLE_COURSE_MANAGER, 11L));

        verifyNoInteractions(courseRepository);
        verify(questionGroupRepository, never()).delete(any(QuestionGroup.class));
    }

    @Test
    void getQuestionGroups_ZeroSize_DefaultsToTwenty() {
        when(questionGroupRepository.findAll(any(Specification.class), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        questionGroupService.getQuestionGroups(999L, User.ROLE_ADMIN, null, null, null, null, 0, 0);

        ArgumentCaptor<Pageable> captor = ArgumentCaptor.forClass(Pageable.class);
        verify(questionGroupRepository).findAll(any(Specification.class), captor.capture());
        assertEquals(20, captor.getValue().getPageSize());
    }

    @Test
    void getQuestionGroups_OversizedSize_CappedAtMaximum() {
        when(questionGroupRepository.findAll(any(Specification.class), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 100), 0));

        questionGroupService.getQuestionGroups(999L, User.ROLE_ADMIN, null, null, null, null, 0, 5000);

        ArgumentCaptor<Pageable> captor = ArgumentCaptor.forClass(Pageable.class);
        verify(questionGroupRepository).findAll(any(Specification.class), captor.capture());
        assertEquals(100, captor.getValue().getPageSize());
    }

    @Test
    void getQuestionGroups_FourthPage_ReportsPagingFlags() {
        Page<QuestionGroup> page = new PageImpl<>(List.of(group), PageRequest.of(3, 20), 81);
        when(questionGroupRepository.findAll(any(Specification.class), any(Pageable.class))).thenReturn(page);
        when(questionRepository.countByGroupIds(List.of(7L))).thenReturn(Collections.singletonList(new Object[]{7L, 5L}));

        PageResponse<QuestionGroupResponse> response =
                questionGroupService.getQuestionGroups(999L, User.ROLE_ADMIN, null, null, null, null, 3, 20);

        assertEquals(3, response.getPage());
        assertEquals(81L, response.getTotalElements());
        assertEquals(5, response.getTotalPages());
        assertFalse(response.isFirst());
        assertFalse(response.isLast());
        assertEquals(5L, response.getContent().get(0).getQuestionCount());
    }

    @Test
    void updateQuestionGroup_ForeignGroupByAdmin_Succeeds() {
        when(questionGroupRepository.findById(7L)).thenReturn(Optional.of(group));
        when(questionGroupRepository.save(any(QuestionGroup.class))).thenReturn(group);
        when(questionRepository.countByGroupIds(List.of(7L))).thenReturn(Collections.singletonList(new Object[]{7L, 3L}));

        QuestionGroupResponse response = questionGroupService.updateQuestionGroup(
                1L, "ROLE_ADMIN", 7L,
                QuestionGroupUpdateRequest.builder().passageText("New passage").build());

        assertEquals("New passage", response.getPassageText());
        assertEquals(3L, response.getQuestionCount());
        verifyNoInteractions(courseRepository);
    }

    @Test
    void getQuestionGroups_RolePrefixedAdmin_SkipsOwnershipCheck() {
        when(questionGroupRepository.findAll(any(Specification.class), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(group), PageRequest.of(0, 20), 1));
        when(questionRepository.countByGroupIds(List.of(7L))).thenReturn(Collections.singletonList(new Object[]{7L, 1L}));

        PageResponse<QuestionGroupResponse> response =
                questionGroupService.getQuestionGroups(1L, "ROLE_ADMIN", null, null, null, null, 0, 20);

        assertEquals(1, response.getContent().size());
        assertEquals(1L, response.getContent().get(0).getQuestionCount());
        verifyNoInteractions(courseRepository);
    }

    @Test
    void getQuestionGroups_ManagerWithoutCourseFilter_DoesNotCheckOwnershipUpFront() {
        when(questionGroupRepository.findAll(any(Specification.class), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        questionGroupService.getQuestionGroups(101L, User.ROLE_COURSE_MANAGER, null, null, null, null, 0, 20);

        verify(courseRepository, never()).countOwnedCourse(any(), any());
        verifyNoInteractions(questionRepository);
    }

    @Test
    void createQuestionGroup_MissingType_ThrowsValidationError() {
        QuestionGroupCreateRequest request = QuestionGroupCreateRequest.builder()
                .courseId(12L)
                .title("Reading Passage 1")
                .build();

        assertThrows(BadRequestException.class, () ->
                questionGroupService.createQuestionGroup(101L, User.ROLE_COURSE_MANAGER, request));

        verifyNoInteractions(courseRepository);
    }

    @Test
    void createQuestionGroup_MixedType_ThrowsValidationError() {
        QuestionGroupCreateRequest request = QuestionGroupCreateRequest.builder()
                .courseId(12L)
                .questionType("MIXED")
                .title("Reading Passage 1")
                .build();

        assertThrows(BadRequestException.class, () ->
                questionGroupService.createQuestionGroup(101L, User.ROLE_COURSE_MANAGER, request));

        verifyNoInteractions(courseRepository);
    }

    @Test
    void updateQuestionGroup_TypeChangeWithMatchingMembers_Succeeds() {
        when(questionGroupRepository.findById(7L)).thenReturn(Optional.of(group));
        when(courseRepository.countOwnedCourse(12L, 101L)).thenReturn(1L);
        when(questionRepository.findDistinctQuestionTypesByGroupId(7L)).thenReturn(List.of("ESSAY"));
        when(questionGroupRepository.save(any(QuestionGroup.class))).thenReturn(group);
        when(questionRepository.countByGroupIds(List.of(7L))).thenReturn(List.of());

        QuestionGroupResponse response = questionGroupService.updateQuestionGroup(
                101L, User.ROLE_COURSE_MANAGER, 7L,
                QuestionGroupUpdateRequest.builder().questionType("ESSAY").build());

        assertEquals("ESSAY", response.getQuestionType());
    }

    @Test
    void updateQuestionGroup_TypeChangeWithDifferentMembers_ThrowsConflict() {
        when(questionGroupRepository.findById(7L)).thenReturn(Optional.of(group));
        when(courseRepository.countOwnedCourse(12L, 101L)).thenReturn(1L);
        when(questionRepository.findDistinctQuestionTypesByGroupId(7L)).thenReturn(List.of("SINGLE_CHOICE"));

        assertThrows(ResourceConflictException.class, () -> questionGroupService.updateQuestionGroup(
                101L, User.ROLE_COURSE_MANAGER, 7L,
                QuestionGroupUpdateRequest.builder().questionType("ESSAY").build()));

        verify(questionGroupRepository, never()).save(any(QuestionGroup.class));
    }

    @Test
    void updateQuestionGroup_TypeChangeOnEmptyGroup_Succeeds() {
        when(questionGroupRepository.findById(7L)).thenReturn(Optional.of(group));
        when(courseRepository.countOwnedCourse(12L, 101L)).thenReturn(1L);
        when(questionRepository.findDistinctQuestionTypesByGroupId(7L)).thenReturn(List.of());
        when(questionGroupRepository.save(any(QuestionGroup.class))).thenReturn(group);
        when(questionRepository.countByGroupIds(List.of(7L))).thenReturn(List.of());

        QuestionGroupResponse response = questionGroupService.updateQuestionGroup(
                101L, User.ROLE_COURSE_MANAGER, 7L,
                QuestionGroupUpdateRequest.builder().questionType("DIAGRAM").build());

        assertEquals("DIAGRAM", response.getQuestionType());
    }

    @Test
    void updateQuestionGroup_SameType_DoesNotQueryMembers() {
        when(questionGroupRepository.findById(7L)).thenReturn(Optional.of(group));
        when(courseRepository.countOwnedCourse(12L, 101L)).thenReturn(1L);
        when(questionGroupRepository.save(any(QuestionGroup.class))).thenReturn(group);
        when(questionRepository.countByGroupIds(List.of(7L))).thenReturn(List.of());

        questionGroupService.updateQuestionGroup(
                101L, User.ROLE_COURSE_MANAGER, 7L,
                QuestionGroupUpdateRequest.builder().questionType("QUIZ").build());

        verify(questionRepository, never()).findDistinctQuestionTypesByGroupId(any());
    }

    @Test
    void updateQuestionGroup_MixedType_ThrowsValidationError() {
        when(questionGroupRepository.findById(7L)).thenReturn(Optional.of(group));
        when(courseRepository.countOwnedCourse(12L, 101L)).thenReturn(1L);

        assertThrows(BadRequestException.class, () -> questionGroupService.updateQuestionGroup(
                101L, User.ROLE_COURSE_MANAGER, 7L,
                QuestionGroupUpdateRequest.builder().questionType("MIXED").build()));

        verify(questionGroupRepository, never()).save(any(QuestionGroup.class));
    }

    @Test
    void deleteQuestionGroup_RemovesDraftLinksAndDetachesQuestions() {
        when(questionGroupRepository.findById(7L)).thenReturn(Optional.of(group));
        when(courseRepository.countOwnedCourse(12L, 101L)).thenReturn(1L);
        when(examGroupRepository.countByGroupIdAndExamStatus(7L, "PUBLISHED")).thenReturn(0L);
        when(examQuestionRepository.countByQuestionGroupIdAndExamStatus(7L, "PUBLISHED")).thenReturn(0L);

        questionGroupService.deleteQuestionGroup(101L, User.ROLE_COURSE_MANAGER, 7L);

        verify(examGroupRepository).deleteByGroupId(7L);
        verify(questionRepository).detachFromGroup(7L);
        verify(questionGroupRepository).delete(group);
    }
}
