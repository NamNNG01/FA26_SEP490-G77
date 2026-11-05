package com.examprep.services.student;

import com.examprep.dto.attempt.Snapshots;
import com.examprep.dto.practice.ModulePracticeResponses;
import com.examprep.entities.Course;
import com.examprep.entities.Enrollment;
import com.examprep.entities.Module;
import com.examprep.entities.QuestionMedia;
import com.examprep.entities.QuestionPracticeAnswer;
import com.examprep.entities.QuestionPracticeProgress;
import com.examprep.entities.QuestionPracticeSession;
import com.examprep.entities.QuestionPracticeSessionQuestion;
import com.examprep.exceptions.ForbiddenException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.CourseRepository;
import com.examprep.repositories.EnrollmentRepository;
import com.examprep.repositories.ModuleRepository;
import com.examprep.repositories.QuestionMediaRepository;
import com.examprep.repositories.QuestionPracticeAnswerRepository;
import com.examprep.repositories.QuestionPracticeProgressRepository;
import com.examprep.repositories.QuestionPracticeSessionQuestionRepository;
import com.examprep.repositories.QuestionRepository;
import com.examprep.services.AttemptPaperFactory;
import com.examprep.util.attempt.AttemptGrader;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * The pieces every Module Practice service needs: the access rule of a module, the read/write of the
 * frozen snapshots, and the mapping of practice rows to their DTOs.
 *
 * <p>Snapshots are built and read through {@link AttemptPaperFactory}, the same component the exam
 * attempt feature uses, so practice never grows a second, drifting answer-key format. On top of that
 * shared document, a session's {@code display_snapshot} also carries the question's displayable media
 * and its shared passage, frozen at session start, so nothing a manager edits mid-session can change
 * what the student is practising.</p>
 */
@Component
@RequiredArgsConstructor
public class ModulePracticeSupport {

    public static final BigDecimal RUBRIC_PASSING_THRESHOLD = new BigDecimal("0.50");

    private final ModuleRepository modules;
    private final CourseRepository courses;
    private final EnrollmentRepository enrollments;
    private final QuestionRepository questions;
    private final QuestionPracticeSessionQuestionRepository sessionQuestions;
    private final QuestionPracticeAnswerRepository answers;
    private final QuestionPracticeProgressRepository progress;
    private final QuestionMediaRepository media;
    private final AttemptPaperFactory paperFactory;
    private final ObjectMapper objectMapper;

    /**
     * Resolves a module this student may practise: it must exist and not be hidden (otherwise 404,
     * the same answer an unknown id gets), and the student must be actively enrolled in its course
     * (otherwise 403, the convention the other student services use for a visible course the caller
     * is not enrolled in).
     */
    public Module requireModule(Long userId, Long moduleId) {
        Module module = modules.findById(moduleId)
                .orElseThrow(() -> new ResourceNotFoundException("Module not found"));
        if (module.isHidden()) {
            throw new ResourceNotFoundException("Module not found");
        }
        Long courseId = module.getCourse().getCourseId();
        if (!enrollments.existsByCourse_CourseIdAndUser_UserIdAndStatus(
                courseId, userId, Enrollment.STATUS_ACTIVE)) {
            throw new ForbiddenException("Student is not actively enrolled in this course");
        }
        return module;
    }

    /**
     * Resolves the General scope of a course: it must exist (otherwise 404, the same answer an
     * unknown id gets) and the student must be actively enrolled in it (otherwise 403, the convention
     * the other student services use for a visible course the caller is not enrolled in).
     */
    public Course requireCourse(Long userId, Long courseId) {
        Course course = courses.findById(courseId)
                .orElseThrow(() -> new ResourceNotFoundException("Course not found"));
        requireActiveEnrollment(userId, courseId);
        return course;
    }

    /** The scope of one module, resolved through {@link #requireModule}. */
    public PracticeScope requireModuleScope(Long userId, Long moduleId) {
        return PracticeScope.ofModule(requireModule(userId, moduleId));
    }

    /** The General scope of one course: its questions that carry no module. */
    public PracticeScope requireGeneralScope(Long userId, Long courseId) {
        return PracticeScope.general(requireCourse(userId, courseId));
    }

