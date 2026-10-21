package com.examprep.services;

import com.examprep.ai.AiClient;
import com.examprep.ai.AiRequest;
import com.examprep.ai.AiResponse;
import com.examprep.dto.exam.*;
import com.examprep.dto.question.AnswerOptionDto;
import com.examprep.entities.*;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.ResourceConflictException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.exceptions.UnauthorizedException;
import com.examprep.repositories.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ExamServiceImpl implements ExamService {

    private final ExamRepository examRepository;
    private final ExamConfigRepository examConfigRepository;
    private final ExamQuestionRepository examQuestionRepository;
    private final CourseRepository courseRepository;
    private final QuestionRepository questionRepository;
    private final AnswerOptionRepository answerOptionRepository;
    private final CourseManagerRepository courseManagerRepository;
    private final EnrollmentRepository enrollmentRepository;
    private final ExamAttemptRepository examAttemptRepository;
    private final AttemptAnswerRepository attemptAnswerRepository;
    private final AnswerRegradeLogRepository answerRegradeLogRepository;
    private final AiUsageLogRepository aiUsageLogRepository;
    private final UserSubscriptionRepository userSubscriptionRepository;
    private final NotificationRepository notificationRepository;
    private final UserNotificationRepository userNotificationRepository;
    private final ScoringService scoringService;
    private final AiClient aiClient;
    private final ObjectMapper objectMapper;

    @Override
    @Transactional
    public ExamResponse createRandomExam(ExamRandomRequest req, User currentUser) {
        Course course = courseRepository.findById(req.getCourseId())
                .orElseThrow(() -> new ResourceNotFoundException("Course not found"));

        if (!User.ROLE_ADMIN.equals(currentUser.getRoleName())) {
            boolean isManager = courseManagerRepository.existsByCourse_CourseIdAndUser_UserId(course.getCourseId(), currentUser.getUserId());
            if (!isManager) {
                throw new UnauthorizedException("You are not a manager of this course");
            }
        }

        Long seed = req.getSeed() != null ? req.getSeed() : System.currentTimeMillis();
        Random random = new Random(seed);

        Set<Long> selectedQuestionIds = new LinkedHashSet<>();
        List<SelectedQuestionInfo> selectedInfos = new ArrayList<>();

        for (int i = 0; i < req.getCriteria().size(); i++) {
            ExamCriteriaDto crit = req.getCriteria().get(i);
            List<Long> availableIds = questionRepository.findActiveIdsByCriteria(
                    course.getCourseId(), crit.getQuestionType(), crit.getDifficulty(), crit.getModuleId());

            List<Long> filteredIds = new ArrayList<>();
            for (Long qId : availableIds) {
                if (selectedQuestionIds.contains(qId)) continue;
                Question q = questionRepository.findById(qId).orElse(null);
                if (q == null) continue;
                if (crit.getSkillTag() != null) {
                    try {
                        if (q.getQuestionMetadata() == null) continue;
                        Map map = objectMapper.readValue(q.getQuestionMetadata(), Map.class);
                        if (!crit.getSkillTag().equals(map.get("skillTag"))) continue;
                    } catch (Exception e) {
                        continue;
                    }
                }
                filteredIds.add(qId);
            }

            if (filteredIds.size() < crit.getCount()) {
                throw new ResourceConflictException("Insufficient questions for criteria index " + i + ": requested " + crit.getCount() + ", available " + filteredIds.size());
            }

            Collections.shuffle(filteredIds, random);
            List<Long> chosenIds = filteredIds.subList(0, crit.getCount());
            for (Long qId : chosenIds) {
                selectedQuestionIds.add(qId);
                Question q = questionRepository.findById(qId).orElseThrow();
                BigDecimal pts = crit.getPointsEach() != null ? crit.getPointsEach() : q.getDefaultPoints();
                selectedInfos.add(new SelectedQuestionInfo(q, pts));
            }
        }

        Exam exam = Exam.builder()
                .course(course)
                .createdBy(currentUser)
                .title(req.getTitle())
                .description(req.getDescription())
                .durationMinutes(req.getDurationMinutes())
                .isPractice(req.getIsPractice() != null ? req.getIsPractice() : false)
                .generationType("RANDOM")
                .status("DRAFT")
                .passMark(req.getPassMark() != null ? req.getPassMark() : 50)
                .maxAttempts(req.getMaxAttempts() != null ? req.getMaxAttempts() : 1)
                .build();

        exam = examRepository.save(exam);

        try {
            String criteriaJson = objectMapper.writeValueAsString(req.getCriteria());
            ExamConfig config = ExamConfig.builder()
                    .exam(exam)
                    .questionType(req.getCriteria().get(0).getQuestionType())
                    .numberOfQuestions(selectedQuestionIds.size())
                    .difficulty(req.getCriteria().get(0).getDifficulty())
                    .criteria(criteriaJson)
                    .seed(seed)
                    .build();
            examConfigRepository.save(config);
        } catch (Exception ignored) {}

        List<ExamQuestion> examQuestions = new ArrayList<>();
        for (int i = 0; i < selectedInfos.size(); i++) {
            SelectedQuestionInfo info = selectedInfos.get(i);
            ExamQuestion eq = ExamQuestion.builder()
                    .exam(exam)
                    .question(info.question)
                    .orderIndex(i)
                    .points(info.points)
                    .build();
            examQuestions.add(examQuestionRepository.save(eq));
        }

        Long eId = exam.getExamId();
        List<ExamQuestion> eqList = examQuestionRepository.findAll().stream()
                .filter(eq -> eq.getExam().getExamId().equals(eId))
                .collect(Collectors.toList());

        return mapToExamResponse(exam, eqList, false);
    }

    @Override
    @Transactional
    public ExamResponse updateExam(Long examId, ExamUpdateRequest req, User currentUser) {
        Exam exam = examRepository.findById(examId)
                .orElseThrow(() -> new ResourceNotFoundException("Exam not found"));

        if ("PUBLISHED".equals(exam.getStatus())) {
            throw new ResourceConflictException("Cannot modify a published exam");
        }

        if (req.getTitle() != null) exam.setTitle(req.getTitle());
        if (req.getDescription() != null) exam.setDescription(req.getDescription());
        if (req.getDurationMinutes() != null) exam.setDurationMinutes(req.getDurationMinutes());
        if (req.getPassMark() != null) exam.setPassMark(req.getPassMark());
        if (req.getMaxAttempts() != null) exam.setMaxAttempts(req.getMaxAttempts());
        if (req.getIsPractice() != null) exam.setIsPractice(req.getIsPractice());

        exam = examRepository.save(exam);
        Long examIdToFilter = exam.getExamId();
        List<ExamQuestion> eqList = examQuestionRepository.findAll().stream()
                .filter(eq -> eq.getExam().getExamId().equals(examIdToFilter))
                .collect(Collectors.toList());

        return mapToExamResponse(exam, eqList, false);
    }

    @Override
    @Transactional
    public ExamResponse publishExam(Long examId, User currentUser) {
        Exam exam = examRepository.findById(examId)
                .orElseThrow(() -> new ResourceNotFoundException("Exam not found"));

        Long eId = exam.getExamId();
        List<ExamQuestion> eqList = examQuestionRepository.findAll().stream()
                .filter(eq -> eq.getExam().getExamId().equals(eId))
                .collect(Collectors.toList());

        if (eqList.isEmpty()) {
            throw new BadRequestException("Cannot publish an exam with no questions");
        }

        BigDecimal totalPoints = eqList.stream().map(ExamQuestion::getPoints).reduce(BigDecimal.ZERO, BigDecimal::add);
        if (totalPoints.compareTo(BigDecimal.ZERO) <= 0) {
            throw new BadRequestException("Total exam points must be greater than zero");
        }

        for (ExamQuestion eq : eqList) {
            Question q = eq.getQuestion();
            if (!"ACTIVE".equals(q.getStatus()) || !"APPROVED".equals(q.getApprovalStatus()) || q.getDeletedAt() != null) {
                throw new BadRequestException("Exam contains inactive, unapproved, or deleted questions");
            }
        }

        exam.setStatus("PUBLISHED");
        exam.setPublishedAt(Instant.now());
        exam = examRepository.save(exam);

        return mapToExamResponse(exam, eqList, false);
    }

    @Override
    @Transactional(readOnly = true)
    public ExamResponse getExamDetail(Long examId, User currentUser, boolean studentView) {
        Exam exam = examRepository.findById(examId)
                .orElseThrow(() -> new ResourceNotFoundException("Exam not found"));

        if (studentView) {
            if (!"PUBLISHED".equals(exam.getStatus())) {
                throw new UnauthorizedException("Exam is not published");
            }
            if (exam.getModule() != null && exam.getModule().isHidden()) {
                throw new UnauthorizedException("Exam is not available");
            }
            if (exam.getCourse() != null) {
                boolean enrolled = enrollmentRepository.existsByCourse_CourseIdAndUser_UserId(
                        exam.getCourse().getCourseId(), currentUser.getUserId());
                if (!enrolled && !User.ROLE_ADMIN.equals(currentUser.getRoleName())) {
                    throw new UnauthorizedException("You are not enrolled in this course");
                }
            }
        }

        Long eId = exam.getExamId();
        List<ExamQuestion> eqList = examQuestionRepository.findAll().stream()
                .filter(eq -> eq.getExam().getExamId().equals(eId))
                .sorted(Comparator.comparing(ExamQuestion::getOrderIndex))
                .collect(Collectors.toList());

        return mapToExamResponse(exam, eqList, studentView);
    }

    @Override
    @Transactional(readOnly = true)
    public List<ExamResponse> getExamsForCourse(Long courseId, User currentUser) {
        List<Exam> exams = examRepository.findAll().stream()
                .filter(e -> e.getCourse() != null && e.getCourse().getCourseId().equals(courseId))
                .collect(Collectors.toList());

        boolean isStudent = User.ROLE_STUDENT.equals(currentUser.getRoleName());
        if (isStudent) {
            exams = exams.stream().filter(e -> "PUBLISHED".equals(e.getStatus()))
                    .filter(e -> e.getModule() == null || !e.getModule().isHidden()).collect(Collectors.toList());
        }

        return exams.stream().map(e -> {
            Long eId = e.getExamId();
            List<ExamQuestion> eqList = examQuestionRepository.findAll().stream()
                    .filter(eq -> eq.getExam().getExamId().equals(eId))
                    .collect(Collectors.toList());
            return mapToExamResponse(e, eqList, isStudent);
        }).collect(Collectors.toList());
    }

    @Override
    @Transactional
    public ExamResponse addQuestionToExam(Long examId, ExamAddQuestionRequest req, User currentUser) {
        Exam exam = examRepository.findById(examId)
                .orElseThrow(() -> new ResourceNotFoundException("Exam not found"));
        if ("PUBLISHED".equals(exam.getStatus())) {
            throw new ResourceConflictException("Cannot modify a published exam");
        }
        Question q = questionRepository.findActiveById(req.getQuestionId())
                .orElseThrow(() -> new ResourceNotFoundException("Question not found"));
        if (q.getCourse() == null || exam.getCourse() == null || !q.getCourse().getCourseId().equals(exam.getCourse().getCourseId())) {
            throw new BadRequestException("Question does not belong to the same course as the exam");
        }
        if (!"ACTIVE".equals(q.getStatus()) || !"APPROVED".equals(q.getApprovalStatus())) {
            throw new BadRequestException("Question must be active and approved");
        }

        Long eId = exam.getExamId();
        List<ExamQuestion> existing = examQuestionRepository.findAll().stream()
                .filter(eq -> eq.getExam().getExamId().equals(eId))
                .collect(Collectors.toList());

        boolean alreadyExists = existing.stream().anyMatch(eq -> eq.getQuestion().getQuestionId().equals(q.getQuestionId()));
        if (alreadyExists) {
            throw new ResourceConflictException("Question is already in the exam");
        }

        int maxOrder = existing.stream().mapToInt(ExamQuestion::getOrderIndex).max().orElse(-1);
        BigDecimal pts = req.getPoints() != null ? req.getPoints() : q.getDefaultPoints();

        ExamQuestion eq = ExamQuestion.builder()
                .exam(exam)
                .question(q)
                .orderIndex(maxOrder + 1)
                .points(pts)
                .build();
        examQuestionRepository.save(eq);

        existing.add(eq);
        return mapToExamResponse(exam, existing, false);
    }

    @Override
    @Transactional
    public ExamResponse removeQuestionFromExam(Long examId, Long examQuestionId, User currentUser) {
        Exam exam = examRepository.findById(examId)
                .orElseThrow(() -> new ResourceNotFoundException("Exam not found"));
        if ("PUBLISHED".equals(exam.getStatus())) {
            throw new ResourceConflictException("Cannot modify a published exam");
        }
        ExamQuestion eq = examQuestionRepository.findById(examQuestionId)
                .orElseThrow(() -> new ResourceNotFoundException("Exam question not found"));
        if (!eq.getExam().getExamId().equals(exam.getExamId())) {
            throw new BadRequestException("Exam question does not belong to this exam");
        }

        examQuestionRepository.delete(eq);

        Long eId = exam.getExamId();
        List<ExamQuestion> existing = examQuestionRepository.findAll().stream()
                .filter(e -> e.getExam().getExamId().equals(eId))
                .collect(Collectors.toList());

        return mapToExamResponse(exam, existing, false);
    }

    @Override
    @Transactional
    public ExamResponse reorderExamQuestions(Long examId, ExamReorderRequest req, User currentUser) {
        Exam exam = examRepository.findById(examId)
                .orElseThrow(() -> new ResourceNotFoundException("Exam not found"));
        if ("PUBLISHED".equals(exam.getStatus())) {
            throw new ResourceConflictException("Cannot modify a published exam");
        }

        Long eId = exam.getExamId();
        List<ExamQuestion> existing = examQuestionRepository.findAll().stream()
                .filter(eq -> eq.getExam().getExamId().equals(eId))
                .collect(Collectors.toList());

        Map<Long, ExamQuestion> eqMap = existing.stream().collect(Collectors.toMap(ExamQuestion::getExamQuestionId, eq -> eq));

        List<Long> ids = req.getExamQuestionIds();
        for (int i = 0; i < ids.size(); i++) {
            ExamQuestion eq = eqMap.get(ids.get(i));
            if (eq != null) {
                eq.setOrderIndex(i);
                examQuestionRepository.save(eq);
            }
        }

        List<ExamQuestion> updated = examQuestionRepository.findAll().stream()
                .filter(eq -> eq.getExam().getExamId().equals(eId))
                .sorted(Comparator.comparing(ExamQuestion::getOrderIndex))
                .collect(Collectors.toList());

        return mapToExamResponse(exam, updated, false);
    }

    @Override
    @Transactional
    public AttemptResponse submitAttempt(AttemptSubmitRequest req, User currentUser) {
        Exam exam = examRepository.findById(req.getExamId())
                .orElseThrow(() -> new ResourceNotFoundException("Exam not found"));

        if (!"PUBLISHED".equals(exam.getStatus())) {
            throw new BadRequestException("Exam is not published");
        }
        if (exam.getModule() != null && exam.getModule().isHidden()) {
            throw new BadRequestException("Exam is not available");
        }

        ExamAttempt attempt = ExamAttempt.builder()
                .exam(exam)
                .user(currentUser)
                .startTime(Instant.now())
                .status("IN_PROGRESS")
                .build();
        attempt = examAttemptRepository.save(attempt);

        Long eId = exam.getExamId();
        List<ExamQuestion> examQuestions = examQuestionRepository.findAll().stream()
                .filter(eq -> eq.getExam().getExamId().equals(eId))
                .collect(Collectors.toList());
        Map<Long, ExamQuestion> eqMap = examQuestions.stream().collect(Collectors.toMap(eq -> eq.getQuestion().getQuestionId(), eq -> eq));

        BigDecimal totalScore = BigDecimal.ZERO;
        boolean hasPendingEssay = false;
        List<AttemptResponse.AttemptAnswerDto> ansDtos = new ArrayList<>();

        for (AttemptSubmitRequest.AnswerSubmitDto ansDto : req.getAnswers()) {
            ExamQuestion eq = eqMap.get(ansDto.getQuestionId());
            if (eq == null) continue;
            Question q = eq.getQuestion();

            String gradingStatus = "AUTO";
            BigDecimal scoreEarned = BigDecimal.ZERO;
            Boolean isCorrect = false;

            String responseJson = null;
            try {
                if (ansDto.getResponse() != null) {
                    responseJson = objectMapper.writeValueAsString(ansDto.getResponse());
                }
            } catch (Exception ignored) {}

            if ("ESSAY".equals(q.getQuestionType())) {
                gradingStatus = "PENDING_AI";
                hasPendingEssay = true;
                scoreEarned = BigDecimal.ZERO;
                isCorrect = null;
            } else {
                List<AnswerOption> options = answerOptionRepository.findByQuestion_QuestionId(q.getQuestionId());
                ScoringService.ScoreResult res = scoringService.calculateScore(
                        q.getQuestionType(), eq.getPoints(), q.getAnswerKey(), options, responseJson);
                scoreEarned = res.getScore();
                isCorrect = res.isCorrect();
                totalScore = totalScore.add(scoreEarned);
            }

            AttemptAnswer aa = AttemptAnswer.builder()
                    .attempt(attempt)
                    .question(q)
                    .response(responseJson)
                    .essayAnswer(ansDto.getEssayAnswer())
                    .questionVersion(q.getScoringVersion())
                    .gradingStatus(gradingStatus)
                    .scoreEarned(scoreEarned)
                    .isCorrect(isCorrect)
                    .build();
            aa = attemptAnswerRepository.save(aa);

            ansDtos.add(AttemptResponse.AttemptAnswerDto.builder()
                    .answerId(aa.getAttemptAnswerId())
                    .questionId(q.getQuestionId())
                    .gradingStatus(gradingStatus)
                    .scoreEarned(scoreEarned)
                    .isCorrect(isCorrect)
                    .build());
        }

        attempt.setSubmitTime(Instant.now());
        if (hasPendingEssay) {
            attempt.setStatus("GRADING");
            attempt.setTotalScore(totalScore);
        } else {
            attempt.setStatus("COMPLETED");
            attempt.setTotalScore(totalScore);
        }
        attempt = examAttemptRepository.save(attempt);

        return AttemptResponse.builder()
                .attemptId(attempt.getAttemptId())
                .examId(exam.getExamId())
                .examTitle(exam.getTitle())
                .startTime(attempt.getStartTime())
                .submitTime(attempt.getSubmitTime())
                .totalScore(attempt.getTotalScore())
                .status(attempt.getStatus())
                .answers(ansDtos)
                .build();
    }

    @Override
    @Scheduled(fixedDelayString = "${app.scheduler.delay:30000}")
    public void processPendingAiEssays() {
        List<AttemptAnswer> pendingList = attemptAnswerRepository.findByGradingStatus("PENDING_AI");
        if (pendingList.isEmpty()) return;

        for (AttemptAnswer aa : pendingList) {
            try {
                gradeSingleEssay(aa);
            } catch (Exception ignored) {}
        }
    }

    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public void gradeSingleEssay(AttemptAnswer aa) {
        Question q = aa.getQuestion();
        Course course = q.getCourse();
        if (course == null || course.getManager() == null) return;
        User manager = course.getManager();

        Instant now = Instant.now();
        UserSubscription sub = userSubscriptionRepository.findActiveSubscriptionByUser(manager.getUserId(), now).orElse(null);
        if (sub != null) {
            int usedTokens = aiUsageLogRepository.sumTokensByUserSince(manager.getUserId(), sub.getStartDate());
            if (usedTokens + 300 > sub.getPlan().getAiTokenLimit()) {
                return;
            }
        }

        String prompt = "Grade the following essay answer according to rubric:\n" +
                "Question: " + q.getContent() + "\n" +
                "Rubric: " + q.getEssayGradingRubric() + "\n" +
                "Student Answer: " + aa.getEssayAnswer() + "\n" +
                "Return JSON with 'criteriaScores' (list of scores per criterion), 'totalScore', and 'feedback'.";

        Instant start = Instant.now();
        try {
            AiResponse resp = aiClient.complete(AiRequest.builder()
                    .prompt(prompt)
                    .systemPrompt("You are an expert essay grader. Return strictly valid JSON.")
                    .build());
            long duration = Duration.between(start, Instant.now()).toMillis();

            AiUsageLog log = AiUsageLog.builder()
                    .user(manager)
                    .course(course)
                    .purpose("ESSAY_GRADING")
                    .model(resp.getModel())
                    .inputTokens(resp.getInputTokens())
                    .outputTokens(resp.getOutputTokens())
                    .status("SUCCESS")
                    .durationMs((int) duration)
                    .attemptAnswerId(aa.getAttemptAnswerId())
                    .build();
            aiUsageLogRepository.save(log);

            Map<String, Object> resMap = objectMapper.readValue(resp.getText(), Map.class);
            BigDecimal earnedScore = BigDecimal.valueOf(((Number) resMap.getOrDefault("totalScore", 0)).doubleValue());
            if (earnedScore.compareTo(q.getDefaultPoints()) > 0) earnedScore = q.getDefaultPoints();

            updateAttemptAnswerGraded(aa.getAttemptAnswerId(), earnedScore, objectMapper.writeValueAsString(resMap.get("criteriaScores")), objectMapper.writeValueAsString(resMap.get("feedback")));

        } catch (Exception e) {
            long duration = Duration.between(start, Instant.now()).toMillis();
            failOrRetryEssay(aa.getAttemptAnswerId(), e.getMessage(), duration, manager, course);
        }
    }

    @Transactional
    public void updateAttemptAnswerGraded(Long answerId, BigDecimal score, String criteriaScores, String feedback) {
        AttemptAnswer aa = attemptAnswerRepository.findById(answerId).orElse(null);
        if (aa == null) return;
        aa.setScoreEarned(score);
        aa.setAiCriteriaScores(criteriaScores);
        aa.setAiFeedbackJson(feedback);
        aa.setGradingStatus("AI_GRADED");
        aa.setGradedAt(Instant.now());
        attemptAnswerRepository.save(aa);

        checkAndUpdateAttemptCompletion(aa.getAttempt());
    }

    @Transactional
    public void failOrRetryEssay(Long answerId, String errorMsg, long duration, User manager, Course course) {
        AttemptAnswer aa = attemptAnswerRepository.findById(answerId).orElse(null);
        if (aa == null) return;
        int retry = aa.getGradeRetryCount() + 1;
        aa.setGradeRetryCount(retry);
        if (retry >= 3) {
            aa.setGradingStatus("FAILED");
            aa.setScoreEarned(BigDecimal.ZERO);
        }
        attemptAnswerRepository.save(aa);

        AiUsageLog errorLog = AiUsageLog.builder()
                .user(manager)
                .course(course)
                .purpose("ESSAY_GRADING")
                .status("FAILED")
                .errorMessage(errorMsg)
                .durationMs((int) duration)
                .attemptAnswerId(aa.getAttemptAnswerId())
                .build();
        aiUsageLogRepository.save(errorLog);

        if (retry >= 3) {
            checkAndUpdateAttemptCompletion(aa.getAttempt());
        }
    }

    private void checkAndUpdateAttemptCompletion(ExamAttempt attempt) {
        List<AttemptAnswer> answers = attemptAnswerRepository.findByAttempt_AttemptId(attempt.getAttemptId());
        boolean hasPending = answers.stream().anyMatch(a -> "PENDING_AI".equals(a.getGradingStatus()));
        if (!hasPending) {
            BigDecimal total = answers.stream().map(a -> a.getScoreEarned() != null ? a.getScoreEarned() : BigDecimal.ZERO).reduce(BigDecimal.ZERO, BigDecimal::add);
            attempt.setTotalScore(total);
            attempt.setStatus("COMPLETED");
            examAttemptRepository.save(attempt);
        }
    }

    @Override
    @Scheduled(fixedDelayString = "${app.scheduler.delay:30000}")
    public void processRegrades() {
        List<AttemptAnswer> regradeList = attemptAnswerRepository.findAll().stream()
                .filter(aa -> "AUTO".equals(aa.getGradingStatus()) && aa.getResponse() != null &&
                        aa.getQuestionVersion() != null && aa.getQuestionVersion() < aa.getQuestion().getScoringVersion())
                .limit(200)
                .collect(Collectors.toList());

        for (AttemptAnswer aa : regradeList) {
            Question q = aa.getQuestion();
            BigDecimal oldScore = aa.getScoreEarned() != null ? aa.getScoreEarned() : BigDecimal.ZERO;
            List<AnswerOption> options = answerOptionRepository.findByQuestion_QuestionId(q.getQuestionId());
            ScoringService.ScoreResult res = scoringService.calculateScore(
                    q.getQuestionType(), q.getDefaultPoints(), q.getAnswerKey(), options, aa.getResponse());

            BigDecimal newScore = res.getScore();
            if (oldScore.compareTo(newScore) != 0) {
                AnswerRegradeLog log = AnswerRegradeLog.builder()
                        .attemptAnswer(aa)
                        .oldScore(oldScore)
                        .newScore(newScore)
                        .questionVersionFrom(aa.getQuestionVersion())
                        .questionVersionTo(q.getScoringVersion())
                        .build();
                answerRegradeLogRepository.save(log);
            }

            aa.setScoreEarned(newScore);
            aa.setIsCorrect(res.isCorrect());
            aa.setQuestionVersion(q.getScoringVersion());
            attemptAnswerRepository.save(aa);

            ExamAttempt att = aa.getAttempt();
            List<AttemptAnswer> attAnswers = attemptAnswerRepository.findByAttempt_AttemptId(att.getAttemptId());
            BigDecimal attTotal = attAnswers.stream().map(a -> a.getScoreEarned() != null ? a.getScoreEarned() : BigDecimal.ZERO).reduce(BigDecimal.ZERO, BigDecimal::add);
            att.setTotalScore(attTotal);
            examAttemptRepository.save(att);
        }
    }

    @Override
    @Transactional
    public void manualEssayRegrade(Long questionId, User currentUser) {
        Question q = questionRepository.findById(questionId)
                .orElseThrow(() -> new ResourceNotFoundException("Question not found"));
        if (!"ESSAY".equals(q.getQuestionType())) {
            throw new BadRequestException("Question is not an essay");
        }
        List<AttemptAnswer> answers = attemptAnswerRepository.findAll().stream()
                .filter(aa -> aa.getQuestion().getQuestionId().equals(q.getQuestionId()) && "AI_GRADED".equals(aa.getGradingStatus()))
                .collect(Collectors.toList());

        for (AttemptAnswer aa : answers) {
            aa.setGradingStatus("PENDING_AI");
            aa.setGradeRetryCount(0);
            attemptAnswerRepository.save(aa);

            ExamAttempt att = aa.getAttempt();
            att.setStatus("GRADING");
            examAttemptRepository.save(att);
        }
    }

    private ExamResponse mapToExamResponse(Exam exam, List<ExamQuestion> eqList, boolean studentView) {
        List<ExamResponse.ExamQuestionDto> qDtos = new ArrayList<>();
        for (ExamQuestion eq : eqList) {
            Question q = eq.getQuestion();
            List<AnswerOption> opts = answerOptionRepository.findByQuestion_QuestionId(q.getQuestionId());

            List<AnswerOptionDto> optDtos = opts.stream().map(o -> AnswerOptionDto.builder()
                    .optionId(o.getOptionId())
                    .optionText(o.getOptionText())
                    .isCorrect(studentView ? null : o.getIsCorrect())
                    .explanation(studentView ? null : o.getExplanation())
                    .orderIndex(o.getOrderIndex())
                    .build()).collect(Collectors.toList());

            if (studentView && "MATCHING".equals(q.getQuestionType())) {
                Collections.shuffle(optDtos);
            }

            qDtos.add(ExamResponse.ExamQuestionDto.builder()
                    .examQuestionId(eq.getExamQuestionId())
                    .questionId(q.getQuestionId())
                    .content(q.getContent())
                    .questionType(q.getQuestionType())
                    .difficulty(q.getDifficulty())
                    .orderIndex(eq.getOrderIndex())
                    .points(eq.getPoints())
                    .options(optDtos)
                    .answerKey(studentView ? null : parseJson(q.getAnswerKey()))
                    .aiExplanation(studentView ? null : q.getAiExplanation())
                    .build());
        }

        return ExamResponse.builder()
                .examId(exam.getExamId())
                .courseId(exam.getCourse() != null ? exam.getCourse().getCourseId() : null)
                .courseName(exam.getCourse() != null ? exam.getCourse().getTitle() : null)
                .title(exam.getTitle())
                .description(exam.getDescription())
                .durationMinutes(exam.getDurationMinutes())
                .isPractice(exam.getIsPractice())
                .generationType(exam.getGenerationType())
                .status(exam.getStatus())
                .publishedAt(exam.getPublishedAt())
                .passMark(exam.getPassMark())
                .maxAttempts(exam.getMaxAttempts())
                .createdBy(exam.getCreatedBy() != null ? exam.getCreatedBy().getUserId() : null)
                .createdAt(exam.getCreatedAt())
                .questions(qDtos)
                .build();
    }

    private Object parseJson(String jsonStr) {
        if (jsonStr == null || jsonStr.trim().isEmpty()) return null;
        try {
            return objectMapper.readValue(jsonStr, Object.class);
        } catch (Exception e) {
            return null;
        }
    }

    private static class SelectedQuestionInfo {
        Question question;
        BigDecimal points;
        SelectedQuestionInfo(Question q, BigDecimal p) {
            this.question = q;
            this.points = p;
        }
    }
}
