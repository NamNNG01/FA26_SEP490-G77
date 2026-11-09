package com.examprep.controllers;

import com.examprep.controllers.student.Fixtures;
import com.examprep.entities.*;
import com.examprep.entities.Module;
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
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;

import static com.examprep.controllers.student.Fixtures.as;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Student report → manager ticket → reject / duplicate / resolve → regrade job. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class QuestionIssueApiIntegrationTest {
    static final String BASE = "/api/v1/manager/question-issues";
    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired ObjectMapper json;
    Fixtures f;
    User manager, otherManager, taker, enrolled, stranger;
    Course course;
    Module module;
    Exam exam;
    Question question;
    AnswerOption wrong, right;
    ExamAttempt attempt;
    AttemptAnswer answer;

    @BeforeEach void setUp() {
        f = new Fixtures(em);
        manager = f.account(User.ROLE_COURSE_MANAGER);
        otherManager = f.account(User.ROLE_COURSE_MANAGER);
        taker = f.account(User.ROLE_STUDENT);
        enrolled = f.account(User.ROLE_STUDENT);
        stranger = f.account(User.ROLE_STUDENT);
        course = f.course(manager);
        f.course(otherManager);
        module = f.module(course, "M1");
        f.enroll(enrolled, course);
        exam = f.exam(course, module, manager, "EXAM");
        question = f.question(course, module, "EASY");
        em.flush();
        List<AnswerOption> opts = em.createQuery("SELECT o FROM AnswerOption o WHERE o.question = :q ORDER BY o.orderIndex", AnswerOption.class)
                .setParameter("q", question).getResultList();
        wrong = opts.get(0);
        right = opts.get(1);
        attempt = f.finishedAttempt(exam, taker, Instant.now(), "0");
        answer = AttemptAnswer.builder().attempt(attempt).question(question).weightSnapshot(BigDecimal.ONE)
                .displaySnapshot("{\"questionId\":" + question.getQuestionId() + ",\"questionType\":\"SINGLE_CHOICE\",\"content\":\"x\"}")
                .keySnapshot("{\"correctOptionIds\":[" + right.getOptionId() + "]}")
                .response("{\"selectedOptionIds\":[" + wrong.getOptionId() + "]}")
                .gradingStatus("AUTO").isCorrect(false).scoreEarned(BigDecimal.ZERO).questionVersion(1).build();
        em.persist(answer);
        em.flush();
    }

    String reportBody(Question q, String type) {
        return "{\"questionId\":" + q.getQuestionId() + ",\"issueType\":\"" + type + "\",\"description\":\"The marked answer looks wrong to me\"}";
    }

    long report(User student) throws Exception {
        return data(send(post("/api/v1/student/question-issues"), student, reportBody(question, "WRONG_ANSWER"))
                .andExpect(status().isCreated())).path("issueId").asLong();
    }

    @Test void reportsOfOneQuestionShareTheOpenTicket() throws Exception {
        long id = report(taker);
        JsonNode second = data(send(post("/api/v1/student/question-issues"), enrolled, reportBody(question, "WRONG_CONTENT"))
                .andExpect(status().isCreated()));
        assertEquals(id, second.path("issueId").asLong());
        assertTrue(second.path("joinedExistingIssue").asBoolean());
        assertEquals(2, second.path("reportCount").asLong());

        send(post("/api/v1/student/question-issues"), taker, reportBody(question, "OTHER"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.data.code").value("ALREADY_REPORTED"));
        send(post("/api/v1/student/question-issues"), stranger, reportBody(question, "OTHER"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.data.code").value("QUESTION_NOT_ACCESSIBLE"));
        send(post("/api/v1/student/question-issues"), taker, "{\"questionId\":" + question.getQuestionId() + ",\"issueType\":\"OTHER\",\"description\":\"short\"}")
                .andExpect(status().isBadRequest());
        send(post("/api/v1/student/question-issues"), stranger, reportBody(question, "BOGUS")).andExpect(status().isBadRequest());

        mvc.perform(get("/api/v1/student/question-issues").with(as(taker))).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1)).andExpect(jsonPath("$.data.content[0].reportCount").value(2));
        JsonNode mine = data(mvc.perform(get("/api/v1/student/question-issues/" + id).with(as(enrolled))).andExpect(status().isOk()));
        assertEquals(1, mine.path("myReports").size());
        assertEquals("WRONG_CONTENT", mine.path("myReports").get(0).path("issueType").asText());
        mvc.perform(get("/api/v1/student/question-issues/" + id).with(as(stranger))).andExpect(status().isNotFound());
    }

    @Test void managerSeesOnlyTheirCourses() throws Exception {
        long id = report(taker);
        report(enrolled);
        mvc.perform(get(BASE).param("status", "PENDING").with(as(manager))).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].reportCount").value(2))
                .andExpect(jsonPath("$.data.content[0].courseName").value("Java basics"));
        mvc.perform(get(BASE).param("search", "looks wrong").with(as(manager))).andExpect(jsonPath("$.data.content.length()").value(1));
        mvc.perform(get(BASE).param("status", "RESOLVED").with(as(manager))).andExpect(jsonPath("$.data.content.length()").value(0));
        mvc.perform(get(BASE).with(as(otherManager))).andExpect(jsonPath("$.data.content.length()").value(0));
        mvc.perform(get(BASE + "/" + id).with(as(otherManager))).andExpect(status().isNotFound());
        JsonNode detail = data(mvc.perform(get(BASE + "/" + id).with(as(manager))).andExpect(status().isOk()));
        assertEquals(2, detail.path("reports").size());
        assertEquals(2, detail.path("question").path("options").size());
        assertEquals(question.getLockVersion(), detail.path("question").path("lockVersion").asLong());
        send(patch(BASE + "/" + id + "/assign"), manager, "{\"assignedTo\":" + otherManager.getUserId() + "}").andExpect(status().isBadRequest());
        send(patch(BASE + "/" + id + "/assign"), manager, "{\"assignedTo\":" + manager.getUserId() + "}").andExpect(status().isOk())
                .andExpect(jsonPath("$.data.assignedTo.userId").value(manager.getUserId()));
    }

    @Test void rejectNotifiesReportersAndClosesTheTicket() throws Exception {
        long id = report(taker);
        report(enrolled);
        send(patch(BASE + "/" + id + "/status"), manager, "{\"status\":\"IN_PROGRESS\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("IN_PROGRESS")).andExpect(jsonPath("$.data.assignedTo.userId").value(manager.getUserId()));
        send(patch(BASE + "/" + id + "/status"), manager, "{\"status\":\"REJECTED\"}").andExpect(status().isBadRequest());
        send(patch(BASE + "/" + id + "/status"), manager, "{\"status\":\"RESOLVED\"}").andExpect(status().isBadRequest());
        send(patch(BASE + "/" + id + "/status"), manager, "{\"status\":\"REJECTED\",\"note\":\"The key is right: see chapter 2\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("REJECTED"));
        send(patch(BASE + "/" + id + "/status"), manager, "{\"status\":\"IN_PROGRESS\"}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.data.code").value("ISSUE_CLOSED"));
        mvc.perform(get("/api/v1/student/question-issues/" + id).with(as(taker)))
                .andExpect(jsonPath("$.data.status").value("REJECTED"))
                .andExpect(jsonPath("$.data.resolutionNote").value("The key is right: see chapter 2"));
        assertEquals(1, notifications(taker));
        assertEquals(1, notifications(enrolled));
        JsonNode history = data(mvc.perform(get(BASE + "/" + id + "/history").with(as(manager))));
        assertEquals(List.of("REPORTED", "REPORTED", "REVIEW_STARTED", "REJECTED"),
                json.convertValue(history.findValuesAsText("action"), List.class));
        assertNotEquals(id, report(taker), "a closed ticket does not take new reports");
    }

    @Test void duplicateClosesAgainstThePrimaryTicket() throws Exception {
        long primary = report(taker);
        Question other = f.question(course, module, "EASY");
        em.flush();
        long second = data(send(post("/api/v1/student/question-issues"), enrolled, reportBody(other, "WRONG_CONTENT"))).path("issueId").asLong();
        send(post(BASE + "/" + second + "/duplicate"), manager, "{\"duplicateOfIssueId\":" + second + ",\"note\":\"same\"}").andExpect(status().isBadRequest());
        send(post(BASE + "/" + second + "/duplicate"), manager, "{\"duplicateOfIssueId\":" + primary + ",\"note\":\"Same typo as #" + primary + "\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("DUPLICATE"))
                .andExpect(jsonPath("$.data.duplicateOfIssueId").value(primary));
        send(post(BASE + "/" + primary + "/duplicate"), manager, "{\"duplicateOfIssueId\":" + second + ",\"note\":\"loop\"}")
                .andExpect(status().isBadRequest());
    }

    @Test void answerCorrectionRegradesFinishedAnswersAfterConfirmation() throws Exception {
        long id = report(taker);
        send(patch(BASE + "/" + id + "/status"), manager, "{\"status\":\"IN_PROGRESS\"}").andExpect(status().isOk());
        String flipped = "{\"options\":[{\"optionId\":" + wrong.getOptionId() + ",\"optionText\":\"wrong\",\"isCorrect\":true,\"orderIndex\":1},"
                + "{\"optionId\":" + right.getOptionId() + ",\"optionText\":\"right\",\"isCorrect\":false,\"orderIndex\":2}]}";
        send(post(BASE + "/" + id + "/resolve"), manager, "{\"resolutionType\":\"ANSWER_CORRECTED\",\"resolutionNote\":\"Key fixed\",\"expectedLockVersion\":99,\"changes\":" + flipped + "}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.data.code").value("QUESTION_VERSION_CONFLICT"));
        send(post(BASE + "/" + id + "/resolve"), manager, "{\"resolutionType\":\"ANSWER_CORRECTED\",\"resolutionNote\":\"Key fixed\",\"changes\":{\"questionType\":\"ESSAY\"}}")
                .andExpect(status().isBadRequest());

        JsonNode resolved = data(send(post(BASE + "/" + id + "/resolve"), manager, "{\"resolutionType\":\"ANSWER_CORRECTED\",\"resolutionNote\":\"Key fixed\",\"expectedLockVersion\":"
                + question.getLockVersion() + ",\"changes\":" + flipped + "}").andExpect(status().isOk()));
        assertEquals("RESOLVED", resolved.path("issue").path("status").asText());
        JsonNode job = resolved.path("regradeJob");
        assertEquals("PENDING_CONFIRMATION", job.path("status").asText());
        assertEquals(1, job.path("totalAnswers").asInt());
        assertEquals(BigDecimal.ZERO.compareTo(f.reload(answer).getScoreEarned()), 0, "nothing changes before confirmation");

        long jobId = job.path("jobId").asLong();
        send(post(BASE + "/" + id + "/regrade/confirm"), manager, "{\"jobId\":" + jobId + ",\"confirmed\":true,\"reason\":\"Apply the fixed key\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("COMPLETED"))
                .andExpect(jsonPath("$.data.processedAnswers").value(1)).andExpect(jsonPath("$.data.progressPercent").value(100));
        AttemptAnswer after = f.reload(answer);
        assertTrue(after.getIsCorrect());
        assertEquals(0, new BigDecimal("10.00").compareTo(after.getScoreEarned()));
        assertEquals(f.reload(question).getScoringVersion(), after.getQuestionVersion());
        assertEquals(0, new BigDecimal("10.00").compareTo(f.reload(attempt).getTotalScore()));
        assertEquals(1L, em.createQuery("SELECT COUNT(l) FROM AnswerRegradeLog l WHERE l.attemptAnswer = :a", Long.class)
                .setParameter("a", after).getSingleResult());
        send(post(BASE + "/" + id + "/regrade/confirm"), manager, "{\"jobId\":" + jobId + ",\"confirmed\":true,\"reason\":\"again\"}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.data.code").value("REGRADE_JOB_NOT_PENDING"));
        send(post(BASE + "/regrade-jobs/" + jobId + "/retry"), manager, "").andExpect(status().isConflict());
        mvc.perform(get(BASE + "/" + id + "/regrade-jobs").with(as(otherManager))).andExpect(status().isNotFound());
        assertEquals(1, notifications(taker));
    }

    @Test void voidedQuestionGivesFullPointsOrCanBeCancelled() throws Exception {
        long id = report(taker);
        JsonNode job = data(send(post(BASE + "/" + id + "/resolve"), manager, "{\"resolutionType\":\"QUESTION_VOIDED\",\"resolutionNote\":\"Ambiguous wording\"}")
                .andExpect(status().isOk())).path("regradeJob");
        long jobId = job.path("jobId").asLong();
        send(post(BASE + "/" + id + "/regrade/confirm"), manager, "{\"jobId\":" + jobId + ",\"confirmed\":false,\"reason\":\"Not now\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("CANCELLED"));
        assertEquals(0, BigDecimal.ZERO.compareTo(f.reload(answer).getScoreEarned()));

        long second = report(taker);
        long jobId2 = data(send(post(BASE + "/" + second + "/resolve"), manager, "{\"resolutionType\":\"QUESTION_VOIDED\",\"resolutionNote\":\"Voided\"}"))
                .path("regradeJob").path("jobId").asLong();
        send(post(BASE + "/" + second + "/regrade/confirm"), manager, "{\"jobId\":" + jobId2 + ",\"confirmed\":true,\"reason\":\"Give everyone the point\"}")
                .andExpect(jsonPath("$.data.status").value("COMPLETED"));
        assertEquals(0, new BigDecimal("10.00").compareTo(f.reload(answer).getScoreEarned()));
        assertEquals("COMPLETED", f.reload(attempt).getStatus());
    }

    @Test void contentFixWithoutScoreChangeCreatesNoJob() throws Exception {
        question.setStatus("ACTIVE");
        long id = report(taker);
        JsonNode resolved = data(send(post(BASE + "/" + id + "/resolve"), manager,
                "{\"resolutionType\":\"CONTENT_CORRECTED\",\"resolutionNote\":\"Typo\",\"changes\":{\"content\":\"Fixed wording of the question\"}}")
                .andExpect(status().isOk()));
        assertTrue(resolved.path("regradeJob").isMissingNode() || resolved.path("regradeJob").isNull());
        assertEquals("Fixed wording of the question", f.reload(question).getContent());
        assertEquals(1, question.getScoringVersion());
    }

    long notifications(User u) {
        return em.createQuery("SELECT COUNT(un) FROM UserNotification un WHERE un.user = :u AND un.notification.type = 'QUESTION_ISSUE'", Long.class)
                .setParameter("u", u).getSingleResult();
    }

    ResultActions send(MockHttpServletRequestBuilder request, User actor, String content) throws Exception {
        return mvc.perform(request.with(as(actor)).contentType(MediaType.APPLICATION_JSON).content(content));
    }

    JsonNode data(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8)).path("data");
    }
}
