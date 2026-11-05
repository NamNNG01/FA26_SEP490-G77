package com.examprep.services.student;

import com.examprep.dto.ResponseCode;
import com.examprep.dto.attempt.Snapshots;
import com.examprep.dto.practice.ModulePracticeRequests;
import com.examprep.dto.practice.ModulePracticeResponses;
import com.examprep.entities.AnswerOption;
import com.examprep.entities.Question;
import com.examprep.entities.QuestionPracticeProgress;
import com.examprep.entities.QuestionPracticeSession;
import com.examprep.entities.QuestionPracticeSessionQuestion;
import com.examprep.entities.QuestionMedia;
import com.examprep.entities.User;
import com.examprep.exceptions.BaseException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.QuestionMediaRepository;
import com.examprep.repositories.QuestionPracticeAnswerRepository;
import com.examprep.repositories.QuestionPracticeProgressRepository;
import com.examprep.repositories.QuestionPracticeSessionQuestionRepository;
import com.examprep.repositories.QuestionPracticeSessionRepository;
import com.examprep.repositories.QuestionRepository;
import com.examprep.repositories.StudentQuestionReviewRepository;
import com.examprep.repositories.UserRepository;
import com.examprep.services.AttemptPaperFactory;
import com.examprep.util.attempt.AttemptShuffler;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Supplier;
import java.util.stream.Collectors;

/**
 * MP-01 … MP-04, MP-07, MP-08, MP-11, MP-12 — for one module and for a course's General pool.
 *
 * <p>Every rule is written once against a {@link PracticeScope}: the module-scoped endpoints resolve
 * the module through {@link ModulePracticeSupport#requireModule}, the General ones resolve the course
 * through {@link ModulePracticeSupport#requireCourse}, and both then run the same code. The
 * session-scoped endpoints resolve the session by ownership first (a foreign session is a 404) and
 * then re-check its scope and the enrolment through
 * {@link ModulePracticeSupport#requireSessionAccess}. A session therefore stops being reachable the
 * moment its module is hidden or the enrolment lapses — including the MP-02 resume branch, which
 * validates before it answers "resumed". The authenticated user id always comes from the caller (the
 * JWT principal), never from the request.</p>
 */
@Service
@RequiredArgsConstructor
public class ModulePracticeServiceImpl implements ModulePracticeService {

    /** Accuracy is reported with four decimals; the FE renders the percentage. */
    private static final int ACCURACY_SCALE = 4;
    private static final int MAX_REVIEW_PAGE_SIZE = 50;
    /** Latest attempt grading states that still wait for the AI rubric worker. */
    private static final Set<String> AWAITING_GRADE = Set.of("PENDING_AI", "QUEUED", "GRADING");
    /** Latest attempt grading states that are finalized. */
    private static final Set<String> GRADED = Set.of("AUTO", "AI_GRADED");

    private final ModulePracticeSupport support;
    private final QuestionPracticeSessionRepository sessions;
    private final QuestionPracticeSessionQuestionRepository sessionQuestions;
    private final QuestionPracticeAnswerRepository answers;
    private final QuestionPracticeProgressRepository progress;
    private final QuestionRepository questions;
    private final QuestionMediaRepository media;
    private final StudentQuestionReviewRepository reviewRepository;
    private final UserRepository users;
    private final AttemptPaperFactory paperFactory;
    private final PlatformTransactionManager transactionManager;

    // ------------------------------------------------------------------ MP-01

    @Override
    @Transactional(readOnly = true)
    public ModulePracticeResponses.Overview overview(Long userId, Long moduleId) {
        return overviewOf(userId, support.requireModuleScope(userId, moduleId));
    }

    @Override
    @Transactional(readOnly = true)
    public ModulePracticeResponses.Overview generalOverview(Long userId, Long courseId) {
        return overviewOf(userId, support.requireGeneralScope(userId, courseId));
    }

