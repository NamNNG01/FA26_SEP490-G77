# Full-Stack Project Audit Report

- **Repository:** `FA26_SEP490-G77` (ExamPrep Platform — Spring Boot 3.3 + Supabase/PostgreSQL + Flyway `V1`–`V97` + React 19 / TypeScript / Vite)
- **Baseline Commit:** `9895c83` (branch `Khai`)
- **Audit Date:** `2026-11-21`
- **Audit Scope:** Complete static and test-backed audit of `BE/` (~764 files: 51 controllers, ~110 services, 63 JPA entities, 65 repositories, 97 Flyway migrations, security/config/importers/workers/PDF writers), `FE/` (~417 files: 42 service modules, 60+ pages, routing, auth/interceptors, shared UI), existing defect/gap documents, and live build/test runs.
- **Note:** This report is read-only audit documentation. **Zero source files were modified.**

---

## Table of Contents

1. [Executive Summary & Live Verification Snapshot](#1-executive-summary--live-verification-snapshot)
2. [Verified Controls & Existing Gap-Doc Reconciliation](#2-verified-controls--existing-gap-doc-reconciliation)
3. [P0 — Critical Findings (19)](#3-p0--critical-findings-19)
4. [P1 — High Findings (36)](#4-p1--high-findings-36)
5. [P2 — Medium Findings (39)](#5-p2--medium-findings-39)
6. [P3 — Low Findings (15)](#6-p3--low-findings-15)
7. [Test Suite Root-Cause Classification (H2 & PostgreSQL Profiles)](#7-test-suite-root-cause-classification-h2--postgresql-profiles)
8. [Phased Remediation Roadmap (Waves 0–6) & Verification Plan](#8-phased-remediation-roadmap-waves-06--verification-plan)
9. [Open Policy Decisions Needed Before Execution](#9-open-policy-decisions-needed-before-execution)

---

## 1. Executive Summary & Live Verification Snapshot

### 1.1 Live Verification Commands Run at HEAD `9895c83`

| Check | Command | Outcome | Root Cause Summary |
|---|---|---|---|
| **Frontend TypeScript** | `Set-Location FE; npx tsc --noEmit` | **FAIL (2 errors)** | `StudentDeckStudyPage.tsx:363` (`ViewerCard.isStarred` missing — also permanently disables **"Review starred cards"**); `StudentExamResultPage.tsx:300` (`getAllSubmissions` takes 1 arg, called with 2 — also drops `?attemptId=` server filtering). |
| **Backend Default (H2) Suite** | `Set-Location BE; mvn -B test -Dtest='!SupabaseSchemaExportTest'` | **FAIL (1,151 run: 5 failures, 6 errors, 117 skipped)** | **2 failures** (`StudentCourseApiIntegrationTest`) are a **real production bug** (`DeckRepository.java:135` hides manager decks); **2 failures** (`StudentDeckApiIntegrationTest`) are stale test assertions; **1 failure** (`StudentAiApiIntegrationTest`) is a flaky 0 ms boundary race; **6 errors** occur because `AbstractPostgresIT` lacks `@EnabledIfSystemProperty(named = "postgresTests", matches = "true")` and fails connecting to `localhost:5433`. |
| **Backend PostgreSQL Profile** *(from existing codebase/report verification)* | `mvn -B test -DpostgresTests=true` | **6 pre-existing errors + 1 hardcoded-port test** | All 6 errors are stale/broken test fixtures (`"MASTERED"`/`"LEARNED"` vs `chk_ucp_status`, missing `Document` FK, removed `totalPoints`, missing `NOT NULL` columns in raw SQL); `DatabaseAlignmentMigrationTest` hardcodes port `55439`. |

### 1.2 Deduplicated Finding Counts

| Severity | Count | Summary Theme |
|---|---:|---|
| **P0 — Critical** | **19** | Cross-course IDOR, answer-key destruction on question update, unpublished/paid question-bank leaks, PayOS webhook outer-`code` trust flaw, OAuth pre-account takeover, guaranteed PostgreSQL `CHECK`/`NOT NULL`/`UNIQUE` crashes, private material-quiz leakage, hidden manager decks, contest registration/retake bypasses, HikariCP/scheduler freezes, AI quota bypasses, FE `tsc` breaks, and Material Quiz `takeAs` leak. |
| **P1 — High** | **36** | Stale JWT role claims, `passwordChangedAt` sub-second `401`, PII login logs, prod SMTP hangs, missing CORS headers, upload heap buffering, OOM dashboard loop, stored XSS (`QuestionValidator` output discarded), DOCX zip-bomb bypass, `NUMERIC(5,2)` overflow, essay full-score truncation (`9.96/10`), exam/question lifecycle/regrader bugs, `DocumentRepository` material pollution, discount lifecycle & `expiredAt` 500 sort crash, premature contest ranking & PG `NULLS FIRST` leaderboard, contribution review stats/promotion/notification link bugs, discussion moderation/anonymity leaks, Notebook `CODE`/General query & PDF 500 crashes, FE timer clock drift, systemic `<Button loading>` double-submit, `questionIssue.service` double `.data`, auth redirects, and StrictMode session leaks. |
| **P2 — Medium** | **39** | Open `defect.md` items (`DEF-BF06-01`, `DEF-BF03-06`, `DEF-BF03-07`), attempt/code/practice validator & locking edge cases, password policy bypass on reset/change, `GlobalExceptionHandler` `ClassCastException`/unmapped SQLStates, course/module delete & progress inflation (`>100%`) bugs, importer parsing corruptions, `DrawioNormalizer` `Inflater` leak, schema/JPA drift (`QuestionContribution` `jsonb`, `SubscriptionPlan` nulls, `@Modifying` cache/flush, concurrent user discount race, Hibernate 6 collection `IS NULL`), and FE package/router/filter/UX bugs. |
| **P3 — Low** | **15** | Duplicate submit spec mismatch (`DEF-BF03-05`), unbounded `newCachedThreadPool`s without `@PreDestroy`, minor material/AI/CORS/timezone/payment/contest/PDF/dead-code cleanup items. |

---

## 2. Verified Controls & Existing Gap-Doc Reconciliation

### 2.1 Verified Clean Controls (Confirmed No Bug)

- **Free-vs-Paid Course Enrollment Bypass & Race:** `EnrollmentServiceImpl.enrollFree()` (`BE/src/main/java/com/examprep/services/EnrollmentServiceImpl.java:38-55`) locks the `Course` row (`findForUpdate`), requires `isPublished == true`, rejects `price == null || price.signum() != 0` (`COURSE_NOT_FREE`), and serializes enrollment creation (`courses.findForUpdate` -> `users.findForUpdate` -> `enrollments.findForUpdate`). `PaymentServiceImpl.doCheckout()` (`:118, 139`) rejects `price <= 0` and `total <= 0`.
- **Draw.io XML XXE:** `DrawioNormalizer.parse()` (`BE/src/main/java/com/examprep/util/diagram/DrawioNormalizer.java:195-204`) disables DOCTYPE, external general/parameter entities, XInclude, and enables secure processing.
- **Material Upload Path Traversal & SSRF:** `MaterialStorage` (`BE/src/main/java/com/examprep/services/MaterialStorage.java`) strips path separators in `sanitize()`, prefixes keys with `materials/user{id}/{uuid}-`, and hardcodes the Cloudinary host (`MaterialTextReader` disables XXE/DTDs and bounds ZIP expansion).
- **Frontend XSS Sinks:** Repo-wide grep across `FE/src` found **0** usages of `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML`, `eval`, or `new Function`.
- **JPA Anti-Patterns (`BE/RULES.md`):** **0** `@Data` or `@EqualsAndHashCode` annotations across all 63 JPA entities; **0** `FetchType.EAGER` associations (every `@ManyToOne` uses `LAZY`, no `@OneToOne` exists); pooled `SEQUENCE` generators (`Question`, `AnswerOption`, `ExamQuestion`) all match `INCREMENT BY 50` in `V30`/`V89`.
- **V90 / V95 / V96 / V97 Migrations:** `SystemSetting` matches `V90`; zero stale `discussions.course_id` references remain post-`V95`; zero `auto_renew` references remain post-`V96`; `PistonClient.supports` and `AttemptAnswer.gradingError` (`'CODE_EXECUTION_UNAVAILABLE'`, 26 chars <= `VARCHAR(30)`) match `V97`.
- **FE↔BE Route Parity Checks:** `FE/src/app/routes.ts` is a 1-line re-export of `./routes.tsx`; `AdminUserController` UM-06 (`POST /admin/users`) and UM-07 (`PUT /admin/users/{id}/subscription`) exist on BE and match FE calls; `AdminDashboard`, `CMDashboard`, `StudentCommunity`, and `StudentSubscription` match BE DTO schemas; `mockQuestionAiData.ts` is gated behind `VITE_AI_MOCK=true`.

### 2.2 Status of Existing Gap & Defect Documents on HEAD (`9895c83`)

#### A. `defect.md` Status

| ID | Description | Status at `9895c83` | Audit Reference |
|---|---|---|---|
| `DEF-BF03-05` | Duplicate `POST /attempts/{id}/submit` returns `200` vs test expecting `400 EXAM_ALREADY_SUBMITTED` | **Open (Spec vs QA mismatch)** | `P3-01` |
| `DEF-BF03-06` | Saving AI questions without `moduleId` fails `400` despite UI optional label | **Still Open** | `P2-01` |
| `DEF-BF03-07` | Updating description on published/attempted exam returns `409` | **Partially Fixed** (sparse `{description}` works; full-object `PUT` with unchanged fields still returns `409`) | `P2-02` |
| `DEF-BF06-01` | Essay `minWords` / `maxWords` rejected with `400 "Unknown metadata key"` | **Still Open / Broken** (`QuestionValidator` patched, `QuestionServiceImpl.validateMetadataKeys` still rejects them, attempt validation ignores them) | `P2-03` |
| `DEF-BF06-02` | `passMark` silently logged and ignored on exam create/update | **Still Open** | `P2-04` |
| `OBS-BF06-01` | Duplicate `POST /student/exams/{id}/attempts` (`409`) on mount (StrictMode) | **Still Open** (FE disables `Idempotency-Key` because BE CORS omits it) | `P1-05`, `P1-32` |
| `OBS-BF06-02` | `Grade with AI` and `Retake` button overlap on ungraded essay result header | **Still Open** | `P2-39` |

#### B. `bf07-code-exam-be-gaps-2026-11-20.md` Status

| Gap ID | Status at `9895c83` | Verification Notes |
|---|---|---|
| `DEF-BF07-01` (Language lost) | **Mostly Fixed — Residual Edge Cases** | `CodeAnswerJudge.persist` writes `{"text","language"}`; `AttemptWriter.apply` backfills language. **Residual:** `AnswerResponseValidator` rejects `language: null` / draft clears (`P2-08`), `checkAnswer` omits language backfill (`P2-12`). |
| `DEF-BF07-02` (Source size limit) | **Mostly Fixed — Residual Caps** | `CodeSource.MAX_BYTES` (100 KB UTF-8) enforced in CD-04/CD-05/SA-03; `PistonClient` maps 4xx -> 400. **Residual:** `AttemptPaperFactory.display()` advertises `maxLength = 10_000` and `ModulePracticeGradingWorker` still rejects `CODE > 10_000` chars (`P2-10`). |
| `DEF-BF07-03` (Missing `allowedLanguages` -> 409) | **Fixed** | `QuestionValidator:330-335` enforces 1 language; `GlobalExceptionHandler:182-195` maps only `23505` -> 409; `V97` adds `chk_code_question_single_language`. |
| `DEF-BF07-04` (Run outside published exam) | **Fixed** | `StudentCodeExamServiceImpl.run():154-157` requires active unexpired `IN_PROGRESS` attempt on `PUBLISHED`/`ARCHIVED` exam (`AttemptAnswerRepository.findRunnableAttempts`), else 404. |
| `DEF-BF07-05` (Cross-attempt submissions) | **Fixed on BE, Broken on FE** | BE `GET /{examId}/submissions` accepts `?attemptId=` and redacts hidden stdout/input/expected. **Broken on FE:** `studentCodeExam.service.ts:144` omits `attemptId` parameter and fails `tsc --noEmit` (`P0-19`). |
| `DEF-BF07-06` (Time-up auto-submit ungraded) | **Partially Fixed — New Critical Concurrency Bugs** | Post-judging deadline check removed; `AttemptAutoSubmitter` grades expired CODE drafts outside TX. **New P0 bugs:** freezes single-threaded `@Scheduled` pool (`P0-15`) and omits `codeJudgingToken` lock (`P0-16`). |

#### C. `admin-user-management-be-gap-2026-11-17.md` Status

| Requirement | Status at `9895c83` | Exact Gaps / Bugs |
|---|---|---|
| UM-01 / UM-02 `subscription` field | **Partially Broken** | Implemented in batch (`findLatestForUsers`). **Bugs:** (1) Shortening a plan's end date returns the old `CANCELLED` row (`P1-20`); (2) `V91` `"Free Plan"` rows (`price = 0`) return `status: "ACTIVE"`, contradicting FE expectation; (3) global `non_null` JSON config omits `"subscription"` instead of `null`. |
| UM-06 Create user (`POST /admin/users`) | **Implemented, Rough Errors, Untested** | Core flow implemented. **Bugs:** throws unmapped 500 `IllegalStateException` & swallows SMTP exception details (`P2-20`), blocks DB TX on SMTP without prod timeout (`P1-04`), zero tests in `AdminUserApiIntegrationTest`. |
| UM-07 Set subscription (`PUT /admin/users/{id}/subscription`) | **Critically Broken on PostgreSQL, Untested** | **Bug:** Guaranteed `23505` (`uq_us_active_user`) crash due to missing `flush()` and expired-but-`ACTIVE` rows (`P0-10`); `endDate` not clamped on cancel (`P1-20`); `granted_by` admin ID not recorded; zero tests. |

#### D. `subscription-plan-entitlements-be-gap-2026-11-17.md` vs Commit `06dfa66`

- Commit `06dfa66` removed `PlanEntitlementService` and all per-feature controller checks (making AI access token-quota-only), yet `V92`, `SubscriptionPlan.featureKeysJson`, `GET /admin/subscription-plans/feature-keys`, Admin plan create/update, and `GET /student/subscription` still persist/validate/expose `featureKeys`, while FE Admin `SubscriptionPackagesPage.tsx` omits `featureKeys` (`P1-25`). Requires product alignment ([Open Decision #1](#9-open-policy-decisions-needed-before-execution)).

---

## 3. P0 — Critical Findings (19)

### [P0-01] Unscoped Cross-Course IDOR in `GET /api/v1/manager/questions`
- **Area:** BE Security / Authorization
- **Location:** `BE/src/main/java/com/examprep/services/QuestionServiceImpl.java:65-117`
- **Code Evidence:**
  ```java
  if (!User.ROLE_ADMIN.equals(currentUser.getRoleName())) {
      List<Long> requested = new ArrayList<>(scopeCourseIds);
      if (courseId != null) requested.add(courseId);
      for (Long id : requested.stream().distinct().toList()) {
          if (!courseManagerRepository.existsByCourse_CourseIdAndUser_UserId(id, currentUser.getUserId())) {
              throw new ForbiddenException("You do not have access to this course");
          }
      }
  }
  Specification<Question> spec = (root, query, cb) -> {
      var predicate = cb.isNull(root.get("deletedAt"));
      if (courseId != null) predicate = cb.and(predicate, cb.equal(root.get("course").get("courseId"), courseId));
      if (!scopeCourseIds.isEmpty()) predicate = cb.and(predicate, root.get("course").get("courseId").in(scopeCourseIds));
      if (moduleId != null) predicate = cb.and(predicate, cb.equal(root.get("module").get("moduleId"), moduleId));
  ```
- **Failure Scenario:** A `COURSE_MANAGER` assigned only to Course 1 calls `GET /api/v1/manager/questions` without `courseId` or `courseIds` (or filters by another course's `moduleId`/`groupId`). `requested` is empty, the access loop is skipped, and no managed-course predicate is added to `Specification`, exposing every question across all paid courses and private student material quizzes platform-wide.
- **Recommended Fix:** For non-`ADMIN` callers, unconditionally resolve `managedCourseIds = courseRepository.findCourseIdsManagedByUser(currentUser.getUserId())`, return an empty page if empty, validate requested `courseId`/`courseIds` and `moduleId`/`groupId` belong to `managedCourseIds`, and always constrain `root.get("course").get("courseId").in(managedCourseIds)`.

### [P0-02] Answer Key Destruction on Question Update & Issue Resolution (`isCorrect` Hardcoded `false`)
- **Area:** BE Data Loss / Grading Integrity
- **Location:** `BE/src/main/java/com/examprep/services/QuestionServiceImpl.java:588-597` (called by `updateQuestion` at `:368` and `correctQuestion` at `:376`, invoked by `QuestionIssueService.resolve()` at `services/QuestionIssueService.java:262`)
- **Code Evidence:**
  ```java
  } else {
      AnswerOption opt = AnswerOption.builder()
              .question(q)
              .optionText(dto.getOptionText())
              .isCorrect(false)
              .explanation(dto.getExplanation())
              .orderIndex(dto.getOrderIndex() != null ? dto.getOrderIndex() : i)
              .build();
  ```
- **Failure Scenario:** Updating a `SINGLE_CHOICE`, `MULTIPLE_CHOICE`, or `TRUE_FALSE` question via `PUT /api/v1/manager/questions/{id}` or `POST /api/v1/manager/question-issues/{id}/resolve` with a newly added correct option (or replaced options array lacking `optionId`s) passes `QuestionValidator`, then persists every new `AnswerOption` with `isCorrect = false`. The saved question has **zero correct options**, and when done during issue resolution `QuestionRegrader.keyJson()` freezes `correctOptionIds = []` and regrades all students to **0 points**.
- **Recommended Fix:** Replace `.isCorrect(false)` at line 591 with `.isCorrect(isOrdering ? false : Boolean.TRUE.equals(dto.getIsCorrect()))` (matching `createQuestionsBatch:286`).

### [P0-03] Draft/Unpublished/Private Question & Option Exfiltration + Cross-Course Oracle via Student Question Issues
- **Area:** BE Security / Authorization
- **Location:** `BE/src/main/java/com/examprep/services/QuestionIssueService.java:67-75, 116-133, 387-392, 496-506, 565-572`
- **Code Evidence:**
  `canReport` (`:387-392`) returns `true` if `enrollments.existsByCourse_CourseIdAndUser_UserIdAndStatus(...)`, ignoring `question.status`, `approvalStatus`, `sourceDocumentId`, `module.status`, and `course.isPublished`. Worse, `suggestedOptions(body.suggestedOptionIds(), questionOptions)` (`:72`) executes **before** the access check (`:73`), while `studentDetail` (`:128`) and `reportView` (`:499`) return `question.getContent()` and `option.getOptionText()`.
- **Failure Scenario:**
  1. An enrolled student submits `POST /api/v1/student/question-issues` with `source: "OTHER"` targeting any `DRAFT`/`INACTIVE`/`PENDING`/`REJECTED` question or another student's private AI material-quiz question (`sourceDocumentId != null`) in the same course, then calls `GET /api/v1/student/question-issues/{issueId}` to read its full question content and option texts.
  2. Any **unenrolled** user can enumerate `questionId`s (`404` vs `403`) and probe which `optionId`s belong to questions in paid/unpublished courses (`400` vs `403`).
- **Recommended Fix:** Perform the `canReport`/context access check **before** `suggestedOptions(...)`; require `ACTIVE`, `APPROVED`, `sourceDocumentId == null`, non-hidden module, and published course in `canReport()` when not backed by the student's own `attemptId`/`practiceSessionId`; return uniform `404` when inaccessible.

### [P0-04] Full Question Bank & Paywall Answer-Key Exfiltration via Notebook Bookmarking
- **Area:** BE Security / IDOR
- **Location:** `BE/src/main/java/com/examprep/services/student/StudentNotebookServiceImpl.java:148-176`; `BE/src/main/java/com/examprep/repositories/StudentQuestionReviewRepository.java:48-106`
- **Code Evidence:**
  `toggleBookmark(Long questionId, Long userId)` loads `questionRepository.findById(questionId)` with zero status/course/enrollment/ownership checks and inserts `StudentQuestionReview(bookmark = true)`. `listSavedQuestions()` (`:115-144`) then returns full `question.content`, all options, and `correctOptionIds`.
- **Failure Scenario:** Any authenticated student can iterate sequential `questionId`s, bookmark questions from paid courses they are not enrolled in, live/upcoming `CONTEST` exams, or `DRAFT`/`INACTIVE`/soft-deleted questions, and extract full questions + answer keys via `GET /api/v1/student/questions/saved?type=bookmarked` or PDF export.
- **Recommended Fix:** In `toggleBookmark()`, verify `deletedAt == null`, `ACTIVE`, `APPROVED`, `sourceDocumentId == null` (or own document), non-hidden module, and active/completed enrollment in the question's course (or a submitted attempt containing the question) while forbidding unseen `CONTEST`-only questions. Add `q.deletedAt IS NULL` and course/access guards in `findSavedQuestions`.

### [P0-05] Authorization Bypasses & IDORs in `CardImportService` (`/api/v1/flashcards/bulk` & `/preview`)
- **Area:** BE Security / Moderation Bypass
- **Location:** `BE/src/main/java/com/examprep/services/student/CardImportService.java:248-257, 315-367, 385-403`
- **Code Evidence:**
  1. **Cross-user `AiUsageLog` IDOR (`:360-367`):** Mutates `aiUsageLogRepository.findById(req.aiGenerationId())` (`savedAt = now`) without checking `log.getUser().getUserId().equals(userId)`.
  2. **Private-deck oracle in `preview()` (`:248-257`):** Loads all cards of any `deckId` passed as a query param to compute `duplicate: true/false` without checking ownership/visibility.
  3. **Moderation & mode bypass in `bulk()` (`:317-325, 385-403`):** Does not check `deck.getReviewStatus()` (`PENDING_REVIEW`/`APPROVED`) or `deck.getMode()`, and omits `ADMIN` role and primary `deck.getCourse().getManager()`.
- **Failure Scenario:** A student can get a clean deck approved as `PUBLIC` and then inject up to 500 unmoderated spam/malicious cards into the public catalog via `POST /api/v1/flashcards/bulk`; corrupt another user's `AiUsageLog.savedAt`; probe private deck cards; or receive 403 as primary manager/admin on co-manager decks.
- **Recommended Fix:** Verify `log.getUser().getUserId().equals(userId)` before mutating `AiUsageLog`; enforce deck read permission in `preview()`; in `bulk()` (and `insertChunk()`), permit `ADMIN` + primary manager + co-manager, reject `PENDING_REVIEW`/`APPROVED` student decks, and enforce `deck.getMode()` card requirements.

### [P0-06] Pre-Account Takeover via Unverified Local Registration + Silent Google OAuth Account Linking
- **Area:** BE Security / Authentication
- **Location:** `BE/src/main/java/com/examprep/services/AuthServiceImpl.java:60-89, 154-188`
- **Code Evidence:**
  `register()` (`:78-86`) creates `STATUS_ACTIVE` accounts without email ownership verification. `loginWithGoogle()` (`:154-183`) falls back to `userRepository.findByEmail(email)` and attaches `user.setGoogleId(googleUser.googleId())` without clearing `passwordHash` or revoking existing `refresh_tokens`.
- **Failure Scenario:** An attacker pre-registers a victim's Google email with an attacker-chosen password before the victim signs up. When the victim later signs in via Google OAuth, `loginWithGoogle()` links the victim's Google account to the attacker-controlled row while leaving the attacker's password and active refresh sessions valid.
- **Recommended Fix:** Require email verification on local registration before auto-linking, or when linking a verified Google identity onto an unverified password-only account, clear `passwordHash` (or require explicit password confirmation), set `passwordChangedAt`, and revoke all active `refresh_tokens`.

### [P0-07] PayOS Webhook Checks Unsigned Outer `code` Field Instead of HMAC-Signed `data.code`
- **Area:** BE Payments / Security
- **Location:** `BE/src/main/java/com/examprep/services/PaymentTransactionService.java:124-132`; `BE/src/main/java/com/examprep/services/PayosClient.java:96-107`
- **Code Evidence:**
  `PayosClient.verifyWebhookSignature()` (`:100`) computes the HMAC over `webhook.path("data")` only. Yet `PaymentTransactionService.completeWebhook()` (`:125`) checks `if (!"00".equals(webhook.path("code").asText()) ...)` (top-level outer `code`) and **never** checks `data.path("code")`.
- **Failure Scenario:** Any validly signed PayOS webhook `data` object carrying a non-`"00"` failure/cancelled `data.code` (along with `orderCode` and `amount`) can be replayed with forged outer `"code": "00"`, passing signature validation and marking the payment `PAID` / granting course or subscription access.
- **Recommended Fix:** Require `"00".equals(data.path("code").asText())` and `data.path("amount").isIntegralNumber()` inside `completeWebhook()`.

### [P0-08] Promoting Any Student Contribution Crashes PostgreSQL (Double `CHECK` Violation) & Hides Promoted Questions on H2
- **Area:** BE Schema / Data Integrity
- **Location:** `BE/src/main/java/com/examprep/services/manager/review/QuestionPromotionService.java:79-82`; `BE/src/main/resources/db/migration/V10__questions_updates.sql:6, 59`; `BE/src/main/resources/db/migration/V67__fix_question_source_column.sql:2`
- **Code Evidence:**
  `QuestionPromotionService` builds the promoted `Question` with `.source("STUDENT_CONTRIBUTION")` and `.approvalStatus("ACCEPTED")`. `V10:6` defines `CHECK (source IN ('MANUAL','AI','IMPORT'))` (`V67` widened `VARCHAR(30)` without updating the `CHECK` constraint), and `V10:59` defines `CHECK (approval_status IN ('PENDING','APPROVED','REJECTED'))`.
- **Failure Scenario:** Every `POST /api/v1/manager/contributions/{id}/approve` crashes on PostgreSQL with SQLState `23514` (`HTTP 500`). Even on H2 (no Flyway constraints), every question delivery/bank query filters `q.approvalStatus = 'APPROVED'`, making all promoted questions invisible.
- **Recommended Fix:** Change `QuestionPromotionService.java:81` to `.approvalStatus("APPROVED")`, add Flyway migration `V98` dropping/recreating the `questions.source` `CHECK` constraint to allow `'STUDENT_CONTRIBUTION'`, and backfill any `'ACCEPTED'` rows to `'APPROVED'`.

### [P0-09] Creating or Updating Any `PERCENT` Discount Crashes PostgreSQL (`discounts."value"` `NOT NULL`)
- **Area:** BE Schema / PostgreSQL Crash
- **Location:** `BE/src/main/java/com/examprep/services/admin/AdminDiscountService.java:146-155, 198-206`; `BE/src/main/java/com/examprep/entities/Discount.java:38-39`; `BE/src/main/resources/db/migration/V4__migrate_to_new_design.sql:37`
- **Code Evidence:** `AdminDiscountService` sets `d.setValue(null)` for `"PERCENT"` discounts. `Discount.java:38` maps `value` as nullable (hiding the bug in H2 tests), while `V4:37` defines `"value" DECIMAL(10,2) NOT NULL` and no subsequent migration (`V5`–`V97`) alters it.
- **Failure Scenario:** Every `POST /api/v1/admin/discounts` or `PUT /api/v1/admin/discounts/{id}` with `discountType = "PERCENT"` fails on PostgreSQL with SQLState `23502` (`NOT NULL` constraint violation).
- **Recommended Fix:** Add `ALTER TABLE discounts ALTER COLUMN "value" DROP NOT NULL;` in migration `V98` (with an optional type-value `CHECK` constraint).

### [P0-10] UM-07 `AdminUserServiceImpl.setSubscription` Crashes PostgreSQL `uq_us_active_user`
- **Area:** BE Schema / Admin User Management
- **Location:** `BE/src/main/java/com/examprep/services/AdminUserServiceImpl.java:185-205`; `BE/src/main/java/com/examprep/repositories/UserSubscriptionRepository.java:27-28`; `V58:60-62`; `V91:77-89`
- **Code Evidence:**
  `V58` enforces `CREATE UNIQUE INDEX uq_us_active_user ON user_subscriptions(user_id) WHERE status = 'ACTIVE'`, and `V91` backfilled an `ACTIVE` Free Plan row for every existing student. Yet `AdminUserServiceImpl.setSubscription()` uses `findCurrentOrFutureByUser(id, now)` (missing expired rows still flagged `status = 'ACTIVE'`) and calls `subscriptions.save(...)` (`GenerationType.IDENTITY` executes `INSERT` immediately) **without calling `subscriptions.flush()`** after marking prior rows `CANCELLED`.
- **Failure Scenario:** Assigning or replacing a subscription for any student who already has an `ACTIVE` or expired-`ACTIVE` row crashes on PostgreSQL with `23505` (`HTTP 409 Conflict`).
- **Recommended Fix:** Query `subscriptions.findByUserUserIdAndStatus(id, "ACTIVE")`, cancel all rows (clamping future `endDate` to `now`), and call `subscriptions.flush()` before `subscriptions.save(...)`.

### [P0-11] Private Student Material-Quiz Questions Leak Across Students & Into Official Random Exams
- **Area:** BE Privacy / Data Isolation
- **Location:** `BE/src/main/java/com/examprep/services/QuizGenerationWorker.java:359-377`; `BE/src/main/java/com/examprep/repositories/QuestionRepository.java:48-63, 93-96, 360-369`; `BE/src/main/java/com/examprep/services/StudentMaterialServiceImpl.java:326-328`
- **Code Evidence:**
  `QuizGenerationWorker` saves private student-document questions with `status = "ACTIVE"`, `approvalStatus = "APPROVED"`, `course = course`, `sourceDocumentId = docId`.
  1. `QuestionRepository.findPracticeCandidates` (`:360-369`), `findAiBank` (`:58-63`), and `findActiveIdsByCriteria` (`:48-56`) **omit `AND q.sourceDocumentId IS NULL`**.
  2. When a student deletes their uploaded material, `StudentMaterialServiceImpl.delete():327` calls `questions.clearSourceDocument(documentId)` (`SET q.sourceDocumentId = null`), leaving those private questions `ACTIVE`, `APPROVED`, `deletedAt = NULL`, and `module = NULL`.
- **Failure Scenario:** Other students immediately receive Student A's private PDF-generated questions in `POST /student/practice-exams` and `smart-practice`, and as soon as Student A deletes the uploaded PDF, those private questions enter the **official course question bank** used by `RANDOM`/`MIXED` exams (`findDrawableIds`) and General Practice!
- **Recommended Fix:** Add `AND q.sourceDocumentId IS NULL` to all shared bank/practice queries; in `StudentMaterialServiceImpl.delete()`, archive/soft-delete (`status = 'ARCHIVED'`, `deletedAt = now`) private material-only questions instead of merely nulling `sourceDocumentId` (or mark material-generated questions with a dedicated private flag/status).

### [P0-12] Manager & Personal Course Decks Hidden in Module Content View (`DeckRepository.java:135`)
- **Area:** BE Logic / Broken Tests (2 live failures)
- **Location:** `BE/src/main/java/com/examprep/repositories/DeckRepository.java:123-141` (`:135`); `BE/src/main/java/com/examprep/services/DeckServiceImpl.java:89-90, 109`; `BE/src/main/java/com/examprep/entities/Deck.java:64`
- **Code Evidence:**
  `DeckServiceImpl.create()`/`:update()` only set `isPublic`, leaving `Deck.visibility` at its default `"PRIVATE"`. Commit `0a9e60ba` changed `DeckRepository.findDecksByModuleOrGeneral:135` to `AND d.visibility = 'PUBLIC'` (contradicting its own comment above line 135).
- **Failure Scenario:** All manager-created course decks and a student's own personal course decks disappear from `GET /api/v1/student/courses/{id}/modules/{moduleId}`, while `countCourseDecksByModule` (`:146`) and `findCourseDecksWithStats` (`:120`) still count and return them. Directly causes 2 failing tests in `StudentCourseApiIntegrationTest`.
- **Recommended Fix:** Restore `AND (d.user.roleName <> 'STUDENT' OR d.user.userId = :userId OR d.visibility = 'PUBLIC')` in `DeckRepository.java:135` and sync `deck.visibility` with `isPublic` in `DeckServiceImpl` (plus backfill in `V98`).

### [P0-13] Contest Lifecycle, `maxParticipants` Cap & Multi-Attempt Bypasses
- **Area:** BE Exam & Contest Integrity
- **Location:** `BE/src/main/java/com/examprep/services/student/StudentContestServiceImpl.java:171-261, 574-576`
- **Code Evidence:**
  1. `registerContest` (`:172-187`) and `startContest` (`:206-215`) never verify `c.getDeletedAt() == null` or `"PUBLISHED".equals(c.getStatus())`.
  2. `startContest` (`:230-234`) auto-registers unregistered users **without checking `c.getMaxParticipants()`**, and `registerContest` reads `contestRepository.findById` without `PESSIMISTIC_WRITE`.
  3. `startContest` (`:218-260`) only checks for `IN_PROGRESS` attempts (by `(userId, examId, 'IN_PROGRESS', 'CONTEST')`, not `participant.getAttemptId()`), while `getContestDetail` (`:574-576`) uses `p.getFinishedAt()`/`p.getRank()` (unpopulated until post-end ranking).
- **Failure Scenario:** Students can register/start `DRAFT`, `CANCELLED`, or soft-deleted contests; bypass `maxParticipants` via `/start` or concurrent `/register`; and after submitting an attempt during a live contest, call `/start` repeatedly for unlimited retakes with fresh question draws.
- **Recommended Fix:** Lock `Contest` via `findForUpdate`; enforce `deletedAt == null && "PUBLISHED".equals(status)`; enforce `maxParticipants` in `startContest`; block `/start` (`409`) whenever `participant.getAttemptId() != null` and that attempt is no longer `IN_PROGRESS`; track active attempt via `participant.getAttemptId()`.

### [P0-14] Blocking 90–120s Gemini HTTP Calls Held Inside `@Transactional(readOnly = true)` in `ExamAiServiceImpl`
- **Area:** BE Reliability / Connection-Pool Exhaustion
- **Location:** `BE/src/main/java/com/examprep/services/ExamAiServiceImpl.java:49, 114-179, 229`
- **Code Evidence:** Class-level `@Transactional(readOnly = true)` holds a HikariCP DB connection across up to two 90–120s Gemini calls executed on `ForkJoinPool.commonPool()` without `future.cancel(true)` on timeout.
- **Failure Scenario:** 10–20 concurrent manager AI requests (matching `maximum-pool-size: 10` dev / `20` prod) or a Gemini slowdown exhausts the entire DB connection pool, taking down unrelated API endpoints.
- **Recommended Fix:** Remove class-level `@Transactional`; load DB reads inside a short `TransactionTemplate`, and execute AI calls via `AiCalls.complete(...)` outside any transaction.

### [P0-15] Blocking Piston Calls in `AttemptAutoSubmitter.closeExpiredCodeAttempts()` Freeze `@Scheduled` Pool
- **Area:** BE Reliability / Scheduler Starvation
- **Location:** `BE/src/main/java/com/examprep/services/AttemptAutoSubmitter.java:95-121`; `BE/src/main/java/com/examprep/services/PistonClient.java:88-95, 105, 336`; `BE/src/main/java/com/examprep/ExamPrepBackendApplication.java:8`
- **Code Evidence:** Spring Boot's default `TaskScheduler` has **1 thread**. Every 15s `closeExpiredCodeAttempts()` synchronously runs Piston judging for up to 25 expired code attempts on that single scheduler thread, blocking on untimed `callPermits.acquire()` (4 permits) and 60s HTTP read timeouts (up to 3 retries/test case).
- **Failure Scenario:** A few expired TLE code attempts or a slow Piston server stalls the sole scheduler thread for minutes, freezing `EssayGradingWorker`, `QuizGenerationWorker`, `FlashcardGenerationWorker`, `ModulePracticeGradingWorker`, `PersonalizationService`, and `ContestRanker`.
- **Recommended Fix:** Configure `spring.task.scheduling.pool.size: 8`, offload expired code attempt judging to a bounded executor (with `@PreDestroy`), and replace `callPermits.acquire()` with bounded `tryAcquire(timeout, ...)` failing fast with `CODE_EXECUTION_UNAVAILABLE`.

### [P0-16] `AttemptAutoSubmitter.close()` Never Acquires `codeJudgingToken`/`codeJudgingUntil`
- **Area:** BE Concurrency / Attempt Integrity
- **Location:** `BE/src/main/java/com/examprep/services/AttemptAutoSubmitter.java:110-168`; `BE/src/main/java/com/examprep/services/AttemptWriter.java:90-98`
- **Code Evidence:** Pass 1 of `prepareClose()` (`:156-160`) returns `plans` and commits/releases the attempt lock **without setting `codeJudgingToken`/`codeJudgingUntil`** before running `judge.judge(plans, true)`.
- **Failure Scenario:** Concurrent requests (`submit`, `getAttempt`, `start`, `closeExpiredCodeAttempts`) trigger duplicate Piston executions, while `PUT /attempts/{id}/answers` (`SA-03`) continues mutating drafts mid-submit, forcing re-judging loops or wasting Piston runs before failing with `409`.
- **Recommended Fix:** Set `codeJudgingToken` + `codeJudgingUntil` in pass 1 of `prepareClose()` (with `try/finally` release on exception), and reject `SA-03` (`saveDrafts`) when `codeJudgingInProgress` is true.

### [P0-17] AI Token Quota Bypass (`PROCESSING` Ignored) + Premature Refund/Kill of Active Queued Jobs
- **Area:** BE AI Quota & Worker Concurrency
- **Location:** `BE/src/main/java/com/examprep/repositories/AiUsageLogRepository.java:26-59`; `BE/src/main/java/com/examprep/services/AiQuotaService.java:47-61`; `BE/src/main/java/com/examprep/services/FlashcardGenerationWorker.java:105, 206, 226-227`; `BE/src/main/java/com/examprep/services/QuizGenerationWorker.java:120, 188-216, 424-429`; `BE/src/main/java/com/examprep/services/student/PersonalizationService.java:151-152, 196-242`
- **Code Evidence:**
  1. `AiUsageLogRepository.sumStudentUsage():29` sums `reservedTokens` ONLY where `l.status = 'PENDING'`, ignoring `'PROCESSING'` (set by `FlashcardGenerationWorker.claim()`). `AiQuotaService.snapshot()` therefore shows those reserved tokens as still spendable across all other AI endpoints.
  2. `AiUsageLogRepository.expirePending():54-58` expires any `PENDING` log older than 5 minutes unless tied to an `attempt_answers` row. Because `QuizGenerationWorker` (single-threaded) never moves its `AiUsageLog` out of `PENDING`, and `FlashcardGenerationWorker` (single-threaded) queues >3 jobs past 5 minutes, `expirePending()` refunds active queued jobs (`FAILED`, `reserved_tokens = 0`) while `QuizGenerationWorker.finish():428` and `PersonalizationService.runSmartPractice():213` settle `SUCCESS` without checking `PENDING` status (and `PersonalizationService` reads `AiPersonalizationJob` without `FOR UPDATE`, racing with `sweepExpiredJobs()`).
- **Failure Scenario:** Students double-spend AI token quotas concurrently during flashcard generation; queued quiz/flashcard jobs >5 min old are killed or double-spent when settled back to `SUCCESS`.
- **Recommended Fix:** Change line 29 to `l.status IN ('PENDING', 'PROCESSING')`; exclude active `quiz_generation_jobs`, `ai_personalization_jobs`, and `FLASHCARD_GENERATE` logs from `expirePending()`; transition `QuizGenerationWorker`'s log to `PROCESSING` on claim; lock `AiPersonalizationJob` via `findForUpdate` and only settle `PENDING`/`PROCESSING` logs.

### [P0-18] Material Quiz "Take as Exam" (`MQ-05`) Never Sends `takeAs` → Answer-Key Leak & No Server Timer
- **Area:** FE↔BE Contract / Exam Security
- **Location:** `FE/src/services/studentMaterial.service.ts:217-219`; `FE/src/features/student/components/MaterialQuizModal.tsx:341-348, 384-395`; `FE/src/features/student/pages/MyMaterialsPage.tsx:149-155`; `FE/src/features/student/pages/StudentTakeExamPage.tsx:209`; `BE/src/main/java/com/examprep/services/StudentMaterialServiceImpl.java:470-524`; `BE/src/main/java/com/examprep/services/StudentAttemptServiceImpl.java:507, 675-678`; `BE/src/main/java/com/examprep/services/AttemptAutoSubmitter.java:69-73`
- **Code Evidence:** `materialService.start(jobId)` posts with **no body**, storing `takeAs` only in `localStorage`. On BE, omitted `takeAs` defaults to `"PRACTICE"`, which makes `SA-02` embed `practiceKey` (correct answers/explanations) in every question response, allows `POST .../check`, and causes `AttemptAutoSubmitter.isExpired()` to return `false`. Meanwhile `StudentTakeExamPage.tsx:209` ignores `session.takeAs` from BE.
- **Failure Scenario:** Selecting **"Take as Exam"** on a Material Quiz exposes all answer keys in the network payload, disables server deadline enforcement, and breaks Exam mode if resumed in another browser.
- **Recommended Fix:** Update `materialService.start(jobId, takeAs)` to send `{ takeAs }` from both callers, and prefer server `session.takeAs` over `localStorage` in `StudentTakeExamPage.tsx`.

### [P0-19] Two Live Frontend `tsc --noEmit` Build Errors & Broken Runtime Features
- **Area:** FE Build / Runtime Features
- **Location:**
  1. `FE/src/features/student/pages/StudentDeckStudyPage.tsx:363` vs `FE/src/services/studentDeck.service.ts` (`ViewerCard`) & `BE/src/main/java/com/examprep/dto/student/StudentDeckDtos.java:79-80, 104`
  2. `FE/src/features/student/pages/StudentExamResultPage.tsx:300` vs `FE/src/services/studentCodeExam.service.ts:133-148` & `BE/src/main/java/com/examprep/controllers/StudentCodeExamController.java:61-70`
- **Code Evidence:**
  1. `cards.filter(card => card.isStarred).length` throws `TS2339: Property 'isStarred' does not exist on type 'ViewerCard'`. Because `ViewerCard` omits `isStarred`, `card.isStarred` is always `undefined`, keeping `starredCount = 0` and permanently disabling `"Review starred cards"` (`StudyPanel.tsx:229-239`).
  2. `studentCodeExamService.getAllSubmissions(examId, attemptId)` throws `TS2554: Expected 1 arguments, but got 2`. At runtime JS ignores `attemptId` and fetches every attempt's submissions instead of passing BE's supported `?attemptId=` query parameter.
- **Recommended Fix:** Use `deck.starredCount` synced on `toggleStar` (and/or add `isStarred` to `ViewerCard`); add optional `attemptId` parameter to `getSubmissions` and `getAllSubmissions` in `studentCodeExam.service.ts`.

---

## 4. P1 — High Findings (36)

### A. Auth, Security & Configuration

| ID | Location | Evidence & Concrete Failure Scenario | Recommended Fix |
|---|---|---|---|
| **P1-01** | `BE/.../security/JwtAuthenticationFilter.java:35-70`; `AdminUserServiceImpl.java:135-140` | **Stale JWT role claims & unrevoked tokens on role demotion:** `isTokenStillValid()` loads the live `User` from DB, discards it, and authenticates with stale JWT claims (parsing the token 3x/request). `AdminUserServiceImpl.update()` only revokes refresh tokens when status becomes `INACTIVE`, not when role changes. Demoted `ADMIN`/`COURSE_MANAGER` keeps elevated access up to 15 min. | Parse claims once, check live `User` + `tokensInvalidBefore`, build `Authentication` from `UserPrincipal.create(user)`; revoke refresh tokens on role change. |
| **P1-02** | `BE/.../security/JwtAuthenticationFilter.java:59-68`; `AuthServiceImpl.java:353-386`; `JwtTokenProvider.java:39-49` | **Sub-second `passwordChangedAt` vs integer-second JWT `iat`:** Password reset/change stores nanosecond `Instant.now()`, while JWT `iat` truncates to whole seconds. Logging in during the same second produces a new token with `iat < passwordChangedAt` that fails `401` for 15 min; also `issuedAt == null` is accepted. | Reject null `iat`; store millisecond `iat_ms` claim (or truncate `passwordChangedAt` + ensure new `iat >= passwordChangedAt`). |
| **P1-03** | `BE/.../services/AuthServiceImpl.java:95, 103-104, 111`; `application-prod.yml:38` | **Production PII logging (`BE/RULES.md` §6.1):** Every login prints user email (`log.info`) and granular password-match status in production (`com.examprep: INFO`). | Remove lines 95, 103–104, and 111; never log emails or auth-oracle flags. |
| **P1-04** | `BE/.../resources/application-prod.yml:20-34`; `AuthServiceImpl.java:282-309`; `AdminUserServiceImpl.java:168-181` | **Blocking SMTP inside `@Transactional` + missing prod mail timeouts:** `application-prod.yml` lacks `connectiontimeout`/`timeout`/`writetimeout` (unlike `dev`). `forgotPassword()` and `AdminUserServiceImpl.create()` execute synchronous SMTP inside `@Transactional` DB locks; `forgotPassword()` also leaks email existence via ~1–3 s SMTP timing and never invalidates prior reset tokens or rate-limits. | Add `5000 ms` mail timeouts to `application-prod.yml`/`application.yml`; send reset email after commit asynchronously, revoke prior tokens, rate-limit `/password/forgot`. |
| **P1-05** | `BE/.../config/CorsConfig.java:25-26` | **CORS omits headers FE relies on:** `allowedHeaders` omits `"Idempotency-Key"` (forcing FE `SA-01` to disable it, causing StrictMode duplicate `409` on exam start); `exposedHeaders` omits `"Content-Disposition"` and `"Retry-After"` (breaking export filenames and `MQ-04`/AI backoff). | Allow `"Idempotency-Key"` and expose `"Content-Disposition"`, `"Retry-After"` in `CorsConfig`. |
| **P1-06** | `BE/.../controllers/{StudentUpload,ManagerUpload,User}Controller.java`; `MaterialStorage.java:166-192` | **Unbounded public image uploads & pre-check 20 MB heap buffering:** Any student can upload unlimited 5 MB public images to Cloudinary with no DB tracking, quota, rate limit, or orphan cleanup. `UserController.bytes()` calls `file.getBytes()` (up to 20 MB Spring multipart max) *before* `MAX_IMAGE_BYTES` (5 MB) check. | Check `file.getSize()` before `file.getBytes()`; enforce per-user upload quotas/rate limits and track/clean orphaned uploads. |
| **P1-07** | `BE/.../services/AdminDashboardServiceImpl.java:79-92, 301-341` | **Unbounded period loop OOM / 500:** `parsePeriod` parses years up to `±999,999,999` with no span cap (`day` from `0001-01-01` to `9999-12-31` allocates 3.65M buckets; `year=999999999` overflows `plusDays(1)` → unhandled `DateTimeException` 500). | Validate year bounds (`2000..2100`) and cap period buckets (`day <= 366`, `month <= 120`, `year <= 50`). |
| **P1-08** | `BE/.../util/validation/QuestionValidator.java:32-35, 79, 174`; `QuestionServiceImpl.java:245, 285, 495, 582, 590` | **OWASP HTML sanitizer result discarded (Stored XSS):** `QuestionValidator` sanitizes into unused local variables only; `QuestionServiceImpl` saves raw unsanitized strings (e.g., `2+2? <img src=x onerror=alert(1)>`) verbatim to DB. | Persist `questionValidator.sanitize(...)` output for question content, options, explanations, pairs, and rubrics before hashing/saving. |
| **P1-09** | `BE/.../util/importer/DocxTextExtractor.java:106-123, 135`; `QuestionImportServiceImpl.java:41-43, 57-70, 130-154` | **DOCX zip-bomb bypass & thread/heap exhaustion:** When ZIP header `entry.getSize() > 0`, `DocxTextExtractor` trusts the forged header and skips inflating/measuring actual bytes; when `<= 0`, `totalUncompressedSize` is not checked inside the loop (`24.4 GB` max). `QuestionImportServiceImpl` reads `20 MB` `file.getBytes()` twice before the 10 MB check, uses unbounded `newCachedThreadPool` without `@PreDestroy`, and leaks an unbounded rate-limit map. | Always inflate and measure actual bytes in `ZipInputStream` for both entry and cumulative limits; configure `ZipSecureFile`; check `file.getSize()` before reading once; use bounded daemon pool + `@PreDestroy`. |

### B. Question Bank, Exams, Grading, Materials & AI Workers

| ID | Location | Evidence & Concrete Failure Scenario | Recommended Fix |
|---|---|---|---|
| **P1-10** | `BE/.../dto/ExamRequests.java:167, 209`; `ManagerExamServiceImpl.java:984`; `Exam.java:54`; `ExamAttempt.java:55`; `AttemptAnswer.java:95`; `V1:136,148`; `V4:523`; `V12:27-28`; `V25:32` | **`NUMERIC(5,2)` / `NUMERIC(6,2)` score overflow (`>= 1000`):** Validation accepts `maxScore` up to `10000`, yet `exams.max_score` is `NUMERIC(6,2)` (`9999.99` max) and `exam_attempts.total_score`, `attempt_answers.score_earned`, `contest_participants.score`, and `answer_regrade_logs.*_score` are `NUMERIC(5,2)` (`999.99` max). Any attempt scoring `>= 1000` crashes on submit/grading/regrade/ranking with PostgreSQL `500`. | Widen all score/max_score columns to `NUMERIC(8,2)` in `V98` and update `@Column(precision = 8, scale = 2)` on entities (or cap `maxScore` at `999.99`). |
| **P1-11** | `BE/.../services/EssayGradingWorker.java:315-324, 378-384, 416`; `AttemptScoring.java:82-89, 101-103` | **Essay full-credit score truncated by `0.01` (`RoundingMode.DOWN`):** For 6 equal essays on `maxScore = 10` (`P_q = 1.6667`, display `1.67`), full criterion score `1.67` is clamped to `1.6667` then `setScale(2, DOWN) = 1.66`, breaking `AttemptScoring.contribution()` promotion and returning `9.96/10.00`. `criteria()` vs `criterionMaxPoints()` also divide in opposite order (off-by-`0.01` cap mismatch). | Cap at `AttemptScoring.output(prepared.maxPoints())` with `RoundingMode.HALF_UP`; unify criterion weight multiplication/division order. |
| **P1-12** | `BE/.../services/student/StudentExamServiceImpl.java:33-43, 119-127`; `Exam.java:69` | **`StudentExamServiceImpl` leaks `CONTEST` & private practice/material exams + bypasses module-only enrollment:** Never checks `exam.mode` or `exam.createdBy`, and ignores `exam.module.course` when `exam.course == null`. Students can inspect hidden `CONTEST` exams, other students' `PRACTICE_EXAM`/`MATERIAL_QUIZ` exams, and module-only course exams without enrollment. | Reject `MODE_CONTEST`; enforce `createdBy == userId` for non-`MODE_EXAM`; resolve course via `exam.course` or `exam.module.course` and validate enrollment. |
| **P1-13** | `BE/.../services/student/StudentExamServiceImpl.java:45, 87-94`; `ExamRepository.java:48, 133-146` | **Pure `RANDOM` exams report `0` questions & `canStart = false`:** `countActiveQuestionsByExamId` and catalog stats count only `ExamQuestion` rows, omitting `ExamConfig` (`numberOfQuestions`) and `ExamGroup` questions. Every `RANDOM` exam fails `EX-01` with `EXAM_HAS_NO_QUESTIONS`. | Include `ExamConfig.numberOfQuestions` sums and deduplicated `ExamGroup` counts in `getExamDetail` and `ExamRepository` stats. |
| **P1-14** | `BE/.../services/ManagerExamServiceImpl.java:367, 431-443, 566, 579-606, 628-687, 767-853`; `AttemptPaperFactory.java:101-135` | **5 `ManagerExamServiceImpl` bugs:** (1) `read()`/`check()` ignore `mode`, letting managers read/archive/delete students' private practice/material exams; (2) cross-course questions/groups can be attached into free-course exams (or `courseId` changed after attaching); (3) `PUBLISHED -> ARCHIVED -> DRAFT` bypasses unpublish block and erases `publishedAt`; (4) `MIXED` `checkRules()` doesn't subtract fixed/group IDs from drawable pools and `publish()` ignores inactive group members, creating unstartable exams; (5) `PUT /questions/{id}/rubric` bypasses immutability, duplicate-criterion validation, and `scoringVersion`. | Restrict `read()`/`check()` to `EXAM`/`CONTEST`; match `question`/`group` `courseId` to `exam.courseId`; disallow `ARCHIVED -> DRAFT` and keep `publishedAt`; subtract fixed/group IDs in `checkRules()` and check group members in `publish()`; guard/validate `rubric()`. |
| **P1-15** | `BE/.../services/QuestionServiceImpl.java:357-368, 439-498, 685-731, 830-848`; `QuestionRepository.java:65, 80-83, 97-106`; `QuestionPayload.java:71-80` | **Question delete & status state-machine bugs:** (1) `deleteQuestion()` skips `ExamGroup`/`ExamConfig` checks and group queries omit `deletedAt IS NULL`, breaking published exam starts (`409 EXAM_INVALID_QUESTIONS`); (2) `PUT` `applyUpdate()` copies `req.status` directly, bypassing approval checks; (3) `duplicateQuestion()` creates dead-end `DRAFT` with duplicate `contentHash`; (4) `ORDERING` activation (`PATCH /status`) and partial `PUT` fail `QuestionValidator` because `fromEntity()` sets `isCorrect = false` and omits `key`. | Add `deletedAt IS NULL` to group queries, check groups/configs & detach group in `deleteQuestion()`; drop `req.status` from `applyUpdate()`; set duplicate status to `INACTIVE`; map `ORDERING` `isCorrect = null` & `key = optionId`. |
| **P1-16** | `BE/.../services/QuestionRegrader.java:82-140`; `QuestionIssueService.java:253-284, 413`; `QuestionServiceImpl.java:392-394` | **`QuestionRegrader` concurrency, `IN_PROGRESS` corruption & General-pool resolve failure:** Iterates `byAttempt` without locking `ExamAttempt` (racing with `EssayGradingWorker` `totalScore` writes); skips `QUESTION_VOIDED` for `IN_PROGRESS` attempts (students submit later and get `0`); updates `keySnapshot` on `ANSWER_CORRECTED` while leaving `displaySnapshot` stale (guaranteeing `0`); `correctQuestion()` rejects `module == null` with `400`. | Lock `ExamAttempt`s deterministically; handle `QUESTION_VOIDED` & `displaySnapshot` sync for `IN_PROGRESS`; allow `module == null` in `correctQuestion()`. |
| **P1-17** | `BE/.../services/AiFlashcardServiceImpl.java:158-167`; `DocumentRepository.java:17-43`; `StudentMaterialServiceImpl.java:85, 136, 318-336, 379, 395`; `QuizGenerationWorker.java:77, 224` | **Flashcard `Document`s pollute Student Materials & quota mis-estimation:** `DocumentRepository` doesn't filter `generationType = 'MATERIAL'`, so 50 flashcard generations block material uploads (`MATERIAL_LIMIT_REACHED`), internal `"AI text input"` rows show in `MQ-02`, and `MQ-03` accepts plain-text flashcard docs. Also `StudentMaterialServiceImpl.reserve()` estimates tokens on unclipped `content.length()` (>60k clip) + fixed `OUTPUT_BUDGET = 500` (under-estimates 30-question requests). | Filter `generationType = 'MATERIAL'` in `DocumentRepository`; clip `promptChars` at `MATERIAL_CLIP` and scale output estimate by `questionCount`. |
| **P1-18** | `BE/.../services/ModulePracticeGradingWorker.java:202-290` | **`ModulePracticeGradingWorker.claim()` halts global queue drain on `QUOTA_EXHAUSTED`:** Returning `null` exits `while (gradeNext())`, stalling all other students' queued answers up to 60 s; skips locking `session`/`sessionQuestion` and skips `refreshCounters()`/`refreshProgress()`. | Return a continue sentinel so remaining queued rows drain; lock session/question and refresh counters/progress. |

### C. Commerce, Contests, Community, Reviews, Decks & Notebook

| ID | Location | Evidence & Concrete Failure Scenario | Recommended Fix |
|---|---|---|---|
| **P1-19** | `BE/.../repositories/UserSubscriptionRepository.java:17-18`; `AdminUserServiceImpl.java:80-87, 112-113, 197-204` | **UM-01/02 returns stale `CANCELLED` subscription when plan end date is shortened:** Cancelling a `2027-06-30` plan and setting a `2026-12-31` plan leaves the `CANCELLED` row sorting ahead of `ACTIVE` (`ORDER BY endDate DESC`), so Admin UI shows `"Free"`. | Sort `findLatestForUsers` by `CASE WHEN s.status = 'ACTIVE' THEN 0 ELSE 1 END ASC, s.endDate DESC, s.subscriptionId DESC`; clamp cancelled future `endDate` to `now`. |
| **P1-20** | `V4:35` vs `V45:45`; `Discount.java:28-29`; `AdminDiscountService.java` | **Soft-deleted discount codes cannot be reused on PostgreSQL:** `V45` added `uq_discounts_upper_code` without dropping `discounts_code_key`. Recreating a deleted code fails on PostgreSQL `23505`. | `ALTER TABLE discounts DROP CONSTRAINT IF EXISTS discounts_code_key;` in `V98`. |
| **P1-21** | `BE/.../services/admin/AdminDiscountService.java:47-50`; `Discount.java:56-57` | **`AdminDiscountService.list` sort whitelist crashes HTTP 500 on `expiredAt`:** Whitelist checks `"expiredAt"` while entity property is `expiresAt` (`PropertyReferenceException`). `?sort=expiresAt` falls back to `createdAt`. | Map `"expiredAt"` -> `"expiresAt"` before `Sort.by`. |
| **P1-22** | `BE/.../services/PaymentServiceImpl.java:136-161, 331-345`; `PaymentTransactionService.java:40-52, 103-108, 131, 156, 206-228`; `DiscountRepository.java:29-32`; `ContestRules.java:46-55` | **5 Discount Lifecycle & Concurrency Bugs:** (1) `validatedDiscount()` blocks last-slot checkout reuse (`usedCount == usageLimit`) before checking reusable pending checkout; (2) `createPending` blocks redeeming a second contest-won `CLAIM_REQUIRED` voucher; (3) `reserveUsage` omits `isActive`/`deletedAt`/`startAt`/`expiresAt` checks; (4) late webhook on `EXPIRED` payment increments `usedCount > usageLimit`; (5) pending checkout double-counts held `CLAIM_REQUIRED` vouchers in `ContestRules.remaining()`, falsely blocking concurrent `ContestRewardPayer`. | Check reusable/cancellable pending payment first; check unused voucher for `CLAIM_REQUIRED`; enforce active/date guards in `reserveUsage`; track held vouchers accurately without double subtraction. |
| **P1-23** | `BE/.../repositories/ContestParticipantRepository.java:36-37`; `ContestRanker.java:72`; `V39:18-19` | **Contests can rank prematurely (`'PENDING'` vs `'QUEUED'`):** `countPendingGrading` queries non-existent `'PENDING'` and misses `'QUEUED'`. If answers are still `'QUEUED'`, `countPendingGrading` returns `0` and `ContestRanker` finalizes incomplete scores and freezes `rankedAt`. | Change `'PENDING'` to `'QUEUED'` (`('PENDING_AI', 'QUEUED', 'GRADING')`). |
| **P1-24** | `BE/.../services/student/StudentContestServiceImpl.java:127, 138, 329-387, 542-550, 611`; `ContestParticipantRepository.java:49` | **Broken Student Contest Leaderboard & `DRAFT` Detail Leak:** Query `ORDER BY score DESC` uses PostgreSQL `NULLS FIRST`, pushing non-submitting participants (`score IS NULL`) into top ranks with fabricated `Instant.now()` timestamps; omits `timeTakenSec` tie-breaking; NPEs if `reward.discount == null`; `getContestDetail` leaks `DRAFT` contests and omits `randomQuestionCounts`. | Reject `DRAFT`/`CANCELLED`/deleted; use ranked participants (`rank IS NOT NULL ORDER BY rank ASC`); null-check `r.getDiscount()`; add `randomQuestionCounts`. |
| **P1-25** | `BE/.../controllers/AdminSubscriptionPlanController.java`; `AdminSubscriptionPlanService.java`; `V92`; `06dfa66` | **Subscription Feature-Key Gating Contradiction:** Commit `06dfa66` deleted `PlanEntitlementService` (making plans token-only), yet BE still stores/validates/returns `featureKeys` (`V92`) while FE omits them (`P2-34`). | Align per [Open Decision #1](#9-open-policy-decisions-needed-before-execution). |
| **P1-26** | `BE/.../repositories/QuestionContributionRepository.java:31-51, 68`; `QuestionPromotionService.java:63, 69-116`; `ContributionReviewController.java:168-171`; `ContributionReviewServiceImpl.java:124, 175`; `DeckReviewServiceImpl.java:194, 250` | **5 Contribution/Review Bugs:** (1) `countApprovedSince` queries `'APPROVED'` instead of `'ACCEPTED'` (`approvedLast30d = 0`, `approvalRate = 0.0`); (2) `ORDERING` promotion never maps keys -> `optionId`s & detail endpoint checks `"CODE"` instead of `"ORDERING"`; (3) `findManagedContributions` leaks `TIP` items into question review queue; (4) promotion skips `findExistingContentHashes` duplicate check; (5) review notification links `"/contributions/{id}"` and `"/decks/{id}"` omit `"/student"` -> 404 redirect on FE. | Fix `'ACCEPTED'` query, `ORDERING` promotion & typo, `c.type = 'QUESTION'`, hash duplicate guard, and `/student/...` notification links (+ FE legacy normalizer). |
| **P1-27** | `BE/.../services/student/StudentDiscussionServiceImpl.java:181-192`; `DiscussionRepository.java:124-135`; `ManagerDiscussionServiceImpl.java:354-361` | **Discussion Moderation Bypass & Anonymous Commenter Identity Leak:** `HIDDEN` discussions stay readable via detail and `findBookmarkedByUser`; `PATCH /manager/discussions/comments/{id}/status` exposes real `userId` & `role` of anonymous commenters. | Reject `HIDDEN` for non-authors in detail & bookmarks; use `AuthorDto.of(...)` in `updateCommentStatus`. |
| **P1-28** | `BE/.../repositories/StudentQuestionReviewRepository.java:48-106, 127-142`; `StudentNotebookServiceImpl.java:87-88, 196, 230` | **Notebook Queries Break `examType=CODE`, Drop General-Pool Questions & Join Typo:** Both queries handle only `QUIZ`/`ESSAY` (`?examType=CODE` returns 0 rows; session title says `"Multiple choice"`); `findSavedQuestions` inner-joins `q.module` (dropping General questions); line 129 joins `q.course`/`q.module` instead of `g.course`/`g.module`. | Add `CODE` predicate & title; use `LEFT JOIN` across `q.course`, `q.module`, and `q.group`; fix `g.course`/`g.module` on line 129. |
| **P1-29** | `BE/.../util/QuestionNotebookPdfWriter.java:49-135` | **`QuestionNotebookPdfWriter` Crashes 500 on Tabs/Emoji & Leaks Stream:** `cs.showText(...)` throws uncaught `IllegalArgumentException` on `\t`/control/non-WinAnsi chars or split surrogates at truncation index 105/95, leaking `PDPageContentStream` and overflowing >45 options. | Reuse `FlashcardPdfWriter` sanitization, wrapping, `try/finally` close, and per-line pagination. |
| **P1-30** | `BE/.../repositories/DeckRepository.java:118-120`; `StudentCourseServiceImpl.java:199-214`; `CardImportService.java:353-354` | **Hidden-Module Deck Exposure & `isPublic` Bypass:** `findCourseDecksWithStats` lacks `m.status <> 'HIDDEN'`; `listDeckCards` ignores hidden modules and falls back to legacy `deck.isPublic` (exposing unapproved `PRIVATE` student imports to any user). | Exclude hidden modules in `findCourseDecksWithStats` and `listDeckCards`; remove legacy `isPublic` bypass in `listDeckCards`. |
| **P1-31** | `BE/.../repositories/ExamAttemptRepository.java:131-132` | **Dead `LEFT JOIN FETCH` With `Page<ExamAttempt>` & No `countQuery`:** `findActivityAttemptsByUser` throws Hibernate `QueryException` if invoked because derived `COUNT(a)` rejects `JOIN FETCH` without explicit `countQuery`. | Remove dead method or add explicit `countQuery`. |

### D. Frontend Runtime, Timer, Auth & UX

| ID | Location | Evidence & Concrete Failure Scenario | Recommended Fix |
|---|---|---|---|
| **P1-32** | `FE/src/features/student/pages/StudentTakeExamPage.tsx:385, 449-467` | **Countdown Timer Jumps Up Mid-Exam:** Timer `useEffect` depends on `submit` (which changes when `codeMeta` loads async) and recomputes `offset = frozenServerTime - Date.now()`, adding elapsed `Δt` back onto remaining time and firing client auto-submit after server deadline (`410`). | Compute `clockOffsetMs` once when `session` arrives, call `submit` via `submitRef`, depend only on `[session, timed]`. |
| **P1-33** | `FE/src/components/ui/Button.tsx:20-35` (callers in `PaymentCheckoutModal`, `PublicCourseDetailPage`, `LoginPage`, `RegisterPage`, `ForgotPasswordPage`, `ResetPasswordPage`, `CategoriesPage`, `IssueReviewModal`, `CreateCourseModal`) | **Systemic Double-Submit Bug in Shared `<Button loading={true}>`:** `loading` renders a spinner without disabling `<button>`, allowing duplicate checkout/cancel/enroll/create POSTs on rapid double-clicks. | Set `disabled={disabled || loading}` and `aria-busy={loading || undefined}` in `Button.tsx`. |
| **P1-34** | `FE/src/services/questionIssue.service.ts:8-30` | **Double `.data` Unwrapping:** All 14 methods pass `(await apiClient.get(...)).data` into `unwrap()`, which reads `response?.data` (inner payload), bypassing `body?.success === false` error checks and stripping nested `.data` properties. | Switch to shared `api` wrapper (`FE/src/services/api.ts`) or pass full Axios response into `unwrap()`. |
| **P1-35** | `FE/src/app/AppContent.tsx:146-151, 194-195, 236-237`; `FE/src/services/axios.ts:74-77, 114-131`; `ResetPasswordPage.tsx:111-117` | **5 Auth/Session Bugs:** (1) Wildcard `*` drops destination `?redirect=`; (2) `LoggedInLoginRedirect` ignores `location.state?.from`; (3) guest 401 on non-public route emits `sessionExpired`, forcing bounce to `/login`; (4) authenticated password reset calls `POST /auth/logout` with revoked token → 401 overrides `passwordReset: true` with `"Session expired"`; (5) `axios.post(.../auth/refresh)` omits `timeout`, hanging `refreshInFlight` forever if stalled. | Preserve `?redirect=` on `*` & read `state.from`; emit `sessionExpired` only when an active session existed; add `timeout` to refresh; clear local auth state without calling `/auth/logout` after reset. |
| **P1-36** | `FE/src/features/student/pages/StudentDeckLearnPage.tsx:73-96, 249`; `AnalyticsPage.tsx`; `AuditLogsPage.tsx`; `SystemSettingsPage.tsx` | **StrictMode Orphan Study Sessions + Mock/Placebo Admin Pages:** `StudentDeckLearnPage` creates 2 `POST /study-sessions` rows in StrictMode and leaves sessions unfinished on Back/"Take a test". Live Admin sidebar shows 100% mock `AnalyticsPage` & `AuditLogsPage` (dead buttons/filters) and write-only `SystemSettingsPage` (never read by BE). | Guard/clean up `startSession`/`finishSession` on unmount; resolve Admin mock/placebo pages per [Open Decision #2](#9-open-policy-decisions-needed-before-execution). |

---

## 5. P2 — Medium Findings (39)

### 5.1 Backend — Question Bank, Exams, Attempts, Code & Practice

- **P2-01 (`DEF-BF03-06`):** `QuestionController.createQuestionsBatch:82` marks `moduleId` `required = false`, while `QuestionServiceImpl.java:142` throws `400 "Course ID and Module ID are required"`. Allow `moduleId == null` (General pool) consistently.
- **P2-02 (`DEF-BF03-07`):** `ManagerExamServiceImpl.java:558-560` flags any non-null structural field in `Update` as `structural = true` without comparing against existing `Exam` values, rejecting description-only full-object `PUT`s with `409`.
- **P2-03 (`DEF-BF06-01`):** Contradictory metadata allowlists: `QuestionValidator.java:107-124` permits `minWords`/`maxWords` (while rejecting `diagramType`/`plantUmlSource`), whereas `QuestionServiceImpl.validateMetadataKeys():1124-1148` rejects `minWords`/`maxWords` (`400`) and allows `diagramType`/`plantUmlSource`; `AttemptPaperFactory` and `AnswerResponseValidator` omit `minWords`/`maxWords`. Remove the duplicate check in `QuestionServiceImpl` and enforce word bounds consistently.
- **P2-04 (`DEF-BF06-02`):** `ExamRequests.Create`/`Update` (`:179-182, 214-217`) log and discard `passMark`. See [Open Decision #4](#9-open-policy-decisions-needed-before-execution).
- **P2-05 (`QuestionValidator` & `CODE` update gaps):** Empty rubric `criteria: []` passes validation (`QuestionValidator.java:528-562`); `null` entries in `testCases`/`ORDERING` `options` cause 500 NPE (`:229, 344`); `memoryLimitKb` has no upper bound (`:326`); `QuestionServiceImpl` skips `scoringVersion` increment on `CODE` changes (`:533-535`) and dereferences `existing` without null check (`:954`).
- **P2-06 (`ManagerExamServiceImpl.attachImported`):** `QuestionRepository.findActiveByCourseAndContentHashes` (`:172-183`) lacks `status = 'ACTIVE' AND approvalStatus = 'APPROVED'`, and newly created batch questions start `INACTIVE`, causing subsequent `publish()` (`:596`) to fail `409`.
- **P2-07 (Oversized `FILL_BLANK` key 500):** `AnswerResponseValidator.java:210-215` checks all-digits then calls `Integer.parseInt` without catching `NumberFormatException` → 500 on keys like `"999999999999"`.
- **P2-08 (`CODE` `language: null` & draft clears rejected):** `AnswerResponseValidator.java:50-88` rejects JSON `NullNode` (`language: null` or `text: null`) before `isEmpty()` runs (`AttemptWriter.java:180` uses `has("language")` instead of `hasNonNull`).
- **P2-09 (False `autoSubmitted = true`):** `AttemptAutoSubmitter.java:257` marks every untimed practice, material-quiz (`PRACTICE`), and 5-second grace-period manual submit as `autoSubmitted = true`. Use `expiredOnly || isExpired(attempt, now)`.
- **P2-10 (Residual `DEF-BF07-02` 10 KB `CODE` cap):** `AttemptPaperFactory.display():312-314` advertises `maxLength = 10_000` for `CODE`, and `ModulePracticeGradingWorker.prepare():356-361` fails `CODE` answers > `10_000` chars with `TEXT_TOO_LONG` despite `MP-05` accepting 100 KB (`CodeSource.MAX_BYTES`).
- **P2-11 (Missing `@Valid` & non-atomic `takeAs` in `MQ-05`):** `StudentMaterialController.start():109-115` omits `@Valid`, and `StudentMaterialServiceImpl.start():477-524` writes `takeAs` in a separate TX2 without locking, allowing malformed values or concurrent `PRACTICE` overwrite.
- **P2-12 (`checkAnswer()` locks non-auto-graded answers & drops `CODE` language):** `StudentAttemptServiceImpl.java:533-582` permanently sets `isLocked = true` even when returning `supported = false` for `ESSAY`/`DIAGRAM`/`CODE`, and stores raw response without language backfill.
- **P2-13 (`cancel()` vs `CD-05` judging race):** `StudentAttemptServiceImpl.cancel():441-461` deletes attempt while `codeJudgingInProgress` is true. Reject with `409`.
- **P2-14 (`PersonalizationService` rate-limit & refund gaps):** `recommendations()` and `weaknessReport()` (`PersonalizationService.java:290-351, 451-536, 671-690`) lack per-user throttling, deduplication, `PENDING`-guarded settlement, and `try/catch` immediate quota refund on non-AI exceptions.
- **P2-15 (`draftSeq`, null `exam`, & partial `DIAGRAM_ESSAY`):** `AttemptWriter.java:155` lets `seq == null` overwrite newer drafts; `AttemptWriter:230`, `StudentAiServiceImpl:177, 420`, and `EssayGradingWorker:262, 391` omit null checks on `attempt.getExam()` and module-only `exam.module.course`; `AnswerResponseValidator:69-73` rejects partial `DIAGRAM_ESSAY` drafts (`text`-only or `drawioXml`-only); `AttemptGrader.matchingCorrect():121-145` has case-sensitive `left` lookup vs case-insensitive `right` and skips pair-count check.

### 5.2 Backend — Auth, Policies, Exceptions, Courses, Dashboards, Importers & Diagrams

- **P2-16 (Password policy bypass on reset/change):** `ResetPasswordRequest:20` and `ChangePasswordRequest:20` allow 6-char weak passwords without complexity or 72-byte BCrypt UTF-8 checks (`AuthServiceImpl.java:69-75, 321-392`).
- **P2-17 (`avatarUrl` arbitrary URI schemes):** `UpdateProfileRequest` / `UserServiceImpl.java:58-61` persist `javascript:`/`data:` URLs without `http`/`https` validation.
- **P2-18 (`MaterialStorage` local path containment & Cloudinary raw type):** `MaterialStorage.java:85-152` lacks backslash/canonical path-containment validation in `localStore()`/`delete()`, and uses `type=upload` + `access_control=[token]` instead of `type=authenticated` for raw docs.
- **P2-19 (`QuestionAccessPolicy` gaps):** `QuestionAccessPolicy.java:15-39` ignores primary `course.manager` and does not require `ROLE_COURSE_MANAGER` for non-admins (leaving demoted managers able to pass if DB role isn't checked).
- **P2-20 (UM-06 exception & mail error swallowing):** `AdminUserServiceImpl.java:179` throws unmapped 500 `IllegalStateException`; `PasswordResetMailService.java:68-71` swallows exception cause/message (`BE/RULES.md` §1.4 & §4.1).
- **P2-21 (Refresh token reuse containment & `logoutAll`):** `AuthServiceImpl.java:224-227, 275-279` does not revoke all tokens on replay of a revoked refresh token, nor invalidate live access tokens on `logoutAll` (`tokensInvalidBefore`).
- **P2-22 (`GlobalExceptionHandler` bugs):** `:90` casts `ObjectError` directly to `FieldError` (`ClassCastException` → 500 on class-level validation); `:104-113` discards `HandlerMethodValidationException` error map; `:182-195` lets FK (`23503`), NOT NULL (`23502`), and CHECK (`23514`) violations fall through to 500.
- **P2-23 (`CourseManagerDashboardServiceImpl` & `DashboardServiceImpl`):** `CourseManagerDashboardServiceImpl:260, 268, 320, 336` rounds to 1 decimal before pass threshold check (`49.95%` counted as `PASSED`), risks `Set.of().contains(null)` NPE, and swallows JSON errors silently; `DashboardServiceImpl:34-70` counts `CANCELLED` enrollments, non-student enrollments, and unnormalized raw `AVG(totalScore)`.
- **P2-24 (Missing `@PreAuthorize`, prod Springdoc, dead matchers):** `DashboardController`, `ManagerUploadController`, `StudentUploadController`, `AdminSettingsService` omit `@PreAuthorize`; `application-prod.yml` leaves Swagger/OpenAPI publicly enabled; `SecurityConfig:69-70` has dead `/api/v1/courses*` `permitAll` matchers.
- **P2-25 (`CourseServiceImpl` delete/hide guards):** `deleteCourse()` (`:200-214`) omits `Deck`s and `isPublished`; `deleteModule()` (`:261-263`) omits `Deck`s; `deleteModule()`/`updateModuleStatus()` don't verify remaining visible modules contain content on published courses.
- **P2-26 (Enrollment & progress math bugs):** `EnrollmentRepository.findMyCourses`/`findStudents`/`countByCourses` include `CANCELLED` rows when `status == null`; `validateActiveEnrollment` blocks `COMPLETED` students and `enrollFree` resets them; `CourseProgressSummaryRepository.questionCompletions*` counts deleted/inactive questions so `qDone > qTotal` and unclamped ratios push module progress past 100%; `StudentProgressServiceImpl:302` / `ExamAttemptRepository:114-120` query invalid `'QUIZ'` mode instead of `'MATERIAL_QUIZ'`; `CourseRepository.findPublishedCourses` (`:98-100`) and `findMyCourses` (`:39`) overcount `CONTEST`/`PRACTICE` exams and private student decks.
- **P2-27 (`TemplateQuestionMapper` / `DocxTextExtractor` / `TemplateBlockParser` bugs):** `Boolean.parseBoolean` turns invalid `TRUE_FALSE` answers into `false`; `FILL_BLANK` containing `=` throws `NumberFormatException`; `normalizeLine` + no-space join corrupts `CODE_CONFIG`/`TEST_CASE`/`DIAGRAM_XML`; DOCX tables extracted out-of-order at document end; `^[A-Z]\.` parses `ESSAY`/`CODE` prompts as options; lowercase `ANSWER: a, b` matches 0 options; duplicate `MATCHING` keys throw `IllegalStateException`; `"APEPP —"` filter is dead while `"PART "` lines drop.
- **P2-28 (`DrawioNormalizer` resource & multi-page bugs):** `Inflater` lacks `try/finally` (native zlib memory leak on error/oversize); multi-page `<mxfile>` lacks total decompressed cap; shared `labels`/`edgeLabels` maps overwrite/collide across pages (`DrawioNormalizer.java:38-85, 172-191`).

### 5.3 Backend — Schema, Repositories, Payments, Contests, Decks, Reviews & Discussions

- **P2-29 (JPA schema drift):** `QuestionContribution.java:53-75` uses `columnDefinition = "jsonb"` vs PostgreSQL `json` (`V41`/`V53`); `SubscriptionPlan.java:46-52` lacks `nullable = false` & `@Builder.Default` on `featuresJson`/`featureKeysJson`; `Question.java:70` declares `creatorRole` `length = 20` vs `VARCHAR(10)`; `contests.status` DB default `'UPCOMING'` (`V4:515`) violates `V47` `chk_contest_status`, and `V44` mixes conditional `NOT NULL` `course_id` with `ON DELETE SET NULL`; `ModuleRepository:31-36` queries legacy `lessons` table missing from H2.
- **P2-30 (Repository JPQL/JPA/concurrency hazards):**
  - `UserDiscountRepository.findByUserAndFilters:36-39` (`REVOKED` misses `isUsed = false`, `EXPIRED` misses `deletedAt IS NULL AND isActive = true`, wrong `getStudentDiscountDetail` PK collision & missing pagination bounds).
  - `DeckRepository:43,51` and `QuestionContributionRepository:32..75` use `(:myCourseIds IS NULL OR c.courseId IN :myCourseIds)` (fragile in Hibernate 6 on Postgres/multi-element lists).
  - All 17 `@Modifying` repository queries omit `flushAutomatically = true` (risking stale Hibernate 1st-level cache / missed flushes).
  - `PaymentTransactionService.createPending:44-50` lacks `users.findForUpdate` / partial unique index, allowing concurrent checkouts by one user to double-use a public discount; `AdminDiscountService.update` lacks `@Version` / pessimistic lock.
  - Missing `ESCAPE '!'` / unescaped wildcards in `SubscriptionPlanRepository:29`, `UserDiscountRepository:54-55`, `StudentQuestionReviewRepository:75-76, 104-105`.
- **P2-31 (Payment & subscription edge cases):** `PaymentTransactionService:191-204` forfeits remaining days on same-plan renewal; 0-VND 100%-off discount passes `validateDiscount` then fails `doCheckout` with `409` (**[Open Decision #5](#9-open-policy-decisions-needed-before-execution)**); sequential `payosOrderCode = paymentId` risks sandbox collisions; `cancel()` on `EXPIRED`/`FAILED` returns fake `"CANCELLED"`; `reconcileWithProvider()` ignores PayOS `CANCELLED`.
- **P2-32 (Review & Flashcard import edge cases):** Resubmission limit (`resubmissionCount < 1`) un-enforced in `StudentContributionServiceImpl:241-316` and `StudentDeckService:258-280`; `ContributionReviewServiceImpl` skips `FOR UPDATE` lock & null `version`; raw `(String)` casts throw 500 `ClassCastException` in review controllers; `DeckReviewServiceImpl:266` (`courseId` vs `owner.id`); unvalidated `sortField` & paging in review lists; `DeckRepository.findBookmarkedDecks` omits course enrollment check; `StudentDeckService.update` keeps stale `module` on course move; `CardImportService` preview misses POI `RuntimeException` catch, row limit, and `@Valid`/`@Size` on `BulkSaveRequest`.
- **P2-33 (Discussion & Contest edge cases):** `escapeLikePattern` runs *before* `substring(0, 100)` (`ManagerDiscussionServiceImpl:187-190`, `StudentDiscussionServiceImpl:113-116` — trailing `'!'` causes PG 500); unlocked `commentCount`/`upvoteCount` increments; unvalidated `imageUrl` schemes; missing pagination bounds; `rejectDiscussion` retains `isPinned`; `ContestRewardPayer` sets `rewardClaimed = true` while `claimReward` lacks `@Valid` `rewardId` check & `ContestRules.issues(..., true)` omits `CLAIM_REQUIRED`.

### 5.4 Frontend — Packages, Contracts & Pages

- **P2-34 (`SubscriptionPackagesPage.tsx` & `adminSubscriptionPlan.service.ts`):** Omit BE `featureKeys` completely (`GET /admin/subscription-plans/feature-keys` unused). Pending [Open Decision #1](#9-open-policy-decisions-needed-before-execution).
- **P2-35 (`FE/package.json:19, 26`):** Legacy `@types/react-router-dom: ^5.3.3` conflicts with `react-router-dom: ^7.18.4`, and all 78+ files import undeclared `'react-router'` transitively.
- **P2-36 (`FE/src/app/routes.tsx:280-296`):** `publicExamPathFor` / `publicExamListPathFor` routes `ADMIN` to `/student/public-exam/...`, hitting `RequireRole(ROLE_STUDENT)` denial.
- **P2-37 (`ExamListPage.tsx:152-215` & `ManagerReviewPage.tsx:215-239`):** `ExamListPage` constructs `AbortController` without passing `signal` or checking `.aborted` (tab-switch race); `ManagerReviewPage` fans out `Promise.all(courses.map(getCourseStudents))` on every search keystroke.
- **P2-38 (`StudentQuestionNotebookPage.tsx` & `StudentCommunityPage.tsx`):** Notebook filter omits `"CODE"` and triggers un-debounced API calls per keystroke; `StudentCommunityPage:238` runs `.slice(-20)` dropping older comments upon reply and renders an empty filter card wrapper (`:98-108`) on `Tips`/`Announcements`.
- **P2-39 (`StudentExamResultPage.tsx` `OBS-BF06-02` & `PaymentCheckoutModal.tsx`):** Minor button overlap on ungraded essay header (`OBS-BF06-02`); 100%-off discount shows green `0 ₫` valid in modal then fails checkout with `409` (tied to **[Open Decision #5](#9-open-policy-decisions-needed-before-execution)**).

---

## 6. P3 — Low Findings (15)

1. **`DEF-BF03-05` Duplicate Exam Submit (`AttemptWriter.java:81-98` vs `defect.md:11-21`):** Intentionally idempotent (`200 OK`) vs QA test expecting `400 EXAM_ALREADY_SUBMITTED` — see [Open Decision #3](#9-open-policy-decisions-needed-before-execution).
2. **Unbounded `ExecutorService`s & Missing `@PreDestroy` Hooks:** `CodeAnswerJudge:52` & `AiCalls:19` use `newCachedThreadPool` without `@PreDestroy`; `PistonClient:97`, `QuizGenerationWorker:120`, `FlashcardGenerationWorker:105`, `PersonalizationService:94` omit `@PreDestroy`.
3. **`QuizGenerationWorker.callAi():241-245`:** Runs blocking 120s HTTP call on `ForkJoinPool.commonPool()` without `cancel(true)` instead of `AiCalls.complete(...)`.
4. **`StudentMaterialServiceImpl` Upload/Delete Races & Heap Amplification (`:135-140, 318-336`, `MaterialStorage:206`):** Concurrent uploads can exceed `MAX_MATERIALS = 50` without locking user row; delete vs generate lacks doc lock; base64-encoding 20 MB files creates ~27–54 MB strings.
5. **`ModulePracticeServiceImpl.result(includeQuestions=true)` (`:527-542`):** Returns up to 500 full questions bypassing `MAX_BATCH_QUESTION_IDS = 20`; stale Javadocs still say answer key is never returned.
6. **`RestAiClient.complete():101` & `ExamAiServiceImpl:109-111, 477-484`:** `Map.of("text", request.getPrompt())` NPEs on null prompt; manager AI quota lives in volatile process-local `HashMap` and doesn't refund on `503`/timeout.
7. **`SecurityConfig:47` & `CorsConfig:22-27`:** `.cors(cors -> cors.configure(http))` registers `CorsFilter` twice; `allowedOrigins.split(",")` doesn't trim spaces.
8. **Timezone Mismatch (`AdminDashboardServiceImpl:53` `systemDefault` vs `AdminUserServiceImpl:222` `UTC` vs `AiQuotaService:28` `Asia/Ho_Chi_Minh`):** 7-hour bucket skew on UTC servers.
9. **`JwtTokenProvider:24-36`:** Does not validate/cache `SecretKey` at startup (`WeakKeyException` deferred until first request).
10. **`UserController.uploadAvatar():47-55`:** Controller calls `MaterialStorage.storeImage` directly (`RULES.md` §3.1) and overwrites Cloudinary avatar before DB commit.
11. **Main-Classpath Hygiene & `AdminSettingsService` Naming:** `BE/src/main/java/com/examprep/PasswordHashTest.java` is dead code with `"Password123!"`; `BE/data/materials/*.docx` and `BE/uploads/documents/*.pdf` are tracked in Git; `AdminSettingsService` lacks interface/`Impl` split (`RULES.md` §3.2).
12. **Contest & Notebook/PDF Minor Bugs:** `ManagerContestService:279` unboxes nullable `exam.durationMinutes` (NPE) and `:136-142` forgets to clear `reminderSentAt` on reschedule; `QuestionReviewRecorder:47-71` can collide on `UNIQUE(student_id, question_id)`; `FlashcardPdfWriter:249` collapses leading spaces in `codeBody`; `PaymentServiceImpl` uses `findAvailable` in `validateDiscount` (accepts inactive plans) and returns `isCurrent = false` for Free Plan; `PayosClient.canonical:113` doesn't normalize `"null"`/`"undefined"` strings.
13. **Dead Repository / Service / Query Items:** `DeckBookmarkRepository:35-39`, duplicate `DiscussionRepository.findAllDiscussions`, `QuestionRepository.findActiveIdsByCriteria:48-56`, `Question.status` entity default (`"INACTIVE"`) vs DB default (`'ACTIVE'`), `AdminDiscountService.list` in-memory `validity` slice.
14. **FE `StudentContestsPage.tsx:962, 1151, 1160`:** `REWARDED` contests with 0 entries display `"Leaderboard opens after the contest"`; unescaped `contest.bannerUrl` interpolated inside CSS `url("...")`.
15. **FE Dead Mock Code:** `FE/src/services/exam.service.ts:717-970` (`getMock*` unused) and unlinked fixture pages in `FE/src/features/public-exam/*`.

---

## 7. Test Suite Root-Cause Classification (H2 & PostgreSQL Profiles)

### 7.1 H2 Default Profile (`mvn test`)

| Test Class & Case | Status at `9895c83` | Classification | Exact Cause & Fix |
|---|---|---|---|
| `ManagerContestApiIntegrationTest` (previously 7 failures) | **PASSING (12/12)** | Already Fixed | Fixed in commit `a79f9234` (`.accessType("CLAIM_REQUIRED")` + English duration message). |
| `StudentCourseApiIntegrationTest` (`getModuleContent_General_ReturnsOk`, `getModuleContent_NumericModule_ReturnsOk`) | **FAILING (2)** | **REAL PROD BUG** | `P0-12`: `DeckRepository.java:135` changed to `AND d.visibility = 'PUBLIC'` while `DeckServiceImpl` leaves `visibility = 'PRIVATE'`. |
| `StudentDeckApiIntegrationTest.listCourseShowsOnlyDecksWithLearnedCountAtLeastOne:381` | **FAILING (1)** | **STALE TEST** | Commit `777fe370` removed the `learnedCount >= 1` filter from `DeckRepository.COURSE_DECKS` (`:88-92`) without updating this test. |
| `StudentDeckApiIntegrationTest.managerListsStudentContributedDecksAtTheDeckListEndpoint:239` | **FAILING (1)** | **STALE TEST** | Commit `aa6edb85` changed `DeckReviewServiceImpl.courseSummary()` (`:264-267`) from `course.id` to `course.courseId` without updating line 239. |
| `StudentAiApiIntegrationTest.sweepFailsStuckGradingAndRefundsExpiredReservations:398` | **FAILING (1)** | **FLAKY STALE TEST** | Commit `8f1fc3a2` raised `EssayGradingWorker.sweep()` cutoff from 120s to 300s while test line 389 still creates `now().minus(5, MINUTES)` against strict `< :cutoff` (0 ms race). Update to `minus(6, MINUTES)`. |
| `DiscountDiagnosticTest`, `AttemptAnswerMappingTest`, `EntitySchemaMatchIT`, `EntitySchemaSyncIT`, `PostMigrationCheckTest`, `PreMigrationCheckTest` (+ `SupabaseSchemaExportTest`) | **ERROR (6–7)** | **BROKEN TEST CONFIG** | `AbstractPostgresIT.java:6-8` & `SupabaseSchemaExportTest` unconditionally enable `postgres-test` without `@EnabledIfSystemProperty(named = "postgresTests", matches = "true")` (and `SupabaseSchemaExportTest` mutates tracked `BE/docs/db/supabase-schema.csv`). Also `AttemptAnswerMappingTest` omits required `Course.categoryId`/`slug` and uses retired `"FIXED"`. |

### 7.2 PostgreSQL Profile (`-DpostgresTests=true`) — All 6 Pre-Existing Errors (+ 1 Port Bug)

All 6 errors are **stale/broken test fixtures** (none is a production bug):

1. `DeckApiIntegrationTest.java:185, 187` (`DeckPostgresIntegrationTest`) — writes `"MASTERED"` into `user_card_progress.status`, violating `V42` `chk_ucp_status IN ('NEW','LEARNING','KNOWN')`. Fix: `"KNOWN"`.
2. `DeckApiIntegrationTest.java:257, 261` (`DeckPostgresIntegrationTest`) — same `"MASTERED"` fixture violation. Fix: `"KNOWN"`.
3. `DeckApiIntegrationTest.java:529` (`DeckPostgresIntegrationTest`) — writes `"LEARNED"`, violating `chk_ucp_status`. Fix: `"KNOWN"`.
4. `ExamApiIntegrationTest.java:192` (`ExamPostgresIntegrationTest`) — sets `q.setSourceDocumentId(424242L)` with no `Document` row, violating `V10` FK `questions_source_document_id_fkey`. Fix: persist a `Document` fixture.
5. `ExamPostgresIntegrationTest.java:18-27` (`rubricAndMetadataRoundTripAsJsonb`) — queries removed `totalPoints` JSON key from `ExamRequests.Rubric(criteria, notes)` and NPEs on `.intValue()`. Fix: assert `criteria[0].weight` / `notes`.
6. `ManagerCoursePostgresIntegrationTest.java:63, 67` — raw SQL `INSERT INTO exams` omits `max_score` (`NOT NULL`, `V25:34`) and `INSERT INTO exam_attempts` omits `deadline_at` (`NOT NULL`, `V33:31`). Fix: supply `max_score` and `deadline_at`.
7. **Bonus (`DatabaseAlignmentMigrationTest.java:16-23`):** Hardcodes `127.0.0.1:55439` (`examprep_test`) instead of reading standard `localhost:5433` test DB properties.

---

## 8. Phased Remediation Roadmap (Waves 0–6) & Verification Plan

| Wave | Target Scope | Key Deliverables |
|---|---|---|
| **Wave 0** | Schema & Entities | Additive `V98__audit_schema_and_constraint_fixes.sql` (`questions.source` CHECK + `'ACCEPTED'` backfill, `discounts."value"` DROP NOT NULL, DROP `discounts_code_key`, widen scores to `NUMERIC(8,2)`, backfill manager deck `visibility`, `contests.status` default `'DRAFT'`, `uq_payments_user_discount_pending`, `users.tokens_invalid_before`) + entity precision/`json`/nullable alignment. |
| **Wave 1** | Security, Auth, RBAC, Config | `QuestionServiceImpl` IDOR (`P0-01`), `QuestionIssueService` (`P0-03`), `StudentNotebookServiceImpl` (`P0-04`), `CardImportService` (`P0-05`), `AuthServiceImpl` OAuth link/PII/SMTP/policy (`P0-06`, `P1-03`, `P1-04`), `JwtAuthenticationFilter` live role & `iat` (`P1-01`, `P1-02`), `CorsConfig` headers (`P1-05`), upload limits, `GlobalExceptionHandler`, `QuestionAccessPolicy`, prod Springdoc off. |
| **Wave 2** | Core Domain Integrity | `QuestionServiceImpl` `isCorrect` & XSS & delete/status (`P0-02`, `P1-08`, `P1-15`), private material leak fixes (`P0-11`), `ManagerExamServiceImpl` & `StudentExamServiceImpl` & `QuestionRegrader` (`P1-12`..`P1-16`), `QuestionPromotionService` + reviews + links (`P0-08`, `P1-26`), `PayosWebhook`/`Payment`/`Discount`/`AdminUser` (`P0-07`, `P0-09`, `P0-10`, `P1-19`..`P1-22`), `Contest` (`P0-13`, `P1-23`, `P1-24`), `Deck` & `Discussion` (`P0-12`, `P1-27`, `P1-30`), `Notebook` (`P1-28`). |
| **Wave 3** | Concurrency, Workers, Scheduler & Quota | `ExamAiServiceImpl` non-TX AI (`P0-14`), `AttemptAutoSubmitter` scheduler offload & `codeJudgingToken` lock (`P0-15`, `P0-16`), `AiUsageLogRepository`/`QuizGenerationWorker`/`PersonalizationService` quota & sweep (`P0-17`), `DocumentRepository` material filter (`P1-17`), `EssayGradingWorker` rounding (`P1-11`), `ModulePracticeGradingWorker` queue drain (`P1-18`), attempt/validator edge fixes (`P2-07`..`P2-15`). |
| **Wave 4** | Frontend Build, Contracts, Timer & UX | Fix both `tsc` errors (`P0-19`), Material Quiz `takeAs` (`P0-18`), exam timer clock drift (`P1-32`), `<Button loading>` disable (`P1-33`), `questionIssue.service` unwrap (`P1-34`), auth redirects & timeout (`P1-35`), StrictMode learn session (`P1-36`), `Idempotency-Key` on `SA-01`, notification normalizer, and Wave 4 P2 cleanups. |
| **Wave 5** | Dashboards, Progress, Importers & PDFs | `AdminDashboardServiceImpl` range bounds (`P1-07`), `DocxTextExtractor` zip bomb & `QuestionImportServiceImpl` (`P1-09`), `QuestionNotebookPdfWriter` (`P1-29`), `CourseServiceImpl` delete guards & progress/catalog math (`P2-25`, `P2-26`), `TemplateQuestionMapper`, `DrawioNormalizer`, repo query/lock hardening. |
| **Wave 6** | Test Greening & Regression Suite | Gate `AbstractPostgresIT` & `SupabaseSchemaExportTest`, fix all stale H2 & 6 PostgreSQL test fixtures, and add automated regression tests for every P0 & P1 defect. |

### Automated Verification Commands (Post-Remediation)
```powershell
# 1. Frontend TypeScript + Production Bundle
Set-Location FE
npx tsc --noEmit
npm run build

# 2. Backend H2 Suite (0 failures, 0 errors, clean git status)
Set-Location ..\BE
mvn -B test

# 3. Backend Fresh PostgreSQL Migration (V1..V98) & Integration Tests
mvn -B test -DpostgresTests=true
```

---

## 9. Open Policy Decisions Needed Before Execution

1. **Subscription Feature-Key Gating (`06dfa66` vs `V92`):** **(A)** Restore `PlanEntitlementService` checks on the 7 endpoints + Admin UI checkboxes, or **(B)** keep token-limit-only pricing and deprecate/hide unused `featureKeys`?
2. **Admin Mock/Placebo Pages (`AnalyticsPage`, `AuditLogsPage`, `SystemSettingsPage`):** **(A)** Hide `Analytics`/`Audit Logs` from the prod sidebar (or badge `"Demo data"` + disable dead controls), or **(B)** implement real BE analytics/audit endpoints and wire `system_settings` into runtime BE checks?
3. **Duplicate Exam Submit (`DEF-BF03-05`):** Keep idempotent `200 OK` (update test case `ST-BF03-50`) OR return `400 EXAM_ALREADY_SUBMITTED`?
4. **Exam `passMark` (`DEF-BF06-02`):** Add `pass_mark` persistence in `V98` + DTOs OR keep deprecated/ignored?
5. **100%-Off / Zero-VND Discounts (`PY-05` vs `PY-01`):** **(A)** Reject discounts reducing `finalAmount <= 0` (or `< 2,000` VND) during `PY-05` validation, or **(B)** support instant free fulfillment bypassing PayOS when `finalAmount == 0`?
6. **Remediation Scope:** Execute **all Waves (0–6: P0–P3 + tests)** or **P0 + P1 + build/test fixes first**?
