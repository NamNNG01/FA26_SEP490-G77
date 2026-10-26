package com.examprep.controllers.student;

import com.examprep.config.SecurityConfig;
import com.examprep.controllers.StudentCourseController;
import com.examprep.dto.student.*;
import com.examprep.security.JwtTokenProvider;
import com.examprep.security.RestAccessDeniedHandler;
import com.examprep.security.RestAuthenticationEntryPoint;
import com.examprep.security.UserPrincipal;
import com.examprep.services.student.StudentCourseService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.util.List;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(StudentCourseController.class)
@Import({SecurityConfig.class, RestAuthenticationEntryPoint.class, RestAccessDeniedHandler.class})
class StudentCourseControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private StudentCourseService studentCourseService;

    @MockBean
    private JwtTokenProvider jwtTokenProvider;

    @MockBean
    private com.examprep.repositories.UserRepository userRepository;

    @Test
    void listCourses_Success() throws Exception {
        CourseCardDto card = new CourseCardDto(
                1L, "Java Basics", "java-basics", "https://...", BigDecimal.ZERO,
                new CategoryRefDto(1L, "Programming"), new ManagerRefDto(2L, "Manager A"),
                3L, 2L, false
        );
        when(studentCourseService.listCourses(any(), any(), any(), anyInt(), anyInt(), any()))
                .thenReturn(new PageImpl<>(List.of(card), PageRequest.of(0, 20), 1));

        mockMvc.perform(get("/api/v1/student/courses"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.content[0].courseId").value(1))
                .andExpect(jsonPath("$.data.content[0].title").value("Java Basics"));
    }

    @Test
    void getCourseDetail_Success() throws Exception {
        CourseDetailDto detail = new CourseDetailDto(
                1L, "Java Basics", "java-basics", "Desc", "https://...", BigDecimal.ZERO,
                new CategoryRefDto(1L, "Programming"), new ManagerRefDto(2L, "Manager A"),
                List.of(new ModuleItemDto(10L, "Module 1", 1)),
                new CourseStatsDto(3L, 2L),
                new EnrollmentSummaryDto(false, null, null)
        );
        when(studentCourseService.getCourseDetail(eq(1L), any())).thenReturn(detail);

        mockMvc.perform(get("/api/v1/student/courses/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.courseId").value(1))
                .andExpect(jsonPath("$.data.title").value("Java Basics"));
    }

    @Test
    void listMyCourses_Success() throws Exception {
        MyCourseDto myCourse = new MyCourseDto(
                1L, "Java Basics", "java-basics", "https://...", BigDecimal.ZERO,
                new CategoryRefDto(1L, "Programming"), new ManagerRefDto(2L, "Manager A"),
                java.time.Instant.now(), "ACTIVE", 50, 3L, 2L, null
        );
        UserPrincipal principal = UserPrincipal.create(10L, "student@examprep.local", "STUDENT");
        when(studentCourseService.listMyCourses(any(), anyInt(), anyInt(), eq(10L)))
                .thenReturn(new PageImpl<>(List.of(myCourse), PageRequest.of(0, 20), 1));

        mockMvc.perform(get("/api/v1/student/my-courses").with(user(principal)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.content[0].progress").value(50));
    }
}
