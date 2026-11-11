package com.examprep.controllers;

import com.examprep.entities.*;
import com.examprep.security.UserPrincipal;
import com.examprep.services.MaterialStorage;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** USER-03 avatar, C-15 course thumbnail, D3 manager media upload. Cloudinary itself is mocked. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ImageUploadApiIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @MockBean MaterialStorage storage;

    private final MockMultipartFile png = new MockMultipartFile("file", "a.png", "image/png", new byte[]{(byte) 0x89, 'P', 'N', 'G'});
    private User manager, stranger, student;
    private Course course;

    @BeforeEach
    void fixtures() {
        manager = account(User.ROLE_COURSE_MANAGER);
        stranger = account(User.ROLE_COURSE_MANAGER);
        student = account(User.ROLE_STUDENT);
        Category category = Category.builder().name("Img").slug(UUID.randomUUID().toString()).build();
        em.persist(category);
        course = Course.builder().categoryId(category.getCategoryId()).category(category).manager(manager)
                .title("Course").slug(UUID.randomUUID().toString()).price(BigDecimal.ZERO).isPublished(false).build();
        em.persist(course);
        em.flush();
        when(storage.storeImage(anyString(), any(byte[].class), anyBoolean())).thenAnswer(inv ->
                new MaterialStorage.StoredImage("https://cdn.test/" + inv.getArgument(0) + ".png", inv.getArgument(0), "png", 10, 10, 4));
    }

    @Test void avatarUploadStoresTheUrlOnTheUser() throws Exception {
        call(student, multipart("/api/v1/users/me/avatar").file(png))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.avatarUrl").value("https://cdn.test/avatars/user" + student.getUserId() + ".png"));
        verify(storage).storeImage(eq("avatars/user" + student.getUserId()), any(byte[].class), eq(true));
        em.flush();
        em.clear();
        assertEquals("https://cdn.test/avatars/user" + student.getUserId() + ".png", em.find(User.class, student.getUserId()).getAvatarUrl());
    }

    @Test void thumbnailUploadChecksCourseAccessBeforeStoring() throws Exception {
        call(stranger, multipart("/api/v1/manager/courses/" + course.getCourseId() + "/thumbnail").file(png))
                .andExpect(status().isForbidden());
        call(student, multipart("/api/v1/manager/courses/" + course.getCourseId() + "/thumbnail").file(png))
                .andExpect(status().isForbidden());
        call(manager, multipart("/api/v1/manager/courses/9223372036854775807/thumbnail").file(png))
                .andExpect(status().isNotFound());
        verifyNoInteractions(storage);

        String id = "courses/course" + course.getCourseId() + "/thumbnail";
        call(manager, multipart("/api/v1/manager/courses/" + course.getCourseId() + "/thumbnail").file(png))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.thumbnailUrl").value("https://cdn.test/" + id + ".png"));
        verify(storage).storeImage(eq(id), any(byte[].class), eq(true));
    }

    @Test void mediaUploadIsForManagersAndReturnsTheImage() throws Exception {
        call(student, multipart("/api/v1/manager/uploads").file(png)).andExpect(status().isForbidden());
        call(manager, multipart("/api/v1/manager/uploads").file(png))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.url").value(org.hamcrest.Matchers.startsWith("https://cdn.test/media/user" + manager.getUserId() + "/")))
                .andExpect(jsonPath("$.data.width").value(10))
                .andExpect(jsonPath("$.data.format").value("png"));
        verify(storage).storeImage(startsWith("media/user" + manager.getUserId() + "/"), any(byte[].class), eq(false));
    }

    @Test void studentUploadIsForStudents() throws Exception {
        call(manager, multipart("/api/v1/student/uploads").file(png)).andExpect(status().isForbidden());
        call(student, multipart("/api/v1/student/uploads").file(png))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.url").value(org.hamcrest.Matchers.startsWith("https://cdn.test/media/user" + student.getUserId() + "/")));
    }

    private ResultActions call(User actor, MockMultipartHttpServletRequestBuilder request) throws Exception {
        em.flush();
        return mvc.perform(request.with(user(UserPrincipal.create(actor))));
    }

    private User account(String role) {
        User user = User.builder().email(UUID.randomUUID() + "@example.com").fullName(role)
                .passwordHash("test-password-hash").roleName(role).build();
        em.persist(user);
        return user;
    }
}