    private ModulePracticeResponses.Overview overviewOf(Long userId, PracticeScope scope) {
        long total = drawableCount(scope);
        Object[] summary = (scope.isGeneral()
                ? progress.summarizeCourse(userId, scope.courseId())
                : progress.summarizeModule(userId, scope.moduleId())).get(0);
        long practiced = number(summary[0]);
        long totalAttempts = number(summary[1]);
        long gradedAttempts = number(summary[2]);
        long correctAttempts = number(summary[3]);
        long wrongAttempts = number(summary[4]);
        long everCorrect = number(summary[5]);
        long needingReview = number(summary[6]);

        ModulePracticeResponses.ActiveSessionInfo active = null;
        Optional<QuestionPracticeSession> open = openSession(userId, scope);
        if (open.isPresent()) {
            QuestionPracticeSession session = open.get();
            Optional<QuestionPracticeSessionQuestion> next = support.nextUnanswered(session.getSessionId());
            active = new ModulePracticeResponses.ActiveSessionInfo(
                    session.getSessionId(),
                    session.getMode(),
                    session.getQuestionCount(),
                    session.getAnsweredCount(),
                    session.getCorrectCount(),
                    session.getStatus(),
                    session.getStartedAt(),
                    session.getLastActivityAt(),
                    next.map(QuestionPracticeSessionQuestion::getSessionQuestionId).orElse(null),
                    next.map(QuestionPracticeSessionQuestion::getOrderIndex).orElse(null));
        }
        return new ModulePracticeResponses.Overview(
                scope.moduleId(),
                scope.moduleTitle(),
                scope.courseId(),
                scope.courseTitle(),
                total,
                practiced,
                Math.max(0, total - practiced),
                everCorrect,
                totalAttempts,
                gradedAttempts,
                correctAttempts,
                wrongAttempts,
                accuracy(correctAttempts, gradedAttempts),
                needingReview,
                active);
    }

    // ------------------------------------------------------------------ MP-02

    @Override
    public ModulePracticeResponses.SessionDetail startOrResume(Long userId, Long moduleId,
                                                               ModulePracticeRequests.StartSession request) {
        return startOrResumeOf(userId, () -> support.requireModuleScope(userId, moduleId), request);
    }

    @Override
    public ModulePracticeResponses.SessionDetail generalStartOrResume(Long userId, Long courseId,
                                                                      ModulePracticeRequests.StartSession request) {
        return startOrResumeOf(userId, () -> support.requireGeneralScope(userId, courseId), request);
    }

    /**
     * Not transactional as a whole on purpose: the attempt to insert the session must fail on its own
     * so the partial unique index can decide between two concurrent starts. The loser then re-reads
     * the winner's session and answers "resumed".
     *
     * <p>The reads are nevertheless wrapped in their own transactions: {@link #detailOf} walks lazy
     * associations (the module's and the course's titles), so mapping a session fetched by a bare
     * repository call would depend on Open-Entity-Manager-In-View — and would break the moment this
     * method is called outside a web request.</p>
     */
    private ModulePracticeResponses.SessionDetail startOrResumeOf(
            Long userId, Supplier<PracticeScope> access, ModulePracticeRequests.StartSession request) {
        // The access rule runs before the resume answer, so a session whose module became hidden or
        // whose enrolment lapsed is refused here exactly like a new start would be.
        ModulePracticeResponses.SessionDetail open = inReadTransaction(() -> {
            PracticeScope scope = access.get();
            return openSession(userId, scope).map(session -> support.detailOf(session, true)).orElse(null);
        });
        if (open != null) {
            return open;
        }
        String mode = request != null && request.mode() != null
                ? request.mode() : QuestionPracticeSession.MODE_ALL;
        Integer requested = request == null ? null : request.questionCount();
        String difficulty = request == null ? null : request.difficulty();
        List<String> questionTypes = request == null ? null : request.questionTypes();
        try {
            return create(userId, access, mode, difficulty, questionTypes, requested);
        } catch (DataIntegrityViolationException concurrentStart) {
            // Another request created the open session first (or a unique paper row raced): adopt it.
            ModulePracticeResponses.SessionDetail adopted = inReadTransaction(() -> {
                PracticeScope scope = access.get();
                return openSession(userId, scope).map(session -> support.detailOf(session, true)).orElse(null);
            });
            if (adopted != null) {
                return adopted;
            }
            throw concurrentStart;
        }
    }

    /** Runs a read and its DTO mapping in one transaction, so no lazy access escapes it. */
    private <T> T inReadTransaction(java.util.function.Supplier<T> work) {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        tx.setReadOnly(true);
        return tx.execute(status -> work.get());
    }