    private void requireActiveEnrollment(Long userId, Long courseId) {
        if (!enrollments.existsByCourse_CourseIdAndUser_UserIdAndStatus(
                courseId, userId, Enrollment.STATUS_ACTIVE)) {
            throw new ForbiddenException("Student is not actively enrolled in this course");
        }
    }

    /**
     * The access rule of an already loaded session, without extra queries: a module session must still
     * point at a visible module, a General session needs no module, and both need an ACTIVE enrolment
     * in the session's course.
     */
    public void requireSessionAccess(Long userId, QuestionPracticeSession session) {
        Module module = session.getModule();
        if (module != null && module.isHidden()) {
            throw new ResourceNotFoundException("Module not found");
        }
        requireActiveEnrollment(userId, session.getCourse().getCourseId());
    }

    /** The module a session belongs to, or {@code null} for a General run. */
    public Long moduleIdOf(QuestionPracticeSession session) {
        return session.getModule() == null ? null : session.getModule().getModuleId();
    }

    /** "General" for a session of a course's module-less pool. */
    public String moduleTitleOf(QuestionPracticeSession session) {
        return session.getModule() == null
                ? PracticeScope.GENERAL_TITLE
                : session.getModule().getTitle();
    }

    /** The frozen display document of one paper row. */
    public Snapshots.DisplayQuestion displayOf(QuestionPracticeSessionQuestion sessionQuestion) {
        return paperFactory.read(sessionQuestion.getDisplaySnapshot(), Snapshots.DisplayQuestion.class);
    }

    /** The frozen grading key of one paper row. Never returned to a client. */
    public Snapshots.KeySnapshot keyOf(QuestionPracticeSessionQuestion sessionQuestion) {
        return paperFactory.read(sessionQuestion.getKeySnapshot(), Snapshots.KeySnapshot.class);
    }

    public JsonNode responseOf(QuestionPracticeAnswer answer) {
        return paperFactory.readResponse(answer.getResponse());
    }

    public String writeResponse(JsonNode response) {
        return paperFactory.writeResponse(response);
    }

    // ------------------------------------------------------------------ frozen paper

    /**
     * Serialises one question for a session: the shared display document plus the media and the shared
     * passage as they are right now. {@link Snapshots.DisplayQuestion} ignores the two extra keys, so
     * validation and grading keep reading the same document they always did.
     */
    public String freezeDisplay(com.examprep.entities.Question question, Snapshots.DisplayQuestion display) {
        return freezeDisplay(question, display, media.findByQuestion_QuestionId(question.getQuestionId()));
    }

    /** Overload accepting preloaded media to eliminate N+1 queries during session creation. */
    public String freezeDisplay(com.examprep.entities.Question question,
                                Snapshots.DisplayQuestion display,
                                List<QuestionMedia> questionMedia) {
        ObjectNode frozen = objectMapper.valueToTree(display);
        ArrayNode mediaRows = frozen.putArray("media");
        if (questionMedia != null) {
            for (QuestionMedia asset : questionMedia) {
                mediaRows.addObject()
                        .put("mediaId", asset.getMediaId())
                        // Reading the id of a lazy proxy does not initialise it, so this stays one query.
                        .put("optionId", asset.getOption() == null ? null : asset.getOption().getOptionId())
                        .put("mediaType", asset.getMediaType())
                        .put("url", asset.getUrl())
                        .put("altText", asset.getAltText());
            }
        }
        if (question.getGroup() != null) {
            frozen.putObject("group")
                    .put("groupId", question.getGroup().getGroupId())
                    .put("questionType", question.getGroup().getQuestionType())
                    .put("title", question.getGroup().getTitle())
                    .put("passageText", question.getGroup().getPassageText());
        }
        return frozen.toString();
    }

    /** MP-04: the media frozen into this session's paper, never the question's current media. */
    public List<ModulePracticeResponses.MediaView> mediaOf(QuestionPracticeSessionQuestion sessionQuestion) {
        List<ModulePracticeResponses.MediaView> views = new ArrayList<>();
        for (JsonNode asset : frozenExtras(sessionQuestion).path("media")) {
            views.add(new ModulePracticeResponses.MediaView(
                    asset.path("mediaId").isNumber() ? asset.path("mediaId").asLong() : null,
                    asset.path("optionId").isNumber() ? asset.path("optionId").asLong() : null,
                    asset.path("mediaType").asText(null),
                    asset.path("url").asText(null),
                    asset.path("altText").asText(null)));
        }
        return views;
    }

