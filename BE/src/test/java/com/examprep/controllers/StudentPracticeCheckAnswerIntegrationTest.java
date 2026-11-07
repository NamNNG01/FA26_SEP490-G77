package com.examprep.controllers;

import com.examprep.entities.AnswerOption;
import com.examprep.entities.Category;
import com.examprep.entities.Course;
import com.examprep.entities.Enrollment;
import com.examprep.entities.Exam;
import com.examprep.entities.ExamQuestion;
import com.examprep.entities.Module;
import com.examprep.entities.Question;
import com.examprep.entities.User;
import com.examprep.security.UserPrincipal;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class StudentPracticeCheckAnswerIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired EntityManager em;

    User student;
    User otherStudent;
    Course course;
    Module module;
    Exam practiceExam;
    Exam standardExam;
    Question singleChoice;
    AnswerOption correctOption;
    AnswerOption wrongOption;
    Question essayQuestion;

    @BeforeEach
    void setUp() {
        student = User.builder().email("student-" + UUID.randomUUID() + "@example.com")
                .fullName("Student").passwordHash("hash").roleName("STUDENT").build();
        em.persist(student);

        otherStudent = User.builder().email("other-" + UUID.randomUUID() + "@example.com")
                .fullName("Other").passwordHash("hash").roleName("STUDENT").build();
        em.persist(otherStudent);

        Category category = Category.builder().name("Cat").slug(UUID.randomUUID().toString()).build();
        em.persist(category);

        course = Course.builder().manager(student).category(category).categoryId(category.getCategoryId())
                .title("Practice Course").slug(UUID.randomUUID().toString()).isPublished(true).build();
        em.persist(course);

        module = Module.builder().course(course).title("Module 1").orderIndex(1).build();
        em.persist(module);

        em.persist(Enrollment.builder().course(course).user(student).enrolledAt(Instant.now())
                .status(Enrollment.STATUS_ACTIVE).build());
        em.persist(Enrollment.builder().course(course).user(otherStudent).enrolledAt(Instant.now())
                .status(Enrollment.STATUS_ACTIVE).build());

        singleChoice = Question.builder().module(module).questionType("SINGLE_CHOICE").content("What is 1+1?")
                .status("ACTIVE").approvalStatus("APPROVED").aiExplanation("1+1 equals 2 in standard arithmetic").build();
        em.persist(singleChoice);

        wrongOption = AnswerOption.builder().question(singleChoice).optionText("3").isCorrect(false).orderIndex(1).build();
        correctOption = AnswerOption.builder().question(singleChoice).optionText("2").isCorrect(true).orderIndex(2).build();
        em.persist(wrongOption);
        em.persist(correctOption);

        essayQuestion = Question.builder().module(module).questionType("ESSAY").content("Explain polymorphism")
                .status("ACTIVE").approvalStatus("APPROVED").build();
        em.persist(essayQuestion);

        practiceExam = Exam.builder().course(course).module(module).createdBy(student)
                .title("Practice Exam PQ-01").durationMinutes(60).generationType("MANUAL")
                .mode(Exam.MODE_PRACTICE_EXAM).maxScore(BigDecimal.TEN).status("PUBLISHED")
                .publishedAt(Instant.now()).practiceConfig("{\"examType\":\"QUIZ\"}").build();
        em.persist(practiceExam);

        attach(practiceExam, singleChoice, "1.00", 0);
        attach(practiceExam, essayQuestion, "2.00", 1);

        standardExam = Exam.builder().course(course).module(module).createdBy(student)
                .title("Standard Final Exam").durationMinutes(60).generationType("MANUAL")
                .mode(Exam.MODE_EXAM).maxScore(BigDecimal.TEN).status("PUBLISHED")
                .publishedAt(Instant.now()).build();
        em.persist(standardExam);

        attach(standardExam, singleChoice, "1.00", 0);
        em.flush();
    }

    private void attach(Exam exam, Question q, String weight, int order) {
        em.persist(ExamQuestion.builder().exam(exam).question(q)
                .weight(new BigDecimal(weight)).orderIndex(order).build());
    }

    private ResultActions call(User user, MockHttpServletRequestBuilder req) throws Exception {
        em.flush();
        return mvc.perform(req.with(user(UserPrincipal.create(user))).contentType(MediaType.APPLICATION_JSON));
    }

    private long startAttempt(Exam exam, User user) throws Exception {
        String res = call(user, post("/api/v1/student/exams/" + exam.getExamId() + "/attempts"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return json.readTree(res).path("data").path("attemptId").asLong();
    }

    @Test
    void checkAnswer_correctChoice_returnsSupportedTrueAndIsCorrectTrue() throws Exception {
        long attemptId = startAttempt(practiceExam, student);
        Long questionId = singleChoice.getQuestionId();

        Map<String, Object> body = Map.of("response", Map.of("selectedOptionIds", List.of(correctOption.getOptionId())));

        String res = call(student, post("/api/v1/student/attempts/" + attemptId + "/questions/" + questionId + "/check")
                .content(json.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.supported").value(true))
                .andExpect(jsonPath("$.data.isCorrect").value(true))
                .andExpect(jsonPath("$.data.correctOptionIds[0]").value(correctOption.getOptionId()))
                .andExpect(jsonPath("$.data.explanation").value("1+1 equals 2 in standard arithmetic"))
                .andReturn().getResponse().getContentAsString();

        JsonNode data = json.readTree(res).path("data");
        assertTrue(data.has("correctAnswer"));
        assertTrue(data.path("correctAnswer").isObject());

        // Repeated check returns cached verdict unchanged
        Map<String, Object> wrongBody = Map.of("response", Map.of("selectedOptionIds", List.of(wrongOption.getOptionId())));
        call(student, post("/api/v1/student/attempts/" + attemptId + "/questions/" + questionId + "/check")
                .content(json.writeValueAsString(wrongBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isCorrect").value(true)); // still true because locked!

        // Subsequent SA-03 draft save is rejected with LOCKED
        Map<String, Object> drafts = Map.of("answers", List.of(
                Map.of("questionId", questionId, "seq", 10, "response", Map.of("selectedOptionIds", List.of(wrongOption.getOptionId())))
        ));
        call(student, put("/api/v1/student/attempts/" + attemptId + "/answers")
                .content(json.writeValueAsString(drafts)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.rejected[0].questionId").value(questionId))
                .andExpect(jsonPath("$.data.rejected[0].reason").value("LOCKED"));

        // SA-02 reload includes check result
        String reloadRes = call(student, get("/api/v1/student/attempts/" + attemptId))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode reloadAnswers = json.readTree(reloadRes).path("data").path("answers");
        JsonNode checkedAnswer = null;
        for (JsonNode ans : reloadAnswers) {
            if (ans.path("questionId").asLong() == questionId) {
                checkedAnswer = ans;
                break;
            }
        }
        assertNotNull(checkedAnswer);
        assertTrue(checkedAnswer.path("check").path("supported").asBoolean());
        assertTrue(checkedAnswer.path("check").path("isCorrect").asBoolean());
    }

    @Test
    void checkAnswer_incorrectChoice_returnsSupportedTrueAndIsCorrectFalse() throws Exception {
        long attemptId = startAttempt(practiceExam, student);
        Long questionId = singleChoice.getQuestionId();

        Map<String, Object> body = Map.of("response", Map.of("selectedOptionIds", List.of(wrongOption.getOptionId())));

        call(student, post("/api/v1/student/attempts/" + attemptId + "/questions/" + questionId + "/check")
                .content(json.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.supported").value(true))
                .andExpect(jsonPath("$.data.isCorrect").value(false))
                .andExpect(jsonPath("$.data.correctOptionIds[0]").value(correctOption.getOptionId()));
    }

    @Test
    void checkAnswer_essayUnsupported_returnsSupportedFalse() throws Exception {
        long attemptId = startAttempt(practiceExam, student);
        Long questionId = essayQuestion.getQuestionId();

        Map<String, Object> body = Map.of("response", Map.of("text", "Polymorphism is..."));

        call(student, post("/api/v1/student/attempts/" + attemptId + "/questions/" + questionId + "/check")
                .content(json.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.supported").value(false))
                .andExpect(jsonPath("$.data.isCorrect").doesNotExist());
    }

    @Test
    void checkAnswer_examMode_returns403NotAPracticeExam() throws Exception {
        long attemptId = startAttempt(standardExam, student);
        Long questionId = singleChoice.getQuestionId();

        Map<String, Object> body = Map.of("response", Map.of("selectedOptionIds", List.of(correctOption.getOptionId())));

        call(student, post("/api/v1/student/attempts/" + attemptId + "/questions/" + questionId + "/check")
                .content(json.writeValueAsString(body)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("This endpoint is only available for practice exams"));
    }

    @Test
    void checkAnswer_submittedAttempt_returns409AttemptNotInProgress() throws Exception {
        long attemptId = startAttempt(practiceExam, student);
        Long questionId = singleChoice.getQuestionId();

        // Submit attempt
        call(student, post("/api/v1/student/attempts/" + attemptId + "/submit"))
                .andExpect(status().isOk());

        Map<String, Object> body = Map.of("response", Map.of("selectedOptionIds", List.of(correctOption.getOptionId())));
        call(student, post("/api/v1/student/attempts/" + attemptId + "/questions/" + questionId + "/check")
                .content(json.writeValueAsString(body)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Attempt is not in progress"));
    }

    @Test
    void checkAnswer_notOwner_returns403() throws Exception {
        long attemptId = startAttempt(practiceExam, student);
        Long questionId = singleChoice.getQuestionId();

        call(otherStudent, post("/api/v1/student/attempts/" + attemptId + "/questions/" + questionId + "/check"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("Attempt belongs to another student"));
    }

    @Test
    void checkAnswer_questionNotInAttempt_returns404() throws Exception {
        long attemptId = startAttempt(practiceExam, student);

        call(student, post("/api/v1/student/attempts/" + attemptId + "/questions/999999/check"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Question is not part of this attempt"));
    }

    @Test
    void checkAnswer_malformedResponse_returns400() throws Exception {
        long attemptId = startAttempt(practiceExam, student);
        Long questionId = singleChoice.getQuestionId();

        Map<String, Object> body = Map.of("response", Map.of("selectedOptionIds", "not-an-array"));

        call(student, post("/api/v1/student/attempts/" + attemptId + "/questions/" + questionId + "/check")
                .content(json.writeValueAsString(body)))
                .andExpect(status().isBadRequest());
    }
}
