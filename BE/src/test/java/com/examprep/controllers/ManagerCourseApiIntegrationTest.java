package com.examprep.controllers;

import com.examprep.dto.ManagerCourseInfo;
import com.examprep.entities.*;
import com.examprep.entities.Module;
import com.examprep.repositories.CourseRepository;
import com.examprep.repositories.EnrollmentRepository;
import com.examprep.security.UserPrincipal;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
public class ManagerCourseApiIntegrationTest {
    @Autowired protected MockMvc mvc;
    @Autowired protected ObjectMapper json;
    @Autowired protected EntityManager em;
    @Autowired private CourseRepository courses;
    @Autowired private EnrollmentRepository enrollments;

    private User admin;
    private User manager;
    private User collaborator;
    private User stranger;
    private User student;
    private Category category;
    private Course course;

    @BeforeEach
    void fixtures() {
        admin = account(User.ROLE_ADMIN);
        manager = account(User.ROLE_COURSE_MANAGER);
        collaborator = account(User.ROLE_COURSE_MANAGER);
        stranger = account(User.ROLE_COURSE_MANAGER);
        student = account(User.ROLE_STUDENT);
        category = Category.builder().name("Programming").slug(UUID.randomUUID().toString()).build();
        em.persist(category);
        course = course(manager, "Python for beginners");
        em.persist(CourseManager.builder().course(course).user(collaborator).build());
        em.flush();
    }

    @Test
    void readsRequireAuthenticationAndManagerRole() throws Exception {
        mvc.perform(get("/api/v1/manager/courses")).andExpect(status().isUnauthorized());
        call(student, get("/api/v1/manager/courses")).andExpect(status().isForbidden());
        call(stranger, get(path())).andExpect(status().isForbidden());
        call(manager, get("/api/v1/manager/courses/9223372036854775807"))
                .andExpect(status().isNotFound());
    }