    /** MP-04: the shared passage frozen into this session's paper, if the question had one. */
    public ModulePracticeResponses.GroupView groupOf(QuestionPracticeSessionQuestion sessionQuestion) {
        JsonNode group = frozenExtras(sessionQuestion).path("group");
        if (group.isMissingNode() || group.isNull()) {
            return null;
        }
        return new ModulePracticeResponses.GroupView(
                group.path("groupId").isNumber() ? group.path("groupId").asLong() : null,
                group.path("questionType").asText(null),
                group.path("title").asText(null),
                group.path("passageText").asText(null));
    }

    /** The frozen display document as a tree, so the practice-only extras can be read back. */
    private JsonNode frozenExtras(QuestionPracticeSessionQuestion sessionQuestion) {
        String raw = sessionQuestion.getDisplaySnapshot();
        if (raw == null || raw.isBlank()) {
            return objectMapper.createObjectNode();
        }
        try {
            return objectMapper.readTree(raw);
        } catch (Exception unreadable) {
            // A snapshot from another build: the extras are simply absent.
            return objectMapper.createObjectNode();
        }
    }

    // ------------------------------------------------------------------ paper row projection

    /**
     * In-memory projection of the paper row directly from the freshly created answer (zero queries).
     */
    public void applyAnswer(QuestionPracticeSessionQuestion sessionQuestion, QuestionPracticeAnswer latest) {
        sessionQuestion.setAttemptCount(latest.getAttemptNumber());
        sessionQuestion.setLatestIsCorrect(latest.getIsCorrect());
        sessionQuestion.setLatestScore(latest.getScoreEarned());
        sessionQuestion.setGradingStatus(latest.getGradingStatus());
        if (sessionQuestion.getFirstAnsweredAt() == null) {
            sessionQuestion.setFirstAnsweredAt(latest.getAnsweredAt());
        }
        sessionQuestion.setLastAnsweredAt(latest.getAnsweredAt());
    }

    /**
     * In-memory incremental counter update for the locked session during submit (zero queries).
     */
    public void updateCounters(QuestionPracticeSession session,
                               Boolean previousIsCorrect,
                               boolean wasAnsweredBefore,
                               QuestionPracticeAnswer newAnswer,
                               Instant now) {
        if (!wasAnsweredBefore) {
            session.setAnsweredCount(session.getAnsweredCount() + 1);
        }
        Boolean newIsCorrect = newAnswer.getIsCorrect();
        if (Boolean.TRUE.equals(previousIsCorrect) && !Boolean.TRUE.equals(newIsCorrect)) {
            session.setCorrectCount(Math.max(0, session.getCorrectCount() - 1));
        } else if (!Boolean.TRUE.equals(previousIsCorrect) && Boolean.TRUE.equals(newIsCorrect)) {
            session.setCorrectCount(session.getCorrectCount() + 1);
        }
        session.setLastActivityAt(now);
        session.setDurationSeconds((int) Math.max(0,
                Duration.between(session.getStartedAt(), now).getSeconds()));
    }

    /**
     * Projects the paper row from that question's newest attempt. Called after a submit and after an
     * AI grade lands, so the row a student sees always describes the attempt they last made — an
     * older grading result that arrives late cannot overwrite a newer answer.
     */
    public void applyLatestAnswer(QuestionPracticeSessionQuestion sessionQuestion) {
        answers.findFirstBySessionQuestion_SessionQuestionIdOrderByAttemptNumberDesc(
                sessionQuestion.getSessionQuestionId()).ifPresent(latest -> {
            sessionQuestion.setAttemptCount(latest.getAttemptNumber());
            sessionQuestion.setLatestIsCorrect(latest.getIsCorrect());
            sessionQuestion.setLatestScore(latest.getScoreEarned());
            sessionQuestion.setGradingStatus(latest.getGradingStatus());
            if (sessionQuestion.getFirstAnsweredAt() == null) {
                sessionQuestion.setFirstAnsweredAt(latest.getAnsweredAt());
            }
            sessionQuestion.setLastAnsweredAt(latest.getAnsweredAt());
        });
    }

