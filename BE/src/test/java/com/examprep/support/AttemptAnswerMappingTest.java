package com.examprep.support;

import com.examprep.entities.*;
import com.examprep.repositories.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;

import static org.junit.jupiter.api.Assertions.*;

public class AttemptAnswerMappingTest extends AbstractPostgresIT {

    @Autowired
    private AttemptAnswerRepository attemptAnswerRepository;

    @Autowired
    private ExamAttemptRepository examAttemptRepository;

    @Autowired
    private ExamRepository examRepository;

    @Autowired
    private QuestionRepository questionRepository;

    @Autowired
    private CourseRepository courseRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private CategoryRepository categoryRepository;

    @Test
    @Transactional
    public void testAttemptAnswerSnapshotsMapping() {
        Category cat = categoryRepository.findAll().stream().findFirst().orElseGet(() -> {
            return categoryRepository.save(Category.builder().name("Test Cat").slug("test-cat").code("TEST-CAT").build());
        });

        User user = userRepository.findAll().stream().findFirst().orElseGet(() -> {
            return userRepository.save(User.builder().email("test@examprep.local").passwordHash("hash").fullName("Test User").roleName("STUDENT").build());
        });

        Course course = courseRepository.findAll().stream().findFirst().orElseGet(() -> {
            return courseRepository.save(Course.builder().title("Test Course").category(cat).manager(user).isPublished(true).build());
        });

        Exam exam = examRepository.save(Exam.builder()
                .course(course)
                .createdBy(user)
                .title("Test Exam")
                .durationMinutes(60)
                .isPractice(false)
                .generationType("FIXED")
                .maxScore(BigDecimal.TEN)
                .status("PUBLISHED")
                .build());

        ExamAttempt attempt = examAttemptRepository.save(ExamAttempt.builder()
                .exam(exam)
                .user(user)
                .startTime(Instant.now())
                .deadlineAt(Instant.now().plusSeconds(3600))
                .status("IN_PROGRESS")
                .build());

        Question question = questionRepository.save(Question.builder()
                .course(course)
                .createdBy(user)
                .questionType("SINGLE_CHOICE")
                .content("What is 2+2?")
                .status("ACTIVE")
                .build());

        String displayJson = "{\"options\":[\"3\",\"4\"]}";
        String keyJson = "{\"correct\":1}";

        AttemptAnswer answer = AttemptAnswer.builder()
                .attempt(attempt)
                .question(question)
                .displaySnapshot(displayJson)
                .keySnapshot(keyJson)
                .draftSeq(1)
                .weightSnapshot(BigDecimal.valueOf(2.5))
                .gradingStatus("AUTO")
                .build();

        AttemptAnswer saved = attemptAnswerRepository.save(answer);
        attemptAnswerRepository.flush();

        AttemptAnswer fetched = attemptAnswerRepository.findById(saved.getAttemptAnswerId()).orElseThrow();
        assertEquals(displayJson, fetched.getDisplaySnapshot());
        assertEquals(keyJson, fetched.getKeySnapshot());
        assertEquals(1, fetched.getDraftSeq());
        assertEquals(0, BigDecimal.valueOf(2.5).compareTo(fetched.getWeightSnapshot()));
    }
}
