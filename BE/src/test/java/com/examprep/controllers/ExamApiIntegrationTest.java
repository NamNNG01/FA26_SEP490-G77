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
        mvc.perform(get("/api/v1/manager/exams")).andExpect(status().isUnauthorized());
        call(student, get("/api/v1/manager/exams")).andExpect(status().isForbidden());
        call(collaborator, get(path(owned))).andExpect(status().isOk());
        call(manager, get(path(foreign))).andExpect(status().isForbidden());
        call(manager, get("/api/v1/manager/exams")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1));
        call(admin, get("/api/v1/manager/exams")).andExpect(jsonPath("$.data.totalElements").value(2));
        call(manager, get("/api/v1/manager/exams").param("size", "101")).andExpect(status().isBadRequest());
    }

    @Test void createsDraftWithDirectAndGroupedQuestionsAndCountsPoints() throws Exception {
        QuestionGroup group = QuestionGroup.builder().course(course).module(module).title("Passage").build();
        em.persist(group);
        Question grouped = question(module, "ESSAY", "Passage question"); grouped.setGroup(group);
        Map<String,Object> payload = create();
        payload.put("maxScore", 7);
        payload.put("status", "PUBLISHED");
        payload.put("groupIds", List.of(Map.of("groupId", group.getGroupId(), "questions", List.of(Map.of("questionId", grouped.getQuestionId(), "points", 5)))));
        JsonNode result = data(call(collaborator, post("/api/v1/manager/exams").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(payload))).andExpect(status().isCreated()));
        assertEquals("DRAFT", result.path("status").asText());
        assertEquals(2, result.path("questionCount").asInt());
        assertEquals(0, new BigDecimal("7").compareTo(result.path("totalPoints").decimalValue()));
        assertEquals(2, result.path("questions").size());
        assertEquals(1, result.path("groups").size());
        assertTrue(result.path("examKind").isNull() || result.path("examKind").isMissingNode());
        call(manager, get("/api/v1/manager/exams").param("search", "Final").param("examKind", "MIXED"))
                .andExpect(status().isBadRequest());
    }

    @Test void rejectsDuplicateInactiveAndForeignContentBeforeSaving() throws Exception {
        Map<String,Object> payload = create();
        payload.put("questionIds", List.of(Map.of("questionId", question.getQuestionId(), "points", 2), Map.of("questionId", question.getQuestionId(), "points", 2)));
        submit(payload).andExpect(status().isConflict());
        payload.put("questionIds", List.of(Map.of("questionId", foreignQuestion.getQuestionId(), "points", 2)));
        submit(payload).andExpect(status().isForbidden());
        payload.put("questionIds", List.of(Map.of("questionId", question.getQuestionId(), "points", 2)));
        question.setStatus("INACTIVE"); submit(payload).andExpect(status().isBadRequest());
        question.setStatus("ACTIVE"); payload.remove("courseId"); payload.remove("moduleId");
        submit(payload).andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").value("courseId or moduleId is required."));
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
        Exam exam = exam(course, module); exam.setMaxScore(BigDecimal.ONE); attach(exam, question);
        call(manager, patch(path(exam) + "/publish").contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"PUBLISHED\"}"))
                .andExpect(status().isOk());
        call(manager, put(path(exam)).contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Changed\"}"))
                .andExpect(status().isConflict());
        call(manager, post(path(exam) + "/questions").contentType(MediaType.APPLICATION_JSON)
                .content("{\"questionId\":" + essay.getQuestionId() + ",\"points\":2}")).andExpect(status().isConflict());
        call(manager, patch(path(exam) + "/publish").contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"DRAFT\"}"))
                .andExpect(status().isOk());
        call(manager, put(path(exam)).contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Changed\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.title").value("Changed"));
    }

    @Test void publishingEmptyIsRejectedAndMissingRubricsAreWarnings() throws Exception {
        Exam exam = exam(course, module); exam.setMaxScore(BigDecimal.ONE);
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
        String payload = "{\"groupId\":"+group.getGroupId()+",\"questions\":[{\"questionId\":"+grouped.getQuestionId()+",\"points\":3}]}";
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
        Exam exam = exam(course, module); exam.setMaxScore(BigDecimal.valueOf(3));
        String contents = "1. What is two plus two?\nA. Three\nB. Four\nAnswer: B\n\n2. Explain indexing.";
        MockMultipartFile file = new MockMultipartFile("file", "exam.txt", "text/plain", contents.getBytes(StandardCharsets.UTF_8));
        call(manager, multipart(path(exam)+"/import").file(file).param("points", "1").param("points", "1")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.reused").value(1)).andExpect(jsonPath("$.data.imported").value(1))
                .andExpect(jsonPath("$.data.skippedDuplicates").value(0))
                .andExpect(jsonPath("$.data.questionIds.length()").value(2));

        String contents2 = "1. What is two plus two?\nA. Three\nB. Four\nAnswer: B\n\n2. Explain indexing.\n\n3. Explain indexing.";
        MockMultipartFile file2 = new MockMultipartFile("file", "exam2.txt", "text/plain", contents2.getBytes(StandardCharsets.UTF_8));
        call(manager, multipart(path(exam)+"/import").file(file2).param("points", "1").param("points", "1").param("points", "1")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.reused").value(0)).andExpect(jsonPath("$.data.imported").value(0))
                .andExpect(jsonPath("$.data.skippedDuplicates").value(3));
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
        call(admin, put("/api/v1/manager/exams/" + id).contentType(MediaType.APPLICATION_JSON)
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

    @Test void randomConfigsRejectSkillTagWithBadRequest() throws Exception {
        Map<String,Object> payload = create();
        payload.put("generationType", "RANDOM"); payload.put("questionIds", List.of());
        payload.put("configs", List.of(Map.of("questionType", "ESSAY", "numberOfQuestions", 3, "moduleId", module.getModuleId(), "skillTag", "java")));
        submit(payload).andExpect(status().isBadRequest());
    }

    @Test void groupExpansionWithMultipleQuestionsAndDifferentPoints() throws Exception {
        Exam exam = exam(course, module); exam.setMaxScore(BigDecimal.valueOf(10));
        QuestionGroup group = QuestionGroup.builder().course(course).module(module).title("Reading group").build(); em.persist(group);
        List<Map<String, Object>> qPoints = new ArrayList<>();
        for(int i=0; i<3; i++) {
            Question q = question(module, "ESSAY", "Group q " + i); q.setGroup(group); em.persist(q);
            qPoints.add(Map.of("questionId", q.getQuestionId(), "points", BigDecimal.valueOf(i + 1)));
        }
        em.flush();
        String payload = json.writeValueAsString(Map.of("groupId", group.getGroupId(), "questions", qPoints));
        JsonNode added = data(call(collaborator, post(path(exam)+"/groups").contentType(MediaType.APPLICATION_JSON).content(payload))
                .andExpect(status().isCreated()));
        assertEquals(3, added.path("questionCount").asInt());
    }

    @Test void addGroupValidatesExactGroupQuestions() throws Exception {
        Exam exam = exam(course, module);
        QuestionGroup group = QuestionGroup.builder().course(course).module(module).title("Group").build(); em.persist(group);
        Question q1 = question(module, "ESSAY", "Q1"); q1.setGroup(group); em.persist(q1);
        em.flush();
        String payload = json.writeValueAsString(Map.of("groupId", group.getGroupId(), "questions", List.of()));
        call(collaborator, post(path(exam)+"/groups").contentType(MediaType.APPLICATION_JSON).content(payload))
                .andExpect(status().isBadRequest());
    }

    @Test void removeGroupDeletesExamQuestionsWithoutTouchingBank() throws Exception {
        Exam exam = exam(course, module); exam.setMaxScore(BigDecimal.valueOf(5));
        QuestionGroup group = QuestionGroup.builder().course(course).module(module).title("Group").build(); em.persist(group);
        Question q1 = question(module, "ESSAY", "Q1"); q1.setGroup(group); em.persist(q1);
        em.flush();
        String payload = json.writeValueAsString(Map.of("groupId", group.getGroupId(), "questions", List.of(Map.of("questionId", q1.getQuestionId(), "points", 5))));
        JsonNode added = data(call(collaborator, post(path(exam)+"/groups").contentType(MediaType.APPLICATION_JSON).content(payload))
                .andExpect(status().isCreated()));
        long examGroupId = added.path("examGroupId").asLong();
        call(manager, delete(path(exam)+"/groups/"+examGroupId)).andExpect(status().isOk());
        assertNotNull(em.find(Question.class, q1.getQuestionId()));
    }

    @Test void publishValidatesTotalPointsMatchMaxScore() throws Exception {
        Exam exam = exam(course, module); exam.setMaxScore(BigDecimal.valueOf(5));
        attach(exam, question);
        call(manager, patch(path(exam) + "/publish").contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"PUBLISHED\"}"))
                .andExpect(status().isConflict());
        exam.setMaxScore(BigDecimal.ONE);
        call(manager, patch(path(exam) + "/publish").contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"PUBLISHED\"}"))
                .andExpect(status().isOk());
    }

    @Test void publishedExamLocksMaxScoreAndPoints() throws Exception {
        Exam exam = exam(course, module); exam.setMaxScore(BigDecimal.ONE); attach(exam, question);
        call(manager, patch(path(exam) + "/publish").contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"PUBLISHED\"}"))
                .andExpect(status().isOk());
        call(manager, put(path(exam)).contentType(MediaType.APPLICATION_JSON).content("{\"maxScore\":10}"))
                .andExpect(status().isConflict());
    }

    @Test void importWithoutPointsIsRejectedAllOrNothing() throws Exception {
        Exam exam = exam(course, module); exam.setMaxScore(BigDecimal.valueOf(10));
        String contents = "1. What is two plus two?\nA. Three\nB. Four\nAnswer: B";
        MockMultipartFile file = new MockMultipartFile("file", "exam.txt", "text/plain", contents.getBytes(StandardCharsets.UTF_8));
        call(manager, multipart(path(exam)+"/import").file(file)).andExpect(status().isBadRequest());
    }

    @Test void creatingAndUpdatingWithDeprecatedPassMarkAndMaxAttemptsSucceedsAndIgnoresThem() throws Exception {
        Map<String,Object> payload = create();
        payload.put("passMark", 80);
        payload.put("maxAttempts", 3);
        JsonNode created = data(submit(payload).andExpect(status().isCreated()));
        assertFalse(created.has("passMark"));
        assertFalse(created.has("maxAttempts"));

        long id = created.path("examId").asLong();
        call(manager, put("/api/v1/manager/exams/" + id).contentType(MediaType.APPLICATION_JSON)
                .content("{\"passMark\":70,\"maxAttempts\":2,\"title\":\"Updated Title\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.title").value("Updated Title"))
                .andExpect(jsonPath("$.data.passMark").doesNotExist())
                .andExpect(jsonPath("$.data.maxAttempts").doesNotExist());
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
        return call(manager, post("/api/v1/manager/exams").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(payload)));
    }
    private Map<String,Object> create() {
        Map<String,Object> result = new HashMap<>();
        result.put("title", "Final exam"); result.put("courseId", course.getCourseId()); result.put("moduleId", module.getModuleId());
        result.put("durationMinutes",60); result.put("isPractice",false); result.put("generationType","STATIC");
        result.put("maxScore", 10);
        result.put("questionIds", List.of(Map.of("questionId",question.getQuestionId(),"points",2,"orderIndex",0)));
        return result;
    }
    private ResultActions call(User actor, MockHttpServletRequestBuilder request) throws Exception {
        em.flush(); return mvc.perform(request.with(user(UserPrincipal.create(actor))));
    }
    private JsonNode data(ResultActions result) throws Exception { return json.readTree(result.andReturn().getResponse().getContentAsString()).path("data"); }
    private String path(Exam exam) { return "/api/v1/manager/exams/"+exam.getExamId(); }
    private User account(String role) { User result=User.builder().email(UUID.randomUUID()+"@example.com").fullName(role).passwordHash("test").roleName(role).build(); em.persist(result); return result; }
    private Course course(User owner, Category category) { Course result=Course.builder().manager(owner).category(category).categoryId(category.getCategoryId()).title("Course").slug(UUID.randomUUID().toString()).isPublished(false).build(); em.persist(result); return result; }
    private Module module(Course parent) { Module result=Module.builder().course(parent).title("Module").orderIndex(1).build(); em.persist(result); return result; }
    private Question question(Module parent, String type, String content) { Question result=Question.builder().module(parent).questionType(type).content(content).build(); em.persist(result); return result; }
    private Exam exam(Course parent, Module mod) { Exam result=Exam.builder().course(parent).module(mod).createdBy(manager).title("Exam").durationMinutes(60).generationType("STATIC").isPractice(false).maxScore(BigDecimal.TEN).build(); em.persist(result); return result; }
    private ExamQuestion attach(Exam exam, Question question) { ExamQuestion result=ExamQuestion.builder().exam(exam).question(question).points(BigDecimal.ONE).build(); em.persist(result); return result; }
}
