package com.examprep.dto.question;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class QuestionListItemDto {
    private Long questionId;
    private String content;
    private Long courseId;
    private String courseName;
    private Long moduleId;
    private String moduleName;
    private Long groupId;
    private String questionType;
    private String difficulty;
    private String status;
    private String approvalStatus;
    private String creatorRole;
    private String source;
    private Long createdBy;
    private Integer scoringVersion;
    private Long lockVersion;
    private long optionCount;
    private Instant updatedAt;
}
