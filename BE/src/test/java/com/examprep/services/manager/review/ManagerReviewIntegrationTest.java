package com.examprep.services.manager.review;

import com.examprep.dto.question.AnswerOptionDto;
import com.examprep.entities.*;
import com.examprep.exceptions.ReviewException;
import com.examprep.repositories.*;
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
class ManagerReviewIntegrationTest {

    @Autowired
    private ContributionReviewService contributionReviewService;

    @Autowired
    private DeckReviewService deckReviewService;

    @Autowired
    private EntityManager em;

    @Autowired
    private QuestionContributionRepository contributionRepository;

    @Autowired
    private DeckRepository deckRepository;

    @Autowired
    private QuestionRepository questionRepository;

    private User manager;
    private User student;
    private Course course;
    private com.examprep.entities.Module module;

    @BeforeEach
    void setUp() {
        manager = User.builder()
                .email(UUID.randomUUID() + "@manager.com")
                .fullName("Manager One")
                .passwordHash("test")
                .roleName("COURSE_MANAGER")
                .status(User.STATUS_ACTIVE)
                .build();
        em.persist(manager);

        student = User.builder()
                .email(UUID.randomUUID() + "@student.com")
                .fullName("Student A")
                .passwordHash("test")
                .roleName("STUDENT")
                .status(User.STATUS_ACTIVE)
                .build();
        em.persist(student);

        Category category = Category.builder()
                .name("Test Cat")
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

        module = com.examprep.entities.Module.builder()
                .course(course)
                .title("Test Module")
                .orderIndex(1)
                .build();
        em.persist(module);
        em.flush();
    }

    @Test
    void testApproveContribution_createsQuestionAndNotification() {
        QuestionContribution contribution = QuestionContribution.builder()
                .userId(student.getUserId())
                .courseId(course.getCourseId())
                .moduleId(module.getModuleId())
                .type("QUESTION")
                .questionType("SINGLE_CHOICE")
                .title("Sample Q")
                .content("What is 2+2?")
                .difficulty("EASY")
                .optionsJson("[{\"optionText\":\"4\",\"isCorrect\":true,\"orderIndex\":0},{\"optionText\":\"5\",\"isCorrect\":false,\"orderIndex\":1}]")
                .status("PENDING")
                .version(0L)
                .build();
        final QuestionContribution savedContrib = contributionRepository.save(contribution);
        em.flush();

        Map<String, Object> result = contributionReviewService.approve(manager, savedContrib.getContributionId(), 0L, "Good question");
        assertNotNull(result);
        assertEquals("ACCEPTED", result.get("status"));
        assertNotNull(result.get("acceptedQuestionId"));

        Long qId = (Long) result.get("acceptedQuestionId");
        Question q = questionRepository.findById(qId).orElseThrow();
        assertEquals("What is 2+2?", q.getContent());
        assertEquals("ACCEPTED", q.getApprovalStatus());
        assertEquals("ACTIVE", q.getStatus());
        assertEquals("STUDENT_CONTRIBUTION", q.getSource());
    }

    @Test
    void testRejectContribution_requiresReason() {
        QuestionContribution contribution = QuestionContribution.builder()
                .userId(student.getUserId())
                .courseId(course.getCourseId())
                .type("QUESTION")
                .content("Bad Q")
                .status("PENDING")
                .version(0L)
                .build();
        final QuestionContribution savedContrib = contributionRepository.save(contribution);

        Exception ex = assertThrows(ReviewException.class, () ->
            contributionReviewService.reject(manager, savedContrib.getContributionId(), 0L, "Bad")
        );
        assertTrue(ex.getMessage().contains("Reason is required"));

        Map<String, Object> result = contributionReviewService.reject(manager, savedContrib.getContributionId(), 0L, "This question is incorrect.");
        assertEquals("REJECTED", result.get("status"));
    }

    @Test
    void testCannotReviewOwnContribution() {
        QuestionContribution contribution = QuestionContribution.builder()
                .userId(manager.getUserId())
                .courseId(course.getCourseId())
                .type("QUESTION")
                .content("My Q")
                .status("PENDING")
                .version(0L)
                .build();
        final QuestionContribution savedContrib = contributionRepository.save(contribution);

        assertThrows(ReviewException.class, () ->
            contributionReviewService.approve(manager, savedContrib.getContributionId(), 0L, "Self")
        );
    }

    @Test
    void testApproveDeck_setsPublicAndCourseVisibility() {
        Deck deck = Deck.builder()
                .user(student)
                .course(course)
                .title("Java Deck")
                .isPublic(false)
                .reviewStatus("PENDING")
                .version(0L)
                .build();
        final Deck savedDeck = deckRepository.save(deck);

        Flashcard card = Flashcard.builder()
                .deck(savedDeck)
                .frontText("Front")
                .backText("Back")
                .position(1)
                .build();
        em.persist(card);
        em.flush();

        Map<String, Object> result = deckReviewService.approve(manager, savedDeck.getDeckId(), 0L, "Approved");
        assertEquals("APPROVED", result.get("reviewStatus"));
        assertEquals(true, result.get("isPublic"));
        assertEquals(Deck.VISIBILITY_PUBLIC, result.get("visibility"));
    }
}
