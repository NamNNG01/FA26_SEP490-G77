package com.examprep.controllers;

import com.examprep.controllers.student.Fixtures;
import com.examprep.entities.*;
import com.examprep.entities.Module;
import com.examprep.services.contest.ContestRanker;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static com.examprep.controllers.student.Fixtures.as;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Section 6.3 ranking and API 8 leaderboard. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ContestRankingIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired ContestRanker ranker;
    Fixtures f;
    User manager;
    Course course;
    Exam exam;
    Contest contest;
    Discount prize;
    Instant end = Instant.now().minus(10, ChronoUnit.MINUTES).truncatedTo(ChronoUnit.SECONDS);

    @BeforeEach void setUp() {
        f = new Fixtures(em);
        manager = f.account(User.ROLE_COURSE_MANAGER);
        course = f.course(manager);
        Module module = f.module(course, "M");
        exam = f.exam(course, module, manager, "EXAM");
        contest = Contest.builder().exam(exam).course(course).createdBy(manager).title("Weekly").durationMinutes(30)
                .startTime(end.minus(2, ChronoUnit.HOURS)).endTime(end).status("PUBLISHED").build();
        em.persist(contest);
        prize = Discount.builder().code("TOP1").discountType("PERCENT").value(new BigDecimal("50")).usageLimit(5).isActive(true).build();
        em.persist(prize);
        em.persist(ContestReward.builder().contest(contest).discount(prize).rankPosition(1).build());
        em.flush();
    }

    /** A participant whose attempt took {@code seconds} and was submitted {@code minutesBeforeEnd} before the end. */
    ContestParticipant participant(String score, int seconds, int minutesBeforeEnd, String status) {
        User user = f.account(User.ROLE_STUDENT);
        Instant submitted = end.minus(minutesBeforeEnd, ChronoUnit.MINUTES);
        ExamAttempt attempt = ExamAttempt.builder().exam(exam).user(user).startTime(submitted.minusSeconds(seconds))
                .deadlineAt("IN_PROGRESS".equals(status) ? Instant.now().plus(1, ChronoUnit.HOURS) : submitted.plusSeconds(60))
                .submittedAt("IN_PROGRESS".equals(status) ? null : submitted).status(status).examSnapshot("{}")
                .totalScore(score == null ? null : new BigDecimal(score)).build();
        em.persist(attempt);
        ContestParticipant p = ContestParticipant.builder().contest(contest).user(user).attemptId(attempt.getAttemptId()).build();
        em.persist(p);
        em.flush();
        return p;
    }

    @Test void ranksByScoreThenTimeThenSubmission() {
        ContestParticipant d = participant("8", 600, 30, "SUBMITTED");
        ContestParticipant c = participant("8", 300, 20, "SUBMITTED");
        ContestParticipant a = participant("9", 900, 50, "SUBMITTED");
        ContestParticipant b = participant("8", 300, 40, "SUBMITTED");
        ContestParticipant none = ContestParticipant.builder().contest(contest).user(f.account(User.ROLE_STUDENT)).build();
        em.persist(none);
        em.flush();
        ranker.rankDue();
        em.flush();
        em.clear();
        assertEquals(1, em.find(ContestParticipant.class, a.getParticipantId()).getRank());
        assertEquals(2, em.find(ContestParticipant.class, b.getParticipantId()).getRank());
        assertEquals(3, em.find(ContestParticipant.class, c.getParticipantId()).getRank());
        assertEquals(4, em.find(ContestParticipant.class, d.getParticipantId()).getRank());
        assertNull(em.find(ContestParticipant.class, none.getParticipantId()).getRank());
        ContestParticipant ranked = em.find(ContestParticipant.class, b.getParticipantId());
        assertEquals(0, new BigDecimal("8").compareTo(ranked.getScore()));
        assertEquals(300, ranked.getTimeTakenSec());
        Contest after = em.find(Contest.class, contest.getContestId());
        assertNotNull(after.getRankedAt());
        assertEquals("PUBLISHED", after.getStatus());
    }

    @Test void skipsWhileAttemptInProgressOrGradingPending() {
        ContestParticipant running = participant(null, 100, 1, "IN_PROGRESS");
        ranker.rankDue();
        assertNull(f.reload(contest).getRankedAt());
        ExamAttempt attempt = em.find(ExamAttempt.class, running.getAttemptId());
        attempt.setStatus("SUBMITTED");
        attempt.setSubmittedAt(end.minusSeconds(30));
        attempt.setTotalScore(new BigDecimal("7"));
        AttemptAnswer essay = AttemptAnswer.builder().attempt(attempt).question(f.question(course, null, "EASY"))
                .weightSnapshot(BigDecimal.ONE).gradingStatus("PENDING_AI").build();
        em.persist(essay);
        em.flush();
        ranker.rankDue();
        assertNull(f.reload(contest).getRankedAt());
        essay.setGradingStatus("AI_GRADED");
        em.flush();
        ranker.rankDue();
        assertNotNull(f.reload(contest).getRankedAt());
    }

    @Test void leaderboardBeforeReadyAndAfter() throws Exception {
        participant("9", 600, 30, "SUBMITTED");
        participant("5", 600, 30, "SUBMITTED");
        String path = "/api/v1/manager/contests/" + contest.getContestId() + "/leaderboard";
        mvc.perform(get(path).with(as(manager))).andExpect(status().isConflict()).andExpect(jsonPath("$.data.code").value("RANKING_NOT_READY"));
        ranker.rankDue();
        em.flush();
        mvc.perform(get(path).with(as(manager))).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(2))
                .andExpect(jsonPath("$.data.content[0].rank").value(1))
                .andExpect(jsonPath("$.data.content[0].score").value(9.0))
                .andExpect(jsonPath("$.data.content[0].timeSpentSeconds").value(600))
                .andExpect(jsonPath("$.data.content[0].reward.code").value("TOP1"))
                .andExpect(jsonPath("$.data.content[0].rewardGranted").value(false))
                .andExpect(jsonPath("$.data.content[1].reward").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.data.content[0].user.fullName").exists());
        mvc.perform(get(path).with(as(f.account(User.ROLE_COURSE_MANAGER)))).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/manager/contests/" + contest.getContestId()).with(as(manager)))
                .andExpect(jsonPath("$.data.rankingStatus").value("READY"))
                .andExpect(jsonPath("$.data.rewards[0].winner.score").value(9.0))
                .andExpect(jsonPath("$.data.canPayReward").value(true))
                .andExpect(jsonPath("$.data.payBlockers.length()").value(0));
    }
}
