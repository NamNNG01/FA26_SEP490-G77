# Defect Report — BF-03 (Take Quiz Exam) & BF-06 (Take Essay Exam)

- **Updated**: 2026-11-21
- **Environment**: Spring Boot Backend (`http://localhost:8080/api/v1`), React + Vite Frontend (`http://localhost:3000`)
- **Test Accounts**: `managerB@examprep.local`, `student1@examprep.local`

---

## 1. BF-03 Defects (Take Quiz Exam)

### DEF-BF03-05 — Duplicate submission of a completed attempt returns `200 Submitted` instead of `400 EXAM_ALREADY_SUBMITTED`
- **Test Case**: `ST-BF03-50` (*Reject a duplicate submission of a completed attempt*)
- **Severity**: Low (Spec-vs-Test Mismatch)
- **Status**: Open (Verified on `2026-11-21`)
- **Steps to Reproduce**:
  1. Sign in as `student1@examprep.local`.
  2. Start and submit an attempt on Exam `320` (`POST /api/v1/student/attempts/{id}/submit`).
  3. Send `POST /api/v1/student/attempts/{id}/submit` a second time for the same attempt.
- **Actual Result**: HTTP `200 OK`, message `"Submitted"`.
- **Expected Result (Test Case)**: HTTP `400` (`EXAM_ALREADY_SUBMITTED`).
- **Root Cause**: `AttemptWriter.java:81-94` intentionally implements `submit()` as idempotent (*"Already submitted → the current result is returned without grading again"*). BA/QA should align whether to keep idempotent `200` (update test case) or return `400/409`.

### DEF-BF03-06 — Saving AI-generated questions without a Module fails with `400` despite UI labelling Module as optional
- **Test Case**: `ST-BF03-63` (*Save generated questions without selecting a module*)
- **Severity**: Medium
- **Status**: Open (Verified on `2026-11-21`)
- **Steps to Reproduce**:
  1. Sign in as `managerB@examprep.local`.
  2. Open **Create Exam > AI Generate**, select Course `6`, leave Module empty (UI label indicates optional), and generate a draft.
  3. Save the generated questions (`POST /api/v1/manager/questions/batch?courseId=6` without `moduleId`).
- **Actual Result**: HTTP `400 Bad Request` — `"Course ID and Module ID are required"`.
- **Expected Result**: Either allow saving questions without a module, or mark Module as required in the AI Generate UI before generating/saving.

### DEF-BF03-07 — Description update on a published exam with attempts is rejected with `409`
- **Test Case**: `ST-BF03-22` (*Allow description update after an exam has attempts*)
- **Severity**: Medium
- **Status**: Open (Verified on `2026-11-21`)
- **Steps to Reproduce**:
  1. Sign in as `managerB@examprep.local` and publish Exam `322`.
  2. Have `student1@examprep.local` start and submit an attempt on Exam `322`.
  3. Send `PUT /api/v1/manager/exams/322` with updated `description`.
- **Actual Result**: HTTP `409 Conflict` — `"Only draft exams with no attempts allow content changes. Archive exams with attempts."`.
- **Expected Result (Test Case)**: Description-only update should be allowed after attempts exist.

---

## 2. BF-06 Defects & Observations (Take Essay Exam)

### DEF-BF06-01 — Essay questions do not support word limits (`minWords` / `maxWords`)
- **Test Case**: `ST-BF06-07` (v1.9)
- **Severity**: Medium (SRS Gap)
- **Status**: Open (Verified on `2026-11-20`)
- **Description**: `QuestionValidator.java:96-144` rejects `minWords` / `maxWords` inside `questionMetadata` (`400 "Unknown metadata key: minWords"`). Only a fixed `10,000`-character limit exists on attempt answers (`AnswerResponseValidator.ESSAY_MAX_CHARS`).

### DEF-BF06-02 — Essay exams do not store passing criteria (`passMark`)
- **Test Case**: `ST-BF06-08` (v1.9)
- **Severity**: Medium (Deprecated / Ignored Field)
- **Status**: Open (Verified on `2026-11-20`)
- **Description**: `ExamRequests.Update` (`ExamRequests.java:214-217`) logs and ignores `passMark` (`Deprecated passMark field received and ignored.`), without persisting or returning it.

### OBS-BF06-01 (UI) — Duplicate `POST /student/exams/{id}/attempts` (`409`) fired on exam screen mount
- **Severity**: Low (Network noise)
- **Description**: When clicking `Start exam` or `Retake`, network logs show a parallel `POST /student/exams/306/attempts` returning `409` (likely React StrictMode double-mount), though the UI still opens the attempt normally.

### OBS-BF06-02 (UI) — Slight overlap between `Grade with AI` and `Retake` buttons on ungraded result header
- **Severity**: Low (UI Layout)
- **Description**: On `/student/exam-result` when an essay attempt is `Not graded`, the `Grade with AI` and `Retake` buttons in the header panel slightly overlap.
