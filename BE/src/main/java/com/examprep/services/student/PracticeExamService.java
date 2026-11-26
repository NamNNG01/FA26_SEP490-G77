package com.examprep.services.student;

import com.examprep.dto.PageResponse;
import com.examprep.dto.ResponseCode;
import com.examprep.dto.student.PracticeDtos;
import com.examprep.dto.student.QuestionCandidate;
import com.examprep.entities.*;
import com.examprep.entities.Module;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.BaseException;
import com.examprep.exceptions.ForbiddenException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.*;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.examprep.util.attempt.AttemptScoring;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;

/** Custom practice exams PQ-01..04, and the exam builder AI-01 reuses. */
@Service
@RequiredArgsConstructor
@Transactional
public class PracticeExamService {
    /** Types SA-04 grades without AI, so a practice exam has a score as soon as it is submitted. */
    public static final List<String> AUTO_GRADED = List.of("SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE", "FILL_BLANK", "ORDERING", "MATCHING");
    /** Assessment / rubric-graded types. */
    public static final List<String> ASSESSMENT_TYPES = List.of("ESSAY", "DIAGRAM", "DIAGRAM_ESSAY");
    /** Mixed types across both quiz and assessment banks. */
    public static final List<String> ALL_PRACTICE_TYPES = List.of(
            "SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE", "FILL_BLANK", "ORDERING", "MATCHING",
            "ESSAY", "DIAGRAM", "DIAGRAM_ESSAY");
    public static final BigDecimal MAX_SCORE = BigDecimal.TEN;

    private final ExamRepository exams;
    private final ExamQuestionRepository examQuestions;
    private final ExamAttemptRepository attempts;
    private final AttemptAnswerRepository answers;
    private final ModuleRepository modules;
    private final CourseRepository courses;
    private final EnrollmentRepository enrollments;
    private final QuestionRepository questions;
    private final UserRepository users;
    private final StudyPlanner planner;
    private final ObjectMapper json;

    // ------------------------------------------------------------------ PQ-01

    public PracticeDtos.Created create(Long userId, PracticeDtos.Create request) {
        Long courseId = request.courseId();
        requireEnrolled(userId, courseId);
        String requestedType = request.examType();
        boolean essay = "ESSAY".equals(requestedType);
        boolean mixed = "MIXED".equals(requestedType);
        boolean smart = "SMART".equals(request.allocation());
        List<String> types = typesOf(requestedType);

        List<Long> categoryIds = new ArrayList<>();
        List<QuestionCandidate> drawn = new ArrayList<>();
        int totalCount = 0;

        if (smart) {
            SmartSplit split = smartSplit(userId, courseId, request);
            drawn = StudyPlanner.draw(split.snapshot(), split.counts());
            for (int i = 0; i < split.counts().size(); i++) {
                Long moduleId = split.snapshot().modules().get(i).moduleId();
                if (split.counts().get(i) > 0 && moduleId != null) categoryIds.add(moduleId);
            }
            totalCount = drawn.size();
        } else if (request.moduleQuestionCounts() != null && !request.moduleQuestionCounts().isEmpty()) {
            if (request.moduleQuestionCounts().stream().mapToInt(PracticeDtos.ModuleQuestionCount::questionCount).sum() > 100) {
                throw new BadRequestException("moduleQuestionCounts must add up to at most 100 questions.");
            }
            Set<Long> seenModules = new HashSet<>();
            for (PracticeDtos.ModuleQuestionCount mq : request.moduleQuestionCounts()) {
                Long moduleId = mq.categoryId();
                if (!seenModules.add(moduleId)) {
                    throw new BadRequestException("Duplicate module in moduleQuestionCounts: " + moduleId);
                }
                Module module = modules.findById(moduleId).orElse(null);
                if (module == null || !module.getCourse().getCourseId().equals(courseId) || module.isHidden()) {
                    throw new BadRequestException("Module must be a visible module of this course: " + moduleId);
                }
                int count = mq.questionCount();
                List<QuestionCandidate> pool = findCandidates(courseId, types, false, List.of(moduleId), request.difficulty());
                if (pool.size() < count) {
                    throw new BaseException(ResponseCode.UNPROCESSABLE_VALIDATION_ERROR, "The question bank does not have enough questions.",
                            Map.of("code", "NOT_ENOUGH_QUESTIONS", "categoryId", moduleId, "available", pool.size()));
                }
                drawn.addAll(drawBalanced(pool, count));
                categoryIds.add(moduleId);
                totalCount += count;
            }
        } else {
            Set<Long> moduleIds = request.categoryIds() == null ? Set.of() : new LinkedHashSet<>(request.categoryIds());
            for (Long moduleId : moduleIds) {
                Module module = modules.findById(moduleId).orElse(null);
                if (module == null || !module.getCourse().getCourseId().equals(courseId) || module.isHidden()) {
                    throw new BadRequestException("categoryIds must be visible modules of this course: " + moduleId);
                }
            }
            if (request.questionCount() == null) {
                throw new BadRequestException("questionCount is required.");
            }
            int count = request.questionCount();
            List<QuestionCandidate> pool = findCandidates(courseId, types, moduleIds.isEmpty(), moduleIds.isEmpty() ? List.of(-1L) : moduleIds, request.difficulty());
            if (pool.size() < count) throw notEnough(pool.size());
            drawn = drawBalanced(pool, count);
            categoryIds.addAll(moduleIds);
            totalCount = count;
        }

        String examType = mixed ? "MIXED" : (essay ? "ESSAY" : "QUIZ");
        String title = titleOr(request.title(), smart ? "Personalized practice"
                : "Custom practice - " + (mixed ? "Mixed" : (essay ? "Essay" : "Multiple choice")));

        // Build practice_config JSON
        String practiceConfig = writePracticeConfig(examType, totalCount, request.difficulty(),
                categoryIds);

        String mode = "PRACTICE".equals(request.mode()) ? Exam.MODE_PRACTICE : Exam.MODE_PRACTICE_EXAM;
        boolean isPracticeMode = Exam.MODE_PRACTICE.equals(mode);
        // durationMinutes is required for EXAM mode (default); PRACTICE mode may omit it.
        if (!isPracticeMode && request.durationMinutes() == null) {
            throw new BadRequestException("durationMinutes is required for EXAM mode.");
        }
        Integer duration = isPracticeMode ? null : request.durationMinutes();
        // The config goes in with the INSERT: chk_practice_exam_config rejects a PRACTICE_EXAM row without one.
        Exam exam = createGeneratedExam(userId, courseId, title, mode, duration,
                drawn.stream().map(QuestionCandidate::questionId).toList(), practiceConfig);

        return new PracticeDtos.Created(exam.getExamId(), title, totalCount, duration, exam.getExamId());
    }

