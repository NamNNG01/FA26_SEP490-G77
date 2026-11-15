package com.examprep.controllers;

import com.examprep.entities.User;
import com.examprep.security.UserPrincipal;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * AS-01/AS-02: the admin System Settings document is stored and returned verbatim, so the screen
 * never reports a save that did not happen and a reload reads back what was saved.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class AdminSettingsApiIntegrationTest {

    private static final String BASE = "/api/v1/admin/settings";

    @Autowired MockMvc mvc;
    @Autowired EntityManager em;

    User admin, student;

    @BeforeEach
    void fixtures() {
        admin = account(User.ROLE_ADMIN);
        student = account(User.ROLE_STUDENT);
    }

    @Test
    void settingsAreStoredAndReadBackVerbatim() throws Exception {
        mvc.perform(get(BASE).with(user(UserPrincipal.create(admin))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data").isEmpty());

        String document = "{\"general\":{\"platformName\":\"PrepExam Admin\",\"supportEmail\":\"ops@example.com\"},"
                + "\"security\":{\"minPasswordLength\":\"10\"}}";
        mvc.perform(put(BASE).with(user(UserPrincipal.create(admin)))
                .contentType(MediaType.APPLICATION_JSON).content(document))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Settings saved."))
                .andExpect(jsonPath("$.data.general.platformName").value("PrepExam Admin"));

        // A reload reads exactly what was saved.
        mvc.perform(get(BASE).with(user(UserPrincipal.create(admin))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.general.platformName").value("PrepExam Admin"))
                .andExpect(jsonPath("$.data.security.minPasswordLength").value("10"));
    }

    @Test
    void settingsRejectNonObjectsAndNonAdmins() throws Exception {
        mvc.perform(get(BASE)).andExpect(status().isUnauthorized());
        mvc.perform(get(BASE).with(user(UserPrincipal.create(student)))).andExpect(status().isForbidden());
        mvc.perform(put(BASE).with(user(UserPrincipal.create(student)))
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        mvc.perform(put(BASE).with(user(UserPrincipal.create(admin)))
                .contentType(MediaType.APPLICATION_JSON).content("[1,2]"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Settings must be a JSON object"));
    }

    private User account(String role) {
        User user = User.builder().email(UUID.randomUUID() + "@example.com").fullName(role)
                .passwordHash("test").roleName(role).build();
        em.persist(user);
        return user;
    }
}
