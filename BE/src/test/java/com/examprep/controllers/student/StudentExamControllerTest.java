package com.examprep.controllers.student;

import com.examprep.config.SecurityConfig;
import com.examprep.controllers.StudentExamController;
import com.examprep.dto.student.*;
import com.examprep.security.JwtTokenProvider;
import com.examprep.security.RestAccessDeniedHandler;
import com.examprep.security.RestAuthenticationEntryPoint;
import com.examprep.security.UserPrincipal;
import com.examprep.services.student.StudentExamService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(StudentExamController.class)
@Import({SecurityConfig.class, RestAuthenticationEntryPoint.class, RestAccessDeniedHandler.class})
class StudentExamControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private StudentExamService studentExamService;

    @MockBean
    private JwtTokenProvider jwtTokenProvider;

    @MockBean
    private com.examprep.repositories.UserRepository userRepository;

    @Test
    void getExamDetail_Success() throws Exception {
        ExamDetailDto detail = new ExamDetailDto(
                5L, 1L, "Course 1", "Midterm Exam", "Desc", 60,
                BigDecimal.TEN, 10, Instant.now(),
                new ExamMyStatsDto(1L, BigDecimal.valueOf(8), Instant.now(), 100L),
                new ExamActionsDto(true, null, true, null)
        );
        UserPrincipal principal = UserPrincipal.create(10L, "student@examprep.local", "STUDENT");
        when(studentExamService.getExamDetail(eq(5L), eq(10L))).thenReturn(detail);

        mockMvc.perform(get("/api/v1/student/exams/5").with(user(principal)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.examId").value(5))
                .andExpect(jsonPath("$.data.title").value("Midterm Exam"));
    }

    @Test
    void listMyExams_Success() throws Exception {
        MyExamDto myExam = new MyExamDto(
                100L, "Midterm Exam", 5L, "Course 1", BigDecimal.TEN, 1L, BigDecimal.valueOf(8), "EXAM"
        );
        UserPrincipal principal = UserPrincipal.create(10L, "student@examprep.local", "STUDENT");
        when(studentExamService.listMyExams(anyInt(), anyInt(), eq(10L)))
                .thenReturn(new PageImpl<>(List.of(myExam), PageRequest.of(0, 20), 1));

        mockMvc.perform(get("/api/v1/student/my-exams").with(user(principal)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.content[0].examId").value(100))
                .andExpect(jsonPath("$.data.content[0].mode").value("EXAM"));
    }
}