    // ------------------------------------------------------------------ long-term progress

    /**
     * Rebuilds the long-term progress row of one student / module / question from the entire stored
     * attempt history. Recomputing instead of incrementing keeps the row correct no matter in which
     * order a submission and a late AI grade land, and makes the operation idempotent.
     *
     * <p>{@code total_attempts} counts every submission (a queued essay included),
     * {@code graded_attempts} only finalized ones, and correct/wrong only finalized attempts that
     * carry a verdict — so {@code correct + wrong <= graded <= total} always holds.</p>
     *
     * <p>The read-modify-write is serialised on a row every writer of this key agrees on: the progress
     * row itself when it already exists, otherwise the question row (which both writers then also
     * hold), so a first insert can never collide on
     * {@code uq_qpp_user_module_question} and a later update can never be lost.</p>
     */
    public QuestionPracticeProgress refreshProgress(QuestionPracticeSessionQuestion sessionQuestion) {
        QuestionPracticeSession session = sessionQuestion.getSession();
        Long userId = session.getUser().getUserId();
        Long courseId = session.getCourse().getCourseId();
        Long moduleId = session.getModule() == null ? null : session.getModule().getModuleId();
        // A General run keeps its own row per (student, course, question); a module run per
        // (student, module, question).
        boolean general = moduleId == null;
        Long questionId = sessionQuestion.getQuestion().getQuestionId();

        Optional<QuestionPracticeProgress> locked = general
                ? progress.lockByUserCourseQuestion(userId, courseId, questionId)
                : progress.lockByUserModuleQuestion(userId, moduleId, questionId);
        if (locked.isEmpty()) {
            // No row yet: serialise the creation on the question row, then re-read under that lock.
            questions.lockById(questionId);
            locked = general
                    ? progress.findGeneralByUserCourseQuestion(userId, courseId, questionId)
                    : progress.findByUser_UserIdAndModule_ModuleIdAndQuestion_QuestionId(
                            userId, moduleId, questionId);
        }

        // Single query replaces summarizeProgress + findFinalizedResultsNewestFirst
        List<QuestionPracticeAnswer> history = general
                ? answers.findGeneralAttemptsForProgress(userId, courseId, questionId)
                : answers.findAttemptsForProgress(userId, moduleId, questionId);
        int total = history.size();
        int graded = 0;
        int correct = 0;
        int wrong = 0;
        BigDecimal bestScore = null;
        Boolean lastIsCorrect = null;
        BigDecimal latestScore = null;
        Instant firstAnsweredAt = null;
        Instant lastAnsweredAt = null;

        if (!history.isEmpty()) {
            lastAnsweredAt = history.get(0).getAnsweredAt();
            firstAnsweredAt = history.get(history.size() - 1).getAnsweredAt();
        }

        boolean foundNewestFinalized = false;
        for (QuestionPracticeAnswer a : history) {
            String status = a.getGradingStatus();
            if ("AUTO".equals(status) || "AI_GRADED".equals(status)) {
                graded++;
                if (Boolean.TRUE.equals(a.getIsCorrect())) {
                    correct++;
                } else if (Boolean.FALSE.equals(a.getIsCorrect())) {
                    wrong++;
                }
                if (a.getScoreEarned() != null) {
                    if (bestScore == null || a.getScoreEarned().compareTo(bestScore) > 0) {
                        bestScore = a.getScoreEarned();
                    }
                }
                if (!foundNewestFinalized) {
                    foundNewestFinalized = true;
                    lastIsCorrect = a.getIsCorrect();
                    latestScore = a.getScoreEarned();
                }
            }
        }

        String masteryStatus;
        if (graded == 0) {
            masteryStatus = QuestionPracticeProgress.MASTERY_NEW;
        } else if (Boolean.TRUE.equals(lastIsCorrect)) {
            masteryStatus = QuestionPracticeProgress.MASTERY_MASTERED;
        } else if (Boolean.FALSE.equals(lastIsCorrect)) {
            masteryStatus = QuestionPracticeProgress.MASTERY_LEARNING;
        } else {
            // Rubric question (lastIsCorrect is null, score-based):
            // Threshold >= 0.50 means mastered, < 0.50 means learning / needs review
            if (latestScore != null && latestScore.compareTo(RUBRIC_PASSING_THRESHOLD) >= 0) {
                masteryStatus = QuestionPracticeProgress.MASTERY_MASTERED;
            } else {
                masteryStatus = QuestionPracticeProgress.MASTERY_LEARNING;
            }
        }

        QuestionPracticeProgress row = locked.orElseGet(() -> QuestionPracticeProgress.builder()
                .user(session.getUser())
                .course(session.getCourse())
                .module(session.getModule())
                .question(sessionQuestion.getQuestion())
                .build());
        row.setTotalAttempts(total);
        row.setGradedAttempts(graded);
        row.setCorrectAttempts(correct);
        row.setWrongAttempts(wrong);
        row.setLastIsCorrect(lastIsCorrect);
        row.setBestScore(bestScore);
        row.setFirstAnsweredAt(firstAnsweredAt);
        row.setLastAnsweredAt(lastAnsweredAt);
        row.setMasteryStatus(masteryStatus);
        return progress.save(row);
    }

