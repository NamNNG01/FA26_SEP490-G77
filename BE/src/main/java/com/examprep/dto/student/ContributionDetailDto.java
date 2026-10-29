package com.examprep.dto.student;

import com.examprep.dto.question.AnswerOptionDto;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ContributionDetailDto {
    private Long contributionId;
    private Long courseId;
    private String type;
    private String status;
    private String title;
    private String content;
    private Long moduleId;
    private Long groupId;
    private String questionType;
    private List<AnswerOptionDto> options;
    private Object answerKey;
    private String explanation;
    private String difficulty;
    private Object essayGradingRubric;
    private Object questionMetadata;
    private String fileName;
    private Integer fileSizeKb;
    private String fileUrl;
    private String sourceReference;
    private String reviewNote;
    private Integer resubmissionCount;
    private Instant createdAt;
    private Instant reviewedAt;
}
