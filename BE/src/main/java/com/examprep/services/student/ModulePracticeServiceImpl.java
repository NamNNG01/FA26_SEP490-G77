package com.examprep.services.student;

import com.examprep.dto.ResponseCode;
import com.examprep.dto.attempt.Snapshots;
import com.examprep.dto.practice.ModulePracticeRequests;
import com.examprep.dto.practice.ModulePracticeResponses;
import com.examprep.entities.AnswerOption;
import com.examprep.entities.Module;
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
import java.util.stream.Collectors;

/**
 * MP-01 … MP-04, MP-07, MP-08, MP-11, MP-12.
 *
 * <p>The module-scoped endpoints resolve the module through
 * {@link ModulePracticeSupport#requireModule} first; the session-scoped ones resolve the session by
 * ownership first (a foreign session is a 404) and then re-check the module and the enrolment through
 * {@link ModulePracticeSupport#requireModuleAccess}. A session therefore stops being reachable the
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
        Module module = support.requireModule(userId, moduleId);
        long total = questions.countPracticeDrawable(moduleId);
        Object[] summary = progress.summarizeModule(userId, moduleId).get(0);
        long practiced = number(summary[0]);
        long totalAttempts = number(summary[1]);
        long gradedAttempts = number(summary[2]);
        long correctAttempts = number(summary[3]);
        long wrongAttempts = number(summary[4]);
        long everCorrect = number(summary[5]);
        long needingReview = number(summary[6]);

        ModulePracticeResponses.ActiveSessionInfo active = null;
        Optional<QuestionPracticeSession> open = openSession(userId, moduleId);
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
                module.getModuleId(),
                module.getTitle(),
                module.getCourse().getCourseId(),
                module.getCourse().getTitle(),
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
    @Override
    public ModulePracticeResponses.SessionDetail startOrResume(Long userId, Long moduleId,
                                                               ModulePracticeRequests.StartSession request) {
        // The access rule runs before the resume answer, so a session whose module became hidden or
        // whose enrolment lapsed is refused here exactly like a new start would be.
        ModulePracticeResponses.SessionDetail open = inReadTransaction(() -> {
            support.requireModule(userId, moduleId);
            return openSession(userId, moduleId).map(session -> support.detailOf(session, true)).orElse(null);
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
            return create(userId, moduleId, mode, difficulty, questionTypes, requested);
        } catch (DataIntegrityViolationException concurrentStart) {
            // Another request created the open session first (or a unique paper row raced): adopt it.
            ModulePracticeResponses.SessionDetail adopted = inReadTransaction(() -> {
                support.requireModule(userId, moduleId);
                return openSession(userId, moduleId).map(session -> support.detailOf(session, true)).orElse(null);
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

    private ModulePracticeResponses.SessionDetail create(Long userId, Long moduleId, String mode,
                                                         String difficulty, List<String> questionTypes,
                                                         Integer requested) {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        ModulePracticeResponses.SessionDetail created = tx.execute(status -> {
            Module module = support.requireModule(userId, moduleId);
            if (openSession(userId, moduleId).isPresent()) {
                // A session appeared between the pre-check and this transaction: resume it.
                return support.detailOf(openSession(userId, moduleId).orElseThrow(), true);
            }

            List<Long> pool;
            if (QuestionPracticeSession.MODE_REVIEW.equals(mode) || QuestionPracticeSession.MODE_WRONG.equals(mode)) {
                pool = reviewPool(userId, moduleId);
                if (pool.isEmpty()) {
                    throw new BaseException(ResponseCode.PRACTICE_NO_QUESTIONS,
                            "No question of this module is waiting for review");
                }
            } else if (QuestionPracticeSession.MODE_BOOKMARKED.equals(mode)) {
                pool = bookmarkedPool(userId, moduleId);
                if (pool.isEmpty()) {
                    throw new BaseException(ResponseCode.PRACTICE_NO_QUESTIONS,
                            "No bookmarked question available for practice in this module");
                }
            } else if (QuestionPracticeSession.MODE_TARGET.equals(mode)) {
                pool = targetPool(moduleId, difficulty, questionTypes);
                if (pool.isEmpty()) {
                    throw new BaseException(ResponseCode.PRACTICE_NO_QUESTIONS,
                            "No question matches the specified criteria in this module");
                }
            } else {
                pool = questions.findPracticeDrawableIds(moduleId);
                if (pool.isEmpty()) {
                    throw new BaseException(ResponseCode.PRACTICE_NO_QUESTIONS,
                            "This module has no question available for practice");
                }
            }

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
                    .course(module.getCourse())
                    .module(module)
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
                        paperFactory.display(question, key, questionOptions, position, shuffler);
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
                throw new BaseException(ResponseCode.PRACTICE_NO_QUESTIONS,
                        "This module has no question available for practice");
            }
            session.setQuestionCount(paper.size());
            sessionQuestions.saveAll(paper);
            return support.detailOf(session, false);
        });
        return created;
    }

    private List<Long> bookmarkedPool(Long userId, Long moduleId) {
        return reviewRepository.findBookmarkedQuestionIds(userId, moduleId);
    }

    private List<Long> targetPool(Long moduleId, String difficulty, List<String> questionTypes) {
        String diff = (difficulty != null && !difficulty.isBlank()) ? difficulty.trim() : null;
        boolean hasTypes = questionTypes != null && !questionTypes.isEmpty();
        return questions.findTargetDrawableIds(moduleId, diff, hasTypes, hasTypes ? questionTypes : List.of(""));
    }

    /**
     * The review questions that are still deliverable. The eligibility set is intersected in a new
     * list rather than by mutating the repository's result, so the method does not depend on how the
     * provider materialised it.
     */
    private List<Long> reviewPool(Long userId, Long moduleId) {
        Set<Long> stillEligible = new HashSet<>(questions.findPracticeDrawableIds(moduleId));
        List<Long> pool = new ArrayList<>();
        for (Long questionId : progress.findReviewQuestionIds(userId, moduleId)) {
            if (stillEligible.contains(questionId)) {
                pool.add(questionId);
            }
        }
        return pool;
    }

    private Optional<QuestionPracticeSession> openSession(Long userId, Long moduleId) {
        return sessions.findFirstByUser_UserIdAndModule_ModuleIdAndStatusOrderBySessionIdDesc(
                userId, moduleId, QuestionPracticeSession.STATUS_IN_PROGRESS);
    }

    // ------------------------------------------------------------------ MP-03

    @Override
    @Transactional(readOnly = true)
    public ModulePracticeResponses.SessionDetail session(Long userId, Long sessionId) {
        QuestionPracticeSession session = owned(userId, sessionId);
        support.requireModuleAccess(userId, session);
        return support.detailOf(session, false);
    }

    // ------------------------------------------------------------------ MP-04

    @Override
    @Transactional(readOnly = true)
    public ModulePracticeResponses.QuestionView question(Long userId, Long sessionId, Long sessionQuestionId) {
        QuestionPracticeSession session = owned(userId, sessionId);
        support.requireModuleAccess(userId, session);
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
        support.requireModuleAccess(userId, session);
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
        support.requireModuleAccess(userId, session);
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
                session.getModule().getModuleId(),
                session.getModule().getTitle(),
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
        Module module = support.requireModule(userId, moduleId);
        int pageSize = Math.min(Math.max(size, 1), MAX_REVIEW_PAGE_SIZE);
        Page<QuestionPracticeProgress> found =
                progress.findReviewQuestions(userId, moduleId, PageRequest.of(Math.max(page, 0), pageSize));
        return found.map(item -> new ModulePracticeResponses.ReviewItem(
                item.getProgressId(),
                item.getQuestion().getQuestionId(),
                module.getModuleId(),
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

    /**
     * Strictly PRACTICE_ONLY: sessions (and, through the schema's cascades, their frozen paper and
     * every stored attempt) plus the aggregated practice progress of this student and module.
     *
     * <p>Untouched by construction: {@code question_review} (the mistake notebook and its bookmarks),
     * exams, attempts, flashcards, study sessions, enrolments, other modules, other students and
     * {@code ai_usage_logs}.</p>
     */
    @Override
    @Transactional
    public ModulePracticeResponses.ResetResult resetProgress(Long userId, Long moduleId) {
        Module module = support.requireModule(userId, moduleId);
        int deletedSessions = sessions.deleteByUserIdAndModuleId(userId, moduleId);
        int deletedProgress = progress.deleteByUserIdAndModuleId(userId, moduleId);
        return new ModulePracticeResponses.ResetResult(module.getModuleId(), deletedSessions, deletedProgress);
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
