package com.examprep.controllers;

import com.examprep.entities.Notification;
import com.examprep.entities.User;
import com.examprep.entities.UserNotification;
import com.examprep.security.UserPrincipal;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * NT-01 … NT-03 (spec 23): the inbox only shows the caller's notifications, newest first, keeps an
 * accurate unread badge, and both read endpoints are owner-scoped and idempotent.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
public class StudentNotificationApiIntegrationTest {

    private static final Instant BASE = Instant.parse("2026-05-01T00:00:00Z");

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired EntityManager em;

    User student, other, manager;
    Notification readItem, unreadItem, newestItem, otherItem;
    UserNotification readRow, unreadRow, newestRow, otherRow;

    @BeforeEach
    void fixtures() {
        student = account(User.ROLE_STUDENT);
        other = account(User.ROLE_STUDENT);
        manager = account(User.ROLE_COURSE_MANAGER);
        readItem = notification("Old read", "You passed chapter 1", "SYSTEM", "/student/exams/1");
        unreadItem = notification("Midterm soon", "You have 3 days", "EXAM_REMINDER", "/student/exams/8");
        newestItem = notification("New tip", "Try spaced repetition", "TIP", null);
        otherItem = notification("Other inbox", "not yours", "SYSTEM", null);
        readRow = inbox(student, readItem, true);
        unreadRow = inbox(student, unreadItem, false);
        newestRow = inbox(student, newestItem, false);
        otherRow = inbox(other, otherItem, false);
        em.flush();
        // Auditing stamps created_at on insert, so pin the order afterwards.
        pin(readItem, BASE);
        pin(unreadItem, BASE.plusSeconds(60));
        pin(newestItem, BASE.plusSeconds(120));
        pin(otherItem, BASE.plusSeconds(180));
        em.clear();
    }

    // =================================================================================
    // NT-01
    // =================================================================================

