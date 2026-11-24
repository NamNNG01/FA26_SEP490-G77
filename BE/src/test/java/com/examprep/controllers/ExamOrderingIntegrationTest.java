package com.examprep.controllers;

import com.examprep.entities.AnswerOption;
import com.examprep.entities.Category;
import com.examprep.entities.Course;
import com.examprep.entities.Enrollment;
import com.examprep.entities.Module;
import com.examprep.entities.Question;
import com.examprep.entities.QuestionGroup;
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
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ExamOrderingIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired EntityManager em;

    private User manager;
    private User student;
    private Course course;
    private Module module;

    private Question s1, s2;
    private QuestionGroup group1, group2;
    private Question g1q1, g1q2, g1q3;
    private Question g2q1, g2q2;

    @BeforeEach
    void setUp() {
        manager = User.builder().email(UUID.randomUUID() + "@test.com").fullName("Manager").passwordHash("test").roleName("COURSE_MANAGER").build();
        student = User.builder().email(UUID.randomUUID() + "@test.com").fullName("Student").passwordHash("test").roleName("STUDENT").build();
        em.persist(manager);
        em.persist(student);

        Category category = Category.builder().name("Order cat").slug(UUID.randomUUID().toString()).build();
        em.persist(category);

        course = Course.builder().manager(manager).category(category).categoryId(category.getCategoryId())
                .title("Order Course").slug(UUID.randomUUID().toString()).price(BigDecimal.ZERO).isPublished(true).build();
        em.persist(course);

        module = Module.builder().course(course).title("Module 1").orderIndex(1).build();
        em.persist(module);

        em.persist(Enrollment.builder().course(course).user(student).enrolledAt(Instant.now()).status(Enrollment.STATUS_ACTIVE).build());

        group1 = QuestionGroup.builder().course(course).module(module).questionType("SINGLE_CHOICE")
                .title("Reading Passage 1").passageText("Passage text 1").build();
        em.persist(group1);

        group2 = QuestionGroup.builder().course(course).module(module).questionType("SINGLE_CHOICE")
                .title("Reading Passage 2").passageText("Passage text 2").build();
        em.persist(group2);

        s1 = createChoiceQuestion("Standalone 1", null);
        s2 = createChoiceQuestion("Standalone 2", null);

        g1q1 = createChoiceQuestion("Group 1 Q1", group1);
        g1q2 = createChoiceQuestion("Group 1 Q2", group1);
        g1q3 = createChoiceQuestion("Group 1 Q3", group1);

        g2q1 = createChoiceQuestion("Group 2 Q1", group2);
        g2q2 = createChoiceQuestion("Group 2 Q2", group2);

        em.flush();
    }

    @Test
    void manualOrderPreservesExactUnifiedAndWithinGroupSequenceAndReordersCleanly() throws Exception {
        // Create exam in MANUAL order: [s1 (0), group1 [g1q2, g1q1, g1q3] (1), s2 (2)]
        Map<String, Object> createPayload = Map.of(
                "title", "Manual Order Exam",
                "courseId", course.getCourseId(),
                "moduleId", module.getModuleId(),
                "durationMinutes", 30,
                "mode", "EXAM",
                "generationType", "STATIC",
                "questionOrder", "MANUAL",
                "maxScore", 10,
                "questionIds", List.of(
                        Map.of("questionId", s1.getQuestionId(), "weight", 1, "orderIndex", 0),
                        Map.of("questionId", s2.getQuestionId(), "weight", 1, "orderIndex", 2)
                ),
                "groupIds", List.of(
                        Map.of("groupId", group1.getGroupId(), "orderIndex", 1, "questions", List.of(
                                Map.of("questionId", g1q2.getQuestionId(), "weight", 1),
                                Map.of("questionId", g1q1.getQuestionId(), "weight", 1),
                                Map.of("questionId", g1q3.getQuestionId(), "weight", 1)
                        ))
                )
        );

        String createdJson = mvc.perform(post("/api/v1/manager/exams")
                        .with(user(UserPrincipal.create(manager)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(createPayload)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.questionOrder").value("MANUAL"))
                .andExpect(jsonPath("$.data.groups[0].orderIndex").value(1))
                .andReturn().getResponse().getContentAsString();

        JsonNode created = json.readTree(createdJson).path("data");
        long examId = created.path("examId").asLong();
        Map<Long, Long> standaloneLinkByQId = new HashMap<>();
        for (JsonNode ql : created.path("questions")) {
            if (ql.path("groupId").isNull() || ql.path("groupId").isMissingNode()) {
                standaloneLinkByQId.put(ql.path("questionId").asLong(), ql.path("examQuestionId").asLong());
            }
        }
        long groupLinkId = created.path("groups").get(0).path("examGroupId").asLong();

        // Reorder via PUT /order -> [group1 [g1q3, g1q1, g1q2] (0), s2 (1), s1 (2)]
        Map<String, Object> reorderPayload = Map.of(
                "questionOrder", "MANUAL",
                "items", List.of(
                        Map.of("itemType", "GROUP", "linkId", groupLinkId, "questionIds", List.of(
                                g1q3.getQuestionId(), g1q1.getQuestionId(), g1q2.getQuestionId())),
                        Map.of("itemType", "QUESTION", "linkId", standaloneLinkByQId.get(s2.getQuestionId())),
                        Map.of("itemType", "QUESTION", "linkId", standaloneLinkByQId.get(s1.getQuestionId()))
                )
        );

        mvc.perform(put("/api/v1/manager/exams/" + examId + "/order")
                        .with(user(UserPrincipal.create(manager)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(reorderPayload)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.groups[0].orderIndex").value(0));

        // Publish and start attempt -> must strictly follow [g1q3, g1q1, g1q2, s2, s1]
        mvc.perform(patch("/api/v1/manager/exams/" + examId + "/publish")
                        .with(user(UserPrincipal.create(manager)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"PUBLISHED\"}"))
                .andExpect(status().isOk());

        em.flush();
        em.clear();

        String attemptRes = mvc.perform(post("/api/v1/student/exams/" + examId + "/attempts")
                        .with(user(UserPrincipal.create(student)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();

        List<Long> actualOrder = extractQuestionIdsInOrder(json.readTree(attemptRes).path("data").path("questions"));
        assertEquals(
                List.of(g1q3.getQuestionId(), g1q1.getQuestionId(), g1q2.getQuestionId(), s2.getQuestionId(), s1.getQuestionId()),
                actualOrder
        );
    }

    @Test
    void randomOrderKeepsGroupedQuestionsContiguousAndInWithinGroupOrder() throws Exception {
        Map<String, Object> createPayload = Map.of(
                "title", "Random Order Grouped Exam",
                "courseId", course.getCourseId(),
                "moduleId", module.getModuleId(),
                "durationMinutes", 30,
                "mode", "EXAM",
                "generationType", "STATIC",
                "questionOrder", "RANDOM",
                "maxScore", 10,
                "questionIds", List.of(
                        Map.of("questionId", s1.getQuestionId(), "weight", 1, "orderIndex", 0),
                        Map.of("questionId", s2.getQuestionId(), "weight", 1, "orderIndex", 3)
                ),
                "groupIds", List.of(
                        Map.of("groupId", group1.getGroupId(), "orderIndex", 1, "questions", List.of(
                                Map.of("questionId", g1q2.getQuestionId(), "weight", 1),
                                Map.of("questionId", g1q1.getQuestionId(), "weight", 1),
                                Map.of("questionId", g1q3.getQuestionId(), "weight", 1)
                        )),
                        Map.of("groupId", group2.getGroupId(), "orderIndex", 2, "questions", List.of(
                                Map.of("questionId", g2q2.getQuestionId(), "weight", 1),
                                Map.of("questionId", g2q1.getQuestionId(), "weight", 1)
                        ))
                )
        );

        String createdJson = mvc.perform(post("/api/v1/manager/exams")
                        .with(user(UserPrincipal.create(manager)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(createPayload)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        long examId = json.readTree(createdJson).path("data").path("examId").asLong();

        mvc.perform(patch("/api/v1/manager/exams/" + examId + "/publish")
                        .with(user(UserPrincipal.create(manager)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"PUBLISHED\"}"))
                .andExpect(status().isOk());

        Set<List<Long>> distinctTopOrders = new HashSet<>();
        for (int attemptIdx = 0; attemptIdx < 6; attemptIdx++) {
            User s = User.builder().email(UUID.randomUUID() + "@test.com").fullName("S" + attemptIdx)
                    .passwordHash("test").roleName("STUDENT").build();
            em.persist(s);
            em.persist(Enrollment.builder().course(course).user(s).enrolledAt(Instant.now()).status(Enrollment.STATUS_ACTIVE).build());
            em.flush();

            String attemptRes = mvc.perform(post("/api/v1/student/exams/" + examId + "/attempts")
                            .with(user(UserPrincipal.create(s)))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{}"))
                    .andExpect(status().isCreated())
                    .andReturn().getResponse().getContentAsString();

            List<Long> orderedIds = extractQuestionIdsInOrder(json.readTree(attemptRes).path("data").path("questions"));
            distinctTopOrders.add(orderedIds);

            int idx1 = orderedIds.indexOf(g1q2.getQuestionId());
            assertTrue(idx1 >= 0 && idx1 + 2 < orderedIds.size(), "group1 start out of bounds: " + orderedIds);
            assertEquals(List.of(g1q2.getQuestionId(), g1q1.getQuestionId(), g1q3.getQuestionId()),
                    orderedIds.subList(idx1, idx1 + 3), "group1 must stay contiguous in configured within-group order");

            int idx2 = orderedIds.indexOf(g2q2.getQuestionId());
            assertTrue(idx2 >= 0 && idx2 + 1 < orderedIds.size(), "group2 start out of bounds: " + orderedIds);
            assertEquals(List.of(g2q2.getQuestionId(), g2q1.getQuestionId()),
                    orderedIds.subList(idx2, idx2 + 2), "group2 must stay contiguous in configured within-group order");
        }

        assertTrue(distinctTopOrders.size() >= 2, "Expected RANDOM order to vary across attempts, got " + distinctTopOrders);
    }

    private List<Long> extractQuestionIdsInOrder(JsonNode questionsArray) {
        List<JsonNode> nodes = new ArrayList<>();
        questionsArray.forEach(nodes::add);
        nodes.sort(Comparator.comparingInt(n -> n.path("orderIndex").asInt()));
        return nodes.stream().map(n -> n.path("questionId").asLong()).toList();
    }

    private Question createChoiceQuestion(String text, QuestionGroup group) {
        Question q = Question.builder()
                .module(module)
                .group(group)
                .questionType("SINGLE_CHOICE")
                .difficulty("EASY")
                .content(text)
                .status("ACTIVE")
                .approvalStatus("APPROVED")
                .build();
        em.persist(q);
        em.persist(AnswerOption.builder().question(q).optionText("A " + text).isCorrect(true).orderIndex(0).build());
        em.persist(AnswerOption.builder().question(q).optionText("B " + text).isCorrect(false).orderIndex(1).build());
        return q;
    }
}
