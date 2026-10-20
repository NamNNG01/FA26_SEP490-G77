package com.examprep.controllers;

import com.examprep.entities.User;
import com.examprep.security.UserPrincipal;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class AdminUserApiIntegrationTest {
    private static final String PATH = "/api/v1/admin/users";
    @Autowired MockMvc mvc;
    @Autowired EntityManager em;

    @Test
    void adminListsActiveCourseManagersForTheCourseManagerDropdown() throws Exception {
        User admin = account(User.ROLE_ADMIN, User.STATUS_ACTIVE);
        User active = account(User.ROLE_COURSE_MANAGER, User.STATUS_ACTIVE);
        User banned = account(User.ROLE_COURSE_MANAGER, "BANNED");
        em.flush();

        mvc.perform(get(PATH).param("role", "COURSE_MANAGER").param("status", "ACTIVE").param("size", "100")
                        .with(user(UserPrincipal.create(admin))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[*].userId").value(hasItem(active.getUserId().intValue())))
                .andExpect(jsonPath("$.data.content[*].userId").value(not(hasItem(banned.getUserId().intValue()))))
                .andExpect(jsonPath("$.data.content[*].userId").value(not(hasItem(admin.getUserId().intValue()))))
                .andExpect(jsonPath("$.data.content[*].passwordHash").doesNotExist());

        mvc.perform(get(PATH).with(user(UserPrincipal.create(active)))).andExpect(status().isForbidden());
        mvc.perform(get(PATH).param("size", "0").with(user(UserPrincipal.create(admin)))).andExpect(status().isBadRequest());
    }

    private User account(String role, String status) {
        User value = User.builder().email(UUID.randomUUID() + "@example.com").fullName(role)
                .passwordHash("test-password-hash").roleName(role).status(status).build();
        em.persist(value);
        return value;
    }
}
