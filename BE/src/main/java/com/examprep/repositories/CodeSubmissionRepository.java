package com.examprep.repositories;

import com.examprep.entities.CodeSubmission;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface CodeSubmissionRepository extends JpaRepository<CodeSubmission, Long> {

    /** CD-07: my submissions of one exam, newest first. */
    @Query("SELECT s FROM CodeSubmission s WHERE s.user.userId = :userId "
            + "AND s.attempt.exam.examId = :examId ORDER BY s.submittedAt DESC, s.submissionId DESC")
    Page<CodeSubmission> findHistory(@Param("userId") Long userId, @Param("examId") Long examId,
                                     Pageable pageable);
}
