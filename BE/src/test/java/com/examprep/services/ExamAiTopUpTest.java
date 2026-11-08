package com.examprep.services;

import com.examprep.ai.AiClient;
import com.examprep.ai.AiRequest;
import com.examprep.ai.AiResponse;
import com.examprep.dto.ExamAiDraftResponse;
import com.examprep.dto.ExamAiRequest;
import com.examprep.entities.Course;
import com.examprep.entities.User;
import com.examprep.repositories.*;
import com.examprep.security.UserPrincipal;
import com.examprep.util.validation.QuestionValidator;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** The model often returns one question short; the service must top up the missing slot. */
class ExamAiTopUpTest {

    private static String questions(int from, int count) {
        return IntStream.range(from, from + count).mapToObj(i -> """
                {"content":"Question %d?","questionType":"SINGLE_CHOICE","difficulty":"EASY","defaultPoints":1,
                 "explanation":"x","questionMetadata":{"skillTag":"t"},
                 "options":[{"optionText":"A","isCorrect":true,"orderIndex":0},{"optionText":"B","isCorrect":false,"orderIndex":1},
                            {"optionText":"C","isCorrect":false,"orderIndex":2}]}""".formatted(i))
                .collect(Collectors.joining(",", "{\"title\":\"T\",\"description\":\"D\",\"questions\":[", "]}"));
    }

    @Test
    void topsUpWhenModelReturnsOneShort() throws Exception {
        CourseRepository courses = mock(CourseRepository.class);
        when(courses.findById(1L)).thenReturn(Optional.of(mock(Course.class)));
        AiClient ai = mock(AiClient.class);
        when(ai.complete(any())).thenReturn(AiResponse.builder().text(questions(0, 9)).build(),
                AiResponse.builder().text(questions(9, 1)).build());
        ObjectMapper json = new ObjectMapper();
        ExamAiServiceImpl service = new ExamAiServiceImpl(courses, mock(CourseManagerRepository.class),
                mock(ModuleRepository.class), mock(QuestionRepository.class), mock(QuestionValidator.class), json,
                mock(Validator.class), ai);
        ReflectionTestUtils.setField(service, "timeoutMillis", 90_000L);
        ReflectionTestUtils.setField(service, "dailyLimit", 20);

        ExamAiDraftResponse draft = service.generate(UserPrincipal.builder().id(1L).role(User.ROLE_ADMIN).build(),
                new ExamAiRequest(1L, null, null, 10, Map.of("EASY", 10),
                        List.of(new ExamAiRequest.TypeCount("SINGLE_CHOICE", 10)), 30, "en", null));

        assertEquals(10, draft.questions().size());
        assertTrue(draft.warnings().isEmpty(), draft.warnings().toString());
        ArgumentCaptor<AiRequest> calls = ArgumentCaptor.forClass(AiRequest.class);
        verify(ai, times(2)).complete(calls.capture());
        assertEquals(10, json.readTree(calls.getAllValues().get(0).getPrompt()).path("questionPlan").size());
        assertEquals(1, json.readTree(calls.getAllValues().get(1).getPrompt()).path("questionCount").asInt());
    }

    @Test
    void planZipsTypesWithDifficulties() {
        Map<String, Integer> types = new LinkedHashMap<>(Map.of("SINGLE_CHOICE", 2));
        types.put("ESSAY", 1);
        var plan = ExamAiServiceImpl.plan(types, Map.of("EASY", 2, "HARD", 1, "MEDIUM", 0));
        assertEquals(List.of(Map.of("questionType", "SINGLE_CHOICE", "difficulty", "EASY"),
                Map.of("questionType", "SINGLE_CHOICE", "difficulty", "EASY"),
                Map.of("questionType", "ESSAY", "difficulty", "HARD")), plan);
    }
}
