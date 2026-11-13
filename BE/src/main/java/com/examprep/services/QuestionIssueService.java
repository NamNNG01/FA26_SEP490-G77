package com.examprep.services;

import com.examprep.dto.PageResponse;
import com.examprep.dto.QuestionIssueDtos.*;
import com.examprep.dto.ResponseCode;
import com.examprep.dto.attempt.Snapshots;
import com.examprep.dto.question.QuestionUpdateRequest;
import com.examprep.entities.*;
import com.examprep.exceptions.BaseException;
import com.examprep.repositories.*;
import com.examprep.security.UserPrincipal;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;

/**
 * Question issue flow: a student reports a wrong question, the reports of one question gather in one open
 * ticket, the course manager (or a co-manager, ADMIN sees all) takes it, then rejects it, marks it a duplicate
 * or resolves it by correcting the question. A correction that changes how answers score creates a regrade job
 * that only runs once a manager confirms it. Reporters get a notification when their ticket closes.
 * A ticket outside the caller's courses is 404 (never reveal it exists).
 */
@Service
@RequiredArgsConstructor
@Transactional
public class QuestionIssueService {
    private static final Set<String> EDITABLE = Set.of("content", "explanation", "difficulty", "options", "answerKey",
            "correctOrder", "questionMetadata", "essayGradingRubric", "codeConfig", "testCases");
    private static final Set<String> CODE_ONLY = Set.of("codeConfig", "testCases");
    private static final Map<String, String> SORTS = Map.of("createdAt", "createdAt", "updatedAt", "updatedAt",
            "priority", "priorityScore", "lastReportedAt", "lastReportedAt");

    private final QuestionIssueRepository issues;
    private final QuestionIssueReportRepository reports;
    private final QuestionIssueHistoryRepository history;
    private final QuestionRegradeJobRepository jobs;
    private final AnswerOptionRepository options;
    private final EnrollmentRepository enrollments;
    private final CourseManagerRepository assignments;
    private final UserRepository users;
    private final NotificationRepository notifications;
    private final UserNotificationRepository userNotifications;
    private final QuestionService questionService;
    private final QuestionRegrader regrader;
    private final QuestionIssueInsights insights;
    private final AttemptAnswerRepository attemptAnswers;
    private final QuestionPracticeSessionQuestionRepository sessionQuestions;
    private final QuestionPracticeAnswerRepository practiceAnswers;
    private final ObjectMapper objectMapper;

    // ------------------------------------------------------------------ student

    public ReportResult report(UserPrincipal me, ReportRequest body) {
        String type = upper(body.issueType());
        if (!QuestionIssue.TYPES.contains(type)) throw invalid("issueType", "issueType must be one of " + new TreeSet<>(QuestionIssue.TYPES));
        String url = blankToNull(body.attachmentUrl());
        if (url != null && !url.matches("(?i)^https?://\\S+$")) throw invalid("attachmentUrl", "attachmentUrl must be an http(s) link");

        Question question = issues.lockQuestion(body.questionId())
                .filter(q -> q.getDeletedAt() == null)
                .orElseThrow(() -> error(ResponseCode.RESOURCE_NOT_FOUND, "QUESTION_NOT_FOUND", "Question not found"));
        List<AnswerOption> questionOptions = options.findByQuestion_QuestionId(question.getQuestionId());
        Context context = context(me, question, body, questionOptions);
        List<Long> suggested = suggestedOptions(body.suggestedOptionIds(), questionOptions);
        if (context.attempt() == null && context.session() == null && !canReport(me, question)) {
            throw error(ResponseCode.FORBIDDEN, "QUESTION_NOT_ACCESSIBLE", "You can only report questions you have practised or that belong to your courses");
        }
        QuestionIssue issue = issues.findFirstByQuestion_QuestionIdAndStatusIn(question.getQuestionId(), QuestionIssue.OPEN).orElse(null);
        boolean joined = issue != null;
        if (joined && reports.existsByIssue_IssueIdAndUser_UserId(issue.getIssueId(), me.getId())) {
            throw new BaseException(ResponseCode.CONFLICT, "You already reported this question; follow the open report",
                    Map.of("code", "ALREADY_REPORTED", "issueId", issue.getIssueId()));
        }
        if (!joined) {
            issue = issues.save(QuestionIssue.builder().question(question).course(question.getCourse()).issueType(type).build());
        }
        User student = users.getReferenceById(me.getId());
        QuestionIssueReport report = reports.save(QuestionIssueReport.builder().issue(issue).user(student).issueType(type)
                .description(body.description().strip()).attachmentUrl(url)
                .source(context.source()).attempt(context.attempt()).practiceSession(context.session())
                .questionNumber(context.number()).questionLockVersion(question.getLockVersion()).contextSnapshot(context.snapshot())
                .suggestedOptionIds(suggested.isEmpty() ? null : write(suggested)).suggestedAnswer(blankToNull(body.suggestedAnswer()))
                .build());
        log(issue, student, "REPORTED", null, issue.getStatus(), type + (context.source() == null ? "" : " from " + context.source()));
        issue.setLastReportedAt(Instant.now());
        issue.setUpdatedAt(Instant.now());
        refreshPriority(issue);
        return new ReportResult(issue.getIssueId(), report.getReportId(), issue.getStatus(),
                reports.countByIssue_IssueId(issue.getIssueId()), joined);
    }