    /** Recomputes the session counters from the paper rows in a single aggregated query. */
    public void refreshCounters(QuestionPracticeSession session, Instant now) {
        Long sessionId = session.getSessionId();
        List<Object[]> counts = sessionQuestions.countAnsweredAndCorrect(sessionId);
        if (!counts.isEmpty()) {
            Object[] row = counts.get(0);
            session.setAnsweredCount((int) number(row[0]));
            session.setCorrectCount((int) number(row[1]));
        } else {
            session.setAnsweredCount(0);
            session.setCorrectCount(0);
        }
        session.setLastActivityAt(now);
        session.setDurationSeconds((int) Math.max(0,
                Duration.between(session.getStartedAt(), now).getSeconds()));
    }

    public ModulePracticeResponses.SessionProgress progressOf(QuestionPracticeSession session) {
        List<QuestionPracticeSessionQuestionRepository.UnansweredSummary> next =
                sessionQuestions.findNextUnanswered(session.getSessionId(), PageRequest.of(0, 1));
        return new ModulePracticeResponses.SessionProgress(
                session.getQuestionCount(),
                session.getAnsweredCount(),
                session.getCorrectCount(),
                session.getStatus(),
                next.isEmpty() ? null : next.get(0).getSessionQuestionId(),
                next.isEmpty() ? null : next.get(0).getOrderIndex());
    }

    /** MP-03: the first question still unanswered in the persisted order. */
    public Optional<QuestionPracticeSessionQuestion> nextUnanswered(Long sessionId) {
        List<QuestionPracticeSessionQuestion> head =
                sessionQuestions.findUnansweredOrdered(sessionId, PageRequest.of(0, 1));
        return head.isEmpty() ? Optional.empty() : Optional.of(head.get(0));
    }

    // ------------------------------------------------------------------ DTO mapping

    public ModulePracticeResponses.SessionDetail detailOf(QuestionPracticeSession session, boolean resumed) {
        Long sessionId = session.getSessionId();
        List<QuestionPracticeSessionQuestion> paper = sessionQuestions.findPaperBySessionId(sessionId);
        List<ModulePracticeResponses.SessionQuestionSummary> questions = new ArrayList<>(paper.size());
        for (QuestionPracticeSessionQuestion sessionQuestion : paper) {
            questions.add(summaryOf(sessionQuestion));
        }
        List<QuestionPracticeSessionQuestionRepository.UnansweredSummary> next =
                sessionQuestions.findNextUnanswered(sessionId, PageRequest.of(0, 1));
        Long nextId = next.isEmpty() ? null : next.get(0).getSessionQuestionId();
        Integer nextOrder = next.isEmpty() ? null : next.get(0).getOrderIndex();
        return new ModulePracticeResponses.SessionDetail(
                sessionId,
                moduleIdOf(session),
                moduleTitleOf(session),
                session.getCourse().getCourseId(),
                session.getCourse().getTitle(),
                session.getMode(),
                session.getQuestionCount(),
                session.getAnsweredCount(),
                session.getCorrectCount(),
                session.getStatus(),
                session.getStartedAt(),
                session.getLastActivityAt(),
                session.getCompletedAt(),
                session.getDurationSeconds(),
                resumed,
                nextId,
                nextOrder,
                questions);
    }

