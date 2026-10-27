package com.examprep.repositories;

import com.examprep.dto.ManagerCourseInfo;
import com.examprep.dto.student.CourseCardDto;
import com.examprep.entities.Course;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CourseRepository extends JpaRepository<Course, Long> {

    String MANAGER_SCOPE = "(c.manager.userId = :managerId OR EXISTS (SELECT cm.courseManagerId FROM CourseManager cm WHERE cm.course = c AND cm.user.userId = :managerId))";

    @Query("SELECT COUNT(c) FROM Course c WHERE " + MANAGER_SCOPE)
    long countByManagerId(@Param("managerId") Long managerId);

    @Query("SELECT COUNT(c) FROM Course c WHERE c.courseId = :courseId AND " + MANAGER_SCOPE)
    long countOwnedCourse(@Param("courseId") Long courseId, @Param("managerId") Long managerId);

    @Query("SELECT COUNT(c) FROM Course c WHERE " + MANAGER_SCOPE + " AND c.isPublished = :published")
    long countByManagerIdAndPublished(@Param("managerId") Long managerId, @Param("published") boolean published);

    @Query("SELECT new com.examprep.dto.ManagerCourseInfo(c.courseId, c.title, c.isPublished, COUNT(DISTINCT e.user.userId)) " +
            "FROM Course c LEFT JOIN c.enrollments e " +
            "WHERE " + MANAGER_SCOPE + " " +
            "GROUP BY c.courseId, c.title, c.isPublished, c.createdAt " +
            "ORDER BY c.createdAt DESC")
    List<ManagerCourseInfo> findRecentCoursesByManagerId(@Param("managerId") Long managerId, Pageable pageable);

    @EntityGraph(attributePaths = {"category", "manager"})
    @Query("SELECT c FROM Course c WHERE (:managerId IS NULL OR " + MANAGER_SCOPE + ") " +
            "AND (:categoryId IS NULL OR c.categoryId = :categoryId) " +
            "AND (:published IS NULL OR c.isPublished = :published) " +
            "AND (LOWER(c.title) LIKE :search ESCAPE '!' OR LOWER(c.description) LIKE :search ESCAPE '!')")
    Page<Course> findManagedCourses(@Param("managerId") Long managerId, @Param("categoryId") Long categoryId,
                                   @Param("published") Boolean published, @Param("search") String search, Pageable pageable);

    @EntityGraph(attributePaths = {"category", "manager"})
    @Query("SELECT c FROM Course c WHERE c.courseId = :id")
    Optional<Course> findDetail(@Param("id") Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT c FROM Course c WHERE c.courseId = :id")
    Optional<Course> findForUpdate(@Param("id") Long id);

    long countByIsPublishedTrue();

    long countByIsPublishedFalse();

    @Query("SELECT new com.examprep.dto.student.CourseCardDto(" +
            "c.courseId, c.title, c.slug, c.thumbnailUrl, c.price, " +
            "new com.examprep.dto.student.CategoryRefDto(cat.categoryId, cat.name), " +
            "new com.examprep.dto.student.ManagerRefDto(m.userId, m.fullName), " +
            "(SELECT COUNT(ex) FROM Exam ex WHERE ex.course = c AND ex.status = 'PUBLISHED' " +
            "AND NOT EXISTS (SELECT hm FROM Module hm WHERE hm = ex.module AND hm.status = 'HIDDEN')), " +
            "(SELECT COUNT(d) FROM Deck d WHERE d.course = c), " +
            "CASE WHEN :userId IS NOT NULL AND EXISTS (SELECT 1 FROM Enrollment en WHERE en.course = c AND en.user.userId = :userId AND en.status = 'ACTIVE') THEN true ELSE false END) " +
            "FROM Course c JOIN c.category cat JOIN c.manager m " +
            "WHERE c.isPublished = true " +
            "AND (:categoryId IS NULL OR c.categoryId = :categoryId) " +
            "AND (:search IS NULL OR LOWER(c.title) LIKE :search ESCAPE '!')")
    Page<CourseCardDto> findPublishedCourses(@Param("categoryId") Long categoryId, @Param("search") String search, @Param("userId") Long userId, Pageable pageable);
}