    @Test
    void inboxIsOwnerScopedNewestFirstAndReportsTheUnreadBadge() throws Exception {
        MvcResult result = call(student, get("/api/v1/student/notifications"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.unreadCount").value(2))
                .andExpect(jsonPath("$.data.content.length()").value(3))
                .andExpect(jsonPath("$.data.page").value(0))
                .andExpect(jsonPath("$.data.size").value(20))
                .andExpect(jsonPath("$.data.totalElements").value(3))
                .andExpect(jsonPath("$.data.totalPages").value(1))
                .andExpect(jsonPath("$.data.first").value(true))
                .andExpect(jsonPath("$.data.last").value(true))
                .andReturn();
        JsonNode content = data(result).path("content");

        assertEquals(newestItem.getNotificationId(), content.get(0).path("notificationId").asLong());
        assertEquals("New tip", content.get(0).path("title").asText());
        assertEquals("Try spaced repetition", content.get(0).path("body").asText());
        assertEquals("TIP", content.get(0).path("type").asText());
        assertFalse(content.get(0).has("link"));
        assertFalse(content.get(0).path("isRead").asBoolean());
        assertEquals(BASE.plusSeconds(120), Instant.parse(content.get(0).path("createdAt").asText()));
        assertEquals(unreadItem.getNotificationId(), content.get(1).path("notificationId").asLong());
        assertEquals("/student/exams/8", content.get(1).path("link").asText());
        assertEquals(readItem.getNotificationId(), content.get(2).path("notificationId").asLong());
        assertTrue(content.get(2).path("isRead").asBoolean());

        // The other student's notification is neither listed nor counted in the badge.
        assertTrue(content.findValuesAsText("title").stream().noneMatch("Other inbox"::equals));

        JsonNode unreadOnly = data(call(student, get("/api/v1/student/notifications")
                .param("unreadOnly", "true")).andExpect(status().isOk()));
        assertEquals(2, unreadOnly.path("content").size());
        assertEquals(2L, unreadOnly.path("totalElements").asLong());
        assertEquals(2, unreadOnly.path("unreadCount").asInt());
        assertEquals(newestItem.getNotificationId(), unreadOnly.path("content").get(0).path("notificationId").asLong());
        assertEquals(unreadItem.getNotificationId(), unreadOnly.path("content").get(1).path("notificationId").asLong());

        JsonNode page1 = data(call(student, get("/api/v1/student/notifications")
                .param("page", "1").param("size", "2")).andExpect(status().isOk()));
        assertEquals(1, page1.path("content").size());
        assertEquals(1, page1.path("page").asInt());
        assertEquals(2, page1.path("size").asInt());
        assertEquals(3L, page1.path("totalElements").asLong());
        assertEquals(2, page1.path("totalPages").asInt());
        assertFalse(page1.path("first").asBoolean());
        assertTrue(page1.path("last").asBoolean());
        assertEquals(readItem.getNotificationId(), page1.path("content").get(0).path("notificationId").asLong());

        // The other student only sees their own single notification.
        JsonNode otherInbox = data(call(other, get("/api/v1/student/notifications")).andExpect(status().isOk()));
        assertEquals(1, otherInbox.path("content").size());
        assertEquals(1, otherInbox.path("unreadCount").asInt());
        assertEquals(otherItem.getNotificationId(), otherInbox.path("content").get(0).path("notificationId").asLong());

        call(manager, get("/api/v1/student/notifications")).andExpect(status().isForbidden());
        mvc.perform(get("/api/v1/student/notifications")).andExpect(status().isUnauthorized());
        call(student, get("/api/v1/student/notifications").param("page", "-1"))
                .andExpect(status().isBadRequest());
        call(student, get("/api/v1/student/notifications").param("size", "0"))
                .andExpect(status().isBadRequest());
        call(student, get("/api/v1/student/notifications").param("size", "101"))
                .andExpect(status().isBadRequest());
    }

    // =================================================================================
    // NT-02
    // =================================================================================

    @Test
    void markReadIsIdempotentOwnerScopedAndUpdatesTheBadge() throws Exception {
        JsonNode first = data(call(student, post("/api/v1/student/notifications/"
                + unreadItem.getNotificationId() + "/read")).andExpect(status().isOk()));
        assertEquals(unreadItem.getNotificationId(), first.path("notificationId").asLong());
        assertTrue(first.path("isRead").asBoolean());
        assertEquals(1, first.path("unreadCount").asInt());
        assertTrue(rowOf(unreadItem).getIsRead());

        // Idempotent: a second call succeeds and the badge does not move again.
        JsonNode second = data(call(student, post("/api/v1/student/notifications/"
                + unreadItem.getNotificationId() + "/read")).andExpect(status().isOk()));
        assertTrue(second.path("isRead").asBoolean());
        assertEquals(1, second.path("unreadCount").asInt());

        // Reading an already-read notification keeps the badge untouched.
        JsonNode alreadyRead = data(call(student, post("/api/v1/student/notifications/"
                + readItem.getNotificationId() + "/read")).andExpect(status().isOk()));
        assertTrue(alreadyRead.path("isRead").asBoolean());
        assertEquals(1, alreadyRead.path("unreadCount").asInt());

        JsonNode unreadOnly = data(call(student, get("/api/v1/student/notifications")
                .param("unreadOnly", "true")).andExpect(status().isOk()));
        assertEquals(1, unreadOnly.path("content").size());
        assertEquals(newestItem.getNotificationId(), unreadOnly.path("content").get(0).path("notificationId").asLong());

        call(student, post("/api/v1/student/notifications/" + otherItem.getNotificationId() + "/read"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Notification not found"));
        assertFalse(rowOf(otherItem).getIsRead());

        call(student, post("/api/v1/student/notifications/" + Long.MAX_VALUE + "/read"))
                .andExpect(status().isNotFound());
        call(manager, post("/api/v1/student/notifications/" + unreadItem.getNotificationId() + "/read"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/student/notifications/" + unreadItem.getNotificationId() + "/read"))
                .andExpect(status().isUnauthorized());
    }

    // =================================================================================
    // NT-03
    // =================================================================================

    @Test
    void markAllReadOnlyTouchesTheCallersRowsAndIsIdempotent() throws Exception {
        JsonNode first = data(call(student, post("/api/v1/student/notifications/read-all"))
                .andExpect(status().isOk()));
        assertEquals(2, first.path("markedCount").asInt());
        assertEquals(0, first.path("unreadCount").asInt());
        assertTrue(rowOf(readItem).getIsRead());
        assertTrue(rowOf(unreadItem).getIsRead());
        assertTrue(rowOf(newestItem).getIsRead());
        assertFalse(rowOf(otherItem).getIsRead());
        assertEquals(0, data(call(student, get("/api/v1/student/notifications"))
                .andExpect(status().isOk())).path("unreadCount").asInt());

        // Nothing left to mark: the call still succeeds and reports zero.
        JsonNode second = data(call(student, post("/api/v1/student/notifications/read-all"))
                .andExpect(status().isOk()));
        assertEquals(0, second.path("markedCount").asInt());
        assertEquals(0, second.path("unreadCount").asInt());

        // The other student's unread rows were not touched.
        JsonNode otherInbox = data(call(other, get("/api/v1/student/notifications")).andExpect(status().isOk()));
        assertEquals(1, otherInbox.path("unreadCount").asInt());
        assertEquals(1, data(call(other, get("/api/v1/student/notifications")
                .param("unreadOnly", "true")).andExpect(status().isOk())).path("content").size());

        call(manager, post("/api/v1/student/notifications/read-all")).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/student/notifications/read-all")).andExpect(status().isUnauthorized());
    }

    // =================================================================================
    // helpers
    // =================================================================================

    private ResultActions call(User actor, MockHttpServletRequestBuilder request) throws Exception {
        em.flush();
        return mvc.perform(request.with(user(UserPrincipal.create(actor))));
    }

    private JsonNode data(MvcResult result) throws Exception {
        return json.readTree(result.getResponse().getContentAsString()).path("data");
    }

    private JsonNode data(ResultActions actions) throws Exception {
        return data(actions.andReturn());
    }

    private UserNotification rowOf(Notification notification) {
        return em.createQuery("select un from UserNotification un where un.notification.notificationId = :id",
                        UserNotification.class)
                .setParameter("id", notification.getNotificationId())
                .getSingleResult();
    }

    private User account(String role) {
        User user = User.builder().email(UUID.randomUUID() + "@example.com").fullName(role)
                .passwordHash("test").roleName(role).build();
        em.persist(user);
        return user;
    }

    private Notification notification(String title, String content, String type, String link) {
        Notification notification = Notification.builder().title(title).content(content).type(type)
                .link(link).build();
        em.persist(notification);
        return notification;
    }

    private UserNotification inbox(User owner, Notification notification, boolean isRead) {
        UserNotification row = UserNotification.builder().user(owner).notification(notification)
                .isRead(isRead).build();
        em.persist(row);
        return row;
    }

    private void pin(Notification notification, Instant createdAt) {
        em.createQuery("update Notification n set n.createdAt = :createdAt where n.notificationId = :id")
                .setParameter("createdAt", createdAt)
                .setParameter("id", notification.getNotificationId())
                .executeUpdate();
    }
}