    public ModulePracticeResponses.SessionQuestionSummary summaryOf(QuestionPracticeSessionQuestion sessionQuestion) {
        return new ModulePracticeResponses.SessionQuestionSummary(
                sessionQuestion.getSessionQuestionId(),
                sessionQuestion.getQuestion().getQuestionId(),
                sessionQuestion.getOrderIndex(),
                sessionQuestion.getQuestion().getQuestionType(),
                sessionQuestion.isAnswered(),
                sessionQuestion.getAttemptCount(),
                sessionQuestion.getLatestIsCorrect(),
                sessionQuestion.getLatestScore(),
                sessionQuestion.getGradingStatus());
    }

    /**
     * MP-04: what the student is shown for one question. Content, options, matching columns, media and
     * passage all come from the frozen display document; {@code correctAnswer} comes from the frozen
     * key document of the auto-graded types, so the client can judge an answer in place with exactly
     * the rule {@link AttemptGrader} grades by.
     */
    public ModulePracticeResponses.QuestionView questionViewOf(QuestionPracticeSessionQuestion sessionQuestion,
                                                               int questionsTotal,
                                                               int questionsAnswered,
                                                               List<QuestionPracticeAnswer> attempts,
                                                               boolean isBookmarked) {
        Snapshots.DisplayQuestion display = displayOf(sessionQuestion);
        List<ModulePracticeResponses.OptionView> options = null;
        ModulePracticeResponses.MatchingView matching = null;
        ModulePracticeResponses.AnswerSpaceView answerSpace = null;
        String content = sessionQuestion.getQuestion().getContent();
        String questionType = sessionQuestion.getQuestion().getQuestionType();
        if (display != null) {
            content = display.content();
            questionType = display.questionType();
            if (display.options() != null) {
                options = new ArrayList<>(display.options().size());
                for (Snapshots.DisplayOption option : display.options()) {
                    options.add(new ModulePracticeResponses.OptionView(option.optionId(), option.optionText()));
                }
            }
            if (display.matching() != null) {
                matching = new ModulePracticeResponses.MatchingView(
                        display.matching().lefts(), display.matching().rights());
            }
            if (display.answerSpace() != null) {
                answerSpace = new ModulePracticeResponses.AnswerSpaceView(display.answerSpace().maxLength());
            }
        }
        List<ModulePracticeResponses.SubmittedAnswer> submitted = new ArrayList<>(attempts.size());
        for (QuestionPracticeAnswer attempt : attempts) {
            submitted.add(answerOf(attempt));
        }
        return new ModulePracticeResponses.QuestionView(
                sessionQuestion.getSession().getSessionId(),
                sessionQuestion.getSessionQuestionId(),
                sessionQuestion.getQuestion().getQuestionId(),
                sessionQuestion.getOrderIndex(),
                questionsTotal,
                questionsAnswered,
                questionType,
                content,
                options,
                matching,
                answerSpace,
                mediaOf(sessionQuestion),
                groupOf(sessionQuestion),
                correctAnswerOf(sessionQuestion, questionType),
                isBookmarked,
                sessionQuestion.getAttemptCount(),
                sessionQuestion.getLatestIsCorrect(),
                sessionQuestion.getLatestScore(),
                sessionQuestion.getGradingStatus(),
                submitted);
    }

