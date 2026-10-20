package com.examprep.controllers;

import com.examprep.entities.Category;
import com.examprep.entities.Course;
import com.examprep.entities.Enrollment;
import com.examprep.entities.Exam;
import com.examprep.entities.ExamAttempt;
import com.examprep.entities.PasswordResetToken;
import com.examprep.entities.RefreshToken;
import com.examprep.entities.User;
import com.examprep.repositories.UserRepository;
import com.examprep.security.UserPrincipal;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
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
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * UM-01..UM-05: admin user management endpoints. Grows with every UM API.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class AdminUserApiIntegrationTest {
    private static final String BASE = "/api/v1/admin/users";

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper json;
    @Autowired private EntityManager em;
    @Autowired private UserRepository repository;
    @Autowired private PasswordEncoder encoder;

    private User admin, manager, student;

    @BeforeEach
    void fixtures() {
        admin = account(User.ROLE_ADMIN, "Admin User", User.STATUS_ACTIVE);
        manager = account(User.ROLE_COURSE_MANAGER, "Manager User", User.STATUS_ACTIVE);
        student = account(User.ROLE_STUDENT, "Student User", User.STATUS_ACTIVE);
    }

    @Test
    void userEndpointsRequireAuthenticationAndAdminRole() throws Exception {
        mvc.perform(get(BASE)).andExpect(status().isUnauthorized());
        for (MockHttpServletRequestBuilder request : List.of(get(BASE), get(BASE + "/1"),
                put(BASE + "/1").contentType(MediaType.APPLICATION_JSON)
                        .content(updateBody("Blocked", "blocked@example.com", User.ROLE_STUDENT, User.STATUS_ACTIVE)),
                patch(BASE + "/1").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"INACTIVE\"}"),
                post(BASE + "/1/reset-password"))) {
            for (User actor : List.of(manager, student)) {
                call(actor, request).andExpect(status().isForbidden());
            }
        }
    }

    @Test
    void listFiltersSearchRoleAndStatusAndSortsNewestFirst() throws Exception {
        User w1 = account(User.ROLE_STUDENT, "Wonderland One", "one@wonderland.test", User.STATUS_ACTIVE);
        User w2 = account(User.ROLE_ADMIN, "Wonderland Two", "two@wonderland.test", User.STATUS_ACTIVE);
        User w3 = account(User.ROLE_COURSE_MANAGER, "Wonderland Three", "three@wonderland.test", User.STATUS_INACTIVE);

        call(admin, get(BASE).param("search", "wonderland"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(3))
                .andExpect(jsonPath("$.data.content[0].userId").value(w3.getUserId()))
                .andExpect(jsonPath("$.data.content[1].userId").value(w2.getUserId()))
                .andExpect(jsonPath("$.data.content[2].userId").value(w1.getUserId()));

        // search is case-insensitive and matches e-mail as well as full name
        call(admin, get(BASE).param("search", "WONDERLAND")).andExpect(jsonPath("$.data.totalElements").value(3));
        call(admin, get(BASE).param("search", "one@wonderland")).andExpect(jsonPath("$.data.totalElements").value(1));

        call(admin, get(BASE).param("search", "wonderland").param("role", User.ROLE_STUDENT))
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].userId").value(w1.getUserId()));

        call(admin, get(BASE).param("search", "wonderland").param("status", User.STATUS_INACTIVE))
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].userId").value(w3.getUserId()));
    }

    @Test
    void listPaginatesAndReportsOverviewStats() throws Exception {
        User extra = account(User.ROLE_STUDENT, "Extra User", User.STATUS_ACTIVE);
        Course first = course("Course one");
        Course second = course("Course two");
        enroll(extra, first);
        enroll(extra, second);

        call(admin, get(BASE).param("search", "extra").param("size", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].userId").value(extra.getUserId()))
                .andExpect(jsonPath("$.data.content[0].role").value(User.ROLE_STUDENT))
                .andExpect(jsonPath("$.data.content[0].status").value(User.STATUS_ACTIVE))
                .andExpect(jsonPath("$.data.content[0].enrolledCoursesCount").value(2))
                .andExpect(jsonPath("$.data.content[0].lastLoginAt").doesNotExist())
                .andExpect(jsonPath("$.data.page").value(0))
                .andExpect(jsonPath("$.data.size").value(1))
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.totalPages").value(1))
                .andExpect(jsonPath("$.data.first").value(true))
                .andExpect(jsonPath("$.data.last").value(true));

        // fixtures() creates 3 accounts and this test adds a 4th, all created this month
        call(admin, get(BASE))
                .andExpect(jsonPath("$.data.stats.total").value(4))
                .andExpect(jsonPath("$.data.stats.active").value(4))
                .andExpect(jsonPath("$.data.stats.inactive").value(0))
                .andExpect(jsonPath("$.data.stats.newThisMonth").value(4));
    }

    @Test
    void listRejectsInvalidPaginationAndFilters() throws Exception {
        for (String[] parameter : List.of(new String[]{"page", "-1"}, new String[]{"size", "0"},
                new String[]{"size", "101"}, new String[]{"role", "BOGUS"}, new String[]{"status", "BOGUS"})) {
            call(admin, get(BASE).param(parameter[0], parameter[1])).andExpect(status().isBadRequest());
        }
        call(admin, get(BASE).param("role", "BOGUS"))
                .andExpect(jsonPath("$.message").value("Unknown role: BOGUS"));
    }

    @Test
    void detailReturnsProfileLearningStatsAndRecentAttempts() throws Exception {
        User target = account(User.ROLE_STUDENT, "Detail Target", "detail-target@example.com", User.STATUS_ACTIVE);
        enroll(target, course("Course one"));
        enroll(target, course("Course two"));
        Exam exam = exam("Quiz Unit 3");
        for (int score = 1; score <= 6; score++) {
            // six submitted attempts: detail must surface only the 5 newest
            attempt(exam, target, score, Instant.parse("2026-10-0" + score + "T12:00:00Z"));
        }

        call(admin, get(BASE + "/" + target.getUserId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.userId").value(target.getUserId()))
                .andExpect(jsonPath("$.data.fullName").value("Detail Target"))
                .andExpect(jsonPath("$.data.email").value("detail-target@example.com"))
                .andExpect(jsonPath("$.data.role").value(User.ROLE_STUDENT))
                .andExpect(jsonPath("$.data.status").value(User.STATUS_ACTIVE))
                .andExpect(jsonPath("$.data.createdAt").isNotEmpty())
                .andExpect(jsonPath("$.data.stats.coursesEnrolled").value(2))
                .andExpect(jsonPath("$.data.stats.examsTaken").value(6))
                .andExpect(jsonPath("$.data.stats.averageScore").value(3.5))
                .andExpect(jsonPath("$.data.stats.lastActivityAt").value("2026-10-06T12:00:00Z"))
                .andExpect(jsonPath("$.data.recentAttempts.length()").value(5))
                .andExpect(jsonPath("$.data.recentAttempts[0].examId").value(exam.getExamId()))
                .andExpect(jsonPath("$.data.recentAttempts[0].examTitle").value("Quiz Unit 3"))
                .andExpect(jsonPath("$.data.recentAttempts[0].score").value(6))
                .andExpect(jsonPath("$.data.recentAttempts[0].status").value("COMPLETED"))
                .andExpect(jsonPath("$.data.recentAttempts[0].submittedAt").value("2026-10-06T12:00:00Z"))
                .andExpect(jsonPath("$.data.recentAttempts[4].score").value(2));
    }

    @Test
    void detailOfFreshUserHasNoActivityAndUnknownIdIsNotFound() throws Exception {
        call(admin, get(BASE + "/" + student.getUserId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.stats.coursesEnrolled").value(0))
                .andExpect(jsonPath("$.data.stats.examsTaken").value(0))
                .andExpect(jsonPath("$.data.stats.averageScore").doesNotExist())
                .andExpect(jsonPath("$.data.stats.lastActivityAt").doesNotExist())
                .andExpect(jsonPath("$.data.recentAttempts.length()").value(0));

        call(admin, get(BASE + "/999999")).andExpect(status().isNotFound());
    }

    @Test
    void updateRefreshesProfileAndNormalizesEmail() throws Exception {
        User target = account(User.ROLE_STUDENT, "Old Name", "old.mail@example.com", User.STATUS_ACTIVE);

        call(admin, put(BASE + "/" + target.getUserId()).contentType(MediaType.APPLICATION_JSON)
                        .content(updateBody("New Name", "New.Mail@Example.com",
                                User.ROLE_COURSE_MANAGER, User.STATUS_ACTIVE)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.userId").value(target.getUserId()))
                .andExpect(jsonPath("$.data.fullName").value("New Name"))
                .andExpect(jsonPath("$.data.email").value("new.mail@example.com"))
                .andExpect(jsonPath("$.data.role").value(User.ROLE_COURSE_MANAGER))
                .andExpect(jsonPath("$.data.status").value(User.STATUS_ACTIVE))
                .andExpect(jsonPath("$.data.createdAt").isNotEmpty());

        em.flush();
        em.clear();
        User reloaded = em.find(User.class, target.getUserId());
        assertEquals("New Name", reloaded.getFullName());
        assertEquals("new.mail@example.com", reloaded.getEmail());
        assertEquals(User.ROLE_COURSE_MANAGER, reloaded.getRoleName());
    }

    @Test
    void updateRejectsSelfRoleOrStatusChange() throws Exception {
        String body = updateBody("Admin User", admin.getEmail(), User.ROLE_STUDENT, User.STATUS_ACTIVE);
        call(admin, put(BASE + "/" + admin.getUserId()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Admins cannot change their own role or status."));

        body = updateBody("Admin User", admin.getEmail(), User.ROLE_ADMIN, User.STATUS_INACTIVE);
        call(admin, put(BASE + "/" + admin.getUserId()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Admins cannot change their own role or status."));

        // sending the same role and status the admin already has is a plain no-op edit
        body = updateBody("Renamed Admin", admin.getEmail(), User.ROLE_ADMIN, User.STATUS_ACTIVE);
        call(admin, put(BASE + "/" + admin.getUserId()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.fullName").value("Renamed Admin"));
    }

    @Test
    void updateRejectsDuplicateEmailOwnedByAnotherUser() throws Exception {
        User target = account(User.ROLE_STUDENT, "Target", "target@example.com", User.STATUS_ACTIVE);

        String body = updateBody("Target", manager.getEmail(), User.ROLE_STUDENT, User.STATUS_ACTIVE);
        call(admin, put(BASE + "/" + target.getUserId()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict());

        // keeping the user's own e-mail is obviously not a conflict
        body = updateBody("Target", "target@example.com", User.ROLE_STUDENT, User.STATUS_ACTIVE);
        call(admin, put(BASE + "/" + target.getUserId()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
    }

    @Test
    void updateValidatesFieldsAndUserExists() throws Exception {
        call(admin, put(BASE + "/999999").contentType(MediaType.APPLICATION_JSON)
                        .content(updateBody("Ghost", "ghost@example.com", User.ROLE_STUDENT, User.STATUS_ACTIVE)))
                .andExpect(status().isNotFound());

        User target = account(User.ROLE_STUDENT, "Validator", "validator@example.com", User.STATUS_ACTIVE);
        call(admin, put(BASE + "/" + target.getUserId()).contentType(MediaType.APPLICATION_JSON)
                        .content(updateBody("Validator", "validator@example.com", "BOGUS", User.STATUS_ACTIVE)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Unknown role: BOGUS"));
        call(admin, put(BASE + "/" + target.getUserId()).contentType(MediaType.APPLICATION_JSON)
                        .content(updateBody("Validator", "validator@example.com", User.ROLE_STUDENT, "BOGUS")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Unknown status: BOGUS"));
        call(admin, put(BASE + "/" + target.getUserId()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fullName\":\"Validator\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Validation failed for request parameters"));
    }

    @Test
    void updateToInactiveRevokesEverySessionOfThatUserOnly() throws Exception {
        User target = account(User.ROLE_STUDENT, "Doomed", "doomed@example.com", User.STATUS_ACTIVE);
        RefreshToken first = token(target);
        RefreshToken second = token(target);
        RefreshToken foreign = token(student);

        call(admin, put(BASE + "/" + target.getUserId()).contentType(MediaType.APPLICATION_JSON)
                        .content(updateBody("Doomed", "doomed@example.com", User.ROLE_STUDENT, User.STATUS_INACTIVE)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value(User.STATUS_INACTIVE));

        em.flush();
        em.clear();
        assertNotNull(em.find(RefreshToken.class, first.getRefreshTokenId()).getRevokedAt());
        assertNotNull(em.find(RefreshToken.class, second.getRefreshTokenId()).getRevokedAt());
        assertNull(em.find(RefreshToken.class, foreign.getRefreshTokenId()).getRevokedAt());
    }

    @Test
    void statusEndpointTogglesAccountAndRevokesSessionsOnDeactivate() throws Exception {
        User target = account(User.ROLE_STUDENT, "Toggle", "toggle@example.com", User.STATUS_ACTIVE);
        RefreshToken active = token(target);

        call(admin, patch(BASE + "/" + target.getUserId() + "/status").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"INACTIVE\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.userId").value(target.getUserId()))
                .andExpect(jsonPath("$.data.status").value(User.STATUS_INACTIVE));

        em.flush();
        em.clear();
        assertNotNull(em.find(RefreshToken.class, active.getRefreshTokenId()).getRevokedAt());
        assertEquals(User.STATUS_INACTIVE, em.find(User.class, target.getUserId()).getStatus());

        // reactivating is allowed and does not touch status again
        call(admin, patch(BASE + "/" + target.getUserId() + "/status").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"ACTIVE\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value(User.STATUS_ACTIVE));
        em.flush();
        em.clear();
        assertEquals(User.STATUS_ACTIVE, em.find(User.class, target.getUserId()).getStatus());
    }

    @Test
    void statusEndpointRejectsSelfDeactivationAndBadValues() throws Exception {
        call(admin, patch(BASE + "/" + admin.getUserId() + "/status").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"INACTIVE\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Admins cannot change their own role or status."));

        User target = account(User.ROLE_STUDENT, "Checker", "checker@example.com", User.STATUS_ACTIVE);
        call(admin, patch(BASE + "/" + target.getUserId() + "/status").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"BOGUS\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Unknown status: BOGUS"));
        call(admin, patch(BASE + "/" + target.getUserId() + "/status").contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Validation failed for request parameters"));
        call(admin, patch(BASE + "/999999/status").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"INACTIVE\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void resetPasswordPersistsOneTokenAndAlwaysAcknowledges() throws Exception {
        User target = account(User.ROLE_STUDENT, "Reset Me", "reset.me@example.com", User.STATUS_ACTIVE);

        call(admin, post(BASE + "/" + target.getUserId() + "/reset-password"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Password reset email sent."))
                .andExpect(jsonPath("$.data").doesNotExist());

        em.flush();
        em.clear();
        assertEquals(1L, em.createQuery("select count(t) from PasswordResetToken t where t.user.userId = :id", Long.class)
                .setParameter("id", target.getUserId()).getSingleResult());
        PasswordResetToken stored = em.createQuery(
                        "select t from PasswordResetToken t where t.user.userId = :id", PasswordResetToken.class)
                .setParameter("id", target.getUserId()).getSingleResult();
        assertNotNull(stored.getTokenHash());
        assertFalse(stored.getTokenHash().isBlank());
        assertNull(stored.getUsedAt());
        // 15 minute validity window, same as AUTH-06
        assertTrue(stored.getExpiresAt().isAfter(Instant.now().plusSeconds(800)));
        assertTrue(stored.getExpiresAt().isBefore(Instant.now().plusSeconds(1000)));

        call(admin, post(BASE + "/999999/reset-password")).andExpect(status().isNotFound());
    }

    @Test
    void loginRecordsLastLoginAtAndFailureLeavesItUnset() throws Exception {
        User target = User.builder().email(UUID.randomUUID() + "@example.com").fullName("Login User")
                .passwordHash(encoder.encode("Secret123!")).roleName(User.ROLE_STUDENT).build();
        em.persist(target);

        mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(
                                Map.of("email", target.getEmail(), "password", "Secret123!"))))
                .andExpect(status().isOk());
        em.flush();
        assertNotNull(repository.findById(target.getUserId()).orElseThrow().getLastLoginAt());

        User untouched = User.builder().email(UUID.randomUUID() + "@example.com").fullName("No Login User")
                .passwordHash(encoder.encode("Secret123!")).roleName(User.ROLE_STUDENT).build();
        em.persist(untouched);

        mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(
                                Map.of("email", untouched.getEmail(), "password", "wrong-password"))))
                .andExpect(status().isUnauthorized());
        em.flush();
        assertNull(repository.findById(untouched.getUserId()).orElseThrow().getLastLoginAt());
    }

    private ResultActions call(User actor, MockHttpServletRequestBuilder request) throws Exception {
        em.flush();
        return mvc.perform(request.with(user(UserPrincipal.create(actor))));
    }

    private User account(String role, String fullName, String status) {
        return account(role, fullName, UUID.randomUUID() + "@example.com", status);
    }

    private User account(String role, String fullName, String email, String status) {
        User value = User.builder().email(email).fullName(fullName)
                .passwordHash("test-hash").roleName(role).status(status).build();
        em.persist(value);
        return value;
    }

    private Course course(String title) {
        Category category = Category.builder().name("Category").slug(UUID.randomUUID().toString()).build();
        em.persist(category);
        Course value = Course.builder().categoryId(category.getCategoryId()).category(category).manager(admin)
                .title(title).slug(UUID.randomUUID().toString()).isPublished(false).build();
        em.persist(value);
        return value;
    }

    private void enroll(User actor, Course target) {
        em.persist(Enrollment.builder().course(target).user(actor)
                .enrolledAt(Instant.now()).status(Enrollment.STATUS_ACTIVE).build());
    }

    private Exam exam(String title) {
        Exam value = Exam.builder().createdBy(admin).title(title).durationMinutes(30)
                .isPractice(true).generationType("MANUAL").build();
        em.persist(value);
        return value;
    }

    private void attempt(Exam target, User actor, int score, Instant submittedAt) {
        em.persist(ExamAttempt.builder().exam(target).user(actor)
                .startTime(submittedAt.minusSeconds(600)).submitTime(submittedAt)
                .totalScore(BigDecimal.valueOf(score)).status("COMPLETED").build());
    }

    private RefreshToken token(User owner) {
        RefreshToken value = RefreshToken.builder().user(owner).tokenHash(UUID.randomUUID().toString())
                .expiresAt(Instant.now().plusSeconds(3600)).build();
        em.persist(value);
        return value;
    }

    private static String updateBody(String fullName, String email, String role, String status) {
        return "{\"fullName\":\"" + fullName + "\",\"email\":\"" + email
                + "\",\"role\":\"" + role + "\",\"status\":\"" + status + "\"}";
    }
}
