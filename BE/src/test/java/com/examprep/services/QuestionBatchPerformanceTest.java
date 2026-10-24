package com.examprep.services;

import com.examprep.dto.question.AnswerOptionDto;
import com.examprep.dto.question.QuestionCreateRequest;
import com.examprep.dto.question.QuestionDetailDto;
import com.examprep.entities.Category;
import com.examprep.entities.Course;
import com.examprep.entities.CourseManager;
import com.examprep.entities.Module;
import com.examprep.entities.User;
import jakarta.persistence.EntityManager;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertNotNull;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class QuestionBatchPerformanceTest {

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
                .fullName("Batch Manager")
                .passwordHash("test")
                .roleName("COURSE_MANAGER")
                .build();
        em.persist(manager);

        Category category = Category.builder()
                .name("Batch Category")
                .slug(UUID.randomUUID().toString())
                .build();
        em.persist(category);

        course = Course.builder()
                .manager(manager)
                .category(category)
                .categoryId(category.getCategoryId())
                .title("Batch Test Course")
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
                .title("Batch Module")
                .orderIndex(1)
                .build();
        em.persist(module);
        em.flush();
    }

    @Test
    void testBatchCreationAndHibernateStatistics() {
        SessionFactory sessionFactory = em.getEntityManagerFactory().unwrap(SessionFactory.class);
        Statistics stats = sessionFactory.getStatistics();
        stats.setStatisticsEnabled(true);
        stats.clear();

        List<QuestionCreateRequest> requests = new ArrayList<>();
        for (int i = 1; i <= 10; i++) {
            QuestionCreateRequest req = new QuestionCreateRequest();
            req.setQuestionType("SINGLE_CHOICE");
            req.setDifficulty("MEDIUM");
            req.setContent("Batch Question " + i + " " + UUID.randomUUID());
            req.setOptions(List.of(
                    AnswerOptionDto.builder().optionText("Opt A").isCorrect(true).orderIndex(0).build(),
                    AnswerOptionDto.builder().optionText("Opt B").isCorrect(false).orderIndex(1).build()
            ));
            req.setAnswerKey("A");
            requests.add(req);
        }

        long start = System.nanoTime();
        List<QuestionDetailDto> created = questionService.createQuestionsBatch(course.getCourseId(), module.getModuleId(), requests, manager);
        long elapsed = (System.nanoTime() - start) / 1_000_000;

        assertNotNull(created);
        assertTrue(created.size() == 10);

        long entityInserts = stats.getEntityInsertCount();
        long prepareStatements = stats.getPrepareStatementCount();

        System.out.println("BATCH PERF TEST | elapsedMs=" + elapsed + " | entityInserts=" + entityInserts + " | prepareStatements=" + prepareStatements);

        // Assert inserts happened successfully
        assertTrue(entityInserts >= 10);
    }
}
