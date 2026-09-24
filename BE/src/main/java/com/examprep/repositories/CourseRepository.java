package com.examprep.repositories;

import com.examprep.dto.ManagerCourseInfo;
import com.examprep.entities.Course;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CourseRepository extends JpaRepository<Course, Long> {

    @Query("SELECT COUNT(c) FROM Course c WHERE c.manager.userId = :managerId")
    long countByManagerId(@Param("managerId") Long managerId);

    @Query("SELECT COUNT(c) FROM Course c WHERE c.manager.userId = :managerId AND c.isPublished = :published")
    long countByManagerIdAndPublished(@Param("managerId") Long managerId, @Param("published") boolean published);

    @Query("SELECT new com.examprep.dto.ManagerCourseInfo(c.courseId, c.title, c.isPublished, COUNT(e)) " +
            "FROM Course c LEFT JOIN c.enrollments e " +
            "WHERE c.manager.userId = :managerId " +
            "GROUP BY c.courseId, c.title, c.isPublished, c.createdAt " +
            "ORDER BY c.createdAt DESC")
    List<ManagerCourseInfo> findRecentCoursesByManagerId(@Param("managerId") Long managerId, Pageable pageable);
}