    private ModulePracticeResponses.SessionDetail create(Long userId, Supplier<PracticeScope> access,
                                                         String mode, String difficulty,
                                                         List<String> questionTypes, Integer requested) {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        ModulePracticeResponses.SessionDetail created = tx.execute(status -> {
            PracticeScope scope = access.get();
            if (openSession(userId, scope).isPresent()) {
                // A session appeared between the pre-check and this transaction: resume it.
                return support.detailOf(openSession(userId, scope).orElseThrow(), true);
            }

            List<Long> pool = poolOf(userId, scope, mode, difficulty, questionTypes);

            AttemptShuffler shuffler = new AttemptShuffler(AttemptShuffler.newSeed());
            List<Long> shuffled = shuffler.shuffle(new ArrayList<>(new LinkedHashSet<>(pool)));
            // "No questionCount" means "the whole eligible pool" — bounded by the same documented
            // ceiling an explicit count is held to, so one request can never freeze thousands of
            // snapshots in a single transaction.
            int wanted = requested == null ? ModulePracticeRequests.MAX_QUESTION_COUNT : requested;
            int count = Math.min(wanted, shuffled.size());
            List<Long> chosen = shuffled.subList(0, count);

            User student = users.getReferenceById(userId);
            Instant now = Instant.now();
            QuestionPracticeSession session = sessions.saveAndFlush(QuestionPracticeSession.builder()
                    .user(student)
                    .course(scope.course())
                    // null for the General pool: the run is scoped by its course alone.
                    .module(scope.module())
                    .mode(mode)
                    .questionCount(count)
                    .answeredCount(0)
                    .correctCount(0)
                    .status(QuestionPracticeSession.STATUS_IN_PROGRESS)
                    .startedAt(now)
                    .lastActivityAt(now)
                    .durationSeconds(0)
                    .build());

            Map<Long, Question> byId = new HashMap<>();
            // Eager fetch question group to eliminate lazy-loading N+1 queries
            for (Question question : questions.findAllWithGroupByQuestionIdIn(chosen)) {
                byId.put(question.getQuestionId(), question);
            }
            Map<Long, List<AnswerOption>> options = paperFactory.optionsOf(new ArrayList<>(byId.values()));

            // Batch load all media in a single query
            List<QuestionMedia> allMedia = media.findByQuestion_QuestionIdIn(chosen);
            Map<Long, List<QuestionMedia>> mediaByQuestionId = allMedia.stream()
                    .collect(Collectors.groupingBy(m -> m.getQuestion().getQuestionId()));

            List<QuestionPracticeSessionQuestion> paper = new ArrayList<>(count);
            // order_index counts the rows actually written, so it stays gap-free even when the bank
            // changed between the pool query and the entity load.
            int position = 0;
            for (Long questionId : chosen) {
                Question question = byId.get(questionId);
                if (question == null) {
                    continue;
                }
                List<AnswerOption> questionOptions = options.get(question.getQuestionId());
                Snapshots.KeySnapshot key = paperFactory.key(question, questionOptions);
                Snapshots.DisplayQuestion display =
                        paperFactory.display(question, key, questionOptions, position, shuffler, question.getGroup());
                paper.add(QuestionPracticeSessionQuestion.builder()
                        .session(session)
                        .question(question)
                        .orderIndex(position++)
                        .questionLockVersion(question.getLockVersion() == null ? 0L : question.getLockVersion())
                        .scoringVersion(question.getScoringVersion() == null ? 1 : question.getScoringVersion())
                        .displaySnapshot(support.freezeDisplay(question, display,
                                mediaByQuestionId.getOrDefault(question.getQuestionId(), List.of())))
                        .keySnapshot(paperFactory.write(key))
                        .attemptCount(0)
                        .gradingStatus(QuestionPracticeSessionQuestion.GRADING_UNANSWERED)
                        .build());
            }
            if (paper.isEmpty()) {
                throw new BaseException(ResponseCode.PRACTICE_NO_QUESTIONS, noQuestionsMessage(scope));
            }
            session.setQuestionCount(paper.size());
            sessionQuestions.saveAll(paper);
            return support.detailOf(session, false);
        });
        return created;
    }

