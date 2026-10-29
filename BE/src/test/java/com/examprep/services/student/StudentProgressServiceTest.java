package com.examprep.services.student;

import com.examprep.exceptions.ForbiddenException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class StudentProgressServiceTest {

    @Mock
    private CourseRepository courseRepository;
    @Mock
    private EnrollmentRepository enrollmentRepository;
    @Mock
    private ExamRepository examRepository;
    @Mock
    private DeckRepository deckRepository;
    @Mock
    private ExamAttemptRepository examAttemptRepository;

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
        assertThrows(ForbiddenException.class, () -> progressService.getCourseProgress(1L, 10L));
    }
}
