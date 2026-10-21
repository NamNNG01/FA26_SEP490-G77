package com.examprep.dto.question;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ImportBlockResult {
    private int index;
    private int startLine;
    private String questionType;
    private QuestionCreateRequest questionData;
    private List<ImportErrorDto> errors;
}
