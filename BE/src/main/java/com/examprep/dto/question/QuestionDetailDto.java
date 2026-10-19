package com.examprep.dto.question;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class QuestionDetailDto {
    private Long questionId;
    private Long courseId;
    private Long moduleId;
    private Long groupId;
    private String questionType;
    private String difficulty;
    private String content;
    private Object questionMetadata;
    private Object answerKey;
    private BigDecimal defaultPoints;
    private String source;
    private String creatorRole;
    private Long createdBy;
    private Integer scoringVersion;
    private Long lockVersion;
    private String aiExplanation;
    private String status;
    private String approvalStatus;
    private Object essayGradingRubric;
    private List<AnswerOptionDto> options;
    private Instant createdAt;
    private Instant updatedAt;
}
