package com.examprep.controllers;

import com.examprep.security.UserPrincipal;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("postgres-test")
@EnabledIfSystemProperty(named = "postgresTests", matches = "true")
class ManagerCourseConcurrencyPostgresTest {
    @Autowired private MockMvc mvc;
    @Autowired private JdbcTemplate db;
    private long managerId;
    private long replacementId;
    private long categoryId;
    private long courseId;

    @BeforeEach
    void fixtures() {
        managerId = account();
        replacementId = account();
        categoryId = db.queryForObject("INSERT INTO categories(name,slug) VALUES ('Concurrency',?) RETURNING category_id", Long.class, UUID.randomUUID().toString());
        courseId = db.queryForObject("INSERT INTO courses(category_id,manager_id,title,slug) VALUES (?,?,'Concurrent course',?) RETURNING course_id",
                Long.class, categoryId, managerId, UUID.randomUUID().toString());
    }

    @AfterEach
    void cleanup() {
        db.update("DELETE FROM modules WHERE course_id = ?", courseId);
        db.update("DELETE FROM courses WHERE course_id = ?", courseId);
        db.update("DELETE FROM categories WHERE category_id = ?", categoryId);
        db.update("DELETE FROM users WHERE user_id IN (?,?)", managerId, replacementId);
    }

    @Test
    void simultaneousAppendsReceiveDistinctSequentialPositions() throws Exception {
        List<MvcResult> results = concurrently(
                () -> call(managerId, "COURSE_MANAGER", post(path() + "/modules").content("{\"title\":\"One\"}")),
                () -> call(managerId, "COURSE_MANAGER", post(path() + "/modules").content("{\"title\":\"Two\"}")));
        for (MvcResult result : results) assertEquals(201, result.getResponse().getStatus(), result.getResponse().getContentAsString());
        assertEquals(List.of(1, 2), db.queryForList("SELECT order_index FROM modules WHERE course_id = ? ORDER BY order_index", Integer.class, courseId));
    }

    @Test
    void publishRacingLastModuleDeletionCannotLeavePublishedEmptyCourse() throws Exception {
        long moduleId = db.queryForObject("INSERT INTO modules(course_id,title,order_index) VALUES (?,'Only',1) RETURNING module_id", Long.class, courseId);
        List<MvcResult> results = concurrently(
                () -> call(replacementId, "ADMIN", patch(path() + "/publish").content("{\"isPublished\":true}")),
                () -> call(managerId, "COURSE_MANAGER", delete("/api/v1/manager/modules/" + moduleId)));
        int publishStatus = results.get(0).getResponse().getStatus();
        int deleteStatus = results.get(1).getResponse().getStatus();
        assertTrue((publishStatus == 200 && deleteStatus == 409) || (publishStatus == 400 && deleteStatus == 200),
                "publish=" + publishStatus + ", delete=" + deleteStatus);
        Boolean published = db.queryForObject("SELECT is_published FROM courses WHERE course_id = ?", Boolean.class, courseId);
        int modules = db.queryForObject("SELECT count(*) FROM modules WHERE course_id = ?", Integer.class, courseId);
        assertFalse(Boolean.TRUE.equals(published) && modules == 0);
    }

    @Test
    void transferRacingOldManagerEditDoesNotRestoreOldOwnership() throws Exception {
        List<MvcResult> results = concurrently(
                () -> call(replacementId, "ADMIN", put(path()).content("{\"managerId\":" + replacementId + "}")),
                () -> call(managerId, "COURSE_MANAGER", put(path()).content("{\"title\":\"An allowed edit before transfer\"}")));
        assertEquals(200, results.get(0).getResponse().getStatus());
        assertTrue(List.of(200, 403).contains(results.get(1).getResponse().getStatus()));
        assertEquals(replacementId, db.queryForObject("SELECT manager_id FROM courses WHERE course_id = ?", Long.class, courseId));
        assertEquals(403, call(managerId, "COURSE_MANAGER", get(path())).getResponse().getStatus());
    }

    private long account() {
        return db.queryForObject("INSERT INTO users(email,password_hash,full_name,role_name) VALUES (?,'test-only','Concurrent manager','COURSE_MANAGER') RETURNING user_id",
                Long.class, UUID.randomUUID() + "@example.com");
    }

    private String path() { return "/api/v1/manager/courses/" + courseId; }

    private MvcResult call(long userId, String role, MockHttpServletRequestBuilder request) throws Exception {
        return mvc.perform(request.contentType(MediaType.APPLICATION_JSON)
                .with(user(UserPrincipal.create(userId, "test@example.com", role)))).andReturn();
    }

    private List<MvcResult> concurrently(Callable<MvcResult> first, Callable<MvcResult> second) throws Exception {
        var executor = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            var futures = List.of(first, second).stream().map(action -> executor.submit(() -> {
                ready.countDown();
                if (!start.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Concurrent request did not start");
                return action.call();
            })).toList();
            assertTrue(ready.await(10, TimeUnit.SECONDS));
            start.countDown();
            return List.of(futures.get(0).get(20, TimeUnit.SECONDS), futures.get(1).get(20, TimeUnit.SECONDS));
        } finally {
            start.countDown();
            executor.shutdownNow();
            assertTrue(executor.awaitTermination(10, TimeUnit.SECONDS));
        }
    }
}