    /**
     * MP-04: the frozen key of an auto-graded question — the exact values {@link AttemptGrader} grades
     * against — so the client can judge an answer in place. Only the field matching the question type
     * is set. Rubric types (ESSAY, DIAGRAM, CODE) have no right/wrong key and stay {@code null}.
     */
    private ModulePracticeResponses.CorrectAnswerView correctAnswerOf(
            QuestionPracticeSessionQuestion sessionQuestion, String questionType) {
        if (!AttemptGrader.isAutoGraded(questionType)) {
            return null;
        }
        Snapshots.KeySnapshot key = keyOf(sessionQuestion);
        if (key == null) {
            return null;
        }
        switch (questionType == null ? "" : questionType) {
            case "SINGLE_CHOICE", "TRUE_FALSE", "MULTIPLE_CHOICE":
                return key.correctOptionIds() == null || key.correctOptionIds().isEmpty() ? null
                        : new ModulePracticeResponses.CorrectAnswerView(key.correctOptionIds(), null, null, null);
            case "FILL_BLANK":
                if (key.blanks() == null || key.blanks().isEmpty()) {
                    return null;
                }
                List<ModulePracticeResponses.BlankView> blanks = new ArrayList<>();
                for (Snapshots.Blank blank : key.blanks()) {
                    blanks.add(new ModulePracticeResponses.BlankView(
                            blank.index(), blank.accepted(), blank.caseSensitive()));
                }
                return new ModulePracticeResponses.CorrectAnswerView(null, blanks, null, null);
            case "MATCHING":
                if (key.pairs() == null || key.pairs().isEmpty()) {
                    return null;
                }
                List<ModulePracticeResponses.MatchPairView> pairs = new ArrayList<>();
                for (Snapshots.Pair pair : key.pairs()) {
                    pairs.add(new ModulePracticeResponses.MatchPairView(pair.left(), pair.right()));
                }
                return new ModulePracticeResponses.CorrectAnswerView(null, null, pairs, null);
            case "ORDERING":
                return key.correctOrder() == null || key.correctOrder().isEmpty() ? null
                        : new ModulePracticeResponses.CorrectAnswerView(null, null, null, key.correctOrder());
            default:
                return null;
        }
    }

    /**
     * MP-06: one stored attempt, exactly as the student submitted it. The grading provenance
     * ({@code model}, {@code promptVersion}) stays in the column for a dispute but is not part of the
     * student-facing answer, matching what the exam result exposes.
     */
    public ModulePracticeResponses.SubmittedAnswer answerOf(QuestionPracticeAnswer answer) {
        return new ModulePracticeResponses.SubmittedAnswer(
                answer.getPracticeAnswerId(),
                answer.getAttemptNumber(),
                responseOf(answer),
                answer.getIsCorrect(),
                answer.getScoreEarned(),
                answer.getGradingStatus(),
                studentFeedback(answer.getFeedback()),
                readJson(answer.getCriteriaScores()),
                answer.getTimeSpentSeconds(),
                answer.getAnsweredAt(),
                answer.getGradedAt());
    }

    /** The student-facing part of a stored feedback document: the overall text only. */
    public JsonNode studentFeedback(String raw) {
        JsonNode stored = readJson(raw);
        if (stored == null || stored.isNull()) {
            return null;
        }
        ObjectNode visible = objectMapper.createObjectNode();
        JsonNode overall = stored.path("overallFeedback");
        if (overall.isMissingNode() || overall.isNull()) {
            visible.putNull("overallFeedback");
        } else {
            visible.set("overallFeedback", overall);
        }
        return visible;
    }

    /** Reads a stored {@code jsonb} column into a tree so the FE gets JSON, not an escaped string. */
    public JsonNode readJson(String text) {
        return paperFactory.readResponse(text);
    }

    private static long number(Object value) {
        return value instanceof Number counted ? counted.longValue() : 0L;
    }

    /** {@code SUM}/{@code MAX} over a {@code NUMERIC} column may come back as any Number subtype. */
    private static BigDecimal decimal(Object value) {
        if (value instanceof BigDecimal exact) {
            return exact;
        }
        return value instanceof Number approximate ? BigDecimal.valueOf(approximate.doubleValue()) : null;
    }

    /** A timestamp read by an aggregate may arrive as {@code Instant}, {@code Timestamp} or {@code OffsetDateTime}. */
    private static Instant instant(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Instant instant) {
            return instant;
        }
        if (value instanceof java.sql.Timestamp timestamp) {
            return timestamp.toInstant();
        }
        if (value instanceof java.time.OffsetDateTime offset) {
            return offset.toInstant();
        }
        if (value instanceof java.time.LocalDateTime local) {
            return local.toInstant(java.time.ZoneOffset.UTC);
        }
        return null;
    }
}
