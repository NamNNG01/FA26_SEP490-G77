package com.examprep.ai;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiRequest {
    private String prompt;
    private String systemPrompt;
    private String model;
    private Integer maxTokens;
}
