package com.examprep.services.student;

import com.examprep.dto.student.CourseProgressDto;
import com.examprep.entities.Module;
import com.examprep.exceptions.ForbiddenException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.CourseProgressSummaryRepository;
import com.examprep.repositories.CourseProgressSummaryRepository.ModuleQuestionCount;
import com.examprep.repositories.CourseRepository;
import com.examprep.repositories.EnrollmentRepository;
import com.examprep.repositories.ExamAttemptRepository;
import com.examprep.repositories.ModuleRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class StudentProgressServiceTest {

    @Mock
    private CourseRepository courseRepository;
    @Mock
    private EnrollmentRepository enrollmentRepository;
    @Mock
    private ExamAttemptRepository examAttemptRepository;
    @Mock
    private ModuleRepository moduleRepository;
    @Mock
    private CourseProgressSummaryRepository summaryRepository;

    @InjectMocks
    private StudentProgressServiceImpl progressService;

    @Test
    void getCourseProgress_courseNotFound() {
        when(courseRepository.existsById(1L)).thenReturn(false);
        assertThrows(ResourceNotFoundException.class, () -> progressService.getCourseProgress(1L, 10L));
    }

    @Test
    void getCourseProgress_notEnrolled() {
        when(courseRepository.existsById(1L)).thenReturn(true);
        when(enrollmentRepository.existsByCourse_CourseIdAndUser_UserIdAndStatus(1L, 10L, "ACTIVE")).thenReturn(false);
        when(enrollmentRepository.existsByCourse_CourseIdAndUser_UserIdAndStatus(1L, 10L, "COMPLETED")).thenReturn(false);
        assertThrows(ForbiddenException.class, () -> progressService.getCourseProgress(1L, 10L));
    }

    @Test
    void getCourseProgress_calculatesModuleAndGeneralProgressFromQuestionsOnly() {
        when(courseRepository.existsById(1L)).thenReturn(true);
        when(enrollmentRepository.existsByCourse_CourseIdAndUser_UserIdAndStatus(1L, 10L, "ACTIVE")).thenReturn(true);

        Module mod1 = Module.builder().moduleId(101L).title("Module 1").build();
        Module modEmpty = Module.builder().moduleId(102L).title("Empty Module").build();
        when(moduleRepository.findVisibleModulesByCourseId(1L)).thenReturn(List.of(mod1, modEmpty));

        when(summaryRepository.countTotalQuestionsByModule(1L)).thenReturn(List.of(
                new ModuleQuestionCount(101L, 4L),
                new ModuleQuestionCount(null, 2L)
        ));
        when(summaryRepository.countCorrectQuestionsByModule(1L, 10L)).thenReturn(List.of(
                new ModuleQuestionCount(101L, 3L),
                new ModuleQuestionCount(null, 1L)
        ));

        CourseProgressDto dto = progressService.getCourseProgress(1L, 10L);

        assertEquals(1L, dto.getCourseId());
        assertEquals(3, dto.getModules().size());

        CourseProgressDto.ModuleProgressDto m1Dto = dto.getModules().get(0);
        assertEquals(101L, m1Dto.getModuleId());
        assertEquals(75, m1Dto.getProgress());
        assertEquals(3L, m1Dto.getQuestions().getDone());
        assertEquals(4L, m1Dto.getQuestions().getTotal());
        assertNull(m1Dto.getExams());
        assertNull(m1Dto.getDecks());

        CourseProgressDto.ModuleProgressDto mEmptyDto = dto.getModules().get(1);
        assertEquals(102L, mEmptyDto.getModuleId());
        assertNull(mEmptyDto.getProgress());
        assertNull(mEmptyDto.getQuestions());

        CourseProgressDto.ModuleProgressDto generalDto = dto.getModules().get(2);
        assertNull(generalDto.getModuleId());
        assertEquals("General", generalDto.getTitle());
        assertEquals(50, generalDto.getProgress());
    }
}
