package com.examprep.controllers;

import com.examprep.entities.Category;
import com.examprep.entities.Course;
import com.examprep.entities.User;
import com.examprep.security.UserPrincipal;
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

import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class CategoryApiIntegrationTest {
    private static final String PATH = "/api/v1/admin/categories";
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired EntityManager em;
    private User admin;
    private User manager;

    @BeforeEach
    void fixtures() {
        admin = account(User.ROLE_ADMIN);
        manager = account(User.ROLE_COURSE_MANAGER);
    }

    @Test
    void administrationRequiresAdminAndPublicListRequiresNoToken() throws Exception {
        mvc.perform(get(PATH)).andExpect(status().isUnauthorized());
        for (MockHttpServletRequestBuilder request : new MockHttpServletRequestBuilder[]{
                get(PATH), get(PATH + "/tree"), post(PATH).contentType(MediaType.APPLICATION_JSON).content("{}"),
                put(PATH + "/1").contentType(MediaType.APPLICATION_JSON).content("{}"), delete(PATH + "/1")}) {
            call(manager, request).andExpect(status().isForbidden());
        }
        mvc.perform(get("/api/v1/categories")).andExpect(status().isOk());
    }

    @Test
    void createWithoutCodeGeneratesSlugPersistsDescriptionAndBuildsBothSortedLists() throws Exception {
        long second = create(Map.of("name", "Lớp Đặc Biệt", "description", "Desc 2", "sortOrder", 2));
        long first = create(Map.of("name", "First Category", "sortOrder", 1));
        call(admin, get(PATH)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].categoryId").value(first))
                .andExpect(jsonPath("$.data.items[0].slug").value("first-category"))
                .andExpect(jsonPath("$.data.items[0].isActive").value(true))
                .andExpect(jsonPath("$.data.items[0].code").doesNotExist())
                .andExpect(jsonPath("$.data.items[1].categoryId").value(second))
                .andExpect(jsonPath("$.data.items[1].slug").value("lop-dac-biet"))
                .andExpect(jsonPath("$.data.items[1].description").value("Desc 2"))
                .andExpect(jsonPath("$.data.items[1].isActive").value(true))
                .andExpect(jsonPath("$.data.items[1].code").doesNotExist())
                .andExpect(jsonPath("$.data.items[1].parentId").doesNotExist())
                .andExpect(jsonPath("$.data.items[1].children").doesNotExist())
                .andExpect(jsonPath("$.data.items[1].isDeleted").doesNotExist());
        call(admin, get(PATH + "/tree")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data[1].label").value("Lớp Đặc Biệt"))
                .andExpect(jsonPath("$.data[1].value").value(second))
                .andExpect(jsonPath("$.data[1].disabled").value(false))
                .andExpect(jsonPath("$.data[1].children").doesNotExist());
        JsonNode publicData = data(mvc.perform(get("/api/v1/categories")).andExpect(status().isOk()));
        assertEquals(2, publicData.size());
        assertNull(publicData.get(0).get("parentId"));
        assertNull(publicData.get(0).get("parentName"));
    }

    @Test
    void slugCollisionsReceiveDeterministicSuffixes() throws Exception {
        long first = create(Map.of("name", "Java Basics"));
        long second = create(Map.of("name", "Java Basics"));
        long third = create(Map.of("name", "Java Basics"));

        call(admin, get(PATH)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[?(@.categoryId==" + first + ")].slug").value("java-basics"))
                .andExpect(jsonPath("$.data.items[?(@.categoryId==" + second + ")].slug").value("java-basics-2"))
                .andExpect(jsonPath("$.data.items[?(@.categoryId==" + third + ")].slug").value("java-basics-3"));
    }

    @Test
    void rejectsInvalidNamesAndOverlongDescriptionsWithoutRequiringCode() throws Exception {
        for (Map<String, ?> payload : java.util.List.of(
                Map.of("description", "Missing name"),
                Map.of("name", " "),
                Map.of("name", "\u2003"),
                Map.of("name", "A".repeat(256)),
                Map.of("name", "Valid", "description", "D".repeat(1001)))) {
            write(post(PATH), payload).andExpect(status().isBadRequest());
        }
        create(Map.of("name", "A".repeat(255), "description", "D".repeat(1000)));
    }

    @Test
    void partialUpdatePreservesSlugAndUpdatesOrClearsDescription() throws Exception {
        long id = create(Map.of("name", "Item One", "description", "Initial description"));
        write(put(PATH + "/" + id), Map.of("name", "Renamed", "sortOrder", 6, "isActive", false))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.code").doesNotExist())
                .andExpect(jsonPath("$.data.slug").value("item-one"))
                .andExpect(jsonPath("$.data.description").value("Initial description"))
                .andExpect(jsonPath("$.data.name").value("Renamed"))
                .andExpect(jsonPath("$.data.sortOrder").value(6))
                .andExpect(jsonPath("$.data.isActive").value(false));
        call(admin, get(PATH + "/tree")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].disabled").value(true));

        // Explicit empty string clears description
        write(put(PATH + "/" + id), Map.of("description", ""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.description").doesNotExist());

        // Set again then clear with explicit null
        write(put(PATH + "/" + id), Map.of("description", "Restored"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.description").value("Restored"));
        call(admin, put(PATH + "/" + id).contentType(MediaType.APPLICATION_JSON).content("{\"description\":null}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.description").doesNotExist());
    }

    @Test
    void updateRejectsMissingIdsAndInvalidFieldsWithoutPartialWrites() throws Exception {
        long root = create(Map.of("name", "Root", "description", "Keep me"));
        write(put(PATH + "/" + Long.MAX_VALUE), Map.of("name", "Missing")).andExpect(status().isNotFound());
        write(put(PATH + "/" + root), Map.of("name", " ")).andExpect(status().isBadRequest());
        write(put(PATH + "/" + root), Map.of("name", "A".repeat(256))).andExpect(status().isBadRequest());
        write(put(PATH + "/" + root), Map.of("description", "D".repeat(1001))).andExpect(status().isBadRequest());
        call(admin, get(PATH)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].name").value("Root"))
                .andExpect(jsonPath("$.data.items[0].description").value("Keep me"));
    }

    @Test
    void deletionProtectsChildrenAndCoursesThenSoftDeletes() throws Exception {
        long parentId = create(Map.of("name", "Parent"));
        long childId = create(Map.of("name", "Child", "parentId", parentId));
        call(admin, delete(PATH + "/" + parentId)).andExpect(status().isConflict());

        // Delete child first so parent has no active children, then attach a course to parent
        call(admin, delete(PATH + "/" + childId)).andExpect(status().isOk());

        Category entity = em.find(Category.class, parentId);
        Course course = Course.builder().categoryId(parentId).category(entity).manager(manager)
                .title("Dependency").slug(UUID.randomUUID().toString()).isPublished(false).build();
        em.persist(course);
        call(admin, delete(PATH + "/" + parentId)).andExpect(status().isConflict());
        em.remove(course);

        call(admin, delete(PATH + "/" + parentId)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data").doesNotExist());
        assertNotNull(em.find(Category.class, parentId));
        call(admin, get(PATH)).andExpect(status().isOk()).andExpect(jsonPath("$.data.items").isEmpty());
        call(admin, delete(PATH + "/" + parentId)).andExpect(status().isNotFound());
    }

    @Test
    void publicListOmitsInactiveAndDeleted() throws Exception {
        create(Map.of("name", "Hidden", "isActive", false));
        long deleted = create(Map.of("name", "Deleted"));
        call(admin, delete(PATH + "/" + deleted)).andExpect(status().isOk());
        long visible = create(Map.of("name", "Visible"));
        mvc.perform(get("/api/v1/categories")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].categoryId").value(visible));
    }

    @Test
    void successfulMutationsPersistAuditEventsWithActor() throws Exception {
        long id = create(Map.of("name", "Audit"));
        write(put(PATH + "/" + id), Map.of("name", "Changed")).andExpect(status().isOk());
        call(admin, delete(PATH + "/" + id)).andExpect(status().isOk());
        em.flush();
        assertEquals(java.util.List.of("ADMIN_CATEGORY_CREATED", "ADMIN_CATEGORY_UPDATED", "ADMIN_CATEGORY_DELETED"),
                em.createNativeQuery("select event_type from category_audit_events where category_id = :id and actor_id = :actor order by audit_id")
                        .setParameter("id", id).setParameter("actor", admin.getUserId()).getResultList());
    }

    private long create(Map<String, ?> payload) throws Exception {
        return data(write(post(PATH), payload).andExpect(status().isCreated())).get("categoryId").asLong();
    }

    private ResultActions write(MockHttpServletRequestBuilder request, Map<String, ?> payload) throws Exception {
        return call(admin, request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(payload)));
    }

    private ResultActions call(User actor, MockHttpServletRequestBuilder request) throws Exception {
        em.flush();
        return mvc.perform(request.with(user(UserPrincipal.create(actor))));
    }

    private JsonNode data(ResultActions response) throws Exception {
        return json.readTree(response.andReturn().getResponse().getContentAsString()).get("data");
    }

    private User account(String role) {
        User value = User.builder().email(UUID.randomUUID() + "@example.com").fullName(role)
                .passwordHash("test-password-hash").roleName(role).build();
        em.persist(value);
        return value;
    }
}