    /** The eligible ids of the requested mode, refusing an empty pool with the documented error. */
    private List<Long> poolOf(Long userId, PracticeScope scope, String mode, String difficulty,
                              List<String> questionTypes) {
        if (QuestionPracticeSession.MODE_REVIEW.equals(mode) || QuestionPracticeSession.MODE_WRONG.equals(mode)) {
            List<Long> pool = reviewPool(userId, scope);
            if (pool.isEmpty()) {
                throw new BaseException(ResponseCode.PRACTICE_NO_QUESTIONS, scope.isGeneral()
                        ? "No question of this course's General pool is waiting for review"
                        : "No question of this module is waiting for review");
            }
            return pool;
        }
        if (QuestionPracticeSession.MODE_BOOKMARKED.equals(mode)) {
            List<Long> pool = bookmarkedPool(userId, scope);
            if (pool.isEmpty()) {
                throw new BaseException(ResponseCode.PRACTICE_NO_QUESTIONS, scope.isGeneral()
                        ? "No bookmarked question available for practice in this course's General pool"
                        : "No bookmarked question available for practice in this module");
            }
            return pool;
        }
        if (QuestionPracticeSession.MODE_TARGET.equals(mode)) {
            List<Long> pool = targetPool(scope, difficulty, questionTypes);
            if (pool.isEmpty()) {
                throw new BaseException(ResponseCode.PRACTICE_NO_QUESTIONS, scope.isGeneral()
                        ? "No question matches the specified criteria in this course's General pool"
                        : "No question matches the specified criteria in this module");
            }
            return pool;
        }
        List<Long> pool = drawableIds(scope);
        if (pool.isEmpty()) {
            throw new BaseException(ResponseCode.PRACTICE_NO_QUESTIONS, noQuestionsMessage(scope));
        }
        return pool;
    }

    /** Scope-appropriate wording, so a General refusal never claims to be about a module. */
    private static String noQuestionsMessage(PracticeScope scope) {
        return scope.isGeneral()
                ? "This course's General pool has no question available for practice"
                : "This module has no question available for practice";
    }

    private List<Long> drawableIds(PracticeScope scope) {
        return scope.isGeneral()
                ? questions.findGeneralPracticeDrawableIds(scope.courseId())
                : questions.findPracticeDrawableIds(scope.moduleId());
    }

    private long drawableCount(PracticeScope scope) {
        return scope.isGeneral()
                ? questions.countGeneralPracticeDrawable(scope.courseId())
                : questions.countPracticeDrawable(scope.moduleId());
    }

    private List<Long> bookmarkedPool(Long userId, PracticeScope scope) {
        return scope.isGeneral()
                ? reviewRepository.findGeneralBookmarkedQuestionIds(userId, scope.courseId())
                : reviewRepository.findBookmarkedQuestionIds(userId, scope.moduleId());
    }

    private List<Long> targetPool(PracticeScope scope, String difficulty, List<String> questionTypes) {
        String diff = (difficulty != null && !difficulty.isBlank()) ? difficulty.trim() : null;
        boolean hasTypes = questionTypes != null && !questionTypes.isEmpty();
        List<String> types = hasTypes ? questionTypes : List.of("");
        return scope.isGeneral()
                ? questions.findGeneralTargetDrawableIds(scope.courseId(), diff, hasTypes, types)
                : questions.findTargetDrawableIds(scope.moduleId(), diff, hasTypes, types);
    }

    /**
     * The review questions that are still deliverable. The eligibility set is intersected in a new
     * list rather than by mutating the repository's result, so the method does not depend on how the
     * provider materialised it.
     */
    private List<Long> reviewPool(Long userId, PracticeScope scope) {
        Set<Long> stillEligible = new HashSet<>(drawableIds(scope));
        List<Long> reviewIds = scope.isGeneral()
                ? progress.findReviewQuestionIdsGeneral(userId, scope.courseId())
                : progress.findReviewQuestionIds(userId, scope.moduleId());
        List<Long> pool = new ArrayList<>();
        for (Long questionId : reviewIds) {
            if (stillEligible.contains(questionId)) {
                pool.add(questionId);
            }
        }
        return pool;
    }

    private Optional<QuestionPracticeSession> openSession(Long userId, PracticeScope scope) {
        return scope.isGeneral()
                ? sessions.findFirstByUser_UserIdAndCourse_CourseIdAndModuleIsNullAndStatusOrderBySessionIdDesc(
                        userId, scope.courseId(), QuestionPracticeSession.STATUS_IN_PROGRESS)
                : sessions.findFirstByUser_UserIdAndModule_ModuleIdAndStatusOrderBySessionIdDesc(
                        userId, scope.moduleId(), QuestionPracticeSession.STATUS_IN_PROGRESS);
    }

    // ------------------------------------------------------------------ MP-03

    @Override
    @Transactional(readOnly = true)
    public ModulePracticeResponses.SessionDetail session(Long userId, Long sessionId) {
        QuestionPracticeSession session = owned(userId, sessionId);
        support.requireSessionAccess(userId, session);
        return support.detailOf(session, false);
    }

    // ------------------------------------------------------------------ MP-04

