package com.examprep.repositories;

import com.examprep.dto.StudentRecentCourse;
import com.examprep.dto.IdCount;
import org.springframework.data.domain.Page;
import org.springframework.data.jpa.repository.EntityGraph;
import com.examprep.entities.Enrollment;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface EnrollmentRepository extends JpaRepository<Enrollment, Long> {
    boolean existsByCourse_CourseIdAndUser_UserId(Long courseId, Long userId);

    boolean existsByCourse_CourseIdAndUser_UserIdAndStatus(Long courseId, Long userId, String status);

    Optional<Enrollment> findByUser_UserIdAndCourse_CourseId(Long userId, Long courseId);

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT e FROM Enrollment e WHERE e.user.userId = :userId AND e.course.courseId = :courseId")
    Optional<Enrollment> findForUpdate(@Param("userId") Long userId, @Param("courseId") Long courseId);

    @Query("SELECT new com.examprep.dto.student.MyCourseDto(" +
            "c.courseId, c.title, c.slug, c.thumbnailUrl, c.price, " +
            "new com.examprep.dto.student.CategoryRefDto(cat.categoryId, cat.name), " +
            "new com.examprep.dto.student.ManagerRefDto(m.userId, m.fullName), " +
            "en.enrolledAt, en.status, en.progress, " +
            "(SELECT COUNT(ex) FROM Exam ex WHERE ex.course = c AND ex.status = 'PUBLISHED' " +
            "AND NOT EXISTS (SELECT hm FROM Module hm WHERE hm = ex.module AND hm.status = 'HIDDEN')), " +
            "(SELECT COUNT(d) FROM Deck d WHERE d.course = c), " +
            "null) " +
            "FROM Enrollment en JOIN en.course c JOIN c.category cat JOIN c.manager m " +
            "WHERE en.user.userId = :userId AND (:status IS NULL OR en.status = :status)")
    Page<com.examprep.dto.student.MyCourseDto> findMyCourses(@Param("userId") Long userId, @Param("status") String status, Pageable pageable);

    @Query("SELECT COUNT(e) FROM Enrollment e WHERE e.user.userId = :userId")
    long countByUserId(@Param("userId") Long userId);

    @Query("SELECT COUNT(e) FROM Enrollment e WHERE e.user.userId = :userId AND e.status = :status")
    long countByUserIdAndStatus(@Param("userId") Long userId, @Param("status") String status);

    @Query("SELECT COUNT(DISTINCT e.user.userId) FROM Enrollment e JOIN e.course c WHERE " + CourseRepository.MANAGER_SCOPE)
    long countDistinctStudentsByManagerId(@Param("managerId") Long managerId);

    @Query("SELECT new com.examprep.dto.StudentRecentCourse(c.courseId, c.title, c.thumbnailUrl, e.progress) " +
            "FROM Enrollment e JOIN e.course c " +
            "WHERE e.user.userId = :userId " +
            "ORDER BY e.enrolledAt DESC")
    List<StudentRecentCourse> findRecentCoursesByUserId(@Param("userId") Long userId, Pageable pageable);

    boolean existsByCourseCourseId(Long courseId);

    @Query("SELECT new com.examprep.dto.IdCount(e.course.courseId, COUNT(DISTINCT e.user.userId)) FROM Enrollment e WHERE e.course.courseId IN :ids GROUP BY e.course.courseId")
    List<IdCount> countByCourses(@Param("ids") List<Long> ids);

    // UM-01: enrolled-courses counter per user for one page of the admin user list.
    @Query("SELECT new com.examprep.dto.IdCount(e.user.userId, COUNT(e)) FROM Enrollment e WHERE e.user.userId IN :ids GROUP BY e.user.userId")
    List<IdCount> countByUserIds(@Param("ids") List<Long> ids);

    @EntityGraph(attributePaths = "user")
    @Query("SELECT e FROM Enrollment e WHERE e.course.courseId = :courseId AND (:status IS NULL OR e.status = :status) " +
            "AND (LOWER(e.user.fullName) LIKE :search ESCAPE '!' OR LOWER(e.user.email) LIKE :search ESCAPE '!')")
    Page<Enrollment> findStudents(@Param("courseId") Long courseId, @Param("status") String status,
                                  @Param("search") String search, Pageable pageable);
}
