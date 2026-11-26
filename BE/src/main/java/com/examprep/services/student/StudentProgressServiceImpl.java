package com.examprep.services.student;

import com.examprep.dto.student.CourseProgressDto;
import com.examprep.dto.student.StudentActivityDto;
import com.examprep.entities.ExamAttempt;
import com.examprep.entities.Module;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.ForbiddenException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.CourseProgressSummaryRepository;
import com.examprep.repositories.CourseProgressSummaryRepository.ModuleQuestionCount;
import com.examprep.repositories.CourseRepository;
import com.examprep.repositories.EnrollmentRepository;
import com.examprep.repositories.ExamAttemptRepository;
import com.examprep.repositories.ModuleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class StudentProgressServiceImpl implements StudentProgressService {

    private final CourseRepository courseRepository;
    private final EnrollmentRepository enrollmentRepository;
    private final ExamAttemptRepository examAttemptRepository;
    private final ModuleRepository moduleRepository;
    private final CourseProgressSummaryRepository summaryRepository;

    @Override
    public CourseProgressDto getCourseProgress(Long courseId, Long userId) {
        // Step 1: Verify the course exists and the student is enrolled
        if (!courseRepository.existsById(courseId)) {
            throw new ResourceNotFoundException("Course not found");
        }
        boolean isActive = enrollmentRepository.existsByCourse_CourseIdAndUser_UserIdAndStatus(courseId, userId, "ACTIVE");
        boolean isCompleted = enrollmentRepository.existsByCourse_CourseIdAndUser_UserIdAndStatus(courseId, userId, "COMPLETED");
        if (!isActive && !isCompleted) {
            throw new ForbiddenException("Student is not actively enrolled in this course");
        }

        // Step 2: Load total valid questions per module -> Map(moduleId -> count)
        Map<Long, Long> totalByModule = new HashMap<>();
        List<ModuleQuestionCount> totalList = summaryRepository.countTotalQuestionsByModule(courseId);
        for (ModuleQuestionCount item : totalList) {
            totalByModule.put(item.moduleId(), item.count());
        }

        // Step 3: Load correctly answered questions per module -> Map(moduleId -> count)
        Map<Long, Long> correctByModule = new HashMap<>();
        List<ModuleQuestionCount> correctList = summaryRepository.countCorrectQuestionsByModule(courseId, userId);
        for (ModuleQuestionCount item : correctList) {
            correctByModule.put(item.moduleId(), item.count());
        }

        // Step 4: Build progress for each visible module
        List<CourseProgressDto.ModuleProgressDto> moduleProgressList = new ArrayList<>();
        List<Module> modules = moduleRepository.findVisibleModulesByCourseId(courseId);
        for (Module module : modules) {
            Long moduleId = module.getModuleId();
            long total = totalByModule.getOrDefault(moduleId, 0L);
            long correct = correctByModule.getOrDefault(moduleId, 0L);

            moduleProgressList.add(buildModuleProgress(moduleId, module.getTitle(), correct, total));
        }

        // Step 5: Include the "General" pool (moduleId = null) if it has any questions
        long generalTotal = totalByModule.getOrDefault(null, 0L);
        long generalCorrect = correctByModule.getOrDefault(null, 0L);
        if (generalTotal > 0) {
            moduleProgressList.add(buildModuleProgress(null, "General", generalCorrect, generalTotal));
        }

        // Step 6: Return per-module progress only (no overall course progress calculation)
        return CourseProgressDto.builder()
                .courseId(courseId)
                .modules(moduleProgressList)
                .recentAttempts(List.of())
                .build();
    }

    /** Builds the progress DTO for one module (or General when moduleId is null). */
    private CourseProgressDto.ModuleProgressDto buildModuleProgress(
            Long moduleId, String title, long correct, long total
    ) {
        if (total == 0) {
            return new CourseProgressDto.ModuleProgressDto(moduleId, title, null, null, null, null);
        }

        int percent = (int) Math.round((correct * 100.0) / total);
        if (percent > 100) {
            percent = 100;
        }
        if (percent < 0) {
            percent = 0;
        }

        CourseProgressDto.ItemCount questionCount = new CourseProgressDto.ItemCount(correct, total);
        return new CourseProgressDto.ModuleProgressDto(moduleId, title, percent, questionCount, null, null);
    }

    @Override
    public Page<StudentActivityDto> getActivityHistory(String type, int page, int size, Long userId) {
        String normalizedType = (type != null && !type.isBlank()) ? type.trim().toUpperCase() : null;
        if (page < 0) {
            throw new BadRequestException("Page index must not be less than zero");
        }
        if (size < 1 || size > 100) {
            throw new BadRequestException("Page size must be between 1 and 100");
        }
        Pageable pageable = PageRequest.of(page, size);

        Page<ExamAttempt> attempts = examAttemptRepository.findActivityAttemptsByUserAndMode(userId, normalizedType, pageable);

        return attempts.map(att -> {
            String actType = ("QUIZ".equalsIgnoreCase(att.getMode()) || "MATERIAL_QUIZ".equalsIgnoreCase(att.getMode())) ? "QUIZ" : "EXAM";
            return new StudentActivityDto(
                    actType,
                    att.getAttemptId(),
                    att.getExam() != null ? att.getExam().getTitle() : "Practice Exam",
                    att.getTotalScore(),
                    att.getExam() != null ? att.getExam().getMaxScore() : null,
                    null,
                    null,
                    att.getSubmitTime()
            );
        });
    }
}