    /** The SMART split PQ-01 would use, without creating anything; every module of the pool is listed, by priority. */
    @Transactional(readOnly = true)
    public PracticeDtos.Plan plan(Long userId, PracticeDtos.Create request) {
        requireEnrolled(userId, request.courseId());
        SmartSplit split = smartSplit(userId, request.courseId(), request);
        List<PracticeDtos.PlanItem> items = new ArrayList<>();
        for (int i = 0; i < split.counts().size(); i++) {
            StudyPlanner.Profile p = split.snapshot().modules().get(i);
            items.add(new PracticeDtos.PlanItem(p.moduleId(), p.name(), split.counts().get(i), p.bankSize(), p.mastery(),
                    p.accuracy(), p.answered(), p.stillWrong(), p.priority()));
        }
        return new PracticeDtos.Plan(request.questionCount(), items);
    }

    private record SmartSplit(StudyPlanner.Snapshot snapshot, List<Integer> counts) { }

    private SmartSplit smartSplit(Long userId, Long courseId, PracticeDtos.Create request) {
        if (request.questionCount() == null) throw new BadRequestException("questionCount is required.");
        List<QuestionCandidate> pool = findCandidates(courseId, typesOf(request.examType()), true, List.of(-1L), request.difficulty());
        Long focus = request.focusModuleId();
        // The pool holds only this course's visible modules, so a foreign or hidden module just leaves it empty (422).
        if (focus != null) pool = pool.stream().filter(c -> focus == 0 ? c.moduleId() == null : focus.equals(c.moduleId())).toList();
        if (pool.size() < request.questionCount()) throw notEnough(pool.size());
        StudyPlanner.Snapshot snapshot = planner.snapshot(userId, courseId, pool);
        return new SmartSplit(snapshot, StudyPlanner.allocate(snapshot.modules(), request.questionCount()));
    }

    private static List<String> typesOf(String examType) {
        return "MIXED".equals(examType) ? ALL_PRACTICE_TYPES : "ESSAY".equals(examType) ? ASSESSMENT_TYPES : AUTO_GRADED;
    }

    /** The student's exam name, or the fallback when it is blank. */
    public static String titleOr(String title, String fallback) {
        return title == null || title.isBlank() ? fallback : title.strip();
    }

    /** Eligible questions of a course; empty moduleIds means every module. */
    @Transactional(readOnly = true)
    public List<QuestionCandidate> candidates(Long courseId, Collection<Long> moduleIds, String difficulty) {
        return findCandidates(courseId, AUTO_GRADED, moduleIds.isEmpty(), moduleIds.isEmpty() ? List.of(-1L) : moduleIds, difficulty);
    }

