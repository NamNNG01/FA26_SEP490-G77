package com.examprep.services;

import com.examprep.dto.question.AnswerOptionDto;
import com.examprep.dto.question.QuestionCreateRequest;
import com.examprep.dto.question.QuestionDetailDto;
import com.examprep.dto.question.QuestionUpdateRequest;
import com.examprep.entities.Category;
import com.examprep.entities.Course;
import com.examprep.entities.CourseManager;
import com.examprep.entities.Module;
import com.examprep.entities.User;
import com.examprep.exceptions.ResourceConflictException;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class QuestionDuplicateCheckIntegrationTest {

    @Autowired
    private QuestionService questionService;

    @Autowired
    private EntityManager em;

    private User manager;
    private Course course;
    private Module module;

    @BeforeEach
    void setUp() {
        manager = User.builder()
                .email(UUID.randomUUID() + "@test.com")
                .fullName("Test Manager")
                .passwordHash("test")
                .roleName("COURSE_MANAGER")
                .build();
        em.persist(manager);

        Category category = Category.builder()
                .name("Test Category")
                .slug(UUID.randomUUID().toString())
                .build();
        em.persist(category);

        course = Course.builder()
                .manager(manager)
                .category(category)
                .categoryId(category.getCategoryId())
                .title("Test Course")
                .slug(UUID.randomUUID().toString())
                .price(BigDecimal.ZERO)
                .isPublished(true)
                .build();
        em.persist(course);

        CourseManager cm = CourseManager.builder()
                .course(course)
                .user(manager)
                .build();
        em.persist(cm);

        module = Module.builder()
                .course(course)
                .title("Test Module")
                .orderIndex(1)
                .build();
        em.persist(module);
        em.flush();
    }

    @Test
    void test1_duplicateInSameBatch_rejected() {
        QuestionCreateRequest r1 = new QuestionCreateRequest();
        r1.setQuestionType("SINGLE_CHOICE");
        r1.setDifficulty("MEDIUM");
        r1.setContent("What is Java?");
        r1.setOptions(List.of(
                AnswerOptionDto.builder().optionText("Language").isCorrect(true).orderIndex(0).build(),
                AnswerOptionDto.builder().optionText("OS").isCorrect(false).orderIndex(1).build()
        ));

        QuestionCreateRequest r2 = new QuestionCreateRequest();
        r2.setQuestionType("SINGLE_CHOICE");
        r2.setDifficulty("HARD");
        r2.setContent("  What is Java?   ");
        r2.setOptions(List.of(
                AnswerOptionDto.builder().optionText("OS").isCorrect(true).orderIndex(0).build(),
                AnswerOptionDto.builder().optionText("Language").isCorrect(false).orderIndex(1).build()
        ));

        assertThrows(ResourceConflictException.class, () ->
            questionService.createQuestionsBatch(course.getCourseId(), module.getModuleId(), List.of(r1, r2), manager)
        );
    }

    @Test
    void test2_duplicateWithExistingQuestion_rejected() {
        QuestionCreateRequest r1 = new QuestionCreateRequest();
        r1.setQuestionType("SINGLE_CHOICE");
        r1.setDifficulty("MEDIUM");
        r1.setContent("Java question");
        r1.setOptions(List.of(
                AnswerOptionDto.builder().optionText("A").isCorrect(true).orderIndex(0).build(),
                AnswerOptionDto.builder().optionText("B").isCorrect(false).orderIndex(1).build()
        ));
        questionService.createQuestionsBatch(course.getCourseId(), module.getModuleId(), List.of(r1), manager);

        QuestionCreateRequest r2 = new QuestionCreateRequest();
        r2.setQuestionType("SINGLE_CHOICE");
        r2.setDifficulty("EASY");
        r2.setContent("Java question");
        r2.setOptions(List.of(
                AnswerOptionDto.builder().optionText("B").isCorrect(true).orderIndex(0).build(),
                AnswerOptionDto.builder().optionText("A").isCorrect(false).orderIndex(1).build()
        ));

        assertThrows(ResourceConflictException.class, () ->
            questionService.createQuestionsBatch(course.getCourseId(), module.getModuleId(), List.of(r2), manager)
        );
    }

    @Test
    void test3_sameContentAndOptionsDifferentCorrectAnswer_rejected() {
        QuestionCreateRequest r1 = new QuestionCreateRequest();
        r1.setQuestionType("SINGLE_CHOICE");
        r1.setContent("Capital of France?");
        r1.setOptions(List.of(
                AnswerOptionDto.builder().optionText("Paris").isCorrect(true).orderIndex(0).build(),
                AnswerOptionDto.builder().optionText("London").isCorrect(false).orderIndex(1).build()
        ));
        questionService.createQuestionsBatch(course.getCourseId(), module.getModuleId(), List.of(r1), manager);

        QuestionCreateRequest r2 = new QuestionCreateRequest();
        r2.setQuestionType("SINGLE_CHOICE");
        r2.setContent("Capital of France?");
        r2.setOptions(List.of(
                AnswerOptionDto.builder().optionText("Paris").isCorrect(false).orderIndex(0).build(),
                AnswerOptionDto.builder().optionText("London").isCorrect(true).orderIndex(1).build()
        ));

        assertThrows(ResourceConflictException.class, () ->
            questionService.createQuestionsBatch(course.getCourseId(), module.getModuleId(), List.of(r2), manager)
        );
    }

    @Test
    void test4_orderingSameOptionsDifferentCorrectOrder_rejected() {
        QuestionCreateRequest r1 = new QuestionCreateRequest();
        r1.setQuestionType("ORDERING");
        r1.setContent("Order numbers");
        r1.setOptions(List.of(
                AnswerOptionDto.builder().key("k1").optionText("1").orderIndex(0).build(),
                AnswerOptionDto.builder().key("k2").optionText("2").orderIndex(1).build()
        ));
        r1.setCorrectOrder(List.of("k1", "k2"));
        questionService.createQuestionsBatch(course.getCourseId(), module.getModuleId(), List.of(r1), manager);

        QuestionCreateRequest r2 = new QuestionCreateRequest();
        r2.setQuestionType("ORDERING");
        r2.setContent("Order numbers");
        r2.setOptions(List.of(
                AnswerOptionDto.builder().key("k1").optionText("1").orderIndex(0).build(),
                AnswerOptionDto.builder().key("k2").optionText("2").orderIndex(1).build()
        ));
        r2.setCorrectOrder(List.of("k2", "k1"));

        assertThrows(ResourceConflictException.class, () ->
            questionService.createQuestionsBatch(course.getCourseId(), module.getModuleId(), List.of(r2), manager)
        );
    }

    @Test
    void test5_differentQuestionTypesSameContentAndOptions_rejected() {
        QuestionCreateRequest r1 = new QuestionCreateRequest();
        r1.setQuestionType("SINGLE_CHOICE");
        r1.setContent("Test content");
        r1.setOptions(List.of(
                AnswerOptionDto.builder().optionText("Opt 1").isCorrect(true).orderIndex(0).build(),
                AnswerOptionDto.builder().optionText("Opt 2").isCorrect(false).orderIndex(1).build()
        ));
        questionService.createQuestionsBatch(course.getCourseId(), module.getModuleId(), List.of(r1), manager);

        QuestionCreateRequest r2 = new QuestionCreateRequest();
        r2.setQuestionType("TRUE_FALSE");
        r2.setContent("Test content");
        r2.setOptions(List.of(
                AnswerOptionDto.builder().optionText("Opt 1").isCorrect(true).orderIndex(0).build(),
                AnswerOptionDto.builder().optionText("Opt 2").isCorrect(false).orderIndex(1).build()
        ));

        assertThrows(ResourceConflictException.class, () ->
            questionService.createQuestionsBatch(course.getCourseId(), module.getModuleId(), List.of(r2), manager)
        );
    }

    @Test
    void test6_sameContentDifferentOptions_allowed() {
        QuestionCreateRequest r1 = new QuestionCreateRequest();
        r1.setQuestionType("SINGLE_CHOICE");
        r1.setContent("Question content");
        r1.setOptions(List.of(
                AnswerOptionDto.builder().optionText("A").isCorrect(true).orderIndex(0).build(),
                AnswerOptionDto.builder().optionText("B").isCorrect(false).orderIndex(1).build()
        ));
        questionService.createQuestionsBatch(course.getCourseId(), module.getModuleId(), List.of(r1), manager);

        QuestionCreateRequest r2 = new QuestionCreateRequest();
        r2.setQuestionType("SINGLE_CHOICE");
        r2.setContent("Question content");
        r2.setOptions(List.of(
                AnswerOptionDto.builder().optionText("C").isCorrect(true).orderIndex(0).build(),
                AnswerOptionDto.builder().optionText("D").isCorrect(false).orderIndex(1).build()
        ));

        List<QuestionDetailDto> created = questionService.createQuestionsBatch(course.getCourseId(), module.getModuleId(), List.of(r2), manager);
        assertNotNull(created);
        assertEquals(1, created.size());
    }

    @Test
    void test7_whitespaceAndNewlineDifferences_treatedAsDuplicate() {
        QuestionCreateRequest r1 = new QuestionCreateRequest();
        r1.setQuestionType("SINGLE_CHOICE");
        r1.setContent("  Line1\nLine2   ");
        r1.setOptions(List.of(
                AnswerOptionDto.builder().optionText("  Opt 1\t").isCorrect(true).orderIndex(0).build(),
                AnswerOptionDto.builder().optionText("Opt 2").isCorrect(false).orderIndex(1).build()
        ));
        questionService.createQuestionsBatch(course.getCourseId(), module.getModuleId(), List.of(r1), manager);

        QuestionCreateRequest r2 = new QuestionCreateRequest();
        r2.setQuestionType("SINGLE_CHOICE");
        r2.setContent("Line1 Line2");
        r2.setOptions(List.of(
                AnswerOptionDto.builder().optionText("Opt 1").isCorrect(false).orderIndex(0).build(),
                AnswerOptionDto.builder().optionText("Opt 2").isCorrect(true).orderIndex(1).build()
        ));

        assertThrows(ResourceConflictException.class, () ->
            questionService.createQuestionsBatch(course.getCourseId(), module.getModuleId(), List.of(r2), manager)
        );
    }

    @Test
    void test8_updateQuestion_toDuplicate_rejected() {
        QuestionCreateRequest r1 = new QuestionCreateRequest();
        r1.setQuestionType("SINGLE_CHOICE");
        r1.setContent("Q1");
        r1.setOptions(List.of(
                AnswerOptionDto.builder().optionText("A").isCorrect(true).orderIndex(0).build(),
                AnswerOptionDto.builder().optionText("B").isCorrect(false).orderIndex(1).build()
        ));
        questionService.createQuestionsBatch(course.getCourseId(), module.getModuleId(), List.of(r1), manager);

        QuestionCreateRequest r2 = new QuestionCreateRequest();
        r2.setQuestionType("SINGLE_CHOICE");
        r2.setContent("Q2");
        r2.setOptions(List.of(
                AnswerOptionDto.builder().optionText("C").isCorrect(true).orderIndex(0).build(),
                AnswerOptionDto.builder().optionText("D").isCorrect(false).orderIndex(1).build()
        ));
        List<QuestionDetailDto> created2 = questionService.createQuestionsBatch(course.getCourseId(), module.getModuleId(), List.of(r2), manager);
        Long q2Id = created2.get(0).getQuestionId();

        QuestionUpdateRequest updateReq = new QuestionUpdateRequest();
        updateReq.setContent("Q1");
        updateReq.setOptions(List.of(
                AnswerOptionDto.builder().optionText("A").isCorrect(true).orderIndex(0).build(),
                AnswerOptionDto.builder().optionText("B").isCorrect(false).orderIndex(1).build()
        ));

        assertThrows(ResourceConflictException.class, () ->
            questionService.updateQuestion(q2Id, updateReq, manager)
        );
    }

    @Test
    void test9_updateQuestion_noDuplicate_success() {
        QuestionCreateRequest r1 = new QuestionCreateRequest();
        r1.setQuestionType("SINGLE_CHOICE");
        r1.setContent("Q1");
        r1.setOptions(List.of(
                AnswerOptionDto.builder().optionText("A").isCorrect(true).orderIndex(0).build(),
                AnswerOptionDto.builder().optionText("B").isCorrect(false).orderIndex(1).build()
        ));
        List<QuestionDetailDto> created = questionService.createQuestionsBatch(course.getCourseId(), module.getModuleId(), List.of(r1), manager);
        Long qId = created.get(0).getQuestionId();

        QuestionUpdateRequest updateReq = new QuestionUpdateRequest();
        updateReq.setContent("Updated Q1 content");
        updateReq.setOptions(List.of(
                AnswerOptionDto.builder().optionText("A").isCorrect(true).orderIndex(0).build(),
                AnswerOptionDto.builder().optionText("B").isCorrect(false).orderIndex(1).build()
        ));

        QuestionDetailDto updated = questionService.updateQuestion(qId, updateReq, manager);
        assertNotNull(updated);
        assertEquals("Updated Q1 content", updated.getContent());
    }

    @Test
    void test10_updateQuestion_unchanged_doesNotConflictWithSelf() {
        QuestionCreateRequest r1 = new QuestionCreateRequest();
        r1.setQuestionType("SINGLE_CHOICE");
        r1.setContent("Q1");
        r1.setOptions(List.of(
                AnswerOptionDto.builder().optionText("A").isCorrect(true).orderIndex(0).build(),
                AnswerOptionDto.builder().optionText("B").isCorrect(false).orderIndex(1).build()
        ));
        List<QuestionDetailDto> created = questionService.createQuestionsBatch(course.getCourseId(), module.getModuleId(), List.of(r1), manager);
        Long qId = created.get(0).getQuestionId();

        QuestionUpdateRequest updateReq = new QuestionUpdateRequest();
        updateReq.setDifficulty("HARD");

        QuestionDetailDto updated = questionService.updateQuestion(qId, updateReq, manager);
        assertNotNull(updated);
        assertEquals("HARD", updated.getDifficulty());
    }

    @Test
    void test12_softDeletedQuestion_ignoredInDuplicateCheck() {
        QuestionCreateRequest r1 = new QuestionCreateRequest();
        r1.setQuestionType("SINGLE_CHOICE");
        r1.setContent("Q1");
        r1.setOptions(List.of(
                AnswerOptionDto.builder().optionText("A").isCorrect(true).orderIndex(0).build(),
                AnswerOptionDto.builder().optionText("B").isCorrect(false).orderIndex(1).build()
        ));
        List<QuestionDetailDto> created = questionService.createQuestionsBatch(course.getCourseId(), module.getModuleId(), List.of(r1), manager);
        Long qId = created.get(0).getQuestionId();

        questionService.deleteQuestion(qId, manager);

        List<QuestionDetailDto> createdAgain = questionService.createQuestionsBatch(course.getCourseId(), module.getModuleId(), List.of(r1), manager);
        assertNotNull(createdAgain);
        assertEquals(1, createdAgain.size());
    }

    @Test
    void test13_essayQuestionsWithoutOptions_checkedByContent() {
        QuestionCreateRequest r1 = new QuestionCreateRequest();
        r1.setQuestionType("ESSAY");
        r1.setContent("Write an essay on AI");
        r1.setEssayGradingRubric(Map.of("criteria", List.of(Map.of("name", "Grammar", "weight", 10))));

        questionService.createQuestionsBatch(course.getCourseId(), module.getModuleId(), List.of(r1), manager);

        QuestionCreateRequest r2 = new QuestionCreateRequest();
        r2.setQuestionType("ESSAY");
        r2.setContent("Write an essay on AI");
        r2.setEssayGradingRubric(Map.of("criteria", List.of(Map.of("name", "Clarity", "weight", 10))));

        assertThrows(ResourceConflictException.class, () ->
            questionService.createQuestionsBatch(course.getCourseId(), module.getModuleId(), List.of(r2), manager)
        );
    }

    @Test
    void test14_differentOptionCounts_treatedAsDistinct() {
        QuestionCreateRequest r1 = new QuestionCreateRequest();
        r1.setQuestionType("SINGLE_CHOICE");
        r1.setContent("Option count check");
        r1.setOptions(List.of(
                AnswerOptionDto.builder().optionText("Apple").isCorrect(true).orderIndex(0).build(),
                AnswerOptionDto.builder().optionText("Banana").isCorrect(false).orderIndex(1).build(),
                AnswerOptionDto.builder().optionText("Cherry").isCorrect(false).orderIndex(2).build()
        ));
        questionService.createQuestionsBatch(course.getCourseId(), module.getModuleId(), List.of(r1), manager);

        QuestionCreateRequest r2 = new QuestionCreateRequest();
        r2.setQuestionType("SINGLE_CHOICE");
        r2.setContent("Option count check");
        r2.setOptions(List.of(
                AnswerOptionDto.builder().optionText("Apple").isCorrect(true).orderIndex(0).build(),
                AnswerOptionDto.builder().optionText("Banana").isCorrect(false).orderIndex(1).build()
        ));

        List<QuestionDetailDto> created = questionService.createQuestionsBatch(course.getCourseId(), module.getModuleId(), List.of(r2), manager);
        assertNotNull(created);
        assertEquals(1, created.size());
    }
}