    @Transactional(readOnly = true)
    public PageResponse<ListItem> studentList(UserPrincipal me, String status, int page, int size) {
        checkPage(page, size);
        Page<QuestionIssue> found = issues.reportedBy(me.getId(), statusFilter(status),
                PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "updatedAt").and(Sort.by(Sort.Direction.DESC, "issueId"))));
        return listPage(found);
    }

    @Transactional(readOnly = true)
    public StudentDetail studentDetail(UserPrincipal me, Long issueId) {
        QuestionIssue issue = issues.findById(issueId).orElseThrow(QuestionIssueService::notFound);
        List<QuestionIssueReport> mine = reports.findByIssue_IssueIdAndUser_UserIdOrderByCreatedAtAscReportIdAsc(issueId, me.getId());
        if (mine.isEmpty()) throw notFound();
        Map<Long, AnswerOption> optionsById = optionsById(issue.getQuestion());
        List<RegradeResult> regrades = issues.regradesOf(issueId, me.getId()).stream().map(l -> {
            ExamAttempt attempt = l.getAttemptAnswer().getAttempt();
            Snapshots.ExamSnapshot exam = readAs(attempt.getExamSnapshot(), Snapshots.ExamSnapshot.class);
            return new RegradeResult(attempt.getAttemptId(), examTitle(attempt, exam), l.getOldScore(), l.getNewScore(),
                    attempt.getTotalScore(), exam != null && exam.maxScore() != null ? exam.maxScore()
                    : attempt.getExam() == null ? null : attempt.getExam().getMaxScore(), l.getCreatedAt());
        }).toList();
        return new StudentDetail(issue.getIssueId(), issue.getQuestion().getQuestionId(), issue.getQuestion().getContent(),
                issue.getIssueType(), issue.getStatus(), duplicateOfId(issue), issue.getResolutionType(), issue.getResolutionNote(),
                issue.getResolvedAt(), issue.getCreatedAt(), issue.getUpdatedAt(), reports.countByIssue_IssueId(issueId),
                QuestionIssue.PENDING.equals(issue.getStatus()),
                mine.stream().map(r -> reportView(r, null, issue.getQuestion().getLockVersion(), optionsById)).toList(), regrades);
    }

    /**
     * The student takes their report back while nobody has started on the ticket. A ticket left with no report
     * closes as WITHDRAWN; otherwise it stays open for the others.
     */
    public WithdrawResult withdraw(UserPrincipal me, Long issueId) {
        QuestionIssue issue = issues.lockById(issueId).orElseThrow(QuestionIssueService::notFound);
        List<QuestionIssueReport> mine = reports.findByIssue_IssueIdAndUser_UserIdOrderByCreatedAtAscReportIdAsc(issueId, me.getId());
        if (mine.isEmpty()) throw notFound();
        if (!QuestionIssue.PENDING.equals(issue.getStatus())) {
            throw conflict("ISSUE_NOT_WITHDRAWABLE", "A report can only be withdrawn before review starts; this ticket is " + issue.getStatus());
        }
        reports.deleteAll(mine);
        reports.flush();
        User student = actor(me);
        long left = reports.countByIssue_IssueId(issueId);
        if (left == 0) {
            issue.setStatus(QuestionIssue.WITHDRAWN);
            issue.setResolvedAt(Instant.now());
            log(issue, student, "WITHDRAWN", QuestionIssue.PENDING, QuestionIssue.WITHDRAWN, "Last report withdrawn");
        } else {
            log(issue, student, "REPORT_WITHDRAWN", QuestionIssue.PENDING, QuestionIssue.PENDING, left + " report(s) left");
            refreshPriority(issue);
        }
        issue.setUpdatedAt(Instant.now());
        return new WithdrawResult(issueId, issue.getStatus(), left);
    }

    // ------------------------------------------------------------------ manager queue

    @Transactional(readOnly = true)
    public PageResponse<ListItem> managerList(UserPrincipal me, String status, String issueType, Long courseId, Long questionId,
                                              String search, int page, int size, String sort) {
        checkPage(page, size);
        String type = blankToNull(issueType) == null ? null : upper(issueType);
        if (type != null && !QuestionIssue.TYPES.contains(type)) throw invalid("issueType", "issueType must be one of " + new TreeSet<>(QuestionIssue.TYPES));
        String keyword = blankToNull(search);
        Page<QuestionIssue> found = issues.searchManaged(admin(me), me.getId(), statusFilter(status), type, courseId, questionId,
                keyword == null ? null : like(keyword), PageRequest.of(page, size, sort(sort)));
        return listPage(found);
    }

    @Transactional(readOnly = true)
    public ManagerDetail managerDetail(UserPrincipal me, Long issueId) {
        return detail(scoped(me, issues.findById(issueId)));
    }

    public ManagerDetail assign(UserPrincipal me, Long issueId, AssignRequest body) {
        QuestionIssue issue = scoped(me, issues.lockById(issueId));
        requireOpen(issue);
        User assignee = null;
        if (body != null && body.assignedTo() != null) {
            assignee = users.findById(body.assignedTo()).orElseThrow(() -> invalid("assignedTo", "User not found"));
            if (!canManage(assignee.getUserId(), assignee.getRoleName(), issue.getCourse())) {
                throw invalid("assignedTo", "The assignee must manage the course of this question");
            }
        }
        issue.setAssignedTo(assignee);
        log(issue, actor(me), assignee == null ? "UNASSIGNED" : "ASSIGNED", issue.getStatus(), issue.getStatus(),
                assignee == null ? null : assignee.getFullName());
        return detail(issue);
    }

    /** Only IN_PROGRESS (start review) and REJECTED here; RESOLVED and DUPLICATE have their own endpoints. */
    public ManagerDetail changeStatus(UserPrincipal me, Long issueId, StatusRequest body) {
        String target = upper(body.status());
        String note = blankToNull(body.note());
        QuestionIssue issue = scoped(me, issues.lockById(issueId));
        requireOpen(issue);
        String from = issue.getStatus();
        User actor = actor(me);
        switch (target) {
            case QuestionIssue.IN_PROGRESS -> {
                if (!QuestionIssue.PENDING.equals(from)) throw conflict("ISSUE_STATUS_INVALID", "Only a pending ticket can be taken into review");
                issue.setStatus(QuestionIssue.IN_PROGRESS);
                if (issue.getAssignedTo() == null) issue.setAssignedTo(actor);
                log(issue, actor, "REVIEW_STARTED", from, target, note);
            }
            case QuestionIssue.REJECTED -> {
                if (note == null) throw invalid("note", "A reason is required to reject a ticket");
                close(issue, actor, QuestionIssue.REJECTED, null, note);
                log(issue, actor, "REJECTED", from, target, note);
                notifyReporters(issue, "Báo cáo câu hỏi #" + issue.getQuestion().getQuestionId() + " không được chấp nhận", note);
            }
            default -> throw invalid("status", "status must be IN_PROGRESS or REJECTED; use the resolve or duplicate endpoint for the others");
        }
        return detail(issue);
    }

    public ManagerDetail markDuplicate(UserPrincipal me, Long issueId, DuplicateRequest body) {
        if (Objects.equals(issueId, body.duplicateOfIssueId())) throw invalid("duplicateOfIssueId", "A ticket cannot duplicate itself");
        QuestionIssue issue = scoped(me, issues.lockById(issueId));
        requireOpen(issue);
        QuestionIssue primary = issues.findById(body.duplicateOfIssueId())
                .filter(p -> p.getCourse() == null ? admin(me) : manages(me, p.getCourse()))
                .orElseThrow(() -> invalid("duplicateOfIssueId", "Primary ticket not found"));
        if (QuestionIssue.DUPLICATE.equals(primary.getStatus())) {
            throw invalid("duplicateOfIssueId", "The primary ticket is itself a duplicate of #" + duplicateOfId(primary));
        }
        if (QuestionIssue.WITHDRAWN.equals(primary.getStatus())) {
            throw invalid("duplicateOfIssueId", "The primary ticket was withdrawn by its reporters");
        }
        String from = issue.getStatus();
        User actor = actor(me);
        String note = body.note().strip();
        issue.setDuplicateOf(primary);
        close(issue, actor, QuestionIssue.DUPLICATE, null, note);
        log(issue, actor, "DUPLICATE", from, QuestionIssue.DUPLICATE, "Duplicate of #" + primary.getIssueId() + ": " + note);
        log(primary, actor, "DUPLICATE_LINKED", primary.getStatus(), primary.getStatus(), "Ticket #" + issue.getIssueId() + " marked as a duplicate");
        notifyReporters(issue, "Báo cáo câu hỏi #" + issue.getQuestion().getQuestionId() + " đã được gộp",
                "Báo cáo của bạn trùng với báo cáo #" + primary.getIssueId() + ". " + note);
        return detail(issue);
    }

    public ResolveResult resolve(UserPrincipal me, Long issueId, ResolveRequest body) {
        String resolutionType = upper(body.resolutionType());
        if (!QuestionIssue.RESOLUTION_TYPES.contains(resolutionType)) {
            throw invalid("resolutionType", "resolutionType must be one of " + new TreeSet<>(QuestionIssue.RESOLUTION_TYPES));
        }
        QuestionIssue issue = scoped(me, issues.lockById(issueId));
        requireOpen(issue);
        Question question = issues.lockQuestion(issue.getQuestion().getQuestionId()).orElseThrow(QuestionIssueService::notFound);
        if (body.expectedLockVersion() != null && !body.expectedLockVersion().equals(question.getLockVersion())) {
            throw conflict("QUESTION_VERSION_CONFLICT", "The question was changed by someone else; reload the ticket");
        }
        int versionFrom = question.getScoringVersion();
        Map<String, Object> changes = body.changes() == null ? Map.of() : body.changes();
        if (!changes.isEmpty()) {
            questionService.correctQuestion(question.getQuestionId(), correction(question, changes, body.expectedLockVersion()));
        }
        if (QuestionRegrader.VOIDED.equals(resolutionType)) {
            question.setScoringVersion(question.getScoringVersion() + 1);
        }

        QuestionRegradeJob job = null;
        int versionTo = question.getScoringVersion();
        boolean regrades = QuestionRegrader.regrades(resolutionType, question.getQuestionType(), versionTo > versionFrom);
        if (regrades && jobs.existsByQuestion_QuestionIdAndStatusIn(question.getQuestionId(),
                List.of(QuestionRegradeJob.PENDING_CONFIRMATION, QuestionRegradeJob.RUNNING))) {
            throw conflict("REGRADE_ALREADY_PENDING",
                    "A regrade for this question is waiting for confirmation; confirm or cancel it before resolving another ticket");
        }
        if (regrades) {
            long pending = regrader.countPending(question.getQuestionId(), versionTo);
            if (pending > 0) {
                String keySnapshot = QuestionRegrader.VOIDED.equals(resolutionType) ? null : regrader.keyJson(question);
                job = jobs.save(QuestionRegradeJob.builder().issue(issue).question(question).resolutionType(resolutionType)
                        .keySnapshot(keySnapshot)
                        .questionVersionFrom(versionFrom).questionVersionTo(versionTo).totalAnswers((int) pending).build());
            }
        }
        String from = issue.getStatus();
        User actor = actor(me);
        String note = body.resolutionNote().strip();
        close(issue, actor, QuestionIssue.RESOLVED, resolutionType, note);
        log(issue, actor, "RESOLVED", from, QuestionIssue.RESOLVED, resolutionType + ": " + note);
        if (job != null) {
            log(issue, actor, "REGRADE_CREATED", QuestionIssue.RESOLVED, QuestionIssue.RESOLVED,
                    job.getTotalAnswers() + " answers wait for confirmation (job #" + job.getJobId() + ")");
        }
        notifyReporters(issue, "Câu hỏi #" + question.getQuestionId() + " bạn báo cáo đã được sửa", note);
        return new ResolveResult(detail(issue), job == null ? null : jobView(job));
    }

    @Transactional(readOnly = true)
    public List<HistoryView> history(UserPrincipal me, Long issueId) {
        scoped(me, issues.findById(issueId));
        return history.findByIssue_IssueIdOrderByCreatedAtAscHistoryIdAsc(issueId).stream()
                .map(h -> new HistoryView(h.getHistoryId(), h.getAction(), h.getFromStatus(), h.getToStatus(), h.getNote(),
                        userRef(h.getActor()), h.getCreatedAt())).toList();
    }

    // ------------------------------------------------------------------ regrade jobs

    @Transactional(readOnly = true)
    public List<JobView> jobs(UserPrincipal me, Long issueId) {
        scoped(me, issues.findById(issueId));
        return jobs.findByIssue_IssueIdOrderByCreatedAtDescJobIdDesc(issueId).stream().map(QuestionIssueService::jobView).toList();
    }

    public JobView confirmRegrade(UserPrincipal me, Long issueId, ConfirmRegradeRequest body) {
        QuestionIssue issue = scoped(me, issues.lockById(issueId));
        QuestionRegradeJob job = jobs.lockById(body.jobId())
                .filter(j -> j.getIssue().getIssueId().equals(issue.getIssueId()))
                .orElseThrow(() -> error(ResponseCode.RESOURCE_NOT_FOUND, "REGRADE_JOB_NOT_FOUND", "Regrade job not found"));
        if (!QuestionRegradeJob.PENDING_CONFIRMATION.equals(job.getStatus())) {
            throw conflict("REGRADE_JOB_NOT_PENDING", "This regrade job is already " + job.getStatus());
        }
        User actor = actor(me);
        String reason = body.reason().strip();
        job.setReason(reason);
        job.setConfirmedBy(actor);
        job.setConfirmedAt(Instant.now());
        if (!body.confirmed()) {
            job.setStatus(QuestionRegradeJob.CANCELLED);
            job.setFinishedAt(Instant.now());
            log(issue, actor, "REGRADE_CANCELLED", issue.getStatus(), issue.getStatus(), "Job #" + job.getJobId() + ": " + reason);
            return jobView(job);
        }
        regrader.run(job);
        log(issue, actor, "REGRADE_" + job.getStatus(), issue.getStatus(), issue.getStatus(), runNote(job, reason));
        return jobView(job);
    }

    public JobView retryJob(UserPrincipal me, Long jobId) {
        QuestionRegradeJob job = jobs.lockById(jobId)
                .orElseThrow(() -> error(ResponseCode.RESOURCE_NOT_FOUND, "REGRADE_JOB_NOT_FOUND", "Regrade job not found"));
        QuestionIssue issue = scoped(me, Optional.of(job.getIssue()));
        if (!QuestionRegradeJob.FAILED.equals(job.getStatus()) && !QuestionRegradeJob.PARTIAL_FAILED.equals(job.getStatus())) {
            throw conflict("REGRADE_JOB_NOT_RETRYABLE", "Only a failed or partly failed job can be retried");
        }
        regrader.run(job);
        log(issue, actor(me), "REGRADE_RETRIED", issue.getStatus(), issue.getStatus(), runNote(job, null));
        return jobView(job);
    }

    // ------------------------------------------------------------------ scope

    private QuestionIssue scoped(UserPrincipal me, Optional<QuestionIssue> found) {
        QuestionIssue issue = found.orElseThrow(QuestionIssueService::notFound);
        boolean visible = issue.getCourse() == null ? admin(me) : manages(me, issue.getCourse());
        if (!visible) throw notFound();
        return issue;
    }

    private boolean manages(UserPrincipal me, Course course) {
        return admin(me) || canManage(me.getId(), null, course);
    }

    private boolean canManage(Long userId, String roleName, Course course) {
        if (User.ROLE_ADMIN.equals(roleName)) return true;
        if (course == null) return false;
        return (course.getManager() != null && course.getManager().getUserId().equals(userId))
                || assignments.existsByCourseCourseIdAndUserUserId(course.getCourseId(), userId);
    }

    /** Practised it (any attempt holds it), or enrolled in its course (module practice, notebook). */
    private boolean canReport(UserPrincipal me, Question question) {
        if (admin(me)) return true;
        if (issues.answeredBy(question.getQuestionId(), me.getId())) return true;
        return question.getCourse() != null && enrollments.existsByCourse_CourseIdAndUser_UserIdAndStatus(
                question.getCourse().getCourseId(), me.getId(), Enrollment.STATUS_ACTIVE);
    }

    private static boolean admin(UserPrincipal me) {
        return User.ROLE_ADMIN.equals(me.getRole());
    }

    // ------------------------------------------------------------------ helpers

    private QuestionUpdateRequest correction(Question question, Map<String, Object> changes, Long lockVersion) {
        Set<String> unknown = new TreeSet<>(changes.keySet());
        unknown.removeAll(EDITABLE);
        if (!unknown.isEmpty()) throw invalid("changes", "Fields that cannot be corrected here: " + unknown + "; allowed: " + new TreeSet<>(EDITABLE));
        if (!"CODE".equals(question.getQuestionType()) && !Collections.disjoint(changes.keySet(), CODE_ONLY)) {
            throw invalid("changes", "codeConfig and testCases only apply to CODE questions");
        }
        QuestionUpdateRequest request;
        try {
            request = objectMapper.convertValue(changes, QuestionUpdateRequest.class);
        } catch (IllegalArgumentException e) {
            throw invalid("changes", "changes does not match the question format");
        }
        request.setModuleId(question.getModule() == null ? null : question.getModule().getModuleId());
        request.setGroupId(question.getGroup() == null ? null : question.getGroup().getGroupId());
        request.setQuestionType(null);
        request.setStatus(null);
        request.setLockVersion(lockVersion);
        return request;
    }

    private void close(QuestionIssue issue, User actor, String status, String resolutionType, String note) {
        issue.setStatus(status);
        issue.setResolutionType(resolutionType);
        issue.setResolutionNote(note);
        issue.setResolvedBy(actor);
        issue.setResolvedAt(Instant.now());
    }

    private void log(QuestionIssue issue, User actor, String action, String from, String to, String note) {
        history.save(QuestionIssueHistory.builder().issue(issue).actor(actor).action(action).fromStatus(from).toStatus(to).note(note).build());
    }

    private void notifyReporters(QuestionIssue issue, String title, String content) {
        Set<Long> seen = new HashSet<>();
        for (QuestionIssueReport report : reports.findByIssue_IssueIdOrderByCreatedAtAscReportIdAsc(issue.getIssueId())) {
            if (!seen.add(report.getUser().getUserId())) continue;
            Notification n = notifications.save(Notification.builder().title(title).content(content).type("QUESTION_ISSUE")
                    .targetType("USER").link("/student/question-issues").referenceId(issue.getIssueId())
                    .referenceType("QUESTION_ISSUE").build());
            userNotifications.save(UserNotification.builder().user(report.getUser()).notification(n).isRead(false).build());
        }
    }

    private User actor(UserPrincipal me) {
        return users.getReferenceById(me.getId());
    }

    private static void requireOpen(QuestionIssue issue) {
        if (!issue.isOpen()) throw conflict("ISSUE_CLOSED", "This ticket is already " + issue.getStatus());
    }

    private PageResponse<ListItem> listPage(Page<QuestionIssue> found) {
        Map<Long, Long> counts = new HashMap<>();
        if (!found.isEmpty()) {
            issues.countReports(found.map(QuestionIssue::getIssueId).getContent())
                    .forEach(r -> counts.put((Long) r[0], ((Number) r[1]).longValue()));
        }
        return PageResponse.of(found, found.getContent().stream().map(i -> {
            Question q = i.getQuestion();
            return new ListItem(i.getIssueId(), q.getQuestionId(), q.getContent(), q.getQuestionType(), i.getIssueType(), i.getStatus(),
                    i.getCourse() == null ? null : i.getCourse().getCourseId(), i.getCourse() == null ? null : i.getCourse().getTitle(),
                    q.getModule() == null ? null : q.getModule().getModuleId(), q.getModule() == null ? null : q.getModule().getTitle(),
                    counts.getOrDefault(i.getIssueId(), 0L), QuestionIssueInsights.level(i.getPriorityScore()), priority(i),
                    userRef(i.getAssignedTo()), i.getCreatedAt(), i.getLastReportedAt(), i.getUpdatedAt());
        }).toList());
    }

    private ManagerDetail detail(QuestionIssue issue) {
        Question q = issue.getQuestion();
        List<AnswerOption> questionOptions = options.findByQuestion_QuestionId(q.getQuestionId());
        Map<Long, AnswerOption> optionsById = new HashMap<>();
        questionOptions.forEach(o -> optionsById.put(o.getOptionId(), o));
        List<OptionView> optionViews = questionOptions.stream()
                .sorted(Comparator.comparing(AnswerOption::getOrderIndex, Comparator.nullsLast(Comparator.naturalOrder())))
                .map(o -> new OptionView(o.getOptionId(), o.getOptionText(), o.getIsCorrect(), o.getExplanation(), o.getOrderIndex()))
                .toList();
        QuestionView question = new QuestionView(q.getQuestionId(), q.getQuestionType(), q.getDifficulty(), q.getContent(), q.getAiExplanation(),
                q.getStatus(), q.getLockVersion(), q.getScoringVersion(), optionViews, json(q.getAnswerKey()),
                json(q.getQuestionMetadata()), json(q.getEssayGradingRubric()),
                questionService.codeConfigOf(q), questionService.testCasesOf(q));
        List<QuestionIssueReport> issueReports = reports.findByIssue_IssueIdOrderByCreatedAtAscReportIdAsc(issue.getIssueId());
        List<ReportView> reportViews = issueReports.stream()
                .map(r -> reportView(r, r.getUser().getFullName(), q.getLockVersion(), optionsById)).toList();
        Course course = issue.getCourse();
        Location location = new Location(course == null ? null : course.getCourseId(), course == null ? null : course.getTitle(),
                q.getModule() == null ? null : q.getModule().getModuleId(), q.getModule() == null ? null : q.getModule().getTitle(),
                q.getGroup() == null ? null : q.getGroup().getGroupId(), q.getGroup() == null ? null : q.getGroup().getTitle());
        return new ManagerDetail(issue.getIssueId(), q.getQuestionId(), issue.getIssueType(), issue.getStatus(),
                course == null ? null : course.getCourseId(), course == null ? null : course.getTitle(), location,
                QuestionIssueInsights.level(issue.getPriorityScore()), priority(issue), userRef(issue.getAssignedTo()),
                duplicateOfId(issue), issue.getResolutionType(), issue.getResolutionNote(), userRef(issue.getResolvedBy()),
                issue.getResolvedAt(), issue.getCreatedAt(), issue.getLastReportedAt(), issue.getUpdatedAt(), reportViews.size(),
                question, reportViews, insights.build(issue, issueReports, questionOptions));
    }

    private ReportView reportView(QuestionIssueReport r, String studentName, Long lockVersion, Map<Long, AnswerOption> optionsById) {
        List<OptionRef> suggested = insights.optionIds(r.getSuggestedOptionIds()).stream().map(id -> {
            AnswerOption o = optionsById.get(id);
            return new OptionRef(id, o == null ? null : o.getOptionText());
        }).toList();
        return new ReportView(r.getReportId(), r.getUser().getUserId(), studentName, r.getIssueType(), r.getDescription(),
                r.getAttachmentUrl(), r.getSource(), r.getAttempt() == null ? null : r.getAttempt().getAttemptId(),
                r.getPracticeSession() == null ? null : r.getPracticeSession().getSessionId(), r.getQuestionNumber(),
                r.getQuestionLockVersion(), QuestionIssueInsights.outdated(r, lockVersion),
                readAs(r.getContextSnapshot(), ContextSnapshot.class), suggested, r.getSuggestedAnswer(), r.getCreatedAt());
    }

    // ------------------------------------------------------------------ report context

    private record Context(String source, ExamAttempt attempt, QuestionPracticeSession session, Integer number, String snapshot) { }

    /** Checks the attempt / practice session belongs to the student and holds the question, then freezes their answer. */
    private Context context(UserPrincipal me, Question question, ReportRequest body, List<AnswerOption> questionOptions) {
        if (body.attemptId() != null && body.practiceSessionId() != null) {
            throw invalid("attemptId", "Send attemptId or practiceSessionId, not both");
        }
        Long questionId = question.getQuestionId();
        if (body.attemptId() != null) {
            AttemptAnswer answer = attemptAnswers.findByAttemptIdAndQuestionId(body.attemptId(), questionId)
                    .filter(a -> a.getAttempt().getUser().getUserId().equals(me.getId()))
                    .orElseThrow(() -> invalid("attemptId", "This question is not in one of your exam attempts"));
            ExamAttempt attempt = answer.getAttempt();
            boolean running = !QuestionRegrader.FINISHED.contains(attempt.getStatus());
            Snapshots.DisplayQuestion display = readAs(answer.getDisplaySnapshot(), Snapshots.DisplayQuestion.class);
            ContextSnapshot snapshot = new ContextSnapshot(examTitle(attempt, readAs(attempt.getExamSnapshot(), Snapshots.ExamSnapshot.class)),
                    attempt.getStatus(), json(answer.getResponse()), picked(answer.getResponse(), questionOptions),
                    running ? null : answer.getIsCorrect(), running ? null : answer.getScoreEarned(),
                    running ? null : answer.getGradingStatus(), answer.getGradedAt());
            return new Context(running ? "EXAM" : "EXAM_RESULT", attempt, null, display == null ? null : display.orderIndex(), write(snapshot));
        }
        if (body.practiceSessionId() != null) {
            QuestionPracticeSessionQuestion row = sessionQuestions.findBySession_SessionIdAndQuestion_QuestionId(body.practiceSessionId(), questionId)
                    .filter(r -> r.getSession().getUser().getUserId().equals(me.getId()))
                    .orElseThrow(() -> invalid("practiceSessionId", "This question is not in one of your practice sessions"));
            QuestionPracticeSession session = row.getSession();
            QuestionPracticeAnswer last = practiceAnswers
                    .findFirstBySessionQuestion_SessionQuestionIdOrderByAttemptNumberDesc(row.getSessionQuestionId()).orElse(null);
            String title = session.getModule() != null ? session.getModule().getTitle() : session.getCourse().getTitle();
            ContextSnapshot snapshot = last == null
                    ? new ContextSnapshot(title, session.getStatus(), null, List.of(), null, null, null, null)
                    : new ContextSnapshot(title, session.getStatus(), json(last.getResponse()), picked(last.getResponse(), questionOptions),
                            last.getIsCorrect(), last.getScoreEarned(), last.getGradingStatus(), last.getAnsweredAt());
            return new Context("PRACTICE", null, session, row.getOrderIndex() == null ? null : row.getOrderIndex() + 1, write(snapshot));
        }
        String source = blankToNull(body.source()) == null ? null : upper(body.source());
        if (source != null && !Set.of("NOTEBOOK", "OTHER").contains(source)) {
            throw invalid("source", QuestionIssueReport.SOURCES.contains(source)
                    ? source + " needs attemptId or practiceSessionId" : "source must be one of " + new TreeSet<>(QuestionIssueReport.SOURCES));
        }
        return new Context(source, null, null, null, null);
    }

    /** The options the student chose (choice) or ordered (ordering), with their text. */
    private List<OptionRef> picked(String response, List<AnswerOption> questionOptions) {
        JsonNode node = insights.read(response);
        JsonNode ids = node.has("selectedOptionIds") ? node.get("selectedOptionIds") : node.path("orderedOptionIds");
        if (!ids.isArray()) return List.of();
        Map<Long, String> text = new HashMap<>();
        questionOptions.forEach(o -> text.put(o.getOptionId(), o.getOptionText()));
        List<OptionRef> out = new ArrayList<>();
        ids.forEach(id -> out.add(new OptionRef(id.asLong(), text.get(id.asLong()))));
        return out;
    }

    private static List<Long> suggestedOptions(List<Long> ids, List<AnswerOption> questionOptions) {
        if (ids == null || ids.isEmpty()) return List.of();
        Set<Long> valid = new HashSet<>();
        questionOptions.forEach(o -> valid.add(o.getOptionId()));
        List<Long> out = ids.stream().filter(Objects::nonNull).distinct().toList();
        if (!valid.containsAll(out)) throw invalid("suggestedOptionIds", "suggestedOptionIds must be options of this question");
        return out;
    }

    private static String examTitle(ExamAttempt attempt, Snapshots.ExamSnapshot exam) {
        if (exam != null && exam.title() != null) return exam.title();
        return attempt.getExam() == null ? null : attempt.getExam().getTitle();
    }

    private void refreshPriority(QuestionIssue issue) {
        issue.setPriorityScore(insights.priorityScore(issue.getQuestion(),
                reports.findByIssue_IssueIdOrderByCreatedAtAscReportIdAsc(issue.getIssueId())));
    }

    private static int priority(QuestionIssue issue) {
        return issue.getPriorityScore() == null ? 0 : issue.getPriorityScore();
    }

    private Map<Long, AnswerOption> optionsById(Question q) {
        Map<Long, AnswerOption> out = new HashMap<>();
        options.findByQuestion_QuestionId(q.getQuestionId()).forEach(o -> out.put(o.getOptionId(), o));
        return out;
    }

    private <T> T readAs(String text, Class<T> type) {
        if (text == null || text.isBlank()) return null;
        try {
            return objectMapper.readValue(text, type);
        } catch (Exception e) {
            return null;
        }
    }

    private String write(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalStateException("Could not serialise the report context", e);
        }
    }

    private static JobView jobView(QuestionRegradeJob j) {
        int total = j.getTotalAnswers();
        int progress = total == 0 ? 100 : Math.min(100, j.getProcessedAnswers() * 100 / total);
        return new JobView(j.getJobId(), j.getIssue().getIssueId(), j.getQuestion().getQuestionId(), j.getResolutionType(),
                j.getStatus(), j.getQuestionVersionFrom(), j.getQuestionVersionTo(), total, j.getProcessedAnswers(),
                j.getFailedAnswers(), progress, j.getReason(), userRef(j.getConfirmedBy()), j.getConfirmedAt(),
                j.getFinishedAt(), j.getCreatedAt());
    }

    private static String runNote(QuestionRegradeJob job, String reason) {
        return "Job #" + job.getJobId() + ": " + job.getProcessedAnswers() + "/" + job.getTotalAnswers() + " answers regraded, "
                + job.getFailedAnswers() + " failed" + (reason == null ? "" : ". " + reason);
    }

    private static UserRef userRef(User user) {
        return user == null ? null : new UserRef(user.getUserId(), user.getFullName());
    }

    private static Long duplicateOfId(QuestionIssue issue) {
        return issue.getDuplicateOf() == null ? null : issue.getDuplicateOf().getIssueId();
    }

    private JsonNode json(String text) {
        if (text == null || text.isBlank()) return null;
        try {
            return objectMapper.readTree(text);
        } catch (Exception e) {
            return null;
        }
    }

    private static String statusFilter(String status) {
        String value = blankToNull(status) == null ? null : upper(status);
        if (value == null || "ALL".equals(value)) return null;
        if (!QuestionIssue.STATUSES.contains(value)) throw invalid("status", "status must be one of " + new TreeSet<>(QuestionIssue.STATUSES));
        return value;
    }

    private static Sort sort(String sort) {
        if (sort == null || sort.isBlank()) return Sort.by(Sort.Direction.DESC, "createdAt").and(Sort.by(Sort.Direction.DESC, "issueId"));
        String[] parts = sort.split(",");
        String field = SORTS.get(parts[0].strip());
        if (field == null) throw invalid("sort", "sort must be one of " + SORTS.keySet());
        Sort.Direction direction = parts.length > 1 && "asc".equalsIgnoreCase(parts[1].strip()) ? Sort.Direction.ASC : Sort.Direction.DESC;
        return Sort.by(direction, field).and(Sort.by(direction, "issueId"));
    }

    private static void checkPage(int page, int size) {
        if (page < 0 || size < 1 || size > 100) throw invalid("size", "page must be >= 0 and size 1-100");
    }

    private static String like(String keyword) {
        return "%" + keyword.strip().toLowerCase(Locale.ROOT).replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
    }

    private static String upper(String value) {
        return value == null ? "" : value.strip().toUpperCase(Locale.ROOT);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.strip();
    }

    private static BaseException notFound() {
        return error(ResponseCode.RESOURCE_NOT_FOUND, "QUESTION_ISSUE_NOT_FOUND", "Question issue not found");
    }

    private static BaseException conflict(String code, String message) {
        return error(ResponseCode.CONFLICT, code, message);
    }

    private static BaseException error(ResponseCode status, String code, String message) {
        return new BaseException(status, message, Map.of("code", code));
    }

    private static BaseException invalid(String field, String message) {
        return new BaseException(ResponseCode.VALIDATION_ERROR, "Dữ liệu không hợp lệ",
                Map.of("code", "VALIDATION_FAILED", "errors", List.of(Map.of("field", field, "message", message))));
    }
}