    @Test
    void listUsesOwnershipFiltersAndStablePaging() throws Exception {
        course(stranger, "Python secret");
        course(manager, "Other subject");
        call(collaborator, get("/api/v1/manager/courses")
                .param("search", "BEGINNERS").param("categoryId", category.getCategoryId().toString())
                .param("isPublished", "false").param("size", "1").param("sort", "updatedAt,desc"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].courseId").value(course.getCourseId()))
                .andExpect(jsonPath("$.data.content[0].categoryName").value("Programming"))
                .andExpect(jsonPath("$.data.first").value(true))
                .andExpect(jsonPath("$.data.last").value(true));
        call(admin, get("/api/v1/manager/courses").param("categoryId", category.getCategoryId().toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.totalElements").value(3));
    }

    @Test
    void listSearchesDescriptionAndTreatsWildcardsLiterally() throws Exception {
        course.setDescription("Contains 100% of the material");
        call(manager, get("/api/v1/manager/courses").param("search", "100%"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.totalElements").value(1));
        call(manager, get("/api/v1/manager/courses").param("search", "_"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.totalElements").value(0));
    }

    @Test
    void detailsReturnOrderedModulesAndContentCounts() throws Exception {
        Module second = module(course, "Second", 2);
        Module first = module(course, "First", 1);
        question(first);
        exam(course, first);
        enrollment(student, course, "ACTIVE", 65);
        call(collaborator, get(path())).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.moduleCount").value(2))
                .andExpect(jsonPath("$.data.examCount").value(1))
                .andExpect(jsonPath("$.data.studentCount").value(1))
                .andExpect(jsonPath("$.data.modules[0].moduleId").value(first.getModuleId()))
                .andExpect(jsonPath("$.data.modules[0].questionCount").value(1))
                .andExpect(jsonPath("$.data.modules[0].examCount").value(1));
        call(manager, get(path() + "/modules")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data[1].moduleId").value(second.getModuleId()));
    }

    @Test
    void studentsAreScopedFilteredAndPaged() throws Exception {
        enrollment(student, course, "ACTIVE", 65);
        User completed = account(User.ROLE_STUDENT);
        enrollment(completed, course, "COMPLETED", 100);
        call(collaborator, get(path() + "/students").param("search", student.getEmail())
                .param("status", "ACTIVE").param("size", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].userId").value(student.getUserId()))
                .andExpect(jsonPath("$.data.content[0].progress").value(65));
        call(stranger, get(path() + "/students")).andExpect(status().isForbidden());
        call(stranger, get(path() + "/modules")).andExpect(status().isForbidden());
    }

    @Test
    void additionalManagerDashboardMatchesApiWithoutDuplicateCourses() {
        em.persist(CourseManager.builder().course(course).user(manager).build());
        em.persist(CourseManager.builder().course(course).user(collaborator).build());
        enrollment(student, course, "ACTIVE", 30);
        em.flush();
        assertEquals(1, courses.countByManagerId(collaborator.getUserId()));
        assertEquals(1, courses.countByManagerIdAndPublished(collaborator.getUserId(), false));
        assertEquals(1, courses.countByManagerId(manager.getUserId()));
        assertEquals(1, enrollments.countDistinctStudentsByManagerId(collaborator.getUserId()));
        List<ManagerCourseInfo> recent = courses.findRecentCoursesByManagerId(collaborator.getUserId(), PageRequest.of(0, 5));
        assertEquals(1, recent.size());
        assertEquals(1, recent.get(0).getStudentCount());
    }

    @Test
    void categoriesArePublicAndExposeDtos() throws Exception {
        mvc.perform(get("/api/v1/categories")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].categoryId").isNumber())
                .andExpect(jsonPath("$.data[0].name").isString())
                .andExpect(jsonPath("$.data[0].parent").doesNotExist());
    }

    @Test
    void swaggerPublishesTheNewRoutesAndCreatedStatus() throws Exception {
        mvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
                .andExpect(jsonPath("$.paths['/api/v1/manager/courses'].post.responses['201']").exists())
                .andExpect(jsonPath("$.paths['/api/v1/manager/courses/{id}/students'].get").exists())
                .andExpect(jsonPath("$.paths['/api/v1/categories'].get").exists());
    }

    @Test
    void onlyAdminCreatesPublishesOrDeletesCourse() throws Exception {
        call(manager, post("/api/v1/manager/courses").contentType(MediaType.APPLICATION_JSON).content(createBody("New")))
                .andExpect(status().isForbidden());
        call(collaborator, patch(path() + "/publish").contentType(MediaType.APPLICATION_JSON).content("{\"isPublished\":false}"))
                .andExpect(status().isForbidden());
        call(manager, delete(path())).andExpect(status().isForbidden());
    }

    @Test
    void createGeneratesBoundedSlugDraftAndManagerAssignment() throws Exception {
        JsonNode data = body(call(admin, post("/api/v1/manager/courses")
                .contentType(MediaType.APPLICATION_JSON).content(createBody("Đ".repeat(255))))
                .andExpect(status().isCreated()));
        long id = data.get("courseId").asLong();
        assertTrue(data.get("slug").asText().endsWith("-" + id));
        assertTrue(data.get("slug").asText().length() <= 255);
        assertFalse(data.get("isPublished").asBoolean());
        assertEquals(0, data.get("price").decimalValue().compareTo(BigDecimal.ZERO));
        assertEquals(1L, em.createQuery("select count(cm) from CourseManager cm where cm.course.courseId = :id", Long.class)
                .setParameter("id", id).getSingleResult());
    }

    @Test
    void createRejectsInvalidManagerCategoryTitleAndPrice() throws Exception {
        for (String payload : List.of(
                createBody(" "),
                createBody("A").replace("\"managerId\":" + manager.getUserId(), "\"managerId\":" + student.getUserId()),
                createBody("A").replace("\"price\":0", "\"price\":-1"),
                createBody("A").replace("\"price\":0", "\"price\":0.001"),
                createBody("A").replace("\"price\":0", "\"price\":100000000"))) {
            call(admin, post("/api/v1/manager/courses").contentType(MediaType.APPLICATION_JSON).content(payload))
                    .andExpect(status().isBadRequest());
        }
        manager.setStatus("INACTIVE");
        call(admin, post("/api/v1/manager/courses").contentType(MediaType.APPLICATION_JSON).content(createBody("A")))
                .andExpect(status().isBadRequest());
        call(admin, post("/api/v1/manager/courses").contentType(MediaType.APPLICATION_JSON)
                .content(createBody("A").replace("\"categoryId\":" + category.getCategoryId(), "\"categoryId\":9223372036854775807")))
                .andExpect(status().isNotFound());
    }

    @Test
    void managerEditsOnlyAllowedFieldsAndDraftSlugFollowsTitle() throws Exception {
        String slug = "updated-" + course.getCourseId();
        course.setDescription("Old description");
        course.setThumbnailUrl("https://example.com/old.png");
        call(collaborator, put(path()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Updated\",\"description\":\"\",\"thumbnailUrl\":\"\",\"price\":-3,\"managerId\":-1}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.title").value("Updated"))
                .andExpect(jsonPath("$.data.price").value(0))
                .andExpect(jsonPath("$.data.managerId").value(manager.getUserId()))
                .andExpect(jsonPath("$.data.slug").value(slug))
                .andExpect(jsonPath("$.data.description").value(nullValue()))
                .andExpect(jsonPath("$.data.thumbnailUrl").value(nullValue()));
        call(stranger, put(path()).contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Stolen\"}"))
                .andExpect(status().isForbidden());
        course.setIsPublished(true);
        call(collaborator, put(path()).contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Renamed live\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.slug").value(slug));
    }

    @Test
    void transferRevokesOldPrimaryButPreservesOtherAssignments() throws Exception {
        em.persist(CourseManager.builder().course(course).user(manager).build());
        call(admin, put(path()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"managerId\":" + stranger.getUserId() + ",\"price\":12.50}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.price").value(12.5));
        call(manager, get(path())).andExpect(status().isForbidden());
        call(stranger, get(path())).andExpect(status().isOk());
        call(collaborator, get(path())).andExpect(status().isOk());
        assertEquals(0, courses.countByManagerId(manager.getUserId()));
    }

    @Test
    void adminAssignsAndReplacesCoManagers() throws Exception {
        String body = json.writeValueAsString(java.util.Map.of("title", "Shared", "categoryId", category.getCategoryId(),
                "managerId", manager.getUserId(), "managerIds", List.of(collaborator.getUserId(), manager.getUserId(), collaborator.getUserId())));
        JsonNode data = body(call(admin, post("/api/v1/manager/courses").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.managers.length()").value(2))
                .andExpect(jsonPath("$.data.managers[0].userId").value(manager.getUserId()))
                .andExpect(jsonPath("$.data.managers[0].primary").value(true))
                .andExpect(jsonPath("$.data.managers[1].userId").value(collaborator.getUserId())));
        String shared = "/api/v1/manager/courses/" + data.get("courseId").asLong();
        call(collaborator, get(shared)).andExpect(status().isOk());

        call(collaborator, put(shared).contentType(MediaType.APPLICATION_JSON).content("{\"managerIds\":[]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.managers.length()").value(2));
        call(admin, put(shared).contentType(MediaType.APPLICATION_JSON).content("{\"managerIds\":[" + stranger.getUserId() + "]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.managers.length()").value(2))
                .andExpect(jsonPath("$.data.managers[1].userId").value(stranger.getUserId()));
        call(collaborator, get(shared)).andExpect(status().isForbidden());
        call(stranger, get(shared)).andExpect(status().isOk());
        call(manager, get(shared)).andExpect(status().isOk());
        call(admin, put(shared).contentType(MediaType.APPLICATION_JSON).content("{\"managerIds\":[" + student.getUserId() + "]}"))
                .andExpect(status().isBadRequest());
        call(admin, get("/api/v1/manager/courses")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].managers").doesNotExist());
    }

    @Test
    void publishRequiresModuleAndAdminCanManageAnyCourse() throws Exception {
        call(admin, patch(path() + "/publish").contentType(MediaType.APPLICATION_JSON).content("{\"isPublished\":true}"))
                .andExpect(status().isBadRequest());
        module(course, "First", 1);
        call(admin, patch(path() + "/publish").contentType(MediaType.APPLICATION_JSON).content("{\"isPublished\":true}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.isPublished").value(true));
        call(admin, patch(path() + "/publish").contentType(MediaType.APPLICATION_JSON).content("{\"isPublished\":false}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.isPublished").value(false));
    }

    @Test
    void modulesAppendAndUpdateWithoutRenumberingExistingPositions() throws Exception {
        Module first = module(course, "First", 4);
        call(collaborator, post(path() + "/modules").contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Second\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.data.orderIndex").value(5));
        call(manager, put(modulePath(first)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Updated\",\"orderIndex\":5}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.orderIndex").value(5));
        call(manager, get(path() + "/modules")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].moduleId").value(first.getModuleId()));
        call(stranger, put(modulePath(first)).contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"No\"}"))
                .andExpect(status().isForbidden());
        call(stranger, delete(modulePath(first))).andExpect(status().isForbidden());
    }

    @Test
    void deletingLastPublishedModuleIsBlockedUntilUnpublish() throws Exception {
        Module module = module(course, "First", 1);
        course.setIsPublished(true);
        call(manager, delete(modulePath(module))).andExpect(status().isConflict());
        call(admin, patch(path() + "/publish").contentType(MediaType.APPLICATION_JSON).content("{\"isPublished\":false}"))
                .andExpect(status().isOk());
        call(manager, delete(modulePath(module))).andExpect(status().isOk());
        assertNull(em.find(Module.class, module.getModuleId()));
    }

    @Test
    void moduleStatusIsValidatedScopedAndKeepsPublishedCourseVisible() throws Exception {
        Module first = module(course, "First", 1);
        Module second = module(course, "Second", 2);
        String status = modulePath(first) + "/status";
        for (String bad : List.of("{}", "{\"status\":\"\"}", "{\"status\":\"hidden\"}", "{\"status\":\"ARCHIVED\"}"))
            call(manager, patch(status).contentType(MediaType.APPLICATION_JSON).content(bad)).andExpect(status().isBadRequest());
        call(stranger, patch(status).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"HIDDEN\"}")).andExpect(status().isForbidden());
        call(student, patch(status).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"HIDDEN\"}")).andExpect(status().isForbidden());
        call(manager, patch("/api/v1/manager/modules/9223372036854775807/status").contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"HIDDEN\"}")).andExpect(status().isNotFound());

        call(collaborator, patch(status).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"HIDDEN\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("HIDDEN"));
        call(manager, patch(status).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"HIDDEN\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("HIDDEN"));
        call(manager, get(path() + "/modules")).andExpect(jsonPath("$.data[0].status").value("HIDDEN"))
                .andExpect(jsonPath("$.data[1].status").value("VISIBLE"));

        // Published course: the last visible module can be neither hidden nor deleted; hidden ones can.
        call(admin, patch(path() + "/publish").contentType(MediaType.APPLICATION_JSON).content("{\"isPublished\":true}")).andExpect(status().isOk());
        call(manager, patch(modulePath(second) + "/status").contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"HIDDEN\"}"))
                .andExpect(status().isConflict());
        call(manager, delete(modulePath(second))).andExpect(status().isConflict());
        call(manager, delete(modulePath(first))).andExpect(status().isOk());
        call(admin, patch(path() + "/publish").contentType(MediaType.APPLICATION_JSON).content("{\"isPublished\":false}")).andExpect(status().isOk());
        call(manager, patch(modulePath(second) + "/status").contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"HIDDEN\"}"))
                .andExpect(status().isOk());
        // Only hidden modules left: publishing is refused.
        call(admin, patch(path() + "/publish").contentType(MediaType.APPLICATION_JSON).content("{\"isPublished\":true}")).andExpect(status().isBadRequest());
    }

    @Test
    void studentsDoNotSeeOrAttemptExamsOfHiddenModules() throws Exception {
        Module hidden = module(course, "Hidden", 1);
        Module shown = module(course, "Shown", 2);
        Exam hiddenExam = exam(course, hidden);
        Exam shownExam = exam(course, shown);
        hiddenExam.setStatus("PUBLISHED");
        shownExam.setStatus("PUBLISHED");
        enrollment(student, course, "ACTIVE", 0);
        call(manager, patch(modulePath(hidden) + "/status").contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"HIDDEN\"}"))
                .andExpect(status().isOk());
        em.clear();
        call(student, get("/api/v1/student/exams/course/" + course.getCourseId())).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].examId").value(shownExam.getExamId()));
        call(student, get("/api/v1/student/exams/" + hiddenExam.getExamId())).andExpect(jsonPath("$.message").value("Exam is not available"));
        call(student, post("/api/v1/student/exams/attempts").contentType(MediaType.APPLICATION_JSON)
                .content("{\"examId\":" + hiddenExam.getExamId() + ",\"answers\":[]}")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Exam is not available"));
    }

    @Test
    void moduleDeletionProtectsQuestionsExamsConfigurationsAndGroups() throws Exception {
        Module questions = module(course, "Questions", 1);
        Question question = question(questions);
        Module exams = module(course, "Exams", 2);
        exam(course, exams);
        Module configs = module(course, "Configs", 3);
        Exam separateExam = exam(null, null);
        em.persist(ExamConfig.builder().exam(separateExam).module(configs).questionType("SINGLE_CHOICE").numberOfQuestions(1).build());
        Module groups = module(course, "Groups", 4);
        em.persist(QuestionGroup.builder().module(groups).build());
        for (Module module : List.of(questions, exams, configs, groups)) {
            call(manager, delete(modulePath(module))).andExpect(status().isConflict());
        }
        assertNotNull(em.find(Question.class, question.getQuestionId()));
    }

    @Test
    void courseDeletionProtectsEnrollmentsAndExamAttemptHistory() throws Exception {
        enrollment(student, course, "COMPLETED", 100);
        call(admin, delete(path())).andExpect(status().isConflict());
        Course withExam = course(manager, "Exam course");
        Exam exam = exam(withExam, null);
        ExamAttempt attempt = ExamAttempt.builder().exam(exam).user(student).startTime(Instant.now())
                .deadlineAt(Instant.now().plusSeconds(3600)).status("IN_PROGRESS").build();
        em.persist(attempt);
        call(admin, delete("/api/v1/manager/courses/" + withExam.getCourseId())).andExpect(status().isConflict());
        assertNotNull(em.find(ExamAttempt.class, attempt.getAttemptId()));
    }

    @Test
    void courseDeletionAlsoProtectsModuleOnlyExamsAndQuestions() throws Exception {
        Module module = module(course, "Content", 1);
        exam(null, module);
        call(admin, delete(path())).andExpect(status().isConflict());
        Course withQuestions = course(manager, "Questions course");
        question(module(withQuestions, "Questions", 1));
        call(admin, delete("/api/v1/manager/courses/" + withQuestions.getCourseId())).andExpect(status().isConflict());
    }

    @Test
    void emptyCourseDeletionRemovesEmptyModulesAndAssignments() throws Exception {
        module(course, "Empty", 1);
        Long id = course.getCourseId();
        call(admin, delete(path())).andExpect(status().isOk()).andExpect(jsonPath("$.data").doesNotExist());
        em.flush();
        assertNull(em.find(Course.class, id));
        assertEquals(0L, em.createQuery("select count(m) from Module m where m.course.courseId = :id", Long.class).setParameter("id", id).getSingleResult());
        assertEquals(0L, em.createQuery("select count(cm) from CourseManager cm where cm.course.courseId = :id", Long.class).setParameter("id", id).getSingleResult());
    }

    @Test
    void invalidPagingSortStatusAndModuleInputsReturn400() throws Exception {
        for (String[] param : List.of(new String[]{"page", "-1"}, new String[]{"size", "0"}, new String[]{"size", "101"},
                new String[]{"sort", "manager.passwordHash,desc"}, new String[]{"sort", "title,sideways"}, new String[]{"page", "oops"})) {
            call(manager, get("/api/v1/manager/courses").param(param[0], param[1])).andExpect(status().isBadRequest());
        }
        call(manager, get(path() + "/students").param("status", "UNKNOWN")).andExpect(status().isBadRequest());
        for (String payload : List.of("{\"title\":\" \"}", "{\"title\":\"A\",\"orderIndex\":0}")) {
            call(manager, post(path() + "/modules").contentType(MediaType.APPLICATION_JSON).content(payload)).andExpect(status().isBadRequest());
        }
        call(admin, patch(path() + "/publish").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
        call(admin, put(path()).contentType(MediaType.APPLICATION_JSON).content("{\"price\":-1}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void unicodeWhitespaceTitlesAreRejectedForCreateAndUpdate() throws Exception {
        call(admin, post("/api/v1/manager/courses").contentType(MediaType.APPLICATION_JSON).content(createBody("\u2003")))
                .andExpect(status().isBadRequest());
        call(manager, post(path() + "/modules").contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"\u2003\"}"))
                .andExpect(status().isBadRequest());
        call(manager, put(path()).contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"\u2003\"}"))
                .andExpect(status().isBadRequest());
        Module module = module(course, "Valid", 1);
        call(manager, put(modulePath(module)).contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"\u2003\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void courseCountsIncludeDirectAndModuleOnlyExamsWithoutDoubleCounting() throws Exception {
        Module module = module(course, "Content", 1);
        exam(course, null);
        exam(null, module);
        exam(course, module);
        enrollment(student, course, "ACTIVE", 10);
        enrollment(student, course, "COMPLETED", 100);
        call(manager, get(path())).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.examCount").value(3))
                .andExpect(jsonPath("$.data.studentCount").value(1));
        call(manager, get("/api/v1/manager/courses")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].examCount").value(3));
        assertEquals(1, courses.findRecentCoursesByManagerId(manager.getUserId(), PageRequest.of(0, 5)).get(0).getStudentCount());
    }

    @Test
    void fractionalIdentifiersAndModulePositionsAreRejectedRatherThanTruncated() throws Exception {
        call(manager, post(path() + "/modules").contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Fractional\",\"orderIndex\":1.9}"))
                .andExpect(status().isBadRequest());
        call(admin, put(path()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"managerId\":" + manager.getUserId() + ".9}"))
                .andExpect(status().isBadRequest());
        call(admin, put(path()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"categoryId\":" + category.getCategoryId() + ".9}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void nullUpdatePreservesFieldsAndOutOfRangePageIsEmpty() throws Exception {
        course.setDescription("Keep description");
        call(manager, put(path()).contentType(MediaType.APPLICATION_JSON).content("{\"title\":null,\"description\":null}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.title").value("Python for beginners"))
                .andExpect(jsonPath("$.data.description").value("Keep description"));
        call(manager, get("/api/v1/manager/courses").param("page", "20"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.content").isEmpty());
        call(manager, get("/api/v1/manager/courses").param("page", "2147483647"))
                .andExpect(status().isBadRequest());
    }

    private ResultActions call(User actor, MockHttpServletRequestBuilder request) throws Exception {
        em.flush();
        return mvc.perform(request.with(user(UserPrincipal.create(actor))));
    }

    private JsonNode body(ResultActions result) throws Exception {
        return json.readTree(result.andReturn().getResponse().getContentAsString()).get("data");
    }

    private String path() { return "/api/v1/manager/courses/" + course.getCourseId(); }
    private String modulePath(Module module) { return "/api/v1/manager/modules/" + module.getModuleId(); }
    private String createBody(String title) throws Exception {
        return json.writeValueAsString(java.util.Map.of("title", title, "categoryId", category.getCategoryId(), "managerId", manager.getUserId(), "price", 0));
    }

    private User account(String role) {
        User user = User.builder().email(UUID.randomUUID() + "@example.com").fullName(role)
                .passwordHash("test-password-hash").roleName(role).build();
        em.persist(user);
        return user;
    }

    private Course course(User owner, String title) {
        Course value = Course.builder().categoryId(category.getCategoryId()).category(category).manager(owner)
                .title(title).slug(UUID.randomUUID().toString()).isPublished(false).build();
        em.persist(value);
        return value;
    }

    private Module module(Course parent, String title, int order) {
        Module value = Module.builder().course(parent).title(title).orderIndex(order).build();
        em.persist(value);
        return value;
    }

    private Question question(Module module) {
        Question value = Question.builder().module(module).questionType("SINGLE_CHOICE").content("Question").build();
        em.persist(value);
        return value;
    }

    private Exam exam(Course parent, Module module) {
        Exam value = Exam.builder().course(parent).module(module).createdBy(manager).title("Exam")
                .durationMinutes(60).isPractice(false).generationType("FIXED").maxScore(BigDecimal.TEN).build();
        em.persist(value);
        return value;
    }

    private void enrollment(User user, Course course, String status, int progress) {
        em.persist(Enrollment.builder().course(course).user(user).status(status).progress(progress).enrolledAt(Instant.now()).build());
    }
}
