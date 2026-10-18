package com.examprep.repositories;

import com.examprep.entities.Question;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

@Repository
public interface QuestionRepository extends JpaRepository<Question, Long> {

    @Query("SELECT q.group.groupId, COUNT(q) FROM Question q " +
            "WHERE q.group.groupId IN :groupIds " +
            "GROUP BY q.group.groupId")
    List<Object[]> countByGroupIds(@Param("groupIds") Collection<Long> groupIds);

    @Modifying
    @Query("UPDATE Question q SET q.group = null WHERE q.group.groupId = :groupId")
    int detachFromGroup(@Param("groupId") Long groupId);
}