    @Override
    @Transactional(readOnly = true)
    public ModulePracticeResponses.QuestionView question(Long userId, Long sessionId, Long sessionQuestionId) {
        QuestionPracticeSession session = owned(userId, sessionId);
        support.requireSessionAccess(userId, session);
        QuestionPracticeSessionQuestion sessionQuestion = sessionQuestions
                .findInSession(sessionId, sessionQuestionId)
                .orElseThrow(() -> new ResourceNotFoundException("Question is not part of this practice session"));
        List<com.examprep.entities.QuestionPracticeAnswer> attempts =
                answers.findBySessionQuestion_SessionQuestionIdOrderByAttemptNumberAsc(sessionQuestionId);
        boolean isBookmarked = reviewRepository.existsByStudent_UserIdAndQuestion_QuestionIdAndBookmarkTrue(
                userId, sessionQuestion.getQuestion().getQuestionId());
        return support.questionViewOf(sessionQuestion, session.getQuestionCount(), session.getAnsweredCount(), attempts, isBookmarked);
    }

    // ------------------------------------------------------------------ MP-07

    @Override
    @Transactional
    public ModulePracticeResponses.SessionDetail complete(Long userId, Long sessionId) {
        QuestionPracticeSession session = sessions.lockOwned(sessionId, userId)
                .orElseThrow(() -> new ResourceNotFoundException(ResponseCode.PRACTICE_SESSION_NOT_FOUND,
                        "Practice session not found"));
        support.requireSessionAccess(userId, session);
        Instant now = Instant.now();
        if (session.isInProgress()) {
            session.setStatus(QuestionPracticeSession.STATUS_COMPLETED);
            session.setCompletedAt(now);
        }
        // Idempotent: completing an already closed session only refreshes its duration.
        support.refreshCounters(session, session.getCompletedAt() == null ? now : session.getCompletedAt());
        sessions.save(session);
        return support.detailOf(session, false);
    }

    // ------------------------------------------------------------------ MP-08

    @Override
    @Transactional(readOnly = true)
    public ModulePracticeResponses.Result result(Long userId, Long sessionId) {
        QuestionPracticeSession session = owned(userId, sessionId);
        support.requireSessionAccess(userId, session);
        List<QuestionPracticeSessionQuestion> paper = sessionQuestions.findPaperBySessionId(sessionId);

        int answered = 0;
        int latestCorrect = 0;
        int latestWrong = 0;
        int awaitingGrade = 0;
        int gradedWithoutVerdict = 0;
        int failedGrade = 0;
        List<ModulePracticeResponses.ResultQuestion> rows = new ArrayList<>(paper.size());
        for (QuestionPracticeSessionQuestion row : paper) {
            if (row.isAnswered()) {
                answered++;
                // The five buckets below sum to answeredQuestions: a verdict, still being graded,
                // graded without a verdict (a rubric score), or failed to grade.
                if (Boolean.TRUE.equals(row.getLatestIsCorrect())) {
                    latestCorrect++;
                } else if (Boolean.FALSE.equals(row.getLatestIsCorrect())) {
                    latestWrong++;
                } else if (AWAITING_GRADE.contains(row.getGradingStatus())) {
                    awaitingGrade++;
                } else if (GRADED.contains(row.getGradingStatus())) {
                    gradedWithoutVerdict++;
                } else {
                    failedGrade++;
                }
            }
            rows.add(new ModulePracticeResponses.ResultQuestion(
                    row.getSessionQuestionId(),
                    row.getQuestion().getQuestionId(),
                    row.getOrderIndex(),
                    row.getQuestion().getQuestionType(),
                    row.getAttemptCount(),
                    row.getLatestIsCorrect(),
                    row.getLatestScore(),
                    row.getGradingStatus(),
                    row.getFirstAnsweredAt(),
                    row.getLastAnsweredAt()));
        }

        Object[] attemptStats = answers.summarizeSession(sessionId).get(0);
        long totalAttempts = number(attemptStats[0]);
        long gradedAttempts = number(attemptStats[1]);
        long correctAttempts = number(attemptStats[2]);
        long wrongAttempts = number(attemptStats[3]);

        return new ModulePracticeResponses.Result(
                session.getSessionId(),
                support.moduleIdOf(session),
                support.moduleTitleOf(session),
                session.getStatus(),
                paper.size(),
                answered,
                paper.size() - answered,
                latestCorrect,
                latestWrong,
                awaitingGrade,
                gradedWithoutVerdict,
                failedGrade,
                totalAttempts,
                gradedAttempts,
                correctAttempts,
                wrongAttempts,
                accuracy(correctAttempts, gradedAttempts),
                session.getDurationSeconds(),
                session.getStartedAt(),
                session.getCompletedAt(),
                rows);
    }

