package com.examprep.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class QuestionGroupResponse {

    private Long groupId;
    private Long courseId;
    private Long moduleId;
    private String questionType;
    private String title;
    private String passageText;
    private long questionCount;
}
