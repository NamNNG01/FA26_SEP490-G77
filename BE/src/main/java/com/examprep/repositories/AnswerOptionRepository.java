package com.examprep.repositories;

import com.examprep.entities.AnswerOption;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

@Repository
public interface AnswerOptionRepository extends JpaRepository<AnswerOption, Long> {
    List<AnswerOption> findByQuestion_QuestionId(Long questionId);
    java.util.List<AnswerOption> findByQuestionQuestionIdOrderByOrderIndexAscOptionIdAsc(Long questionId);

    /** SA-01: every option of a whole paper in one query, ordered by question and position. */
    @Query("SELECT o FROM AnswerOption o WHERE o.question.questionId IN :questionIds " +
            "ORDER BY o.question.questionId, o.orderIndex, o.optionId")
    List<AnswerOption> findByQuestionIds(@Param("questionIds") Collection<Long> questionIds);
}
