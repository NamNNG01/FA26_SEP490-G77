package com.examprep.dto.question;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AnswerOptionDto {
    private Long optionId;
    private String key;
    private String optionText;
    private Boolean isCorrect;
    private String explanation;
    private Integer orderIndex;
}
