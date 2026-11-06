package com.examprep.controllers;

import com.examprep.dto.ApiResponse;
import com.examprep.dto.PageResponse;
import com.examprep.dto.practice.ModulePracticeRequests;
import com.examprep.dto.practice.ModulePracticeResponses;
import com.examprep.security.UserPrincipal;
import com.examprep.services.student.ModulePracticeAiService;
import com.examprep.services.student.ModulePracticeAnswerService;
import com.examprep.services.student.ModulePracticeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * Module Practice student APIs (MP-01 … MP-12).
 *
 * <p>Every route lives under {@code /api/v1/student/**}, which {@code SecurityConfig} already
 * restricts to the STUDENT role (admin included for support). The student is always taken from the
 * JWT principal; no route accepts a user id.</p>
 *
 * <p>MP-10 (bookmark a question) has no route here on purpose: it is the existing notebook API
 * {@code POST /api/v1/student/questions/{questionId}/bookmark}.</p>
 *
 * <p>The four {@code /courses/{courseId}/general/...} routes are the same feature for a course's
 * General pool — its questions that are filed under no module. Their bodies are identical to the
 * module ones; only {@code moduleId} / {@code moduleTitle} report {@code null} / "General". The
 * session-scoped routes (MP-03 … MP-09) serve General sessions unchanged.</p>
 */
@RestController
@RequestMapping("/api/v1/student")
@RequiredArgsConstructor
@Tag(name = "Module Practice", description = "Practice one module or a course's General pool: overview, sessions, attempts, result, review and reset")
public class StudentModulePracticeController {

    private final ModulePracticeService practice;
    private final ModulePracticeAnswerService answers;
    private final ModulePracticeAiService ai;

    // ------------------------------------------------------------------ MP-01

    @GetMapping("/modules/{moduleId}/practice/overview")
    @Operation(summary = "MP-01: Practice overview of one module",
            description = "Eligible, practised and ever-correct questions, attempt statistics, accuracy, "
                    + "questions needing review and the open session if there is one.")
    public ResponseEntity<ApiResponse<ModulePracticeResponses.Overview>> overview(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @PathVariable Long moduleId) {
        return ResponseEntity.ok(ApiResponse.success(
                practice.overview(currentUser.getId(), moduleId)));
    }

    // ------------------------------------------------------------------ MP-02

    @PostMapping("/modules/{moduleId}/practice/sessions")
    @Operation(summary = "MP-02: Start or resume a practice session",
            description = "Creates the session with a randomly ordered question list frozen into snapshots, "
                    + "or returns the session already open on this module. Idempotent under concurrent calls.")
    public ResponseEntity<ApiResponse<ModulePracticeResponses.SessionDetail>> start(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @PathVariable Long moduleId,
            @Valid @RequestBody(required = false) ModulePracticeRequests.StartSession body) {
        ModulePracticeResponses.SessionDetail session =
                practice.startOrResume(currentUser.getId(), moduleId, body);
        if (session.resumed()) {
            return ResponseEntity.ok(ApiResponse.success(session, "Practice session resumed"));
        }
        URI location = UriComponentsBuilder
                .fromPath("/api/v1/student/practice/sessions/{sessionId}")
                .buildAndExpand(session.sessionId())
                .toUri();
        return ResponseEntity.created(location)
                .body(ApiResponse.success(session, "Practice session started"));
    }

    // ------------------------------------------------------------------ MP-03

    @GetMapping("/practice/sessions/{sessionId}")
    @Operation(summary = "MP-03: Resume a practice session",
            description = "The persisted question order, the current progress and the next unanswered question. "
                    + "The order is never re-randomized.")
    public ResponseEntity<ApiResponse<ModulePracticeResponses.SessionDetail>> session(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @PathVariable Long sessionId) {
        return ResponseEntity.ok(ApiResponse.success(
                practice.session(currentUser.getId(), sessionId)));
    }

    // ------------------------------------------------------------------ MP-04

    @GetMapping("/practice/sessions/{sessionId}/questions/{sessionQuestionId}")
    @Operation(summary = "MP-04: One question of a practice session",
            description = "Content, shuffled options or matching columns, media and passage, plus the student's "
                    + "own attempts. Never the answer key.")
    public ResponseEntity<ApiResponse<ModulePracticeResponses.QuestionView>> question(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @PathVariable Long sessionId,
            @PathVariable Long sessionQuestionId) {
        return ResponseEntity.ok(ApiResponse.success(
                practice.question(currentUser.getId(), sessionId, sessionQuestionId)));
    }

    @GetMapping("/practice/sessions/{sessionId}/questions")
    @Operation(summary = "MP-04 (batch): several questions of a practice session",
            description = "Up to 20 ids in one call, each item exactly MP-04's body (content, options, "
                    + "matching, media, passage, correctAnswer, isBookmarked and the student's own attempts). "
                    + "Reads the frozen paper in batch, so opening a 100-question paper is one request "
                    + "instead of a hundred.")
    public ResponseEntity<ApiResponse<java.util.List<ModulePracticeResponses.QuestionView>>> questions(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @PathVariable Long sessionId,
            @RequestParam(required = false) java.util.List<Long> ids) {
        return ResponseEntity.ok(ApiResponse.success(
                practice.questions(currentUser.getId(), sessionId, ids)));
    }

    // ------------------------------------------------------------------ MP-05 / MP-06

    @PostMapping("/practice/sessions/{sessionId}/questions/{sessionQuestionId}/answers")
    @Operation(summary = "MP-05: Submit an attempt",
            description = "Validates the payload against the frozen display snapshot, grades it against the "
                    + "frozen answer key and appends a new attempt. Objective types are graded immediately; "
                    + "ESSAY, DIAGRAM and CODE go to the AI rubric worker. Replaying the same requestKey "
                    + "returns the stored attempt instead of adding one.")
    public ResponseEntity<ApiResponse<ModulePracticeResponses.AnswerSubmitted>> submit(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @PathVariable Long sessionId,
            @PathVariable Long sessionQuestionId,
            @Valid @RequestBody ModulePracticeRequests.SubmitAnswer body) {
        return ResponseEntity.ok(ApiResponse.success(
                answers.submit(currentUser.getId(), sessionId, sessionQuestionId, body), "Answer recorded"));
    }

    @GetMapping("/practice/sessions/{sessionId}/questions/{sessionQuestionId}/answers")
    @Operation(summary = "MP-06: Attempt history of one question",
            description = "Every attempt of this practice question, oldest first, with the grading outcome of each.")
    public ResponseEntity<ApiResponse<ModulePracticeResponses.AnswerHistory>> history(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @PathVariable Long sessionId,
            @PathVariable Long sessionQuestionId) {
        return ResponseEntity.ok(ApiResponse.success(
                answers.history(currentUser.getId(), sessionId, sessionQuestionId)));
    }

    // ------------------------------------------------------------------ MP-07

    @PostMapping("/practice/sessions/{sessionId}/complete")
    @Operation(summary = "MP-07: Complete a practice session",
            description = "Closes the session early if the student wants to. Unanswered questions stay "
                    + "unanswered and are never marked wrong. Idempotent.")
    public ResponseEntity<ApiResponse<ModulePracticeResponses.SessionDetail>> complete(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @PathVariable Long sessionId) {
        return ResponseEntity.ok(ApiResponse.success(
                practice.complete(currentUser.getId(), sessionId), "Practice session completed"));
    }

    // ------------------------------------------------------------------ MP-08

    @GetMapping("/practice/sessions/{sessionId}/result")
    @Operation(summary = "MP-08: Result of one practice session",
            description = "Unique-question statistics kept apart from attempt statistics, with the latest "
                    + "outcome of every question. Available while the session is still open. With "
                    + "includeQuestions=true every question row also carries its MP-04 body.")
    public ResponseEntity<ApiResponse<ModulePracticeResponses.Result>> result(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @PathVariable Long sessionId,
            @RequestParam(defaultValue = "false") boolean includeQuestions) {
        return ResponseEntity.ok(ApiResponse.success(
                practice.result(currentUser.getId(), sessionId, includeQuestions)));
    }

    // ------------------------------------------------------------------ MP-09

    @PostMapping("/practice/questions/{questionId}/explanation")
    @Operation(summary = "MP-09: AI explanation of a practiced question",
            description = "Explains the question for the attempt the student names (or their latest one), from "
                    + "the session's frozen snapshots. Reuses a manager or version-matching AI explanation when "
                    + "one exists; otherwise it is generated through the shared AI quota and usage log.")
    public ResponseEntity<ApiResponse<ModulePracticeResponses.Explanation>> explain(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @PathVariable Long questionId,
            @Valid @RequestBody ModulePracticeRequests.Explanation body) {
        return ResponseEntity.ok(ApiResponse.success(
                ai.explain(currentUser.getId(), questionId, body)));
    }

    // ------------------------------------------------------------------ MP-11

    @GetMapping("/modules/{moduleId}/practice/review-questions")
    @Operation(summary = "MP-11: Questions of a module to practise again",
            description = "Paged questions whose latest finalized attempt is wrong. Questions that are no "
                    + "longer deliverable never appear here.")
    public ResponseEntity<ApiResponse<PageResponse<ModulePracticeResponses.ReviewItem>>> reviewQuestions(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @PathVariable Long moduleId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(ApiResponse.success(
                PageResponse.of(practice.reviewQuestions(currentUser.getId(), moduleId, page, size))));
    }

    // ------------------------------------------------------------------ MP-12

    @DeleteMapping("/modules/{moduleId}/practice/progress")
    @Operation(summary = "MP-12: Reset the practice progress of one module",
            description = "Deletes only this student's Module Practice data of this module: sessions, their "
                    + "frozen questions, every stored attempt and the aggregated progress. The mistake "
                    + "notebook, its bookmarks, exams, flashcards and AI usage history are untouched.")
    public ResponseEntity<ApiResponse<ModulePracticeResponses.ResetResult>> resetProgress(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @PathVariable Long moduleId) {
        return ResponseEntity.ok(ApiResponse.success(
                practice.resetProgress(currentUser.getId(), moduleId), "Practice progress reset"));
    }

    // ------------------------------------------------------------------ General pool (no module)

    @GetMapping("/courses/{courseId}/general/practice/overview")
    @Operation(summary = "MP-01 (General): Practice overview of a course's questions without a module",
            description = "The module overview's body for the course's General pool: moduleId is null and "
                    + "moduleTitle is \"General\", while courseId and courseTitle stay filled.")
    public ResponseEntity<ApiResponse<ModulePracticeResponses.Overview>> generalOverview(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @PathVariable Long courseId) {
        return ResponseEntity.ok(ApiResponse.success(
                practice.generalOverview(currentUser.getId(), courseId)));
    }

    @PostMapping("/courses/{courseId}/general/practice/sessions")
    @Operation(summary = "MP-02 (General): Start or resume a General practice session",
            description = "Creates or resumes the caller's open General run of this course. Module runs of "
                    + "the same course are a different scope and never count as the open session.")
    public ResponseEntity<ApiResponse<ModulePracticeResponses.SessionDetail>> generalStart(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @PathVariable Long courseId,
            @Valid @RequestBody(required = false) ModulePracticeRequests.StartSession body) {
        ModulePracticeResponses.SessionDetail session =
                practice.generalStartOrResume(currentUser.getId(), courseId, body);
        if (session.resumed()) {
            return ResponseEntity.ok(ApiResponse.success(session, "Practice session resumed"));
        }
        URI location = UriComponentsBuilder
                .fromPath("/api/v1/student/practice/sessions/{sessionId}")
                .buildAndExpand(session.sessionId())
                .toUri();
        return ResponseEntity.created(location)
                .body(ApiResponse.success(session, "Practice session started"));
    }

    @GetMapping("/courses/{courseId}/general/practice/review-questions")
    @Operation(summary = "MP-11 (General): Questions of a course's General pool to practise again",
            description = "Paged module-less questions of the course whose latest finalized attempt is wrong.")
    public ResponseEntity<ApiResponse<PageResponse<ModulePracticeResponses.ReviewItem>>> generalReviewQuestions(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @PathVariable Long courseId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return ResponseEntity.ok(ApiResponse.success(
                PageResponse.of(practice.generalReviewQuestions(currentUser.getId(), courseId, page, size))));
    }

    @DeleteMapping("/courses/{courseId}/general/practice/progress")
    @Operation(summary = "MP-12 (General): Reset the practice progress of a course's General pool",
            description = "Deletes only this student's General sessions, their frozen questions, every stored "
                    + "attempt and the aggregated progress of that course. Module runs of the same course, "
                    + "the mistake notebook, its bookmarks, exams, flashcards and AI usage history are untouched.")
    public ResponseEntity<ApiResponse<ModulePracticeResponses.ResetResult>> generalResetProgress(
            @AuthenticationPrincipal UserPrincipal currentUser,
            @PathVariable Long courseId) {
        return ResponseEntity.ok(ApiResponse.success(
                practice.generalResetProgress(currentUser.getId(), courseId), "Practice progress reset"));
    }
}
