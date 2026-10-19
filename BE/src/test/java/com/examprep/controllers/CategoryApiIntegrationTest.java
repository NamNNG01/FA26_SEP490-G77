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
    void createNormalizesCodeAndBuildsBothSortedTrees() throws Exception {
        long root = create(Map.of("code", "  lớp-ĐẶC  ", "name", "Parent", "sortOrder", 2));
        long child = create(Map.of("code", "child", "name", "Child", "parentId", root));
        long first = create(Map.of("code", "first", "name", "First", "sortOrder", 1));
        call(admin, get(PATH)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].categoryId").value(first))
                .andExpect(jsonPath("$.data.items[1].code").value("LOP-DAC"))
                .andExpect(jsonPath("$.data.items[1].isActive").value(true))
                .andExpect(jsonPath("$.data.items[1].children[0].categoryId").value(child))
                .andExpect(jsonPath("$.data.items[1].children[0].sortOrder").value(0));
        call(admin, get(PATH + "/tree")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data[1].label").value("Parent"))
                .andExpect(jsonPath("$.data[1].value").value(root))
                .andExpect(jsonPath("$.data[1].disabled").value(false))
                .andExpect(jsonPath("$.data[1].children[0].categoryId").value(child));
        JsonNode publicData = data(mvc.perform(get("/api/v1/categories")).andExpect(status().isOk()));
        JsonNode publicChild = null;
        for (JsonNode node : publicData) if (node.get("categoryId").asLong() == child) publicChild = node;
        assertNotNull(publicChild);
        assertEquals("Parent", publicChild.get("parentName").asText());
        assertEquals(root, publicChild.get("parentId").asLong());
    }

    @Test
    void rejectsDuplicateNormalizedCodesInvalidParentsAndInvalidNames() throws Exception {
        create(Map.of("code", "lớp", "name", "A"));
        for (Map<String, ?> payload : java.util.List.of(
                Map.of("code", "LOP", "name", "Duplicate"), Map.of("code", " ", "name", "A"),
                Map.of("code", "\u2003", "name", "A"), Map.of("code", "ok", "name", "\u2003"),
                Map.of("code", "ok", "name", "A".repeat(256)))) {
            write(post(PATH), payload).andExpect(status().isBadRequest());
        }
        write(post(PATH), Map.of("code", "missing", "name", "A", "parentId", Long.MAX_VALUE))
                .andExpect(status().isNotFound());
        create(Map.of("code", "maximum", "name", "A".repeat(255)));
    }

    @Test
    void partialUpdateKeepsCodeAndOmittedParentButCanDetachExplicitly() throws Exception {
        long parent = create(Map.of("code", "parent", "name", "Parent"));
        long child = create(Map.of("code", "child", "name", "Child", "parentId", parent));
        write(put(PATH + "/" + child), Map.of("name", "Renamed", "sortOrder", 6, "isActive", false))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.code").value("CHILD"))
                .andExpect(jsonPath("$.data.parentId").value(parent)).andExpect(jsonPath("$.data.sortOrder").value(6));
        call(admin, get(PATH + "/tree")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].children[0].disabled").value(true));
        call(admin, put(PATH + "/" + child).contentType(MediaType.APPLICATION_JSON).content("{\"parentId\":null}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.parentId").doesNotExist());
        write(put(PATH + "/" + child), Map.of("code", "CHANGED"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void updateRejectsCyclesMissingIdsAndInvalidFieldsWithoutPartialWrites() throws Exception {
        long root = create(Map.of("code", "root", "name", "Root"));
        long child = create(Map.of("code", "child", "name", "Child", "parentId", root));
        long grandchild = create(Map.of("code", "grandchild", "name", "Grandchild", "parentId", child));
        for (long parent : new long[]{root, child, grandchild}) {
            write(put(PATH + "/" + root), Map.of("parentId", parent, "name", "Should not persist"))
                    .andExpect(status().isBadRequest());
        }
        write(put(PATH + "/" + root), Map.of("parentId", Long.MAX_VALUE)).andExpect(status().isNotFound());
        write(put(PATH + "/" + Long.MAX_VALUE), Map.of("name", "Missing")).andExpect(status().isNotFound());
        write(put(PATH + "/" + root), Map.of("name", " ")).andExpect(status().isBadRequest());
        write(put(PATH + "/" + root), Map.of("name", "A".repeat(256))).andExpect(status().isBadRequest());
        call(admin, get(PATH)).andExpect(status().isOk()).andExpect(jsonPath("$.data.items[0].name").value("Root"));
    }

    @Test
    void deletionProtectsChildrenAndCoursesThenSoftDeletesAndReservesCode() throws Exception {
        long parent = create(Map.of("code", "parent", "name", "Parent"));
        long child = create(Map.of("code", "child", "name", "Child", "parentId", parent));
        call(admin, delete(PATH + "/" + parent)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("1")));
        Category childEntity = em.find(Category.class, child);
        Course course = Course.builder().categoryId(child).category(childEntity).manager(manager)
                .title("Dependency").slug(UUID.randomUUID().toString()).isPublished(false).build();
        em.persist(course);
        call(admin, delete(PATH + "/" + child)).andExpect(status().isConflict());
        em.remove(course);
        call(admin, delete(PATH + "/" + child)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data").doesNotExist());
        assertNotNull(em.find(Category.class, child));
        call(admin, get(PATH)).andExpect(status().isOk()).andExpect(jsonPath("$.data.items[0].children").isEmpty());
        call(admin, get(PATH).param("includeDeleted", "true")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.items[0].children[0].isDeleted").value(true));
        write(post(PATH), Map.of("code", "CHILD", "name", "Reuse")).andExpect(status().isBadRequest());
        call(admin, delete(PATH + "/" + child)).andExpect(status().isNotFound());
        write(post(PATH), Map.of("code", "orphan", "name", "Orphan", "parentId", child)).andExpect(status().isNotFound());
        call(admin, delete(PATH + "/" + parent)).andExpect(status().isOk());
    }

    @Test
    void publicListOmitsInactiveDeletedAndDescendantsOfHiddenParents() throws Exception {
        long hidden = create(Map.of("code", "hidden", "name", "Hidden", "isActive", false));
        create(Map.of("code", "hidden-child", "name", "Hidden child", "parentId", hidden));
        long deleted = create(Map.of("code", "deleted", "name", "Deleted"));
        call(admin, delete(PATH + "/" + deleted)).andExpect(status().isOk());
        long visible = create(Map.of("code", "visible", "name", "Visible"));
        mvc.perform(get("/api/v1/categories")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].categoryId").value(visible));
    }

    @Test
    void successfulMutationsPersistAuditEventsWithActor() throws Exception {
        long id = create(Map.of("code", "audit", "name", "Audit"));
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