    // ------------------------------------------------------------------ MP-11

    @Override
    @Transactional(readOnly = true)
    public Page<ModulePracticeResponses.ReviewItem> reviewQuestions(Long userId, Long moduleId,
                                                                    int page, int size) {
        return reviewQuestionsOf(userId, support.requireModuleScope(userId, moduleId), page, size);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<ModulePracticeResponses.ReviewItem> generalReviewQuestions(Long userId, Long courseId,
                                                                          int page, int size) {
        return reviewQuestionsOf(userId, support.requireGeneralScope(userId, courseId), page, size);
    }

    private Page<ModulePracticeResponses.ReviewItem> reviewQuestionsOf(Long userId, PracticeScope scope,
                                                                       int page, int size) {
        int pageSize = Math.min(Math.max(size, 1), MAX_REVIEW_PAGE_SIZE);
        PageRequest paging = PageRequest.of(Math.max(page, 0), pageSize);
        Page<QuestionPracticeProgress> found = scope.isGeneral()
                ? progress.findGeneralReviewQuestions(userId, scope.courseId(), paging)
                : progress.findReviewQuestions(userId, scope.moduleId(), paging);
        return found.map(item -> new ModulePracticeResponses.ReviewItem(
                item.getProgressId(),
                item.getQuestion().getQuestionId(),
                scope.moduleId(),
                scope.moduleTitle(),
                item.getQuestion().getQuestionType(),
                item.getQuestion().getContent(),
                item.getTotalAttempts(),
                item.getGradedAttempts(),
                item.getCorrectAttempts(),
                item.getWrongAttempts(),
                item.getLastIsCorrect(),
                item.getBestScore(),
                item.getMasteryStatus(),
                item.getLastAnsweredAt()));
    }

    // ------------------------------------------------------------------ MP-12

    @Override
    @Transactional
    public ModulePracticeResponses.ResetResult resetProgress(Long userId, Long moduleId) {
        return resetProgressOf(userId, support.requireModuleScope(userId, moduleId));
    }

    @Override
    @Transactional
    public ModulePracticeResponses.ResetResult generalResetProgress(Long userId, Long courseId) {
        return resetProgressOf(userId, support.requireGeneralScope(userId, courseId));
    }

    /**
     * Strictly PRACTICE_ONLY: sessions (and, through the schema's cascades, their frozen paper and
     * every stored attempt) plus the aggregated practice progress of this student and scope.
     *
     * <p>A General reset deletes only sessions and progress rows whose {@code module_id} is NULL, so
     * the module runs of the same course survive, and vice versa.</p>
     *
     * <p>Untouched by construction: {@code question_review} (the mistake notebook and its bookmarks),
     * exams, attempts, flashcards, study sessions, enrolments, other modules, other students and
     * {@code ai_usage_logs}.</p>
     */
    private ModulePracticeResponses.ResetResult resetProgressOf(Long userId, PracticeScope scope) {
        int deletedSessions = scope.isGeneral()
                ? sessions.deleteGeneralByUserIdAndCourseId(userId, scope.courseId())
                : sessions.deleteByUserIdAndModuleId(userId, scope.moduleId());
        int deletedProgress = scope.isGeneral()
                ? progress.deleteGeneralByUserIdAndCourseId(userId, scope.courseId())
                : progress.deleteByUserIdAndModuleId(userId, scope.moduleId());
        return new ModulePracticeResponses.ResetResult(
                scope.moduleId(), scope.moduleTitle(), deletedSessions, deletedProgress);
    }

    // ------------------------------------------------------------------ helpers

    private QuestionPracticeSession owned(Long userId, Long sessionId) {
        return sessions.findOwned(sessionId, userId)
                .orElseThrow(() -> new ResourceNotFoundException(ResponseCode.PRACTICE_SESSION_NOT_FOUND,
                        "Practice session not found"));
    }

    /** correct / graded, four decimals, and 0 when nothing is graded yet (no division by zero). */
    static BigDecimal accuracy(long correct, long graded) {
        if (graded <= 0) {
            return BigDecimal.ZERO.setScale(ACCURACY_SCALE, RoundingMode.HALF_UP);
        }
        return BigDecimal.valueOf(correct)
                .divide(BigDecimal.valueOf(graded), ACCURACY_SCALE, RoundingMode.HALF_UP);
    }

    private static long number(Object value) {
        return value instanceof Number counted ? counted.longValue() : 0L;
    }
}
