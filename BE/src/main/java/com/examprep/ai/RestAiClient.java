
package com.examprep.ai;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

@Component
@ConditionalOnProperty(
        name = "app.ai.client",
        havingValue = "real",
        matchIfMissing = true
)
public class RestAiClient implements AiClient {

    private final RestClient restClient;
    private final String defaultModel;

    public RestAiClient(
            @Value("${app.ai.base-url:https://generativelanguage.googleapis.com/v1beta}")
            String baseUrl,
            @Value("${app.ai.api-key:}")
            String apiKey,
            @Value("${app.ai.model:gemini-2.5-flash}")
            String defaultModel) {

        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalStateException(
                    "Gemini API key is missing. Set GEMINI_API_KEY."
            );
        }

        this.defaultModel = defaultModel;

        this.restClient = RestClient.builder()
                .baseUrl(baseUrl)
                .defaultHeader("x-goog-api-key", apiKey)
                .defaultHeader("Content-Type", "application/json")
                .build();
    }

    @Override
    public AiResponse complete(AiRequest request) {
        String model = request.getModel() != null
                ? request.getModel()
                : defaultModel;

        int maxTokens = request.getMaxTokens() != null
                ? request.getMaxTokens()
                : 4096;

        Map<String, Object> body = Map.of(
                "systemInstruction",
                Map.of(
                        "parts",
                        List.of(
                                Map.of(
                                        "text",
                                        request.getSystemPrompt() != null
                                                ? request.getSystemPrompt()
                                                : ""
                                )
                        )
                ),
                "contents",
                List.of(
                        Map.of(
                                "role", "user",
                                "parts", List.of(
                                        Map.of(
                                                "text",
                                                request.getPrompt()
                                        )
                                )
                        )
                ),
                "generationConfig",
                Map.of("maxOutputTokens", maxTokens)
        );

        try {
            Map<String, Object> responseMap = restClient.post()
                    .uri("/models/{model}:generateContent", model)
                    .body(body)
                    .retrieve()
                    .onStatus(HttpStatusCode::isError, (req, res) -> {
                        String errorBody = new String(
                                res.getBody().readAllBytes(),
                                java.nio.charset.StandardCharsets.UTF_8
                        );

                        throw new RuntimeException(
                                "Gemini API error: HTTP "
                                        + res.getStatusCode()
                                        + " - "
                                        + errorBody
                        );
                    })
                    .body(Map.class);

            if (responseMap == null) {
                throw new RuntimeException(
                        "Gemini returned an empty response."
                );
            }

            String text = "";
            int inputTokens = 0;
            int outputTokens = 0;

            List<Map<String, Object>> candidates =
                    (List<Map<String, Object>>) responseMap.get("candidates");

            if (candidates != null && !candidates.isEmpty()) {
                Map<String, Object> candidate = candidates.get(0);

                Map<String, Object> content =
                        (Map<String, Object>) candidate.get("content");

                if (content != null) {
                    List<Map<String, Object>> parts =
                            (List<Map<String, Object>>) content.get("parts");

                    if (parts != null) {
                        StringBuilder result = new StringBuilder();

                        for (Map<String, Object> part : parts) {
                            Object partText = part.get("text");

                            if (partText instanceof String) {
                                result.append((String) partText);
                            }
                        }

                        text = result.toString();
                    }
                }
            }

            Map<String, Object> usage =
                    (Map<String, Object>) responseMap.get("usageMetadata");

            if (usage != null) {
                Object promptTokens = usage.get("promptTokenCount");
                Object candidateTokens = usage.get("candidatesTokenCount");

                if (promptTokens instanceof Number) {
                    inputTokens = ((Number) promptTokens).intValue();
                }

                if (candidateTokens instanceof Number) {
                    outputTokens = ((Number) candidateTokens).intValue();
                }
            }

            if (text.isBlank()) {
                throw new RuntimeException(
                        "Gemini returned no text. Check candidates, "
                                + "prompt feedback, and safety filtering."
                );
            }

            return AiResponse.builder()
                    .text(text)
                    .inputTokens(inputTokens)
                    .outputTokens(outputTokens)
                    .model(model)
                    .build();

        } catch (Exception e) {
            throw new RuntimeException(
                    "Gemini completion failed: " + e.getMessage(),
                    e
            );
        }
    }
}
