package com.examprep.services.student;

import com.examprep.dto.IdCount;
import com.examprep.dto.student.CourseProgressDto;
import com.examprep.dto.student.StudentActivityDto;
import com.examprep.entities.ExamAttempt;
import com.examprep.exceptions.ForbiddenException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
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
    private final ExamRepository examRepository;
    private final DeckRepository deckRepository;
    private final ExamAttemptRepository examAttemptRepository;
    private final ModuleRepository moduleRepository;
    private final QuestionRepository questionRepository;
    private final QuestionPracticeProgressRepository progressRepository;

    private record DeckStat(Long deckId, long cardCount, long learnedCount) {}

    @Override
    @Transactional
    public CourseProgressDto getCourseProgress(Long courseId, Long userId) {
        if (!courseRepository.existsById(courseId)) {
            throw new ResourceNotFoundException("Course not found");
        }
        boolean active = enrollmentRepository.existsByCourse_CourseIdAndUser_UserIdAndStatus(courseId, userId, "ACTIVE");
        if (!active) {
            throw new ForbiddenException("Student is not actively enrolled in this course");
        }

        return computeCourseProgress(courseId, userId);
    }

    @Override
    @Transactional
    public int liveProgressPercent(Long userId, Long courseId) {
        long totalQ = questionRepository.countGeneralPracticeDrawable(courseId);
        for (com.examprep.entities.Module m : moduleRepository.findVisibleModulesByCourseId(courseId)) {
            totalQ += questionRepository.countPracticeDrawable(m.getModuleId());
        }
        long totalE = examRepository.countPublishedExamsByCourseId(courseId);
        List<Object[]> deckRows = deckRepository.findCourseDeckStatsWithModule(courseId, userId);
        long totalD = deckRows.size();

        if (totalQ == 0 && totalE == 0 && totalD == 0) {
            return -1;
        }

        CourseProgressDto dto = computeCourseProgress(courseId, userId);
        return dto.getProgress();
    }

    private CourseProgressDto computeCourseProgress(Long courseId, Long userId) {
        // 1. Fetch modules
        List<com.examprep.entities.Module> modules = moduleRepository.findVisibleModulesByCourseId(courseId);

        // 2. Exam counts
        Map<Long, Long> examsByModule = new HashMap<>();
        examRepository.countPublishedExamsByModuleGroup(courseId).forEach(c -> examsByModule.put(c.id(), c.total()));
        long totalExamsGeneral = examRepository.countPublishedExamsGeneral(courseId);

        Map<Long, Long> completedExamsByModule = new HashMap<>();
        examAttemptRepository.countCompletedExamsByModuleGroup(userId, courseId).forEach(c -> completedExamsByModule.put(c.id(), c.total()));
        long completedExamsGeneral = examAttemptRepository.countCompletedExamsGeneral(userId, courseId);

        // 3. Deck stats
        List<Object[]> deckRows = deckRepository.findCourseDeckStatsWithModule(courseId, userId);
        Map<Long, List<DeckStat>> decksByModuleMap = new HashMap<>();
        List<DeckStat> generalDecks = new ArrayList<>();
        for (Object[] row : deckRows) {
            Long deckId = (Long) row[0];
            Long modId = (Long) row[1];
            long cardCount = number(row[2]);
            long learnedCount = number(row[3]);
            DeckStat stat = new DeckStat(deckId, cardCount, learnedCount);
            if (modId != null) {
                decksByModuleMap.computeIfAbsent(modId, k -> new ArrayList<>()).add(stat);
            } else {
                generalDecks.add(stat);
            }
        }

        List<CourseProgressDto.ModuleProgressDto> moduleDtos = new ArrayList<>();
        List<Integer> moduleProgressValues = new ArrayList<>();

        long totalCourseQuestionsDone = 0;
        long totalCourseQuestionsTotal = 0;
        long totalCourseExamsDone = 0;
        long totalCourseExamsTotal = 0;
        long totalCourseDecksDone = 0;
        long totalCourseDecksTotal = 0;

        // Process each module
        for (com.examprep.entities.Module m : modules) {
            Long modId = m.getModuleId();
            String title = m.getTitle();

            long qTotal = questionRepository.countPracticeDrawable(modId);
            List<Object[]> qSummary = progressRepository.summarizeModule(userId, modId);
            long qDone = qSummary.isEmpty() ? 0 : number(qSummary.get(0)[5]);

            long eTotal = examsByModule.getOrDefault(modId, 0L);
            long eDone = completedExamsByModule.getOrDefault(modId, 0L);

            List<DeckStat> dList = decksByModuleMap.getOrDefault(modId, List.of());
            long dTotal = dList.size();
            long dDone = dList.stream().filter(d -> d.cardCount > 0 && d.learnedCount >= d.cardCount).count();

            totalCourseQuestionsDone += qDone;
            totalCourseQuestionsTotal += qTotal;
            totalCourseExamsDone += eDone;
            totalCourseExamsTotal += eTotal;
            totalCourseDecksDone += dDone;
            totalCourseDecksTotal += dTotal;

            List<Double> parts = new ArrayList<>();
            CourseProgressDto.ItemCount qItem = qTotal > 0 ? new CourseProgressDto.ItemCount(qDone, qTotal) : null;
            if (qTotal > 0) parts.add((double) qDone / qTotal);

            CourseProgressDto.ItemCount eItem = eTotal > 0 ? new CourseProgressDto.ItemCount(eDone, eTotal) : null;
            if (eTotal > 0) parts.add((double) eDone / eTotal);

            CourseProgressDto.ItemCount dItem = dTotal > 0 ? new CourseProgressDto.ItemCount(dDone, dTotal) : null;
            if (dTotal > 0) parts.add((double) dDone / dTotal);

            Integer modProgress = null;
            if (!parts.isEmpty()) {
                double sum = parts.stream().mapToDouble(Double::doubleValue).sum();
                modProgress = (int) Math.round((sum * 100.0) / parts.size());
                modProgress = Math.min(100, Math.max(0, modProgress));
                moduleProgressValues.add(modProgress);
            }

            moduleDtos.add(new CourseProgressDto.ModuleProgressDto(
                    modId, title, modProgress, qItem, eItem, dItem
            ));
        }

        // Process General pool (moduleId = null)
        long gQTotal = questionRepository.countGeneralPracticeDrawable(courseId);
        List<Object[]> gQSummary = progressRepository.summarizeCourse(userId, courseId);
        long gQDone = gQSummary.isEmpty() ? 0 : number(gQSummary.get(0)[5]);

        long gETotal = totalExamsGeneral;
        long gEDone = completedExamsGeneral;

        long gDTotal = generalDecks.size();
        long gDDone = generalDecks.stream().filter(d -> d.cardCount > 0 && d.learnedCount >= d.cardCount).count();

        totalCourseQuestionsDone += gQDone;
        totalCourseQuestionsTotal += gQTotal;
        totalCourseExamsDone += gEDone;
        totalCourseExamsTotal += gETotal;
        totalCourseDecksDone += gDDone;
        totalCourseDecksTotal += gDTotal;

        List<Double> gParts = new ArrayList<>();
        CourseProgressDto.ItemCount gQItem = gQTotal > 0 ? new CourseProgressDto.ItemCount(gQDone, gQTotal) : null;
        if (gQTotal > 0) gParts.add((double) gQDone / gQTotal);

        CourseProgressDto.ItemCount gEItem = gETotal > 0 ? new CourseProgressDto.ItemCount(gEDone, gETotal) : null;
        if (gETotal > 0) gParts.add((double) gEDone / gETotal);

        CourseProgressDto.ItemCount gDItem = gDTotal > 0 ? new CourseProgressDto.ItemCount(gDDone, gDTotal) : null;
        if (gDTotal > 0) gParts.add((double) gDDone / gDTotal);

        if (!gParts.isEmpty()) {
            double gSum = gParts.stream().mapToDouble(Double::doubleValue).sum();
            int gProgress = (int) Math.round((gSum * 100.0) / gParts.size());
            gProgress = Math.min(100, Math.max(0, gProgress));
            moduleProgressValues.add(gProgress);

            moduleDtos.add(new CourseProgressDto.ModuleProgressDto(
                    null, "General", gProgress, gQItem, gEItem, gDItem
            ));
        }

        int courseProgress = 0;
        if (!moduleProgressValues.isEmpty()) {
            double modSum = moduleProgressValues.stream().mapToInt(Integer::intValue).sum();
            courseProgress = (int) Math.round(modSum / moduleProgressValues.size());
            courseProgress = Math.min(100, Math.max(0, courseProgress));
        }

        final int finalCourseProgress = courseProgress;
        // Persist enrollment progress
        enrollmentRepository.findByUser_UserIdAndCourse_CourseId(userId, courseId).ifPresent(en -> {
            if (en.getProgress() == null || en.getProgress() != finalCourseProgress) {
                en.setProgress(finalCourseProgress);
                enrollmentRepository.save(en);
            }
        });

        Double avgScoreVal = examAttemptRepository.averageScoreByUserAndCourse(userId, courseId);
        BigDecimal averageScore = avgScoreVal != null ? BigDecimal.valueOf(avgScoreVal).setScale(2, RoundingMode.HALF_UP) : null;

        List<ExamAttempt> recentAttempts = examAttemptRepository.findRecentAttemptsByUserAndCourse(userId, courseId, PageRequest.of(0, 5));
        List<CourseProgressDto.RecentAttemptItem> recentAttemptItems = recentAttempts.stream()
                .map(a -> new CourseProgressDto.RecentAttemptItem(
                        a.getAttemptId(),
                        a.getExam().getTitle(),
                        a.getTotalScore(),
                        a.getExam().getMaxScore(),
                        a.getSubmitTime()
                ))
                .toList();

        return CourseProgressDto.builder()
                .courseId(courseId)
                .progress(courseProgress)
                .questions(new CourseProgressDto.ItemCount(totalCourseQuestionsDone, totalCourseQuestionsTotal))
                .exams(new CourseProgressDto.ItemCount(totalCourseExamsDone, totalCourseExamsTotal))
                .decks(new CourseProgressDto.ItemCount(totalCourseDecksDone, totalCourseDecksTotal))
                .modules(moduleDtos)
                .averageScore(averageScore)
                .recentAttempts(recentAttemptItems)
                .totalExams(totalCourseExamsTotal)
                .completedExams(totalCourseExamsDone)
                .totalDecks(totalCourseDecksTotal)
                .learnedDecks(totalCourseDecksDone)
                .build();
    }

    @Override
    public Page<StudentActivityDto> getActivityHistory(String type, int page, int size, Long userId) {
        String normalizedType = (type != null && !type.isBlank()) ? type.trim().toUpperCase() : null;
        Pageable pageable = PageRequest.of(page, size);

        if ("FLASHCARD".equals(normalizedType)) {
            return Page.empty(pageable);
        }

        Page<ExamAttempt> attempts = examAttemptRepository.findActivityAttemptsByUserAndMode(userId, normalizedType, pageable);

        return attempts.map(att -> {
            String actType = "QUIZ".equalsIgnoreCase(att.getMode()) ? "QUIZ" : "EXAM";
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

    private static long number(Object value) {
        return value instanceof Number counted ? counted.longValue() : 0L;
    }
}
