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

    /**
     * A visible module holds public content: an approved ACTIVE question (an INACTIVE one is a draft),
     * a published exam, or a PUBLIC deck (a student's one also approved).
     */
    String HAS_VISIBLE_MODULE_CONTENT = """
        EXISTS (SELECT 1 FROM Module m WHERE m.course = c AND m.status = 'VISIBLE' AND (
            EXISTS (SELECT 1 FROM Question q WHERE q.module = m AND q.deletedAt IS NULL
                AND q.approvalStatus = 'APPROVED' AND q.status = 'ACTIVE')
            OR EXISTS (SELECT 1 FROM Exam ex WHERE ex.module = m AND ex.status = 'PUBLISHED' AND ex.mode = 'EXAM')
            OR EXISTS (SELECT 1 FROM Deck d WHERE d.module = m AND d.visibility = 'PUBLIC'
                AND (d.user.roleName <> 'STUDENT' OR d.reviewStatus = 'APPROVED'))
        ))
        """;

    String IS_PUBLISHABLE = """
        (
            EXISTS (SELECT 1 FROM Module m WHERE m.course = c AND m.status = 'VISIBLE')
            AND NOT EXISTS (SELECT 1 FROM Module em WHERE em.course = c AND NOT (
                EXISTS (SELECT 1 FROM Question q WHERE q.module = em AND q.deletedAt IS NULL
                    AND q.approvalStatus = 'APPROVED' AND q.status = 'ACTIVE')
                OR EXISTS (SELECT 1 FROM Exam ex WHERE ex.module = em AND ex.status = 'PUBLISHED' AND ex.mode = 'EXAM')
                OR EXISTS (SELECT 1 FROM Deck d WHERE d.module = em AND d.visibility = 'PUBLIC'
                    AND (d.user.roleName <> 'STUDENT' OR d.reviewStatus = 'APPROVED'))
            ))
            AND NOT EXISTS (SELECT 1 FROM Question dq LEFT JOIN dq.module dqm
                WHERE (dq.course = c OR dqm.course = c)
                  AND dq.deletedAt IS NULL
                  AND dq.sourceDocumentId IS NULL
                  AND COALESCE(dq.creatorRole, 'MANAGER') <> 'STUDENT'
                  AND dq.status <> 'ACTIVE')
        )
        """;

    @Query("""
    SELECT DISTINCT c.courseId FROM Course c
    WHERE c.manager.userId = :userId
    OR EXISTS (SELECT 1 FROM CourseManager cm
    WHERE cm.course = c AND cm.user.userId = :userId)
    """)
    List<Long> findCourseIdsManagedByUser(@Param("userId") Long userId);

    @Query("""
    SELECT COUNT(c) > 0 FROM Course c
    WHERE c.courseId = :courseId AND (
      c.manager.userId = :userId
      OR EXISTS (SELECT 1 FROM CourseManager cm WHERE cm.course = c AND cm.user.userId = :userId)
    )
    """)
    boolean existsManagedCourse(@Param("courseId") Long courseId, @Param("userId") Long userId);

    @Query("SELECT COUNT(c) FROM Course c WHERE " + MANAGER_SCOPE)
    long countByManagerId(@Param("managerId") Long managerId);

    @Query("SELECT COUNT(c) FROM Course c WHERE c.courseId = :courseId AND " + MANAGER_SCOPE)
    long countOwnedCourse(@Param("courseId") Long courseId, @Param("managerId") Long managerId);

    @Query("SELECT COUNT(c) FROM Course c WHERE " + MANAGER_SCOPE + " AND c.isPublished = :published")
    long countByManagerIdAndPublished(@Param("managerId") Long managerId, @Param("published") boolean published);

    @Query("SELECT new com.examprep.dto.ManagerCourseInfo(c.courseId, c.title, c.isPublished, COUNT(DISTINCT e.user.userId)) " +
            "FROM Course c LEFT JOIN c.enrollments e ON e.status <> 'CANCELLED' AND e.user.roleName = 'STUDENT' " +
            "WHERE " + MANAGER_SCOPE + " " +
            "GROUP BY c.courseId, c.title, c.isPublished, c.createdAt " +
            "ORDER BY c.createdAt DESC")
    List<ManagerCourseInfo> findRecentCoursesByManagerId(@Param("managerId") Long managerId, Pageable pageable);

    @EntityGraph(attributePaths = {"category", "manager"})
    @Query("SELECT c FROM Course c WHERE (:managerId IS NULL OR " + MANAGER_SCOPE + ") " +
            "AND (:categoryId IS NULL OR c.categoryId = :categoryId) " +
            "AND (:published IS NULL OR c.isPublished = :published) " +
            "AND (:status IS NULL OR (:status = 'PUBLISHED' AND c.isPublished = true) " +
            "OR (:status = 'READY_TO_PUBLISH' AND c.isPublished = false AND " + IS_PUBLISHABLE + ") " +
            "OR (:status = 'DRAFT' AND c.isPublished = false AND NOT " + IS_PUBLISHABLE + ")) " +
            "AND (LOWER(c.title) LIKE :search ESCAPE '!' OR LOWER(c.description) LIKE :search ESCAPE '!')")
    Page<Course> findManagedCourses(@Param("managerId") Long managerId, @Param("categoryId") Long categoryId,
                                   @Param("published") Boolean published, @Param("status") String status,
                                   @Param("search") String search, Pageable pageable);

    @Query("SELECT c.courseId FROM Course c WHERE c.courseId IN :ids AND " + HAS_VISIBLE_MODULE_CONTENT)
    List<Long> findCoursesWithVisibleModuleContent(@Param("ids") List<Long> ids);

    @Query("SELECT c.courseId FROM Course c WHERE c.courseId IN :ids AND " + IS_PUBLISHABLE)
    List<Long> findPublishableCourses(@Param("ids") List<Long> ids);

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
            "(SELECT COUNT(ex) FROM Exam ex WHERE ex.course = c AND ex.status = 'PUBLISHED' AND ex.mode = 'EXAM' " +
            "AND NOT EXISTS (SELECT hm FROM Module hm WHERE hm = ex.module AND hm.status = 'HIDDEN')), " +
            "(SELECT COUNT(d) FROM Deck d LEFT JOIN d.module dm WHERE d.course = c " +
            "AND (dm IS NULL OR dm.status <> 'HIDDEN') " +
            "AND (d.user.roleName <> 'STUDENT' OR (d.visibility = 'PUBLIC' AND d.reviewStatus = 'APPROVED'))), " +
            "CASE WHEN :userId IS NOT NULL AND EXISTS (SELECT 1 FROM Enrollment en WHERE en.course = c AND en.user.userId = :userId AND en.status IN ('ACTIVE', 'COMPLETED')) THEN true ELSE false END) " +
            "FROM Course c JOIN c.category cat JOIN c.manager m " +
            "WHERE c.isPublished = true " +
            "AND (:categoryId IS NULL OR c.categoryId = :categoryId) " +
            "AND (:search IS NULL OR LOWER(c.title) LIKE :search ESCAPE '!')")
    Page<CourseCardDto> findPublishedCourses(@Param("categoryId") Long categoryId, @Param("search") String search, @Param("userId") Long userId, Pageable pageable);
}
