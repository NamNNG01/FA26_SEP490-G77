package com.examprep.repositories;

import com.examprep.dto.StudentRecentCourse;
import com.examprep.entities.Enrollment;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface EnrollmentRepository extends JpaRepository<Enrollment, Long> {

    @Query("SELECT COUNT(e) FROM Enrollment e WHERE e.user.userId = :userId")
    long countByUserId(@Param("userId") Long userId);

    @Query("SELECT COUNT(e) FROM Enrollment e WHERE e.user.userId = :userId AND e.status = :status")
    long countByUserIdAndStatus(@Param("userId") Long userId, @Param("status") String status);

    @Query("SELECT COUNT(DISTINCT e.user.userId) FROM Enrollment e WHERE e.course.manager.userId = :managerId")
    long countDistinctStudentsByManagerId(@Param("managerId") Long managerId);

    @Query("SELECT new com.examprep.dto.StudentRecentCourse(c.courseId, c.title, c.thumbnailUrl, e.progress) " +
            "FROM Enrollment e JOIN e.course c " +
            "WHERE e.user.userId = :userId " +
            "ORDER BY e.enrolledAt DESC")
    List<StudentRecentCourse> findRecentCoursesByUserId(@Param("userId") Long userId, Pageable pageable);
}
