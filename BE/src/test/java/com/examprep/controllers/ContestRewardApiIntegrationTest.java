package com.examprep.controllers;

import com.examprep.controllers.student.Fixtures;
import com.examprep.entities.*;
import com.examprep.entities.Module;
import com.examprep.services.contest.ContestRanker;
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
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.StringJoiner;

import static com.examprep.controllers.student.Fixtures.as;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Deadline 2 APIs 9 and 10 (section 6.4). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ContestRewardApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired ObjectMapper json;
    @Autowired ContestRanker ranker;
    Fixtures f;
    User manager;
    Course course;
    Module module;
    Discount d1, d2;
    Contest contest;
    ContestParticipant winner, runnerUp;

    @BeforeEach void setUp() {
        f = new Fixtures(em);
        manager = f.account(User.ROLE_COURSE_MANAGER);
        course = f.course(manager);
        module = f.module(course, "M");
        d1 = discount("TOP1-50", 5, "PERCENT", "50");
        d2 = discount("TOP2-30K", 5, "FIXED_AMOUNT", "30000");
        contest = contest("Weekly", 10);
        prize(contest, 1, d1);
        prize(contest, 2, d2);
        prize(contest, 3, d2);
        winner = participant(contest, "9");
        runnerUp = participant(contest, "7");
        ranker.rankDue();
        em.flush();
    }

    Discount discount(String code, int limit, String type, String value) {
        Discount d = Discount.builder().code(code).name(code).discountType(type).value(new BigDecimal(value)).usageLimit(limit)
                .isActive(true).appliesTo("ALL").expiresAt(Instant.now().plus(30, ChronoUnit.DAYS)).build();
        em.persist(d);
        return d;
    }

    Contest contest(String title, int minutesAgo) {
        Instant end = Instant.now().minus(minutesAgo, ChronoUnit.MINUTES);
        Contest c = Contest.builder().exam(f.exam(course, module, manager, "EXAM")).course(course).createdBy(manager).title(title)
                .durationMinutes(30).startTime(end.minus(1, ChronoUnit.HOURS)).endTime(end).status("PUBLISHED").build();
        em.persist(c);
        return c;
    }

    void prize(Contest c, int rank, Discount d) { em.persist(ContestReward.builder().contest(c).discount(d).rankPosition(rank).build()); }

    ContestParticipant participant(Contest c, String score) {
        User user = f.account(User.ROLE_STUDENT);
        Instant submitted = c.getEndTime().minus(5, ChronoUnit.MINUTES);
        ExamAttempt a = ExamAttempt.builder().exam(c.getExam()).user(user).startTime(submitted.minus(10, ChronoUnit.MINUTES))
                .deadlineAt(submitted.plusSeconds(60)).submittedAt(submitted).status("SUBMITTED").examSnapshot("{}")
                .totalScore(new BigDecimal(score)).build();
        em.persist(a);
        ContestParticipant p = ContestParticipant.builder().contest(c).user(user).attemptId(a.getAttemptId()).build();
        em.persist(p);
        em.flush();
        return p;
    }

    @Test void paysWinnersAndNotifies() throws Exception {
        JsonNode data = data(pay(contest).andExpect(status().isOk()).andExpect(jsonPath("$.message").value("Đã trả thưởng cho 2 người thắng")));
        assertEquals("REWARDED", data.path("status").asText());
        assertEquals(2, data.path("rewardsGranted").asInt());
        assertEquals(1, data.path("winners").get(0).path("rank").asInt());
        assertEquals(winner.getUser().getUserId(), data.path("winners").get(0).path("userId").asLong());
        assertEquals("TOP1-50", data.path("winners").get(0).path("discount").path("code").asText());
        em.flush();
        em.clear();
        List<UserDiscount> granted = em.createQuery("select ud from UserDiscount ud order by ud.userDiscountId", UserDiscount.class).getResultList();
        assertEquals(2, granted.size());
        assertEquals("CONTEST", granted.get(0).getSourceType());
        assertEquals(contest.getContestId(), granted.get(0).getSourceId());
        List<String> titles = em.createQuery("select un.notification.title from UserNotification un where un.notification.type = 'CONTEST_REWARD' "
                + "order by un.notification.notificationId", String.class).getResultList();
        assertEquals(List.of("Chúc mừng bạn đạt hạng 1 – Weekly", "Chúc mừng bạn đạt hạng 2 – Weekly"), titles);
        String content = em.createQuery("select n.content from Notification n where n.title like '%hạng 2%'", String.class).getSingleResult();
        assertTrue(content.contains("TOP2-30K (30000đ)"), content);
        ContestParticipant paid = em.find(ContestParticipant.class, winner.getParticipantId());
        assertTrue(paid.getRewardClaimed());
        assertNotNull(paid.getRewardGrantedAt());
        Contest after = em.find(Contest.class, contest.getContestId());
        assertEquals("REWARDED", after.getStatus());
        assertEquals(manager.getUserId(), after.getRewardedBy().getUserId());
        mvc.perform(get("/api/v1/manager/contests/" + contest.getContestId() + "/leaderboard").with(as(manager)))
                .andExpect(jsonPath("$.data.content[0].rewardGranted").value(true));
        pay(contest).andExpect(status().isConflict()).andExpect(jsonPath("$.data.code").value("CONTEST_NOT_PENDING_REWARD"));
    }

    @Test void noParticipantsStillRewarded() throws Exception {
        Contest empty = contest("Empty", 20);
        prize(empty, 1, d1);
        empty.setRankedAt(Instant.now());
        em.flush();
        pay(empty).andExpect(status().isOk()).andExpect(jsonPath("$.data.rewardsGranted").value(0))
                .andExpect(jsonPath("$.data.status").value("REWARDED"));
    }

    @Test void notReadyOrNotPending409() throws Exception {
        Contest unranked = contest("Unranked", 1);
        participant(unranked, "5").getAttemptId();
        ExamAttempt running = ExamAttempt.builder().exam(unranked.getExam()).user(f.account(User.ROLE_STUDENT)).startTime(Instant.now())
                .deadlineAt(Instant.now().plusSeconds(600)).status("IN_PROGRESS").examSnapshot("{}").build();
        em.persist(running);
        em.persist(ContestParticipant.builder().contest(unranked).user(running.getUser()).attemptId(running.getAttemptId()).build());
        em.flush();
        ranker.rankDue();
        pay(unranked).andExpect(status().isConflict()).andExpect(jsonPath("$.data.code").value("RANKING_NOT_READY"));
        Contest upcoming = contest("Later", -60);
        em.flush();
        pay(upcoming).andExpect(status().isConflict()).andExpect(jsonPath("$.data.code").value("CONTEST_NOT_PENDING_REWARD"));
        mvc.perform(post("/api/v1/manager/contests/" + contest.getContestId() + "/pay-rewards").with(as(f.account(User.ROLE_COURSE_MANAGER))))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.data.code").value("CONTEST_NOT_FOUND"));
    }

    @Test void blockedRollsBackEverything() throws Exception {
        d2.setExpiresAt(Instant.now().minusSeconds(1));
        em.flush();
        mvc.perform(get("/api/v1/manager/contests/" + contest.getContestId()).with(as(manager)))
                .andExpect(jsonPath("$.data.payBlockers[0].reason").value("DISCOUNT_EXPIRED"));
        pay(contest).andExpect(status().isConflict()).andExpect(jsonPath("$.data.code").value("REWARD_PAYMENT_BLOCKED"))
                .andExpect(jsonPath("$.data.issues.length()").value(1))
                .andExpect(jsonPath("$.data.issues[0].rankPosition").value(2))
                .andExpect(jsonPath("$.data.issues[0].reason").value("DISCOUNT_EXPIRED"));
        assertEquals(0L, em.createQuery("select count(ud) from UserDiscount ud", Long.class).getSingleResult());
        assertEquals("PUBLISHED", f.reload(contest).getStatus());
    }

    @Test void rerankBeforePaying() throws Exception {
        ExamAttempt regraded = em.find(ExamAttempt.class, runnerUp.getAttemptId());
        regraded.setTotalScore(new BigDecimal("10"));
        em.flush();
        JsonNode data = data(pay(contest).andExpect(status().isOk()));
        assertEquals(runnerUp.getUser().getUserId(), data.path("winners").get(0).path("userId").asLong());
    }

    @Test void batchSharedDiscountRemainingOne() throws Exception {
        Discount shared = discount("ONE-LEFT", 1, "PERCENT", "10");
        Contest early = contest("Early", 30), late = contest("Late", 10);
        prize(early, 1, shared);
        prize(late, 1, shared);
        participant(early, "8");
        participant(late, "8");
        ranker.rankDue();
        em.flush();
        JsonNode data = data(batch("[" + late.getContestId() + "," + early.getContestId() + "]").andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Đã trả thưởng 1/2 contest")));
        assertEquals(2, data.path("total").asInt());
        assertEquals(1, data.path("succeeded").asInt());
        assertEquals(1, data.path("failed").asInt());
        JsonNode first = data.path("results").get(0), second = data.path("results").get(1);
        assertEquals(early.getContestId(), first.path("contestId").asLong());
        assertTrue(first.path("success").asBoolean());
        assertEquals("REWARDED", first.path("status").asText());
        assertEquals(late.getContestId(), second.path("contestId").asLong());
        assertFalse(second.path("success").asBoolean());
        assertEquals("REWARD_PAYMENT_BLOCKED", second.path("errorCode").asText());
        assertEquals("DISCOUNT_QUOTA_NOT_ENOUGH", second.path("issues").get(0).path("reason").asText());
        assertEquals(0, second.path("issues").get(0).path("remaining").asInt());
    }

    @Test void batchValidation() throws Exception {
        batch("[]").andExpect(status().isBadRequest()).andExpect(jsonPath("$.data.code").value("VALIDATION_FAILED"));
        StringJoiner many = new StringJoiner(",", "[", "]");
        for (int i = 1; i <= 21; i++) many.add(String.valueOf(i));
        batch(many.toString()).andExpect(status().isBadRequest()).andExpect(jsonPath("$.data.code").value("BATCH_TOO_LARGE"));
        batch("[" + contest.getContestId() + "," + contest.getContestId() + "]").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.data.code").value("VALIDATION_FAILED"));
    }

    @Test void batchForeignIdIsRowError() throws Exception {
        batch("[" + Long.MAX_VALUE + "," + contest.getContestId() + "]").andExpect(status().isOk())
                .andExpect(jsonPath("$.data.succeeded").value(1)).andExpect(jsonPath("$.data.failed").value(1))
                .andExpect(jsonPath("$.data.results[1].errorCode").value("CONTEST_NOT_FOUND"));
    }

    ResultActions pay(Contest c) throws Exception {
        return mvc.perform(post("/api/v1/manager/contests/" + c.getContestId() + "/pay-rewards").with(as(manager)));
    }

    ResultActions batch(String ids) throws Exception {
        return mvc.perform(post("/api/v1/manager/contests/batch-pay-rewards").with(as(manager))
                .contentType(MediaType.APPLICATION_JSON).content("{\"contestIds\":" + ids + "}"));
    }

    JsonNode data(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8)).path("data");
    }
}
