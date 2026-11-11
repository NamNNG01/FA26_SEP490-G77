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
public class CodeConfigDto {
    private List<String> allowedLanguages;
    private String codeTemplate;
    private Integer timeLimitMs;
    private Integer memoryLimitKb;
}
