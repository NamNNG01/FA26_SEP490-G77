package com.examprep.repositories;

import com.examprep.entities.Document;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Optional;
import java.util.List;
import com.examprep.dto.student.MaterialResponses.DocumentSummary;
import com.examprep.dto.student.MaterialResponses.DocumentCourse;
import org.springframework.stereotype.Repository;

@Repository
public interface DocumentRepository extends JpaRepository<Document, Long> {
    @Query("""
        SELECT new com.examprep.dto.student.MaterialResponses$DocumentSummary(
            d.docId, d.title, d.fileName, d.pageCount, d.createdAt)
        FROM Document d WHERE d.user.userId = :userId
          AND d.generationType = 'MATERIAL'
          AND (:courseId IS NULL OR EXISTS (SELECT c.courseId FROM d.courses c WHERE c.courseId = :courseId))
        ORDER BY d.createdAt DESC, d.docId DESC
        """)
    Page<DocumentSummary> findSummaries(@Param("userId") Long userId, @Param("courseId") Long courseId, Pageable pageable);

    @Query("""
        SELECT new com.examprep.dto.student.MaterialResponses$DocumentCourse(d.docId, c.courseId, c.title)
        FROM Document d JOIN d.courses c WHERE d.user.userId = :userId AND d.docId IN :ids
          AND d.generationType = 'MATERIAL'
        ORDER BY c.courseId
        """)
    List<DocumentCourse> findCourseLinks(@Param("userId") Long userId, @Param("ids") List<Long> ids);

    boolean existsByCoursesCourseId(Long courseId);

    @Query("""
        SELECT d FROM Document d JOIN d.courses c
        WHERE d.user.userId = :userId AND c.courseId = :courseId AND d.generationType = 'MATERIAL'
        ORDER BY d.createdAt DESC
        """)
    Page<Document> findByUserUserIdAndCoursesCourseIdOrderByCreatedAtDesc(
            @Param("userId") Long userId, @Param("courseId") Long courseId, Pageable pageable);

    @Query("SELECT d FROM Document d WHERE d.user.userId = :userId AND d.generationType = 'MATERIAL' ORDER BY d.createdAt DESC")
    Page<Document> findByUserUserIdOrderByCreatedAtDesc(@Param("userId") Long userId, Pageable pageable);

    @Query("SELECT d FROM Document d WHERE d.user.userId = :userId AND d.sha256 = :sha256 AND d.generationType = 'MATERIAL'")
    Optional<Document> findByUserUserIdAndSha256(@Param("userId") Long userId, @Param("sha256") String sha256);

    @Query("SELECT COUNT(d) FROM Document d WHERE d.user.userId = :userId AND d.generationType = 'MATERIAL'")
    long countByUserUserId(@Param("userId") Long userId);

    @Query("select d from Document d where d.docId = :id and d.user.userId = :userId and d.generationType = 'MATERIAL'")
    Optional<Document> findOwned(@Param("id") Long id, @Param("userId") Long userId);
}
