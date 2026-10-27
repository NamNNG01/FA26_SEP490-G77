package com.examprep.repositories;

import com.examprep.config.JpaAuditingConfig;
import com.examprep.dto.ManagerCourseInfo;
import com.examprep.dto.RecentUser;
import com.examprep.dto.StudentRecentAttempt;
import com.examprep.dto.StudentRecentCourse;
import com.examprep.entities.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest
@ActiveProfiles("test")
@Import(JpaAuditingConfig.class)
class DashboardQueryIntegrationTest {

    @Autowired
    private TestEntityManager em;

    @Autowired
    private EnrollmentRepository enrollmentRepository;

    @Autowired
    private CourseRepository courseRepository;

    @Autowired
    private ExamAttemptRepository examAttemptRepository;

    @Autowired
    private UserRepository userRepository;

    private Category cachedCategory;

    @Test
    void studentSummary_CountsAndAverage_ScoredAttemptsOnly() {
        User manager = persistUser("manager@gmail.com", "Manager One", User.ROLE_COURSE_MANAGER);
        User student = persistUser("student@gmail.com", "Nguyen Van A", User.ROLE_STUDENT);

        Course active = persistCourse(manager, "IELTS Academic", true, "thumb.jpg");
        Course done = persistCourse(manager, "TOEFL Prep", true, null);

        enroll(student, active, Enrollment.STATUS_ACTIVE, 65, Instant.parse("2026-09-10T00:00:00Z"));
        enroll(student, done, Enrollment.STATUS_COMPLETED, 100, Instant.parse("2026-09-05T00:00:00Z"));

        Exam exam = persistExam(active, manager, "IELTS Reading Mock Test 01");
        persistAttempt(student, exam, Instant.parse("2026-09-18T10:00:00Z"), new BigDecimal("82.50"), "GRADED");
        persistAttempt(student, exam, Instant.parse("2026-09-19T14:20:00Z"), new BigDecimal("75.00"), "GRADED");
        persistAttempt(student, exam, null, null, "IN_PROGRESS");
        em.flush();

        assertEquals(2, enrollmentRepository.countByUserId(student.getUserId()));
        assertEquals(1, enrollmentRepository.countByUserIdAndStatus(student.getUserId(), Enrollment.STATUS_ACTIVE));
        assertEquals(1, enrollmentRepository.countByUserIdAndStatus(student.getUserId(), Enrollment.STATUS_COMPLETED));
        assertEquals(3, examAttemptRepository.countByUserId(student.getUserId()));

        Number average = examAttemptRepository.averageScoreByUserId(student.getUserId());
        assertNotNull(average);
        assertEquals(78.75, average.doubleValue(), 0.0001);
    }

    @Test
    void studentRecentCourses_OrderedByEnrolledAtDesc_LimitedToFive() {
        User manager = persistUser("manager@gmail.com", "Manager One", User.ROLE_COURSE_MANAGER);
        User student = persistUser("student@gmail.com", "Nguyen Van A", User.ROLE_STUDENT);

        for (int i = 1; i <= 6; i++) {
            Course course = persistCourse(manager, "Course " + i, true, "thumb-" + i + ".jpg");
            enroll(student, course, Enrollment.STATUS_ACTIVE, i * 10,
                    Instant.parse(String.format("2026-09-%02dT00:00:00Z", i)));
        }
        em.flush();

        List<StudentRecentCourse> recent =
                enrollmentRepository.findRecentCoursesByUserId(student.getUserId(), PageRequest.of(0, 5));

        assertEquals(5, recent.size());
        assertEquals("Course 6", recent.get(0).getTitle());
        assertEquals("thumb-6.jpg", recent.get(0).getThumbnailUrl());
        assertEquals(60, recent.get(0).getProgress());
        assertNotNull(recent.get(0).getCourseId());
        assertEquals("Course 5", recent.get(1).getTitle());
        assertEquals("Course 2", recent.get(4).getTitle());
        assertEquals(20, recent.get(4).getProgress());
    }

    @Test
    void studentRecentAttempts_SubmittedOnly_OrderedBySubmitTimeDesc_LimitedToFive() {
        User manager = persistUser("manager@gmail.com", "Manager One", User.ROLE_COURSE_MANAGER);
        User student = persistUser("student@gmail.com", "Nguyen Van A", User.ROLE_STUDENT);

        Course course = persistCourse(manager, "IELTS Academic", true, "thumb.jpg");
        Exam exam = persistExam(course, manager, "IELTS Reading Mock Test 01");

        for (int i = 1; i <= 6; i++) {
            persistAttempt(student, exam, Instant.parse(String.format("2026-09-%02dT14:20:00Z", 9 + i)),
                    new BigDecimal(String.valueOf(40 + i)), "GRADED");
        }
        persistAttempt(student, exam, null, null, "IN_PROGRESS");
        em.flush();

        List<StudentRecentAttempt> recent =
                examAttemptRepository.findRecentAttemptsByUserId(student.getUserId(), PageRequest.of(0, 5));

        assertEquals(5, recent.size());
        assertEquals(Instant.parse("2026-09-15T14:20:00Z"), recent.get(0).getSubmittedAt());
        assertEquals(0, new BigDecimal("46").compareTo(recent.get(0).getScore()));
        assertEquals("IELTS Reading Mock Test 01", recent.get(0).getExamTitle());
        assertNotNull(recent.get(0).getExamId());
        assertNotNull(recent.get(0).getAttemptId());
        assertEquals("GRADED", recent.get(0).getStatus());
        assertEquals(Instant.parse("2026-09-11T14:20:00Z"), recent.get(4).getSubmittedAt());
        recent.forEach(attempt -> assertNotNull(attempt.getSubmittedAt()));
    }

