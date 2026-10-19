package com.examprep.ai;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("dev")
@ConditionalOnProperty(name = "app.ai.client", havingValue = "fake")
public class FakeAiClient implements AiClient {

    @Override
    public AiResponse complete(AiRequest request) {
        String prompt = request != null && request.getPrompt() != null ? request.getPrompt() : "";

        if (prompt.contains("__TIMEOUT__")) {
            try {
                Thread.sleep(200);
            } catch (InterruptedException ignored) {}
            throw new RuntimeException("AI request timed out (__TIMEOUT__)");
        }

        if (prompt.contains("__BAD_JSON__")) {
            AiResponse resp = new AiResponse();
            resp.setText("INVALID_JSON_STREAM_{{{not closed");
            resp.setInputTokens(100);
            resp.setOutputTokens(50);
            resp.setModel("fake-dev-model");
            return resp;
        }

        if (prompt.contains("__PARTIAL__")) {
            AiResponse resp = new AiResponse();
            resp.setText("[{\"content\": \"Incomplete question missing options\"}]");
            resp.setInputTokens(120);
            resp.setOutputTokens(80);
            resp.setModel("fake-dev-model");
            return resp;
        }

        if (prompt.contains("__TOKENS_HUGE__")) {
            AiResponse resp = new AiResponse();
            resp.setText("[{\"content\": \"Huge token question?\", \"questionType\": \"SINGLE_CHOICE\", \"difficulty\": \"MEDIUM\", \"defaultPoints\": 1, \"options\": [{\"optionText\": \"A\", \"isCorrect\": true}]}]");
            resp.setInputTokens(100000);
            resp.setOutputTokens(500000);
            resp.setModel("fake-dev-model");
            return resp;
        }

        String text = "[{\"content\": \"Sample AI generated question?\", \"questionType\": \"SINGLE_CHOICE\", \"difficulty\": \"MEDIUM\", \"defaultPoints\": 1, \"options\": [{\"optionText\": \"Option A\", \"isCorrect\": true}, {\"optionText\": \"Option B\", \"isCorrect\": false}]}]";

        AiResponse resp = new AiResponse();
        resp.setText(text);
        resp.setInputTokens(150);
        resp.setOutputTokens(250);
        resp.setModel("fake-dev-model");
        return resp;
    }
}
