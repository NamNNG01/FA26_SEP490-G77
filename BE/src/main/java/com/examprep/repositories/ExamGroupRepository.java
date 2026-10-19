package com.examprep.repositories;

import com.examprep.entities.ExamGroup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface ExamGroupRepository extends JpaRepository<ExamGroup, Long> {
    java.util.List<ExamGroup> findByExamExamIdOrderByOrderIndexAscExamGroupIdAsc(Long examId);
    void deleteByExamExamId(Long examId);

    @Query("SELECT COUNT(eg) FROM ExamGroup eg " +
            "WHERE eg.group.groupId = :groupId AND eg.exam.status = :examStatus")
    long countByGroupIdAndExamStatus(@Param("groupId") Long groupId,
                                     @Param("examStatus") String examStatus);

    @Modifying
    @Query("DELETE FROM ExamGroup eg WHERE eg.group.groupId = :groupId")
    int deleteByGroupId(@Param("groupId") Long groupId);
}

