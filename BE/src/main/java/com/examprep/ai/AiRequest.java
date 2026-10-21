package com.examprep.ai;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiRequest {
    private String prompt;
    private String systemPrompt;
    private String model;
    private Integer maxTokens;
    // Gemini structured output (OpenAPI-subset schema). When set the reply is guaranteed to be JSON of this shape.
    private Map<String, Object> responseSchema;
}
