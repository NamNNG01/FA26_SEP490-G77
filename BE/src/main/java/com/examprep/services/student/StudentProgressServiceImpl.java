package com.examprep.services.student;

import com.examprep.dto.IdCount;
import com.examprep.dto.student.CourseProgressDto;
import com.examprep.dto.student.StudentActivityDto;
import com.examprep.entities.ExamAttempt;
import com.examprep.exceptions.BadRequestException;
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
    private final CourseProgressSummaryRepository summaryRepository;

    private record Scope(Long courseId, Long moduleId) {}

    @Override
    public Map<Long, Integer> liveProgressPercents(Long userId, List<Long> courseIds) {
        if (courseIds.isEmpty()) return Map.of();
        // Each scope has question, exam and deck [done, total] pairs. All five queries
        // cover the whole page, independent of its number of courses or modules.
        Map<Scope, long[]> scopes = new HashMap<>();
        addSummary(scopes, summaryRepository.questionTotals(courseIds), 1);
        addSummary(scopes, summaryRepository.questionCompletions(courseIds, userId), 0);
        addSummary(scopes, summaryRepository.examTotals(courseIds), 3);
        addSummary(scopes, summaryRepository.examCompletions(courseIds, userId), 2);
        for (Object[] row : summaryRepository.deckStats(courseIds, userId)) {
            long[] counts = scopes.computeIfAbsent(new Scope((Long) row[0], (Long) row[1]), k -> new long[6]);
            counts[5]++;
            if (number(row[2]) > 0 && number(row[3]) >= number(row[2])) counts[4]++;
        }
        Map<Long, List<Integer>> percentages = new HashMap<>();
        scopes.forEach((scope, counts) -> {
            double sum = 0;
            int parts = 0;
            for (int i = 0; i < counts.length; i += 2) {
                if (counts[i + 1] > 0) {
                    sum += (double) counts[i] / counts[i + 1];
                    parts++;
                }
            }
            if (parts > 0) {
                int percent = Math.min(100, Math.max(0, (int) Math.round(sum * 100 / parts)));
                percentages.computeIfAbsent(scope.courseId(), k -> new ArrayList<>()).add(percent);
            }
        });
        Map<Long, Integer> result = new HashMap<>();
        for (Long id : courseIds) {
            List<Integer> values = percentages.getOrDefault(id, List.of());
            result.put(id, values.isEmpty() ? -1 : (int) Math.round(
                    values.stream().mapToInt(Integer::intValue).average().orElse(0)));
        }
        return result;
    }

    private static void addSummary(Map<Scope, long[]> scopes, List<Object[]> rows, int index) {
        for (Object[] row : rows) {
            scopes.computeIfAbsent(new Scope((Long) row[0], (Long) row[1]), k -> new long[6])[index] = number(row[2]);
        }
    }

    private record DeckStat(Long deckId, long cardCount, long learnedCount) {}

    @Override
    @Transactional(readOnly = true)
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
    @Transactional(readOnly = true)
    public int liveProgressPercent(Long userId, Long courseId) {
        CourseProgressDto dto = computeCourseProgress(courseId, userId);
        boolean hasAnyContent = dto.getQuestions().getTotal() > 0
                || dto.getExams().getTotal() > 0
                || dto.getDecks().getTotal() > 0;
        return hasAnyContent ? dto.getProgress() : -1;
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

        Map<Long, Long> questionTotalsByModule = new HashMap<>();
        long generalQuestionTotal = 0;
        for (Object[] row : summaryRepository.questionTotalsByCourse(courseId)) {
            Long moduleId = (Long) row[1];
            long count = number(row[2]);
            if (moduleId == null) generalQuestionTotal = count;
            else questionTotalsByModule.put(moduleId, count);
        }
        Map<Long, Long> questionDoneByModule = new HashMap<>();
        long generalQuestionDone = 0;
        for (Object[] row : summaryRepository.questionCompletionsByCourse(courseId, userId)) {
            Long moduleId = (Long) row[1];
            long count = number(row[2]);
            if (moduleId == null) generalQuestionDone = count;
            else questionDoneByModule.put(moduleId, count);
        }

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

            long qTotal = questionTotalsByModule.getOrDefault(modId, 0L);
            long qDone = questionDoneByModule.getOrDefault(modId, 0L);

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
        long gQTotal = generalQuestionTotal;
        long gQDone = generalQuestionDone;

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
        if (page < 0) {
            throw new BadRequestException("Page index must not be less than zero");
        }
        if (size < 1 || size > 100) {
            throw new BadRequestException("Page size must be between 1 and 100");
        }
        Pageable pageable = PageRequest.of(page, size);

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
