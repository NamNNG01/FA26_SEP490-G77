package com.examprep.repositories;

import com.examprep.entities.Document;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Optional;
import org.springframework.stereotype.Repository;

@Repository
public interface DocumentRepository extends JpaRepository<Document, Long> {
    boolean existsByCourseCourseId(Long courseId);

    Page<Document> findByUserUserIdAndCourseCourseIdOrderByCreatedAtDesc(Long userId, Long courseId, Pageable pageable);
    Page<Document> findByUserUserIdOrderByCreatedAtDesc(Long userId, Pageable pageable);

    @Query("select d from Document d join fetch d.course where d.docId = :id and d.user.userId = :userId")
    Optional<Document> findOwned(@Param("id") Long id, @Param("userId") Long userId);
}

