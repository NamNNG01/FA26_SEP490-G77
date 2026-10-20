package com.examprep.controllers;

import com.examprep.entities.*;
import com.examprep.entities.Module;
import com.examprep.security.UserPrincipal;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ExamApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired EntityManager em;
    User manager, collaborator, other, admin, student;
    Course course, foreignCourse;
    Module module, foreignModule;
    Question question, essay, foreignQuestion;

    @BeforeEach void fixtures() {
        manager = account("COURSE_MANAGER"); collaborator = account("COURSE_MANAGER");
        other = account("COURSE_MANAGER"); admin = account("ADMIN"); student = account("STUDENT");
        Category category = Category.builder().name("Exam category").slug(UUID.randomUUID().toString()).build();
        em.persist(category);
        course = course(manager, category); foreignCourse = course(other, category);
        module = module(course); foreignModule = module(foreignCourse);
        em.persist(CourseManager.builder().course(course).user(collaborator).build());
        question = question(module, "SINGLE_CHOICE", "What is two plus two?");
        essay = question(module, "ESSAY", "Explain normalization.");
        foreignQuestion = question(foreignModule, "ESSAY", "Other manager's question");
        em.flush();
    }

    @Test void listAndDetailEnforcePrimaryAndAssignedOwnership() throws Exception {
        Exam owned = exam(course, module), foreign = exam(foreignCourse, foreignModule);
        mvc.perform(get("/api/v1/manager/exam-builder")).andExpect(status().isUnauthorized());
        call(student, get("/api/v1/manager/exam-builder")).andExpect(status().isForbidden());
        call(collaborator, get(path(owned))).andExpect(status().isOk());
        call(manager, get(path(foreign))).andExpect(status().isForbidden());
        call(manager, get("/api/v1/manager/exam-builder")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1));
        call(admin, get("/api/v1/manager/exam-builder")).andExpect(jsonPath("$.data.totalElements").value(2));
        call(manager, get("/api/v1/manager/exam-builder").param("size", "101")).andExpect(status().isBadRequest());
    }

    @Test void createsDraftWithDirectAndGroupedQuestionsAndCountsPoints() throws Exception {
        QuestionGroup group = QuestionGroup.builder().course(course).module(module).title("Passage").build();
        em.persist(group);
        Question grouped = question(module, "ESSAY", "Passage question"); grouped.setGroup(group);
        Map<String,Object> payload = create();
        payload.put("status", "PUBLISHED");
        payload.put("groupIds", List.of(Map.of("groupId", group.getGroupId(), "points", 5)));
        JsonNode result = data(call(collaborator, post("/api/v1/manager/exam-builder").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(payload))).andExpect(status().isCreated()));
        assertEquals("DRAFT", result.path("status").asText());
        assertEquals(2, result.path("questionCount").asInt());
        assertEquals(0, new BigDecimal("7").compareTo(result.path("totalPoints").decimalValue()));
        assertEquals(1, result.path("questions").size());
        assertEquals(1, result.path("groups").size());
        call(manager, get("/api/v1/manager/exam-builder").param("search", "Final").param("examKind", "MIXED"))
                .andExpect(jsonPath("$.data.totalElements").value(1));
    }

    @Test void rejectsDuplicateInactiveAndForeignContentBeforeSaving() throws Exception {
        Map<String,Object> payload = create();
        payload.put("questionIds", List.of(Map.of("questionId", question.getQuestionId()), Map.of("questionId", question.getQuestionId())));
        submit(payload).andExpect(status().isConflict());
        payload.put("questionIds", List.of(Map.of("questionId", foreignQuestion.getQuestionId())));
        submit(payload).andExpect(status().isForbidden());
        payload.put("questionIds", List.of(Map.of("questionId", question.getQuestionId())));
        question.setStatus("INACTIVE"); submit(payload).andExpect(status().isBadRequest());
        assertEquals(0L, em.createQuery("select count(e) from Exam e", Long.class).getSingleResult());
    }

    @Test void randomConfigsAreScopedAndRequireValidModes() throws Exception {
        Map<String,Object> payload = create();
        payload.put("generationType", "RANDOM"); payload.put("questionIds", List.of());
        payload.put("configs", List.of(Map.of("questionType", "ESSAY", "numberOfQuestions", 3, "moduleId", module.getModuleId())));
        submit(payload).andExpect(status().isCreated()).andExpect(jsonPath("$.data.configs[0].numberOfQuestions").value(3));
        payload.put("configs", List.of(Map.of("questionType", "ESSAY", "numberOfQuestions", 3, "moduleId", foreignModule.getModuleId())));
        submit(payload).andExpect(status().isBadRequest());
        payload.put("configs", List.of()); submit(payload).andExpect(status().isBadRequest());
        payload.put("generationType", "UNSUPPORTED"); submit(payload).andExpect(status().isBadRequest());
        payload = create(); payload.put("moduleId", foreignModule.getModuleId()); submit(payload).andExpect(status().isBadRequest());
    }

    @Test void publishedContentIsLockedUntilUnpublished() throws Exception {
        Exam exam = exam(course, module); attach(exam, question);
        call(manager, patch(path(exam) + "/publish").contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"PUBLISHED\"}"))
                .andExpect(status().isOk());
        call(manager, put(path(exam)).contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Changed\"}"))
                .andExpect(status().isConflict());
        call(manager, post(path(exam) + "/questions").contentType(MediaType.APPLICATION_JSON)
                .content("{\"questionId\":" + essay.getQuestionId() + "}")).andExpect(status().isConflict());
        call(manager, patch(path(exam) + "/publish").contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"DRAFT\"}"))
                .andExpect(status().isOk());
        call(manager, put(path(exam)).contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Changed\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.title").value("Changed"));
    }

    @Test void publishingEmptyIsRejectedAndMissingRubricsAreWarnings() throws Exception {
        Exam exam = exam(course, module);
        call(manager, patch(path(exam) + "/publish").contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"PUBLISHED\"}"))
                .andExpect(status().isBadRequest());
        attach(exam, essay);
        call(manager, patch(path(exam) + "/publish").contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"PUBLISHED\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.warnings[0]").exists());
    }

    @Test void attemptedExamsAllowOnlyDescriptionAndCannotBeDeleted() throws Exception {
        Exam exam = exam(course, module); attach(exam, question);
        em.persist(ExamAttempt.builder().exam(exam).user(student).startTime(Instant.now()).status("IN_PROGRESS").build());
        call(manager, put(path(exam)).contentType(MediaType.APPLICATION_JSON).content("{\"description\":\"Clarified\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.description").value("Clarified"));
        call(manager, put(path(exam)).contentType(MediaType.APPLICATION_JSON).content("{\"durationMinutes\":100}"))
                .andExpect(status().isConflict());
        call(manager, delete(path(exam))).andExpect(status().isConflict());
        call(manager, patch(path(exam)+"/publish").contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"ARCHIVED\"}"))
                .andExpect(status().isOk());
    }

    @Test void attachmentDeletionUsesLinkIdAndPreservesBank() throws Exception {
        Exam a = exam(course, module), b = exam(course, module);
        ExamQuestion link = attach(a, question);
        call(manager, delete(path(b)+"/questions/"+link.getExamQuestionId())).andExpect(status().isNotFound());
        call(manager, delete(path(a)+"/questions/"+link.getExamQuestionId())).andExpect(status().isOk());
        assertNotNull(em.find(Question.class, question.getQuestionId()));
        call(manager, delete(path(a))).andExpect(status().isOk());
        assertNull(em.find(Exam.class, a.getExamId()));
    }

    @Test void groupsCannotDuplicateOrExposeForeignGroups() throws Exception {
        Exam exam = exam(course, module);
        QuestionGroup group = QuestionGroup.builder().course(course).module(module).title("Reading").build(); em.persist(group);
        Question grouped = question(module, "ESSAY", "Reading question"); grouped.setGroup(group);
        String payload = "{\"groupId\":"+group.getGroupId()+",\"points\":3}";
        JsonNode added = data(call(collaborator, post(path(exam)+"/groups").contentType(MediaType.APPLICATION_JSON).content(payload))
                .andExpect(status().isCreated()));
        call(manager, post(path(exam)+"/groups").contentType(MediaType.APPLICATION_JSON).content(payload)).andExpect(status().isConflict());
        call(manager, delete(path(exam)+"/groups/"+added.path("examGroupId").asLong())).andExpect(status().isOk());
        assertNotNull(em.find(QuestionGroup.class, group.getGroupId()));
    }

    @Test void rubricValidatesTypeTotalsAndOwnership() throws Exception {
        String rubric = "{\"criteria\":[{\"name\":\"Ideas\",\"maxScore\":4,\"weight\":100}],\"totalPoints\":4}";
        call(collaborator, put("/api/v1/manager/questions/"+essay.getQuestionId()+"/rubric").contentType(MediaType.APPLICATION_JSON).content(rubric))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.essayGradingRubric.totalPoints").value(4));
        call(manager, put("/api/v1/manager/questions/"+question.getQuestionId()+"/rubric").contentType(MediaType.APPLICATION_JSON).content(rubric))
                .andExpect(status().isBadRequest());
        call(other, put("/api/v1/manager/questions/"+essay.getQuestionId()+"/rubric").contentType(MediaType.APPLICATION_JSON).content(rubric))
                .andExpect(status().isForbidden());
        call(manager, put("/api/v1/manager/questions/"+essay.getQuestionId()+"/rubric").contentType(MediaType.APPLICATION_JSON)
                .content(rubric.replace("\"totalPoints\":4", "\"totalPoints\":5"))).andExpect(status().isBadRequest());
    }

    @Test void importReusesSameModuleBankAndSkipsNormalizedDuplicates() throws Exception {
        Exam exam = exam(course, module);
        String contents = "1. What is two plus two?\nA. Three\nB. Four\nAnswer: B\n\n2. Explain indexing.\n\n3. Explain indexing.";
        MockMultipartFile file = new MockMultipartFile("file", "exam.txt", "text/plain", contents.getBytes(StandardCharsets.UTF_8));
        call(manager, multipart(path(exam)+"/import").file(file)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.reused").value(1)).andExpect(jsonPath("$.data.imported").value(1))
                .andExpect(jsonPath("$.data.skippedDuplicates").value(1)).andExpect(jsonPath("$.data.questionIds.length()").value(2));
        call(manager, multipart(path(exam)+"/import").file(file)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.imported").value(0)).andExpect(jsonPath("$.data.skippedDuplicates").value(3));
    }

    @Test void importRejectsBadFilesAndPublishedExamsWithoutWriting() throws Exception {
        Exam exam = exam(course, module);
        call(manager, multipart(path(exam)+"/import").file(new MockMultipartFile("file", "bad.exe", "text/plain", "text".getBytes())))
                .andExpect(status().isBadRequest());
        call(manager, multipart(path(exam)+"/import").file(new MockMultipartFile("file", "bad.pdf", "application/pdf", "fake pdf".getBytes())))
                .andExpect(status().isBadRequest());
        attach(exam, question); exam.setStatus("PUBLISHED");
        call(manager, multipart(path(exam)+"/import").file(new MockMultipartFile("file", "ok.txt", "text/plain", "1. A question".getBytes())))
                .andExpect(status().isConflict());
    }

    @ParameterizedTest
    @ValueSource(strings = {"MULTIPLE_CHOICE", "FILL_BLANK"})
    void randomConfigsAcceptCanonicalQuestionTypes(String type) throws Exception {
        Map<String,Object> payload = random(type);
        submit(payload).andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.configs[0].questionType").value(type));
    }

    @Test void changingCourseRejectsRetainedConfigFromPreviousCourse() throws Exception {
        long id = data(submit(random("ESSAY")).andExpect(status().isCreated())).path("examId").asLong();
        call(admin, put("/api/v1/manager/exam-builder/" + id).contentType(MediaType.APPLICATION_JSON)
                .content("{\"courseId\":" + foreignCourse.getCourseId() + "}"))
                .andExpect(status().isBadRequest());
    }

    @Test void staticExamWithRandomConfigCannotPublish() throws Exception {
        Exam exam = exam(course, module); attach(exam, question);
        call(manager, put(path(exam)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"configs\":[{\"questionType\":\"ESSAY\",\"numberOfQuestions\":1}]}"))
                .andExpect(status().isOk());
        call(manager, patch(path(exam) + "/publish").contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"PUBLISHED\"}"))
                .andExpect(status().isBadRequest());
        assertEquals("DRAFT", exam.getStatus());
    }

    @Test void incompleteRandomDraftCanBeSavedButCannotPublish() throws Exception {
        long id = data(submit(random("ESSAY")).andExpect(status().isCreated())).path("examId").asLong();
        call(manager, put("/api/v1/manager/exam-builder/" + id).contentType(MediaType.APPLICATION_JSON)
                .content("{\"configs\":[]}")).andExpect(status().isOk());
        call(manager, patch("/api/v1/manager/exam-builder/" + id + "/publish").contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"PUBLISHED\"}")).andExpect(status().isBadRequest());
    }

    private Map<String,Object> random(String type) {
        Map<String,Object> payload = create();
        payload.remove("moduleId");
        payload.put("generationType", "RANDOM");
        payload.put("questionIds", List.of());
        payload.put("configs", List.of(Map.of("questionType", type, "numberOfQuestions", 1, "moduleId", module.getModuleId())));
        return payload;
    }

    private ResultActions submit(Map<String,Object> payload) throws Exception {
        return call(manager, post("/api/v1/manager/exam-builder").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(payload)));
    }
    private Map<String,Object> create() {
        Map<String,Object> result = new HashMap<>();
        result.put("title", "Final exam"); result.put("courseId", course.getCourseId()); result.put("moduleId", module.getModuleId());
        result.put("durationMinutes",60); result.put("isPractice",false); result.put("generationType","STATIC");
        result.put("questionIds", List.of(Map.of("questionId",question.getQuestionId(),"points",2,"orderIndex",0)));
        return result;
    }
    private ResultActions call(User actor, MockHttpServletRequestBuilder request) throws Exception {
        em.flush(); return mvc.perform(request.with(user(UserPrincipal.create(actor))));
    }
    private JsonNode data(ResultActions result) throws Exception { return json.readTree(result.andReturn().getResponse().getContentAsString()).path("data"); }
    private String path(Exam exam) { return "/api/v1/manager/exam-builder/"+exam.getExamId(); }
    private User account(String role) { User result=User.builder().email(UUID.randomUUID()+"@example.com").fullName(role).passwordHash("test").roleName(role).build(); em.persist(result); return result; }
    private Course course(User owner, Category category) { Course result=Course.builder().manager(owner).category(category).categoryId(category.getCategoryId()).title("Course").slug(UUID.randomUUID().toString()).isPublished(false).build(); em.persist(result); return result; }
    private Module module(Course parent) { Module result=Module.builder().course(parent).title("Module").orderIndex(1).build(); em.persist(result); return result; }
    private Question question(Module parent, String type, String content) { Question result=Question.builder().module(parent).questionType(type).content(content).build(); em.persist(result); return result; }
    private Exam exam(Course parent, Module mod) { Exam result=Exam.builder().course(parent).module(mod).createdBy(manager).title("Exam").durationMinutes(60).generationType("STATIC").isPractice(false).build(); em.persist(result); return result; }
    private ExamQuestion attach(Exam exam, Question question) { ExamQuestion result=ExamQuestion.builder().exam(exam).question(question).points(BigDecimal.ONE).build(); em.persist(result); return result; }
}
