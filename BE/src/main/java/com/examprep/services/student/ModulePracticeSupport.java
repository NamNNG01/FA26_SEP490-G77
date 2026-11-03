package com.examprep.services.student;

import com.examprep.dto.attempt.Snapshots;
import com.examprep.dto.practice.ModulePracticeResponses;
import com.examprep.entities.Enrollment;
import com.examprep.entities.Module;
import com.examprep.entities.QuestionMedia;
import com.examprep.entities.QuestionPracticeAnswer;
import com.examprep.entities.QuestionPracticeProgress;
import com.examprep.entities.QuestionPracticeSession;
import com.examprep.entities.QuestionPracticeSessionQuestion;
import com.examprep.exceptions.ForbiddenException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.EnrollmentRepository;
import com.examprep.repositories.ModuleRepository;
import com.examprep.repositories.QuestionMediaRepository;
import com.examprep.repositories.QuestionPracticeAnswerRepository;
import com.examprep.repositories.QuestionPracticeProgressRepository;
import com.examprep.repositories.QuestionPracticeSessionQuestionRepository;
import com.examprep.repositories.QuestionRepository;
import com.examprep.services.AttemptPaperFactory;
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

    private final ModuleRepository modules;
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

    /** The module of an already loaded session, re-validated against the caller's access. */
    public void requireModuleAccess(Long userId, QuestionPracticeSession session) {
        requireModule(userId, session.getModule().getModuleId());
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
        ObjectNode frozen = objectMapper.valueToTree(display);
        ArrayNode mediaRows = frozen.putArray("media");
        for (QuestionMedia asset : media.findByQuestion_QuestionId(question.getQuestionId())) {
            mediaRows.addObject()
                    .put("mediaId", asset.getMediaId())
                    // Reading the id of a lazy proxy does not initialise it, so this stays one query.
                    .put("optionId", asset.getOption() == null ? null : asset.getOption().getOptionId())
                    .put("mediaType", asset.getMediaType())
                    .put("url", asset.getUrl())
                    .put("altText", asset.getAltText());
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
        Long moduleId = session.getModule().getModuleId();
        Long questionId = sessionQuestion.getQuestion().getQuestionId();

        Optional<QuestionPracticeProgress> locked =
                progress.lockByUserModuleQuestion(userId, moduleId, questionId);
        if (locked.isEmpty()) {
            // No row yet: serialise the creation on the question row, then re-read under that lock.
            questions.lockById(questionId);
            locked = progress.findByUser_UserIdAndModule_ModuleIdAndQuestion_QuestionId(
                    userId, moduleId, questionId);
        }

        Object[] summary = answers.summarizeProgress(userId, moduleId, questionId).get(0);
        int total = (int) number(summary[0]);
        int graded = (int) number(summary[1]);
        int correct = (int) number(summary[2]);
        int wrong = (int) number(summary[3]);
        // The newest finalized attempt may legitimately carry a null verdict (a graded rubric answer),
        // so the single value is read by index: Stream#findFirst would reject a null element.
        List<Boolean> newestVerdict = answers.findFinalizedResultsNewestFirst(
                userId, moduleId, questionId, PageRequest.of(0, 1));
        Boolean lastIsCorrect = newestVerdict.isEmpty() ? null : newestVerdict.get(0);

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
        row.setBestScore(decimal(summary[4]));
        row.setFirstAnsweredAt(instant(summary[5]));
        row.setLastAnsweredAt(instant(summary[6]));
        row.setMasteryStatus(graded == 0
                ? QuestionPracticeProgress.MASTERY_NEW
                : Boolean.TRUE.equals(lastIsCorrect)
                        ? QuestionPracticeProgress.MASTERY_MASTERED
                        : QuestionPracticeProgress.MASTERY_LEARNING);
        return progress.save(row);
    }

    /** Recomputes the session counters from the paper rows; both are a single aggregate query. */
    public void refreshCounters(QuestionPracticeSession session, Instant now) {
        Long sessionId = session.getSessionId();
        session.setAnsweredCount((int) sessionQuestions.countAnswered(sessionId));
        session.setCorrectCount((int) sessionQuestions.countLatestCorrect(sessionId));
        session.setLastActivityAt(now);
        session.setDurationSeconds((int) Math.max(0,
                Duration.between(session.getStartedAt(), now).getSeconds()));
    }

    public ModulePracticeResponses.SessionProgress progressOf(QuestionPracticeSession session) {
        Optional<QuestionPracticeSessionQuestion> next = nextUnanswered(session.getSessionId());
        return new ModulePracticeResponses.SessionProgress(
                session.getQuestionCount(),
                session.getAnsweredCount(),
                session.getCorrectCount(),
                session.getStatus(),
                next.map(QuestionPracticeSessionQuestion::getSessionQuestionId).orElse(null),
                next.map(QuestionPracticeSessionQuestion::getOrderIndex).orElse(null));
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
        Optional<QuestionPracticeSessionQuestion> next = nextUnanswered(sessionId);
        return new ModulePracticeResponses.SessionDetail(
                sessionId,
                session.getModule().getModuleId(),
                session.getModule().getTitle(),
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
                next.map(QuestionPracticeSessionQuestion::getSessionQuestionId).orElse(null),
                next.map(QuestionPracticeSessionQuestion::getOrderIndex).orElse(null),
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
     * passage all come from the frozen display document; the answer key is never read here.
     */
    public ModulePracticeResponses.QuestionView questionViewOf(QuestionPracticeSessionQuestion sessionQuestion,
                                                               int questionsTotal,
                                                               int questionsAnswered,
                                                               List<QuestionPracticeAnswer> attempts) {
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
                sessionQuestion.getAttemptCount(),
                sessionQuestion.getLatestIsCorrect(),
                sessionQuestion.getLatestScore(),
                sessionQuestion.getGradingStatus(),
                submitted);
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
