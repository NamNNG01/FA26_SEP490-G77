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
import java.time.temporal.ChronoUnit;

import static com.examprep.controllers.student.Fixtures.as;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Deadline 2 contest APIs 1-7, 11, 12. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
public class ManagerContestApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired ObjectMapper json;
    @Autowired com.examprep.services.contest.ContestReminder reminder;
    Fixtures f;
    User manager, otherManager, student;
    Course course, foreignCourse;
    Module module;
    Exam exam, exam2;
    Discount top1, top2;

    @BeforeEach void setUp() {
        f = new Fixtures(em);
        manager = f.account(User.ROLE_COURSE_MANAGER);
        otherManager = f.account(User.ROLE_COURSE_MANAGER);
        student = f.account(User.ROLE_STUDENT);
        course = f.course(manager);
        foreignCourse = f.course(otherManager);
        module = f.module(course, "M1");
        exam = f.exam(course, module, manager, "EXAM");
        exam2 = f.exam(course, module, manager, "EXAM");
        top1 = discount("TOP1-50", 10);
        top2 = discount("TOP2-30", 10);
        em.flush();
    }

    Discount discount(String code, int limit) {
        Discount d = Discount.builder().code(code).name("Giảm").discountType("PERCENT").value(new BigDecimal("50")).usageLimit(limit)
                .isActive(true).appliesTo("ALL").expiresAt(Instant.now().plus(30, ChronoUnit.DAYS)).build();
        em.persist(d);
        return d;
    }

    String body(Exam e, Instant start, Instant end, String rewards) {
        return "{\"title\":\"Weekly #5\",\"description\":\"Thi tuần 5\",\"examId\":" + e.getExamId() + ",\"startTime\":\"" + start
                + "\",\"endTime\":\"" + end + "\",\"rewards\":" + rewards + "}";
    }

    String rewards12() {
        return "[{\"rankPosition\":1,\"discountId\":" + top1.getDiscountId() + "},{\"rankPosition\":2,\"discountId\":" + top2.getDiscountId() + "}]";
    }

    Instant inHours(int h) { return Instant.now().plus(h, ChronoUnit.HOURS).truncatedTo(ChronoUnit.SECONDS); }

    long create(String content) throws Exception {
        return data(send(post("/api/v1/manager/contests"), manager, content).andExpect(status().isCreated())).path("contestId").asLong();
    }

    @Test void createDraftThenDetail() throws Exception {
        JsonNode created = data(send(post("/api/v1/manager/contests"), manager, body(exam, inHours(1), inHours(3), "[]"))
                .andExpect(status().isCreated()));
        assertEquals("DRAFT", created.path("status").asText());
        assertEquals("DRAFT", created.path("storedStatus").asText());
        assertTrue(created.path("rankingStatus").isNull());
        assertEquals(course.getCourseId(), created.path("course").path("courseId").asLong());
        assertEquals(30, created.path("exam").path("durationMinutes").asInt());
        assertTrue(created.path("canEdit").asBoolean());
        assertTrue(created.path("canPublish").asBoolean());
        assertTrue(created.path("canCancel").asBoolean());
        assertFalse(created.path("canPayReward").asBoolean());
        assertTrue(created.has("cancelReason"));
        long id = created.path("contestId").asLong();
        send(put("/api/v1/manager/contests/" + id), manager, body(exam, inHours(1), inHours(3), rewards12())).andExpect(status().isOk());
        JsonNode detail = data(mvc.perform(get("/api/v1/manager/contests/" + id).with(as(manager))).andExpect(status().isOk()));
        assertEquals(2, detail.path("rewards").size());
        assertEquals("TOP1-50", detail.path("rewards").get(0).path("discount").path("code").asText());
        assertEquals("ACTIVE", detail.path("rewards").get(0).path("discount").path("validity").asText());
        assertEquals(2, detail.path("topN").asInt());
        long firstRewardId = detail.path("rewards").get(0).path("rewardId").asLong();
        send(put("/api/v1/manager/contests/" + id), manager, body(exam, inHours(1), inHours(3),
                "[{\"rankPosition\":1,\"discountId\":" + top2.getDiscountId() + "}]")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.rewards.length()").value(1))
                .andExpect(jsonPath("$.data.rewards[0].rewardId").value(firstRewardId));
    }

    @Test void createValidation() throws Exception {
        send(post("/api/v1/manager/contests"), manager, "{\"title\":\" \",\"examId\":" + exam.getExamId() + ",\"startTime\":\"" + inHours(1)
                + "\",\"endTime\":\"" + inHours(3) + "\"}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.data.code").value("VALIDATION_FAILED")).andExpect(jsonPath("$.data.errors[0].field").value("title"));
        send(post("/api/v1/manager/contests"), manager, body(exam, inHours(3), inHours(1), "[]"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.data.errors[0].field").value("endTime"));
        send(post("/api/v1/manager/contests"), manager, body(exam, inHours(1), inHours(1).plus(20, ChronoUnit.MINUTES), "[]"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.data.errors[0].field").value("endTime"));
        send(post("/api/v1/manager/contests"), manager, body(exam, inHours(1), inHours(3),
                "[{\"rankPosition\":1,\"discountId\":" + top1.getDiscountId() + "},{\"rankPosition\":3,\"discountId\":" + top1.getDiscountId() + "}]"))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.data.code").value("REWARD_RANK_INVALID"));
        send(post("/api/v1/manager/contests"), manager, body(exam, inHours(1), inHours(3),
                "[{\"rankPosition\":1,\"discountId\":" + Long.MAX_VALUE + "}]"))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.data.code").value("REWARD_RANK_INVALID"));
        exam2.setStatus("DRAFT");
        em.flush();
        send(post("/api/v1/manager/contests"), manager, body(exam2, inHours(1), inHours(3), "[]"))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.data.code").value("EXAM_NOT_ELIGIBLE"));
        Exam practice = f.exam(course, module, student, "PRACTICE");
        em.flush();
        send(post("/api/v1/manager/contests"), manager, body(practice, inHours(1), inHours(3), "[]"))
                .andExpect(jsonPath("$.data.code").value("EXAM_NOT_ELIGIBLE"));
    }

    @Test void examInAnotherActiveContest409() throws Exception {
        long first = create(body(exam, inHours(1), inHours(3), "[]"));
        send(post("/api/v1/manager/contests"), manager, body(exam, inHours(5), inHours(7), "[]"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.data.code").value("EXAM_ALREADY_IN_ACTIVE_CONTEST"));
        mvc.perform(post("/api/v1/manager/contests/" + first + "/cancel").with(as(manager))).andExpect(status().isOk());
        create(body(exam, inHours(5), inHours(7), "[]"));
    }

    @Test void foreignCourse403AndForeignContest404() throws Exception {
        long id = create(body(exam, inHours(1), inHours(3), "[]"));
        mvc.perform(get("/api/v1/manager/contests/" + id).with(as(otherManager)))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.data.code").value("CONTEST_NOT_FOUND"));
        mvc.perform(delete("/api/v1/manager/contests/" + id).with(as(otherManager))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/manager/contests").param("courseId", course.getCourseId().toString()).with(as(otherManager)))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.data.code").value("FORBIDDEN_COURSE"));
        send(post("/api/v1/manager/contests"), otherManager, body(exam2, inHours(1), inHours(3), "[]"))
                .andExpect(jsonPath("$.data.code").value("EXAM_NOT_ELIGIBLE"));
        mvc.perform(get("/api/v1/manager/contests").with(as(otherManager))).andExpect(jsonPath("$.data.totalElements").value(0));
        // An assigned co-manager has the same scope as the owner.
        em.persist(CourseManager.builder().course(course).user(otherManager).build());
        em.flush();
        mvc.perform(get("/api/v1/manager/contests/" + id).with(as(otherManager))).andExpect(status().isOk());
    }

    @Test void publishChecks() throws Exception {
        long id = create(body(exam, inHours(1), inHours(3), "[]"));
        publish(id).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.data.code").value("REWARDS_REQUIRED"));
        Discount single = discount("ONE", 1);
        top2.setIsActive(false);
        em.flush();
        send(put("/api/v1/manager/contests/" + id), manager, body(exam, inHours(1), inHours(3), rewards12())).andExpect(status().isOk());
        publish(id).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.data.code").value("DISCOUNT_NOT_AVAILABLE"))
                .andExpect(jsonPath("$.data.issues[0].discountId").value(top2.getDiscountId()));
        send(put("/api/v1/manager/contests/" + id), manager, body(exam, inHours(1), inHours(3),
                "[{\"rankPosition\":1,\"discountId\":" + single.getDiscountId() + "},{\"rankPosition\":2,\"discountId\":" + single.getDiscountId() + "}]"))
                .andExpect(status().isOk());
        publish(id).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.data.code").value("DISCOUNT_QUOTA_NOT_ENOUGH"))
                .andExpect(jsonPath("$.data.issues[0].required").value(2)).andExpect(jsonPath("$.data.issues[0].remaining").value(1));
        send(put("/api/v1/manager/contests/" + id), manager, body(exam, inHours(1), inHours(3),
                "[{\"rankPosition\":1,\"discountId\":" + top1.getDiscountId() + "}]")).andExpect(status().isOk());
        Contest contest = em.find(Contest.class, id);
        contest.setStartTime(Instant.now().minusSeconds(60));
        em.flush();
        publish(id).andExpect(status().isBadRequest()).andExpect(jsonPath("$.data.errors[0].field").value("startTime"));
        contest.setStartTime(inHours(1));
        em.flush();
        publish(id).andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("UPCOMING"))
                .andExpect(jsonPath("$.data.storedStatus").value("PUBLISHED")).andExpect(jsonPath("$.data.canPublish").value(false));
        publish(id).andExpect(status().isConflict()).andExpect(jsonPath("$.data.code").value("CONTEST_LOCKED"));
    }

    @Test void updateLocksByStatus() throws Exception {
        long id = create(body(exam, inHours(1), inHours(3), rewards12()));
        publish(id).andExpect(status().isOk());
        Contest contest = em.find(Contest.class, id);
        Instant start = Instant.now().minus(1, ChronoUnit.HOURS).truncatedTo(ChronoUnit.SECONDS);
        Instant end = inHours(1);
        contest.setStartTime(start);
        contest.setEndTime(end);
        em.flush();
        // ONGOING: endTime may only grow; exam/rewards are locked.
        send(put("/api/v1/manager/contests/" + id), manager, body(exam, start, end.minus(10, ChronoUnit.MINUTES), rewards12()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.data.code").value("CONTEST_LOCKED"));
        send(put("/api/v1/manager/contests/" + id), manager, body(exam2, start, end, rewards12()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.data.code").value("CONTEST_LOCKED"));
        send(put("/api/v1/manager/contests/" + id), manager, body(exam, start, end.plus(1, ChronoUnit.HOURS), rewards12()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("ONGOING"));
        // PENDING_REWARD: only discounts of the same ranks may change.
        Instant pastEnd = Instant.now().minus(10, ChronoUnit.MINUTES).truncatedTo(ChronoUnit.SECONDS);
        contest.setStartTime(pastEnd.minus(2, ChronoUnit.HOURS));
        contest.setEndTime(pastEnd);
        em.flush();
        Instant s = contest.getStartTime();
        send(put("/api/v1/manager/contests/" + id), manager, body(exam, s, pastEnd,
                "[{\"rankPosition\":1,\"discountId\":" + top1.getDiscountId() + "}]"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.data.code").value("REWARD_RANK_LOCKED"));
        send(put("/api/v1/manager/contests/" + id), manager, body(exam, s, pastEnd,
                "[{\"rankPosition\":1,\"discountId\":" + top2.getDiscountId() + "},{\"rankPosition\":2,\"discountId\":" + top1.getDiscountId() + "}]"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("PENDING_REWARD"))
                .andExpect(jsonPath("$.data.rankingStatus").value("CALCULATING"))
                .andExpect(jsonPath("$.data.rewards[0].discount.discountId").value(top2.getDiscountId()));
        contest.setStatus("REWARDED");
        em.flush();
        send(put("/api/v1/manager/contests/" + id), manager, body(exam, s, pastEnd, rewards12()))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.data.code").value("CONTEST_LOCKED"));
    }

    @Test void cancelNeedsReasonWithParticipantsAndNotifies() throws Exception {
        long id = create(body(exam, inHours(1), inHours(3), rewards12()));
        publish(id).andExpect(status().isOk());
        em.persist(ContestParticipant.builder().contest(em.find(Contest.class, id)).user(student).build());
        em.flush();
        mvc.perform(post("/api/v1/manager/contests/" + id + "/cancel").with(as(manager))).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.data.errors[0].field").value("reason"));
        send(post("/api/v1/manager/contests/" + id + "/cancel"), manager, "{\"reason\":\"Lỗi đề thi\"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("CANCELLED"))
                .andExpect(jsonPath("$.data.cancelReason").value("Lỗi đề thi"));
        Notification sent = em.createQuery("select n.notification from UserNotification n where n.user = :u and n.notification.type = 'CONTEST_CANCELLED'",
                Notification.class).setParameter("u", student).getSingleResult();
        assertEquals("/student/contests/" + id, sent.getLink());
        assertEquals(id, sent.getReferenceId());
        assertEquals("CONTEST", sent.getReferenceType());
        send(post("/api/v1/manager/contests/" + id + "/cancel"), manager, "{\"reason\":\"again\"}")
                .andExpect(status().isConflict()).andExpect(jsonPath("$.data.code").value("CONTEST_LOCKED"));
    }

    @Test void deleteOnlyDraft() throws Exception {
        long draft = create(body(exam, inHours(1), inHours(3), rewards12()));
        long live = create(body(exam2, inHours(1), inHours(3), rewards12()));
        publish(live).andExpect(status().isOk());
        mvc.perform(delete("/api/v1/manager/contests/" + live).with(as(manager)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.data.code").value("CONTEST_LOCKED"));
        mvc.perform(delete("/api/v1/manager/contests/" + draft).with(as(manager))).andExpect(status().isOk());
        mvc.perform(get("/api/v1/manager/contests/" + draft).with(as(manager))).andExpect(status().isNotFound());
        assertNotNull(em.find(Contest.class, draft).getDeletedAt());
    }

    @Test void listStatusFilterPagesInSql() throws Exception {
        Instant now = Instant.now();
        contest("Draft", "DRAFT", now.plus(1, ChronoUnit.HOURS), now.plus(3, ChronoUnit.HOURS));
        contest("Upcoming", "PUBLISHED", now.plus(1, ChronoUnit.HOURS), now.plus(3, ChronoUnit.HOURS));
        Contest ongoing = contest("Ongoing", "PUBLISHED", now.minus(1, ChronoUnit.HOURS), now.plus(1, ChronoUnit.HOURS));
        Contest pending = contest("Pending", "PUBLISHED", now.minus(3, ChronoUnit.HOURS), now.minus(1, ChronoUnit.HOURS));
        pending.setRankedAt(now.minus(30, ChronoUnit.MINUTES));
        contest("Rewarded", "REWARDED", now.minus(5, ChronoUnit.HOURS), now.minus(4, ChronoUnit.HOURS));
        em.persist(ContestReward.builder().contest(pending).discount(top1).rankPosition(1).build());
        em.persist(ContestParticipant.builder().contest(pending).user(student).build());
        em.persist(ContestParticipant.builder().contest(ongoing).user(student).build());
        em.flush();
        mvc.perform(get("/api/v1/manager/contests").param("status", "PENDING_REWARD,ONGOING").param("size", "1").with(as(manager)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.totalElements").value(2))
                .andExpect(jsonPath("$.data.totalPages").value(2)).andExpect(jsonPath("$.data.content.length()").value(1));
        JsonNode page = data(mvc.perform(get("/api/v1/manager/contests").param("status", "PENDING_REWARD").with(as(manager))));
        JsonNode row = page.path("content").get(0);
        assertEquals("Pending", row.path("title").asText());
        assertEquals("READY", row.path("rankingStatus").asText());
        assertTrue(row.path("canPayReward").asBoolean());
        assertEquals(1, row.path("participantCount").asInt());
        assertEquals(1, row.path("topN").asInt());
        mvc.perform(get("/api/v1/manager/contests").param("status", "NOPE").with(as(manager))).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/manager/contests").param("keyword", "upcom").with(as(manager)))
                .andExpect(jsonPath("$.data.totalElements").value(1));
        mvc.perform(get("/api/v1/manager/contests").param("sort", "title,asc").with(as(manager)))
                .andExpect(jsonPath("$.data.content[0].title").value("Draft"));
        mvc.perform(get("/api/v1/manager/contests").param("sort", "password,asc").with(as(manager))).andExpect(status().isBadRequest());
    }

    @Test void examOptionsOnlyEligible() throws Exception {
        create(body(exam, inHours(1), inHours(3), "[]"));
        Exam draft = f.exam(course, module, manager, "EXAM");
        draft.setStatus("DRAFT");
        Question quiz = Question.builder().course(course).module(module).questionType("SINGLE_CHOICE").difficulty("EASY").content("q").build();
        Question essay = Question.builder().course(course).module(module).questionType("ESSAY").difficulty("EASY").content("e").build();
        em.persist(quiz);
        em.persist(essay);
        em.persist(ExamQuestion.builder().exam(exam2).question(quiz).orderIndex(1).build());
        Exam essayExam = f.exam(course, module, manager, "EXAM");
        em.persist(ExamQuestion.builder().exam(essayExam).question(quiz).orderIndex(1).build());
        em.persist(ExamQuestion.builder().exam(essayExam).question(essay).orderIndex(2).build());
        Exam codeRule = f.exam(course, module, manager, "EXAM");
        em.persist(ExamConfig.builder().exam(codeRule).questionType("CODE").numberOfQuestions(2).build());
        em.flush();
        mvc.perform(get("/api/v1/manager/contest-options/exams").param("courseId", course.getCourseId().toString()).with(as(manager)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].examId").value(exam2.getExamId()))
                .andExpect(jsonPath("$.data.content[0].hasEssayQuestions").value(false))
                .andExpect(jsonPath("$.data.content[0].questionCount").value(1));
        for (Exam notQuiz : new Exam[]{essayExam, codeRule}) {
            send(post("/api/v1/manager/contests"), manager, body(notQuiz, inHours(5), inHours(7), "[]"))
                    .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.data.code").value("EXAM_NOT_ELIGIBLE"))
                    .andExpect(jsonPath("$.message").value("Contests can only use quiz exams."));
        }
        mvc.perform(get("/api/v1/manager/contest-options/exams").param("courseId", foreignCourse.getCourseId().toString()).with(as(manager)))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/manager/contest-options/exams").with(as(manager))).andExpect(status().isBadRequest());
    }

    @Test void remindsParticipantsOnceFiveMinutesBefore() throws Exception {
        long soon = create(body(exam, inHours(1), inHours(3), rewards12()));
        long later = create(body(exam2, inHours(1), inHours(3), rewards12()));
        publish(soon).andExpect(status().isOk());
        publish(later).andExpect(status().isOk());
        Contest c = em.find(Contest.class, soon);
        c.setStartTime(Instant.now().plus(4, ChronoUnit.MINUTES));
        em.persist(ContestParticipant.builder().contest(c).user(student).build());
        em.persist(ContestParticipant.builder().contest(em.find(Contest.class, later)).user(student).build());
        em.flush();
        reminder.remindDue();
        reminder.remindDue();
        em.flush();
        em.clear();
        Notification sent = em.createQuery("select n.notification from UserNotification n where n.user = :u and n.notification.type = 'CONTEST_REMINDER'",
                Notification.class).setParameter("u", student).getSingleResult();
        assertEquals(soon, sent.getReferenceId());
        assertEquals("/student/contests/" + soon, sent.getLink());
        assertTrue(sent.getContent().contains("4 phút"), sent.getContent());
        assertNotNull(em.find(Contest.class, soon).getReminderSentAt());
        assertNull(em.find(Contest.class, later).getReminderSentAt());
    }

    @Test void discountOptionsOnlyAvailable() throws Exception {
        Discount used = discount("USED-UP", 1);
        em.persist(UserDiscount.builder().user(student).discount(used).build());
        Discount expired = discount("OLD", 5);
        expired.setExpiresAt(Instant.now().minusSeconds(5));
        Discount subscriptionOnly = discount("SUBS", 5);
        subscriptionOnly.setAppliesTo("SUBSCRIPTION");
        Discount deleted = discount("GONE", 5);
        deleted.setDeletedAt(Instant.now());
        top2.setIsActive(false);
        em.flush();
        JsonNode page = data(mvc.perform(get("/api/v1/manager/contest-options/discounts").with(as(manager))).andExpect(status().isOk()));
        assertEquals(1, page.path("totalElements").asInt());
        assertEquals("TOP1-50", page.path("content").get(0).path("code").asText());
        assertEquals(10, page.path("content").get(0).path("remaining").asInt());
        mvc.perform(get("/api/v1/manager/contest-options/discounts").param("keyword", "nothing").with(as(manager)))
                .andExpect(jsonPath("$.data.totalElements").value(0));
    }

    Contest contest(String title, String status, Instant start, Instant end) {
        Contest c = Contest.builder().exam(f.exam(course, module, manager, "EXAM")).course(course).createdBy(manager).title(title)
                .durationMinutes(30).startTime(start).endTime(end).status(status).build();
        em.persist(c);
        return c;
    }

    ResultActions publish(long id) throws Exception {
        return mvc.perform(post("/api/v1/manager/contests/" + id + "/publish").with(as(manager)));
    }

    ResultActions send(MockHttpServletRequestBuilder request, User actor, String content) throws Exception {
        return mvc.perform(request.with(as(actor)).contentType(MediaType.APPLICATION_JSON).content(content));
    }

    JsonNode data(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8)).path("data");
    }
}