    /** A student's own published exam (PRACTICE_EXAM / PRACTICE / SMART_PRACTICE), one point-equal link per question, max score 10. */
    public Exam createGeneratedExam(Long userId, Long courseId, String title, String mode, Integer durationMinutes, List<Long> questionIds, String practiceConfig) {
        Exam exam = exams.save(Exam.builder().course(courses.getReferenceById(courseId)).createdBy(users.getReferenceById(userId))
                .title(title).durationMinutes(durationMinutes).generationType("MANUAL").maxScore(MAX_SCORE)
                .status("PUBLISHED").publishedAt(Instant.now()).mode(mode).practiceConfig(practiceConfig).build());
        List<ExamQuestion> links = new ArrayList<>();
        int order = 1;
        for (Long id : questionIds) {
            links.add(ExamQuestion.builder().exam(exam).question(questions.getReferenceById(id)).orderIndex(order++).weight(BigDecimal.ONE).build());
        }
        examQuestions.saveAll(links);
        return exam;
    }

    // ------------------------------------------------------------------ PQ-02 / PQ-03

    @Transactional(readOnly = true)
    public PageResponse<PracticeDtos.Item> list(Long userId, int page, int size) {
        if (page < 0 || size < 1 || size > 100) throw new BadRequestException("page must be >= 0 and size 1-100.");
        Page<Exam> examPage = exams.findPracticeExams(userId, PageRequest.of(page, size));
        if (examPage.isEmpty()) {
            return PageResponse.of(new PageImpl<>(List.of(), PageRequest.of(page, size), 0));
        }

        List<Long> examIds = examPage.getContent().stream().map(Exam::getExamId).toList();
        Map<Long, BigDecimal> bestScores = new HashMap<>();
        Map<Long, Long> attemptCounts = new HashMap<>();
        for (Object[] row : attempts.findAttemptStatsByExamIds(examIds, userId)) {
            Long eId = (Long) row[0];
            bestScores.put(eId, (BigDecimal) row[1]);
            attemptCounts.put(eId, ((Number) row[2]).longValue());
        }

        List<PracticeDtos.Item> items = examPage.getContent().stream().map(exam -> {
            JsonNode config = parseConfig(exam.getPracticeConfig());
            String examType = config != null && config.hasNonNull("examType") ? config.get("examType").asText() : null;
            Integer questionCount = config != null && config.hasNonNull("questionCount") ? config.get("questionCount").asInt() : null;
            String difficulty = config != null && config.hasNonNull("difficulty") ? config.get("difficulty").asText() : null;
            List<Long> moduleIds = new ArrayList<>();
            if (config != null && config.has("moduleIds") && config.get("moduleIds").isArray()) {
                for (JsonNode m : config.get("moduleIds")) {
                    if (m.isNumber()) moduleIds.add(m.asLong());
                }
            }
            return new PracticeDtos.Item(
                    exam.getExamId(),
                    exam.getExamId(),
                    exam.getTitle(),
                    questionCount,
                    exam.getDurationMinutes(),
                    bestScores.get(exam.getExamId()),
                    attemptCounts.getOrDefault(exam.getExamId(), 0L),
                    exam.getCreatedAt(),
                    examType,
                    difficulty,
                    moduleIds
            );
        }).toList();

        return PageResponse.of(new PageImpl<>(items, PageRequest.of(page, size), examPage.getTotalElements()));
    }

    /** Soft-deletes the exam (ARCHIVED) so existing attempts keep their paper. */
    public void delete(Long userId, Long practiceId) {
        Exam exam = exams.findById(practiceId).orElseThrow(() -> new ResourceNotFoundException("Practice exam not found."));
        if (!exam.getCreatedBy().getUserId().equals(userId)) throw new ForbiddenException("This practice exam belongs to another student.");
        if (!exam.isPq01() || "ARCHIVED".equals(exam.getStatus())) {
            throw new ResourceNotFoundException("Practice exam not found.");
        }
        exam.setStatus("ARCHIVED");
    }

    // ------------------------------------------------------------------ PQ-04

