package com.examprep.services;

import com.examprep.dto.question.AnswerOptionDto;
import com.examprep.dto.question.QuestionCreateRequest;
import com.examprep.dto.question.QuestionDetailDto;
import com.examprep.dto.question.QuestionUpdateRequest;
import com.examprep.entities.Category;
import com.examprep.entities.Course;
import com.examprep.entities.Module;
import com.examprep.entities.Question;
import com.examprep.entities.QuestionGroup;
import com.examprep.entities.User;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.ResourceConflictException;
import com.examprep.repositories.QuestionGroupRepository;
import com.examprep.repositories.QuestionRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class QuestionGroupTypeEnforcementIntegrationTest {

    @Autowired
    private QuestionService questionService;

    @Autowired
    private QuestionGroupRepository questionGroupRepository;

    @Autowired
    private QuestionRepository questionRepository;

    @Autowired
    private EntityManager entityManager;

    private User admin;
    private Course course;
    private Module module;

    @BeforeEach
    void setUp() {
        admin = persistUser("type-admin@gmail.com", User.ROLE_ADMIN);

        Category category = Category.builder()
                .name("Type enforcement")
                .slug("type-enforcement")
                .build();
        entityManager.persist(category);

        course = Course.builder()
                .categoryId(category.getCategoryId())
                .manager(admin)
                .title("Type enforcement course")
                .slug("type-enforcement-course")
                .price(BigDecimal.ZERO)
                .isPublished(true)
                .build();
        entityManager.persist(course);

        module = Module.builder()
                .course(course)
                .title("Type enforcement module")
                .orderIndex(0)
                .build();
        entityManager.persist(module);
    }

    @Test
    void rejectsQuestionWhoseKindDoesNotMatchTheGroup() {
        QuestionGroup quizGroup = persistGroup("QUIZ");

        assertThrows(BadRequestException.class,
                () -> questionService.createQuestion(essayRequest(quizGroup, "Essay in a quiz group"), admin));
    }

    @Test
    void acceptsAnyQuizTypeInAQuizGroup() {
        QuestionGroup quizGroup = persistGroup("QUIZ");

        QuestionDetailDto created =
                questionService.createQuestion(quizRequest(quizGroup, "Which number is prime?"), admin);

        assertNotNull(created.getQuestionId());
        assertEquals("SINGLE_CHOICE", created.getQuestionType());
        assertEquals(quizGroup.getGroupId(), created.getGroupId());
    }

    @Test
    void firstQuestionAdoptsTheTypeOfALegacyGroup() {
        QuestionGroup legacyGroup = persistGroup(null);
        Long groupId = legacyGroup.getGroupId();

        questionService.createQuestion(quizRequest(legacyGroup, "Legacy group first quiz"), admin);

        entityManager.flush();
        entityManager.clear();
        assertEquals("QUIZ", questionGroupRepository.findById(groupId).orElseThrow().getQuestionType());
    }

    @Test
    void legacyGroupWithMixedQuestionsRejectsNewQuestions() {
        QuestionGroup legacyGroup = persistGroup(null);
        persistQuestion("SINGLE_CHOICE", legacyGroup, "Old quiz question");
        persistQuestion("ESSAY", legacyGroup, "Old essay question");
        entityManager.flush();

        assertThrows(ResourceConflictException.class,
                () -> questionService.createQuestion(quizRequest(legacyGroup, "Another quiz question"), admin));
    }

    @Test
    void attachingAQuestionToAGroupValidatesItsTypeAndBlocksTypeChanges() {
        QuestionGroup essayGroup = persistGroup("ESSAY");
        QuestionGroup quizGroup = persistGroup("QUIZ");
        QuestionDetailDto quiz =
                questionService.createQuestion(quizRequest(null, "Standalone quiz question"), admin);

        assertThrows(BadRequestException.class, () -> questionService.updateQuestion(
                quiz.getQuestionId(),
                QuestionUpdateRequest.builder().groupId(essayGroup.getGroupId()).build(),
                admin));

        QuestionDetailDto attached = questionService.updateQuestion(
                quiz.getQuestionId(),
                QuestionUpdateRequest.builder().groupId(quizGroup.getGroupId()).build(),
                admin);
        assertEquals(quizGroup.getGroupId(), attached.getGroupId());

        assertThrows(BadRequestException.class, () -> questionService.updateQuestion(
                quiz.getQuestionId(),
                QuestionUpdateRequest.builder().questionType("ESSAY").build(),
                admin));
    }

    @Test
    void editingAQuestionInsideALegacyMixedGroupStillWorks() {
        QuestionGroup legacyGroup = persistGroup(null);
        Question edited = persistQuestion("ESSAY", legacyGroup, "Existing essay question");
        persistQuestion("SINGLE_CHOICE", legacyGroup, "Existing quiz question");
        entityManager.flush();

        QuestionDetailDto updated = questionService.updateQuestion(
                edited.getQuestionId(),
                QuestionUpdateRequest.builder().content("Edited essay content").build(),
                admin);

        assertEquals("Edited essay content", updated.getContent());
    }

    private QuestionGroup persistGroup(String questionType) {
        QuestionGroup group = QuestionGroup.builder()
                .course(course)
                .module(module)
                .questionType(questionType)
                .title("Group " + questionType)
                .passageText("Shared passage for " + questionType)
                .build();
        entityManager.persist(group);
        return group;
    }

    private Question persistQuestion(String questionType, QuestionGroup group, String content) {
        Question question = Question.builder()
                .module(module)
                .group(group)
                .questionType(questionType)
                .content(content)
                .difficulty("EASY")
                .status("ACTIVE")
                .build();
        entityManager.persist(question);
        return question;
    }

    private QuestionCreateRequest quizRequest(QuestionGroup group, String content) {
        return QuestionCreateRequest.builder()
                .courseId(course.getCourseId())
                .moduleId(module.getModuleId())
                .groupId(group == null ? null : group.getGroupId())
                .questionType("SINGLE_CHOICE")
                .difficulty("MEDIUM")
                .defaultPoints(BigDecimal.ONE)
                .content(content)
                .options(List.of(
                        AnswerOptionDto.builder().optionText("Option A").isCorrect(true).orderIndex(0).build(),
                        AnswerOptionDto.builder().optionText("Option B").isCorrect(false).orderIndex(1).build()))
                .build();
    }

    private QuestionCreateRequest essayRequest(QuestionGroup group, String content) {
        return QuestionCreateRequest.builder()
                .courseId(course.getCourseId())
                .moduleId(module.getModuleId())
                .groupId(group == null ? null : group.getGroupId())
                .questionType("ESSAY")
                .difficulty("MEDIUM")
                .defaultPoints(BigDecimal.ONE)
                .content(content)
                .build();
    }

    private User persistUser(String email, String roleName) {
        User user = User.builder()
                .email(email)
                .passwordHash("$2a$10$examplehashexamplehashexamplehashexamplehash")
                .fullName("Type Admin")
                .roleName(roleName)
                .status(User.STATUS_ACTIVE)
                .build();
        entityManager.persist(user);
        return user;
    }
}
