package com.examprep.controllers;

import com.examprep.config.SecurityConfig;
import com.examprep.dto.PageResponse;
import com.examprep.dto.QuestionGroupCreateRequest;
import com.examprep.dto.QuestionGroupResponse;
import com.examprep.dto.QuestionGroupUpdateRequest;
import com.examprep.exceptions.ForbiddenException;
import com.examprep.exceptions.ResourceConflictException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.security.JwtTokenProvider;
import com.examprep.security.RestAccessDeniedHandler;
import com.examprep.security.RestAuthenticationEntryPoint;
import com.examprep.security.UserPrincipal;
import com.examprep.services.QuestionGroupService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(QuestionGroupController.class)
@Import({SecurityConfig.class, RestAuthenticationEntryPoint.class, RestAccessDeniedHandler.class})
class QuestionGroupControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private QuestionGroupService questionGroupService;

    @MockBean
    private JwtTokenProvider jwtTokenProvider;

    @MockBean
    private com.examprep.repositories.UserRepository userRepository;

    private final UserPrincipal manager =
            UserPrincipal.create(101L, "manager@gmail.com", "COURSE_MANAGER");
    private final UserPrincipal admin =
            UserPrincipal.create(1L, "admin@gmail.com", "ADMIN");
    private final UserPrincipal student =
            UserPrincipal.create(102L, "student@gmail.com", "STUDENT");

    @Test
    void getQuestionGroups_Manager_Success() throws Exception {
        QuestionGroupResponse item = QuestionGroupResponse.builder()
                .groupId(7L)
                .courseId(12L)
                .moduleId(3L)
                .questionType("QUIZ")
                .title("Reading Passage 1")
                .passageText("Đoạn văn...")
                .questionCount(5L)
                .build();
        PageResponse<QuestionGroupResponse> body = PageResponse.<QuestionGroupResponse>builder()
                .content(List.of(item))
                .page(0)
                .size(20)
                .totalElements(1L)
                .totalPages(1)
                .first(true)
                .last(true)
                .build();
        when(questionGroupService.getQuestionGroups(101L, "COURSE_MANAGER", 12L, 3L, null, "reading", 0, 20))
                .thenReturn(body);

        mockMvc.perform(get("/api/v1/manager/question-groups")
                        .param("courseId", "12")
                        .param("moduleId", "3")
                        .param("search", "reading")
                        .with(user(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Operation completed successfully"))
                .andExpect(jsonPath("$.data.content[0].groupId").value(7))
                .andExpect(jsonPath("$.data.content[0].courseId").value(12))
                .andExpect(jsonPath("$.data.content[0].moduleId").value(3))
                .andExpect(jsonPath("$.data.content[0].questionType").value("QUIZ"))
                .andExpect(jsonPath("$.data.content[0].title").value("Reading Passage 1"))
                .andExpect(jsonPath("$.data.content[0].passageText").value("Đoạn văn..."))
                .andExpect(jsonPath("$.data.content[0].questionCount").value(5))
                .andExpect(jsonPath("$.data.page").value(0))
                .andExpect(jsonPath("$.data.size").value(20))
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.totalPages").value(1))
                .andExpect(jsonPath("$.data.first").value(true))
                .andExpect(jsonPath("$.data.last").value(true));
    }

    @Test
    void getQuestionGroups_AdminWithoutFilters_UsesDefaultPaging() throws Exception {
        PageResponse<QuestionGroupResponse> body = PageResponse.<QuestionGroupResponse>builder()
                .content(List.of())
                .page(0)
                .size(20)
                .totalElements(0L)
                .totalPages(0)
                .first(true)
                .last(true)
                .build();
        when(questionGroupService.getQuestionGroups(1L, "ADMIN", null, null, null, null, 0, 20))
                .thenReturn(body);

        mockMvc.perform(get("/api/v1/manager/question-groups").with(user(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").isArray())
                .andExpect(jsonPath("$.data.content").isEmpty());

        verify(questionGroupService).getQuestionGroups(1L, "ADMIN", null, null, null, null, 0, 20);
    }

    @Test
    void getQuestionGroups_Student_Forbidden() throws Exception {
        mockMvc.perform(get("/api/v1/manager/question-groups").with(user(student)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.success").value(false));

        verifyNoInteractions(questionGroupService);
    }

    @Test
    void getQuestionGroups_Anonymous_Unauthorized() throws Exception {
        mockMvc.perform(get("/api/v1/manager/question-groups"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success").value(false));

        verifyNoInteractions(questionGroupService);
    }

    @Test
    void getQuestionGroups_ForeignCourse_Forbidden() throws Exception {
        when(questionGroupService.getQuestionGroups(101L, "COURSE_MANAGER", 99L, null, null, null, 0, 20))
                .thenThrow(new ForbiddenException("You do not have access to this course."));

        mockMvc.perform(get("/api/v1/manager/question-groups")
                        .param("courseId", "99")
                        .with(user(manager)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("You do not have access to this course."));
    }

    @Test
    void createQuestionGroup_Success() throws Exception {
        QuestionGroupCreateRequest request = QuestionGroupCreateRequest.builder()
                .courseId(12L)
                .moduleId(3L)
                .questionType("QUIZ")
                .title("Reading Passage 1")
                .passageText("Đoạn văn dùng chung...")
                .build();
        QuestionGroupResponse body = QuestionGroupResponse.builder()
                .groupId(7L)
                .courseId(12L)
                .moduleId(3L)
                .questionType("QUIZ")
                .title("Reading Passage 1")
                .passageText("Đoạn văn dùng chung...")
                .questionCount(0L)
                .build();
        when(questionGroupService.createQuestionGroup(eq(101L), eq("COURSE_MANAGER"),
                any(QuestionGroupCreateRequest.class))).thenReturn(body);

        mockMvc.perform(post("/api/v1/manager/question-groups")
                        .with(user(manager))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Resource created successfully"))
                .andExpect(jsonPath("$.data.groupId").value(7))
                .andExpect(jsonPath("$.data.courseId").value(12))
                .andExpect(jsonPath("$.data.moduleId").value(3))
                .andExpect(jsonPath("$.data.questionType").value("QUIZ"))
                .andExpect(jsonPath("$.data.questionCount").value(0));
    }

    @Test
    void createQuestionGroup_MissingCourseId_ValidationError() throws Exception {
        QuestionGroupCreateRequest request = QuestionGroupCreateRequest.builder()
                .questionType("QUIZ")
                .title("Reading Passage 1")
                .build();

        mockMvc.perform(post("/api/v1/manager/question-groups")
                        .with(user(manager))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.data.courseId").value("Course ID is required"));

        verifyNoInteractions(questionGroupService);
    }

    @Test
    void createQuestionGroup_CourseNotFound_NotFound() throws Exception {
        QuestionGroupCreateRequest request = QuestionGroupCreateRequest.builder()
                .courseId(999L)
                .questionType("QUIZ")
                .title("Reading Passage 1")
                .build();
        when(questionGroupService.createQuestionGroup(eq(101L), eq("COURSE_MANAGER"),
                any(QuestionGroupCreateRequest.class)))
                .thenThrow(new ResourceNotFoundException("Course not found with id: 999"));

        mockMvc.perform(post("/api/v1/manager/question-groups")
                        .with(user(manager))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("Course not found with id: 999"));
    }

    @Test
    void updateQuestionGroup_Success() throws Exception {
        QuestionGroupUpdateRequest request = QuestionGroupUpdateRequest.builder()
                .questionType("ESSAY")
                .title("Reading Passage 1 v2")
                .passageText("Đoạn văn mới...")
                .build();
        QuestionGroupResponse body = QuestionGroupResponse.builder()
                .groupId(7L)
                .courseId(12L)
                .moduleId(3L)
                .questionType("ESSAY")
                .title("Reading Passage 1 v2")
                .passageText("Đoạn văn mới...")
                .questionCount(5L)
                .build();
        when(questionGroupService.updateQuestionGroup(eq(101L), eq("COURSE_MANAGER"), eq(7L),
                any(QuestionGroupUpdateRequest.class))).thenReturn(body);

        mockMvc.perform(put("/api/v1/manager/question-groups/7")
                        .with(user(manager))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Operation completed successfully"))
                .andExpect(jsonPath("$.data.groupId").value(7))
                .andExpect(jsonPath("$.data.questionType").value("ESSAY"))
                .andExpect(jsonPath("$.data.title").value("Reading Passage 1 v2"))
                .andExpect(jsonPath("$.data.questionCount").value(5));
    }

    @Test
    void updateQuestionGroup_NotFound() throws Exception {
        QuestionGroupUpdateRequest request = QuestionGroupUpdateRequest.builder()
                .title("Reading Passage 1 v2")
                .build();
        when(questionGroupService.updateQuestionGroup(eq(101L), eq("COURSE_MANAGER"), eq(404L),
                any(QuestionGroupUpdateRequest.class)))
                .thenThrow(new ResourceNotFoundException("Question group not found with id: 404"));

        mockMvc.perform(put("/api/v1/manager/question-groups/404")
                        .with(user(manager))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("Question group not found with id: 404"));
    }

    @Test
    void deleteQuestionGroup_Success() throws Exception {
        mockMvc.perform(delete("/api/v1/manager/question-groups/7")
                        .with(user(manager))
                        .with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Question group deleted successfully."))
                .andExpect(jsonPath("$.data").doesNotExist());

        verify(questionGroupService).deleteQuestionGroup(101L, "COURSE_MANAGER", 7L);
    }

    @Test
    void deleteQuestionGroup_UsedByPublishedExam_Conflict() throws Exception {
        doThrow(new ResourceConflictException(
                        "Question group is used by a published exam and cannot be deleted."))
                .when(questionGroupService).deleteQuestionGroup(101L, "COURSE_MANAGER", 7L);

        mockMvc.perform(delete("/api/v1/manager/question-groups/7")
                        .with(user(manager))
                        .with(csrf()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message")
                        .value("Question group is used by a published exam and cannot be deleted."));
    }

    @Test
    void deleteQuestionGroup_NotFound() throws Exception {
        doThrow(new ResourceNotFoundException("Question group not found with id: 404"))
                .when(questionGroupService).deleteQuestionGroup(101L, "COURSE_MANAGER", 404L);

        mockMvc.perform(delete("/api/v1/manager/question-groups/404")
                        .with(user(manager))
                        .with(csrf()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("Question group not found with id: 404"));
    }

    @Test
    void createQuestionGroup_Admin_BypassesCourseOwnership() throws Exception {
        QuestionGroupCreateRequest request = QuestionGroupCreateRequest.builder()
                .courseId(12L)
                .questionType("QUIZ")
                .title("Reading Passage 1")
                .build();
        when(questionGroupService.createQuestionGroup(eq(1L), eq("ADMIN"),
                any(QuestionGroupCreateRequest.class)))
                .thenReturn(QuestionGroupResponse.builder()
                        .groupId(8L)
                        .courseId(12L)
                        .title("Reading Passage 1")
                        .questionCount(0L)
                        .build());

        mockMvc.perform(post("/api/v1/manager/question-groups")
                        .with(user(admin))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.groupId").value(8))
                .andExpect(jsonPath("$.data.moduleId").doesNotExist());

        verify(questionGroupService).createQuestionGroup(eq(1L), eq("ADMIN"), any(QuestionGroupCreateRequest.class));
    }

    @Test
    void getQuestionGroups_InvalidPageParam_BadRequest() throws Exception {
        mockMvc.perform(get("/api/v1/manager/question-groups")
                        .param("page", "abc")
                        .with(user(manager)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false));

        verifyNoInteractions(questionGroupService);
    }

    @Test
    void getQuestionGroups_SearchOnly_UsesNullIds() throws Exception {
        when(questionGroupService.getQuestionGroups(101L, "COURSE_MANAGER", null, null, null, "passage", 0, 20))
                .thenReturn(PageResponse.<QuestionGroupResponse>builder()
                        .content(List.of())
                        .page(0)
                        .size(20)
                        .totalElements(0L)
                        .totalPages(0)
                        .first(true)
                        .last(true)
                        .build());

        mockMvc.perform(get("/api/v1/manager/question-groups")
                        .param("search", "passage")
                        .with(user(manager)))
                .andExpect(status().isOk());

        verify(questionGroupService).getQuestionGroups(eq(101L), eq("COURSE_MANAGER"),
                isNull(), isNull(), isNull(), eq("passage"), eq(0), eq(20));
    }

    @Test
    void getQuestionGroups_TypeFilter_PassesKindToService() throws Exception {
        when(questionGroupService.getQuestionGroups(101L, "COURSE_MANAGER", null, null, "ESSAY", null, 0, 20))
                .thenReturn(PageResponse.<QuestionGroupResponse>builder()
                        .content(List.of())
                        .page(0)
                        .size(20)
                        .totalElements(0L)
                        .totalPages(0)
                        .first(true)
                        .last(true)
                        .build());

        mockMvc.perform(get("/api/v1/manager/question-groups")
                        .param("questionType", "ESSAY")
                        .with(user(manager)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").isEmpty());

        verify(questionGroupService).getQuestionGroups(101L, "COURSE_MANAGER", null, null, "ESSAY", null, 0, 20);
    }

    @Test
    void createQuestionGroup_MissingQuestionType_ValidationError() throws Exception {
        QuestionGroupCreateRequest request = QuestionGroupCreateRequest.builder()
                .courseId(12L)
                .title("Reading Passage 1")
                .build();

        mockMvc.perform(post("/api/v1/manager/question-groups")
                        .with(user(manager))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.data.questionType").value("Question type is required"));

        verifyNoInteractions(questionGroupService);
    }

    @Test
    void createQuestionGroup_MixedType_ValidationError() throws Exception {
        QuestionGroupCreateRequest request = QuestionGroupCreateRequest.builder()
                .courseId(12L)
                .questionType("MIXED")
                .title("Reading Passage 1")
                .build();

        mockMvc.perform(post("/api/v1/manager/question-groups")
                        .with(user(manager))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.data.questionType")
                        .value("Question type must be one of QUIZ, ESSAY, CODE, DIAGRAM"));

        verifyNoInteractions(questionGroupService);
    }

    @Test
    void updateQuestionGroup_MixedType_ValidationError() throws Exception {
        QuestionGroupUpdateRequest request = QuestionGroupUpdateRequest.builder()
                .questionType("MIXED")
                .build();

        mockMvc.perform(put("/api/v1/manager/question-groups/7")
                        .with(user(manager))
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.data.questionType")
                        .value("Question type must be one of QUIZ, ESSAY, CODE, DIAGRAM"));

        verifyNoInteractions(questionGroupService);
    }
}