    /** Wrong answers of a finished attempt as the student saw them (display snapshot only: no key, no answer). */
    @Transactional(readOnly = true)
    public List<JsonNode> wrongQuestions(Long userId, Long attemptId) {
        ExamAttempt attempt = attempts.findById(attemptId).orElseThrow(() -> new ResourceNotFoundException("Attempt not found."));
        if (!attempt.getUser().getUserId().equals(userId)) throw new ForbiddenException("This attempt belongs to another student.");
        if (!Set.of("SUBMITTED", "COMPLETED").contains(attempt.getStatus())) {
            throw new BaseException(ResponseCode.ATTEMPT_NOT_SUBMITTED, "Submit the attempt first.", Map.of("code", "ATTEMPT_NOT_SUBMITTED"));
        }
        List<JsonNode> items = new ArrayList<>();
        List<AttemptAnswer> rows = answers.findByAttemptIdOrdered(attemptId);
        BigDecimal totalWeight = rows.stream().map(AttemptAnswer::getWeightSnapshot).filter(java.util.Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal maxScore = attempt.getExam() == null ? null : attempt.getExam().getMaxScore();
        for (AttemptAnswer answer : rows) {
            if (!wrong(answer, totalWeight, maxScore)) continue;
            ObjectNode item = display(answer.getDisplaySnapshot());
            item.put("questionId", answer.getQuestion().getQuestionId());
            items.add(item);
        }
        return items;
    }

    /** A verdict wins; a rubric answer graded before verdicts were stored is wrong below half of its points. */
    private static boolean wrong(AttemptAnswer answer, BigDecimal totalWeight, BigDecimal maxScore) {
        if (answer.getIsCorrect() != null) return !answer.getIsCorrect();
        return answer.getScoreEarned() != null && !QuestionReviewRecorder.rubricPassed(answer.getScoreEarned(),
                AttemptScoring.questionMaxPoints(answer.getWeightSnapshot(), totalWeight, maxScore));
    }

    // ------------------------------------------------------------------ helpers

    void requireEnrolled(Long userId, Long courseId) {
        if (!courses.existsById(courseId)) throw new ResourceNotFoundException("Course not found.");
        if (!enrollments.existsByCourse_CourseIdAndUser_UserIdAndStatus(courseId, userId, Enrollment.STATUS_ACTIVE)) {
            throw new ForbiddenException("You are not enrolled in this course.");
        }
    }

    static BaseException notEnough(int available) {
        return new BaseException(ResponseCode.UNPROCESSABLE_VALIDATION_ERROR, "The question bank does not have enough questions.",
                Map.of("code", "NOT_ENOUGH_QUESTIONS", "available", available));
    }

    /**
     * Draws {@code count} questions randomly while balancing across every {@code questionType}
     * present in {@code pool} via round-robin sampling, then shuffles the final list.
     */
    static List<QuestionCandidate> drawBalanced(List<QuestionCandidate> pool, int count) {
        if (count <= 0 || pool.isEmpty()) {
            return List.of();
        }
        Map<String, List<QuestionCandidate>> byType = new LinkedHashMap<>();
        for (QuestionCandidate candidate : pool) {
            String typeKey = candidate.questionType() == null ? "UNKNOWN" : candidate.questionType();
            byType.computeIfAbsent(typeKey, k -> new ArrayList<>()).add(candidate);
        }
        List<List<QuestionCandidate>> buckets = new ArrayList<>(byType.values());
        for (List<QuestionCandidate> bucket : buckets) {
            Collections.shuffle(bucket);
        }
        Collections.shuffle(buckets);

        List<QuestionCandidate> drawn = new ArrayList<>(count);
        int round = 0;
        while (drawn.size() < count) {
            boolean progressed = false;
            for (List<QuestionCandidate> bucket : buckets) {
                if (round < bucket.size()) {
                    drawn.add(bucket.get(round));
                    progressed = true;
                    if (drawn.size() >= count) {
                        break;
                    }
                }
            }
            if (!progressed) {
                break;
            }
            round++;
        }
        Collections.shuffle(drawn);
        return drawn;
    }

    /** findCandidates moved from PracticeExamRepository (which is now deleted). */
    List<QuestionCandidate> findCandidates(Long courseId, Collection<String> types, boolean allModules,
                                            Collection<Long> moduleIds, String difficulty) {
        return questions.findPracticeCandidates(courseId, types, allModules, moduleIds, difficulty);
    }

    String writePracticeConfig(String examType, int questionCount, String difficulty, List<Long> moduleIds) {
        try {
            Map<String, Object> config = new LinkedHashMap<>();
            config.put("examType", examType);
            config.put("questionCount", questionCount);
            config.put("difficulty", difficulty);
            config.put("moduleIds", moduleIds);
            return json.writeValueAsString(config);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private JsonNode parseConfig(String practiceConfig) {
        if (practiceConfig == null || practiceConfig.isBlank()) return null;
        try {
            return json.readTree(practiceConfig);
        } catch (JsonProcessingException ex) {
            return null;
        }
    }

    private ObjectNode display(String snapshot) {
        try {
            JsonNode node = snapshot == null ? null : json.readTree(snapshot);
            return node instanceof ObjectNode object ? object : json.createObjectNode();
        } catch (JsonProcessingException ex) {
            return json.createObjectNode();
        }
    }
}