    @Test
    void managerCounts_PublishedDraftAndDistinctStudents() {
        User manager1 = persistUser("manager1@gmail.com", "Manager One", User.ROLE_COURSE_MANAGER);
        User manager2 = persistUser("manager2@gmail.com", "Manager Two", User.ROLE_COURSE_MANAGER);
        User student1 = persistUser("student1@gmail.com", "Student One", User.ROLE_STUDENT);
        User student2 = persistUser("student2@gmail.com", "Student Two", User.ROLE_STUDENT);
        User student3 = persistUser("student3@gmail.com", "Student Three", User.ROLE_STUDENT);

        Course published = persistCourse(manager1, "IELTS Academic", true, null);
        Course draft = persistCourse(manager1, "TOEFL Practice", false, null);
        Course otherManagerCourse = persistCourse(manager2, "SAT Prep", true, null);

        enroll(student1, published, Enrollment.STATUS_ACTIVE, 30, Instant.parse("2026-09-01T00:00:00Z"));
        enroll(student1, draft, Enrollment.STATUS_ACTIVE, 10, Instant.parse("2026-09-02T00:00:00Z"));
        enroll(student2, published, Enrollment.STATUS_COMPLETED, 100, Instant.parse("2026-09-03T00:00:00Z"));
        enroll(student3, otherManagerCourse, Enrollment.STATUS_ACTIVE, 50, Instant.parse("2026-09-04T00:00:00Z"));
        em.flush();

        assertEquals(2, courseRepository.countByManagerId(manager1.getUserId()));
        assertEquals(1, courseRepository.countByManagerIdAndPublished(manager1.getUserId(), true));
        assertEquals(1, courseRepository.countByManagerIdAndPublished(manager1.getUserId(), false));
        assertEquals(2, enrollmentRepository.countDistinctStudentsByManagerId(manager1.getUserId()));
    }

    @Test
    void managerRecentCourses_StudentCountStatusAndOrder() {
        User manager = persistUser("manager@gmail.com", "Manager One", User.ROLE_COURSE_MANAGER);
        User student1 = persistUser("student1@gmail.com", "Student One", User.ROLE_STUDENT);
        User student2 = persistUser("student2@gmail.com", "Student Two", User.ROLE_STUDENT);
        User student3 = persistUser("student3@gmail.com", "Student Three", User.ROLE_STUDENT);

        Course courseA = persistCourse(manager, "Course A", true, null);
        Course courseB = persistCourse(manager, "Course B", false, null);
        Course courseC = persistCourse(manager, "Course C", true, null);
        em.flush();

        setCreatedAt("courses", "course_id", courseA.getCourseId(), Instant.parse("2026-03-01T00:00:00Z"));
        setCreatedAt("courses", "course_id", courseB.getCourseId(), Instant.parse("2026-03-02T00:00:00Z"));
        setCreatedAt("courses", "course_id", courseC.getCourseId(), Instant.parse("2026-03-03T00:00:00Z"));

        enroll(student1, courseA, Enrollment.STATUS_ACTIVE, 40, Instant.parse("2026-09-01T00:00:00Z"));
        enroll(student2, courseA, Enrollment.STATUS_ACTIVE, 55, Instant.parse("2026-09-02T00:00:00Z"));
        enroll(student3, courseB, Enrollment.STATUS_ACTIVE, 20, Instant.parse("2026-09-03T00:00:00Z"));
        em.flush();
        em.clear();

        List<ManagerCourseInfo> recent =
                courseRepository.findRecentCoursesByManagerId(manager.getUserId(), PageRequest.of(0, 5));

        assertEquals(3, recent.size());
        assertEquals("Course C", recent.get(0).getTitle());
        assertTrue(recent.get(0).getIsPublished());
        assertEquals(0L, recent.get(0).getStudentCount());
        assertEquals("Course B", recent.get(1).getTitle());
        assertFalse(recent.get(1).getIsPublished());
        assertEquals(1L, recent.get(1).getStudentCount());
        assertEquals("Course A", recent.get(2).getTitle());
        assertTrue(recent.get(2).getIsPublished());
        assertEquals(2L, recent.get(2).getStudentCount());
    }

