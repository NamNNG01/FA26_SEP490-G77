package com.examprep.dto.question;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TestCaseDto {
    private String inputData;
    private String expectedOutput;
    private Boolean hidden;
    private Integer orderIndex;
}