    @Test
    void adminRecentUsers_RoleCountsAndOrder() {
        User admin = persistUser("admin@gmail.com", "Platform Admin", User.ROLE_ADMIN);
        User manager = persistUser("manager@gmail.com", "Manager One", User.ROLE_COURSE_MANAGER);
        User[] students = new User[7];
        for (int i = 1; i <= 6; i++) {
            students[i] = persistUser("student" + i + "@gmail.com", "Student " + toWord(i), User.ROLE_STUDENT);
        }
        em.flush();

        setCreatedAt("users", "user_id", admin.getUserId(), Instant.parse("2026-01-01T00:00:00Z"));
        setCreatedAt("users", "user_id", manager.getUserId(), Instant.parse("2026-01-02T00:00:00Z"));
        for (int i = 1; i <= 6; i++) {
            setCreatedAt("users", "user_id", students[i].getUserId(),
                    Instant.parse(String.format("2026-02-%02dT00:00:00Z", i)));
        }
        em.flush();
        em.clear();

        List<RecentUser> recent = userRepository.findRecentUsers(PageRequest.of(0, 5));

        assertEquals(5, recent.size());
        assertEquals("Student Six", recent.get(0).getFullName());
        assertEquals("student6@gmail.com", recent.get(0).getEmail());
        assertEquals(User.ROLE_STUDENT, recent.get(0).getRole());
        assertEquals(Instant.parse("2026-02-06T00:00:00Z"), recent.get(0).getCreatedAt());
        assertEquals("student5@gmail.com", recent.get(1).getEmail());
        assertEquals("student2@gmail.com", recent.get(4).getEmail());

        assertEquals(6, userRepository.countByRoleName(User.ROLE_STUDENT));
        assertEquals(1, userRepository.countByRoleName(User.ROLE_COURSE_MANAGER));
        assertEquals(1, userRepository.countByRoleName(User.ROLE_ADMIN));
        assertEquals(8, userRepository.count());
    }

    private static String toWord(int i) {
        return switch (i) {
            case 1 -> "One";
            case 2 -> "Two";
            case 3 -> "Three";
            case 4 -> "Four";
            case 5 -> "Five";
            case 6 -> "Six";
            default -> String.valueOf(i);
        };
    }

    private User persistUser(String email, String fullName, String roleName) {
        User user = User.builder()
                .email(email)
                .passwordHash("$2a$10$examplehashexamplehashexamplehashexamplehash")
                .fullName(fullName)
                .roleName(roleName)
                .status(User.STATUS_ACTIVE)
                .build();
        em.persist(user);
        return user;
    }

    private Course persistCourse(User manager, String title, boolean published, String thumbnailUrl) {
        if (cachedCategory == null) {
            cachedCategory = Category.builder()
                    .name("General")
                    .slug("general-" + UUID.randomUUID().toString().replace("-", "").substring(0, 12))
                    .build();
            em.persist(cachedCategory);
        }
        Course course = Course.builder()
                .categoryId(cachedCategory.getCategoryId())
                .manager(manager)
                .title(title)
                .slug(UUID.randomUUID().toString().replace("-", "").substring(0, 20))
                .price(BigDecimal.ZERO)
                .thumbnailUrl(thumbnailUrl)
                .isPublished(published)
                .build();
        em.persist(course);
        return course;
    }

    private Enrollment enroll(User user, Course course, String status, int progress, Instant enrolledAt) {
        Enrollment enrollment = Enrollment.builder()
                .course(course)
                .user(user)
                .enrolledAt(enrolledAt)
                .status(status)
                .progress(progress)
                .paidAmount(BigDecimal.ZERO)
                .build();
        em.persist(enrollment);
        return enrollment;
    }

    private Exam persistExam(Course course, User createdBy, String title) {
        Exam exam = Exam.builder()
                .course(course)
                .createdBy(createdBy)
                .title(title)
                .durationMinutes(60)
                .isPractice(false)
                .generationType("FIXED")
                .status("DRAFT")
                .build();
        em.persist(exam);
        return exam;
    }

    private ExamAttempt persistAttempt(User user, Exam exam, Instant submitTime, BigDecimal score, String status) {
        ExamAttempt attempt = ExamAttempt.builder()
                .exam(exam)
                .user(user)
                .startTime(Instant.parse("2026-09-01T00:00:00Z"))
                .deadlineAt(submitTime)
                .submitTime(submitTime)
                .totalScore(score)
                .status(status)
                .build();
        em.persist(attempt);
        return attempt;
    }

    private void setCreatedAt(String table, String idColumn, Long id, Instant createdAt) {
        em.getEntityManager().createNativeQuery(
                        "UPDATE " + table + " SET created_at = ?1 WHERE " + idColumn + " = ?2")
                .setParameter(1, OffsetDateTime.ofInstant(createdAt, ZoneOffset.UTC))
                .setParameter(2, id)
                .executeUpdate();
    }
}
