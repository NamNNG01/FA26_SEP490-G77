# Audit remediation report

Every confirmed finding in [AUDIT_PLAN.md](AUDIT_PLAN.md) is fixed on `Khai` (baseline `eaac599`), plus the
two test issues and the two dependency advisories. Each section states the fix, the files, and how it was
verified. Verification commands and their results are at the end.

Backend baseline is unchanged otherwise: the 6 errors in the Postgres test profile that remain are proven
pre-existing by running the same classes on a pristine worktree of `eaac599` (same 6 errors, same classes).

## P0 - Fresh database startup fails - FIXED

A versioned migration now sets the pooled-sequence increments the entity mapping demands, and the
test-only callback that masked the mismatch was deleted.

- `BE/src/main/resources/db/migration/V89__question_answer_sequence_allocation.sql` (new):
  `ALTER SEQUENCE questions_question_id_seq INCREMENT BY 50` and the same for
  `answer_options_option_id_seq`, each followed by `setval(max(id), true)` so the next pooled block
  starts above the current maximum. `exam_questions` was already fixed by V30.
- `BE/src/test/resources/db/postgres-test/afterMigrate.sql`: deleted. The `postgres-test` Flyway
  locations still include `db/postgres-test`; with no callback there, tests now exercise exactly the
  application migrations a fresh deployment runs.

Verification: a freshly created PostgreSQL 14.10 database (zonky embedded binaries shipped with the
project) migrated with the application migrations alone, and the Spring context started - Flyway applied
89 scripts and Hibernate's `ddl-auto: validate` passed. `pg_sequence` reports `increment=50` for
`questions_question_id_seq`, `answer_options_option_id_seq` and `exam_questions_exam_question_id_seq`.
Before the fix the first two were `1` and Hibernate refused to start (that is what the deleted callback
worked around).

## P0 - Timed exams accepted late answers - FIXED

- `BE/src/main/java/com/examprep/services/AttemptWriter.java`: SA-04 (`submit`) now checks
  `AttemptAutoSubmitter.isExpired` before applying the request body. Past `deadlineAt + 5s` the attempt is
  closed with only what was stored as a draft; a late submit still answers with the graded result marked
  `autoSubmitted`, it just never awards points for answers that arrived after the deadline. Within the
  5-second grace the answers still count, exactly like SA-03 draft saves.
- Regression test: `StudentAttemptControllerTest.answersSentAfterTheDeadlineAreNeverAppliedOrAwarded`
  posts two correct answers two minutes late and asserts `200`, `autoSubmitted=true`, `totalScore=0.00`
  and that the answer row is still empty (the previous behaviour scored 6.00).

## P1 - A perfect score could exceed or fall short of the maximum - FIXED

- `BE/src/main/java/com/examprep/util/attempt/AttemptScoring.java`: new `questionPointsExact` computes
  `P_q` at 12 digits and `contribution` re-derives the exact `P_q` of any answer that earned its whole
  question. `questionMaxPoints` is now the same product rounded to the 4-digit internal scale (identical
  to the AI worker's own formula).
- `BE/src/main/java/com/examprep/services/AttemptAutoSubmitter.java`: the grader receives the unrounded
  `P_q`; the per-answer column keeps its 2 digits while the running total sums the unrounded values, and
  only the total is rounded once. Answers already scored by CD-05 (code) or the AI worker contribute
  their exact `P_q` when they took the whole question instead of the stored 2-digit value.
- `BE/src/main/java/com/examprep/services/EssayGradingWorker.java` and
  `BE/src/main/java/com/examprep/services/QuestionRegrader.java`: when those paths recompute an attempt
  total, they sum the same `contribution` values, so a perfect paper stays at exactly `maxScore`.
- Regression tests: `StudentAttemptControllerTest.aPerfectScoreNeverExceedsOrFallsShortOfTheMaximum`
  (three equal questions used to total `9.99`, six used to total `10.02`, both now `10.00`) and
  `StudentCodeExamApiIntegrationTest.aPaperWithEveryAnswerCorrectTotalsExactlyTheMaximum` (two CD-05 code
  answers at stored `3.33` plus one quiz answer now total exactly `10.00`).

## P1 - Rejected exam drafts were treated as saved - FIXED

- `FE/src/features/student/pages/StudentTakeExamPage.tsx`: an SA-03 `rejected` entry no longer counts as
  done. Only entries that came back in `saved` leave the dirty set; rejected answers stay dirty (the next
  autosave or flush retries them), and a warning banner names the affected questions with the server's
  detail ("Not saved: Question 3 (...). Retrying automatically - edit the answer or keep this tab open
  until it saves."). `saveState` no longer reports "all changes saved" while a rejection is pending.

## P1 - Anonymous discussions exposed the author, posts could go to the wrong course, tags were ignored - FIXED

- Identity: `DiscussionItemDto.AuthorDto.of(User, boolean)` masks an anonymous author completely -
  `userId`, `avatarUrl` and `role` are omitted (the response maps them to `null`, and the global
  `non_null` inclusion drops them), only `displayName` ("Hoc sinh an danh") remains and the caller's own
  `isAuthor` / `isAnonymous` flags still tell the writer apart. Used by both
  `StudentDiscussionServiceImpl` and `ManagerDiscussionServiceImpl` for posts, details and comments.
- Course and tag: `Discussion` maps the `tag` column (V49) again, `CreateDiscussionRequestDto` carries
  `courseId` and `tag`, and `StudentDiscussionServiceImpl.createDiscussion` looks up the requested course,
  requires an active enrolment there (or a manager/admin role for that course), refuses announcements from
  students, rejects unknown tags and stores the tag. The client-supplied course is never silently replaced
  by "whichever enrolment comes first".
- Listing: `DiscussionRepository.findDiscussions` filters by tag again (null tag = every tag, search is
  null-safe) and `listTips` filters `tag = tip`; `DiscussionItemDto` and student/manager detail DTOs
  return the tag. The student controller accepts `tag` on `GET /student/discussions`, which the frontend
  already sends for its Discussions / Announcements tabs.
- Tests: the two discussion unit test classes compile and pass again (they are the classes the audit found
  broken); `StudentV2FeaturesApiIntegrationTest` was brought in line with the moderation rule (a pending
  post is not in the public list; the manager approves it first, then it is listed and commentable) and a
  new `anonymousPostsAndCommentsNeverExposeTheirAuthor` test asserts no `userId`/`role`/avatar leaks
  through the list, the detail or the comment author.

## P1 - Coding exam history exposed hidden test inputs - FIXED

- `BE/src/main/java/com/examprep/services/StudentCodeExamServiceImpl.java`: a hidden fixture in CD-07
  history now reports only `passed`/`failed` (plus case id/order). Its input, its expected output and the
  program's stdout are never returned - stdout too, because a program that echoes stdin would otherwise
  write the hidden input back into the response that the still-open attempt can inspect.
  Public fixtures keep the previous behaviour (input always, expected output only when passed).
- Test: `StudentCodeExamApiIntegrationTest.submissionsHistoryIsOwnerScopedNewestFirstAndPaged` now asserts
  the redaction instead of the old leak.

## P1 - Admin controls reported actions they never performed - FIXED

- **Admin System Settings now persists.** New backend: `V90__system_settings.sql` (one JSONB document per
  key), `SystemSetting` entity, `SystemSettingRepository`, `AdminSettingsService` (validates a JSON object,
  caps it at 64 KiB) and `AdminSettingsController` (`GET`/`PUT /api/v1/admin/settings`, admin only).
  `FE/src/services/systemSettings.service.ts` + `SystemSettingsPage.tsx` now load the stored document,
  merge it over the defaults, and the "Save Changes" banner appears only after `PUT` succeeds ("Settings
  saved successfully.") with an error alert on failure. The fake maintenance actions and the fabricated
  backup history are removed; the section now says those operations are run by the deployment environment
  instead of pretending. Covered by `AdminSettingsApiIntegrationTest` (round trip, non-object -> 400,
  non-admin -> 403).
- **Admin Users list and detail are real now.** `FE/src/services/adminUser.service.ts` wraps UM-01..UM-05;
  `UsersPage.tsx` loads server-paginated/filtered data with debounced search and drives its counters from
  the API's stats, and row actions call the API (reset password, activate/deactivate) with toasts.
  `UserDetailPage.tsx` fetches the `:userId` and renders a "User not found" state on 404 - it can no longer
  fall back to a demo account; Edit (PUT), Reset Password and Activate/Deactivate are wired. The mock
  fixtures (`features/admin/mockUsers.ts`) were deleted; the list-state singleton moved to
  `features/admin/userListState.ts`. The rows' "Average Score (pts)" and "Score (pts)" are labelled as raw
  points because the API does not return a max score, and the unusable student-only "View Result" link was
  removed.
- The Course Manager dashboard already carried a "Demo data" badge; its false "figures update in real
  time" line was replaced with "Demo figures - not live data yet". The public practice-exam screens are
  now badged "Demo data" and their dead actions (start/continue/retake that navigated to an empty exam
  screen) are disabled with an explanation that nothing leaves the browser. The manager "Save" toast says
  the change is session-only.

## P1 - Both normal verification commands had failures - FIXED

- `mvn test-compile` is green again: the discussion work restored the API those two test classes use, so
  all eight `cannot find symbol` / signature errors are gone (`StudentDiscussionServiceTest` 6 tests pass,
  `ManagerDiscussionServiceTest` 10 tests pass).
- `tsc --noEmit` is green: `FE/src/services/studentProgress.service.ts`'s `query()` helper accepts plain
  named-parameter objects (`object` instead of an index-signature type), fixing `TS2345` in
  `exportSavedQuestionsPdf`. Vite production build still passes.

## P1 (audit addendum) - The AI retry test and the dependency advisories

- The backend test subset was rerun in isolation; no test that expects a successful AI retry returns 504.
  The only 504s in the suite are the deliberate `ExamAiApiIntegrationTest` timeout cases
  (`status().isGatewayTimeout()` for the provider-timeout path). Full-suite result is recorded below.
- Dependencies: `FE/package.json` pins `overrides` for `dompurify` (>= 3.4.16, GHSA-6688-9rhm-gjv2) and
  `follow-redirects` (>= 1.16.2, GHSA-mrwp-f3q8-3g9p). Both lockfiles were regenerated
  (`package-lock.json` via npm, `pnpm-lock.yaml` via pnpm lockfile-only) and now resolve
  `dompurify@3.4.18` and `follow-redirects@1.16.3`. `npm audit fix` additionally moved `vite` to 8.3.8 and
  `source-map-js` to 1.2.2 (high-severity dev-chain advisories); four moderate advisories remain in
  `nodemon > minimatch` (dev-only tooling) and `exceljs > uuid` (`uuid < 11.1.1`, only fixable by a
  breaking `exceljs` downgrade that `npm audit` itself flags). Neither is reachable from the shipped
  bundle's request path; no application exploit was established, matching the audit's own note.

## P2 - The shared dialog had no accessible name - FIXED

- `FE/src/components/ui/Modal.tsx`: the dialog now names itself with `aria-labelledby` pointing at the
  heading's generated `id` (React `useId`), so assistive tech announces "dialog: <title>". Verified by
  type-check and review; a fresh Chromium accessibility-tree run was not part of this pass.

## Verification

Backend (JDK 17, Maven 3.9.8, offline against the local repository):

- `mvn -B test-compile` - BUILD SUCCESS (was 8 errors in 2 classes).
- Targeted suites: `StudentAttemptControllerTest` 51/51, `StudentCodeExamApiIntegrationTest` 12/12,
  `StudentV2FeaturesApiIntegrationTest` 4/4, `StudentDiscussionServiceTest` 6/6,
  `ManagerDiscussionServiceTest` 10/10, `AttemptScoringTest` 7/7, `AdminSettingsApiIntegrationTest` 2/2.
- Full H2 suite (`mvn -B test`): **1101 tests, 1091 pass, 9 fail + 1 error, 105 skipped**. Every one of the
  10 non-passing tests was reproduced identically on a pristine `eaac599` worktree, or passes in isolation
  on the patched tree, so none is a regression:
  - `ManagerContestApiIntegrationTest` (7), `StudentDeckApiIntegrationTest` (1),
    `AttemptAnswerMappingTest` (1) - byte-identical failures on the baseline (same tests, same assertions).
  - `StudentAiApiIntegrationTest.sweepFailsStuckGradingAndRefundsExpiredReservations` - passes 22/22 in
    isolation on the patched tree; the failure only appears in the full-run ordering. This is the AI test
    the audit asked to rerun in isolation: no 504, no product defect.
- Fresh PostgreSQL verification (disposable embedded PG 14.10, empty database, final test config with
  `locations: classpath:db/migration` only): `MakeDb` dropped and recreated the database, Flyway applied
  89 migrations and Hibernate `ddl-auto: validate` passed - the context started, which is precisely what
  the audit found impossible before the fix. `pg_sequence` reports `increment=50` for
  `questions_question_id_seq`, `answer_options_option_id_seq` and `exam_questions_exam_question_id_seq`.
  `StudentAttemptConcurrencyPostgresTest` 2/2 and `ExamPostgresIntegrationTest` 38 tests with only its two
  known pre-existing errors (see below). Wider Postgres-profile run: 105 tests, 0 failures, 6 errors - the
  same 6 errors appear on the pristine baseline worktree (92 tests, 6 errors): two deck tests trip a
  `chk_ucp_status` check constraint, one exam test hits a `questions.source_document_id` foreign key, one
  rubric round-trip query reads null, and one manager-course raw-delete test inserts a null `max_score`.
  They only run with `-DpostgresTests=true` and are unrelated to this work.

Frontend (Node 22, npm 10, pnpm 10.17):

- `node_modules/.bin/tsc --noEmit` - clean (was `TS2345`).
- `npm run build` - success (`dist/assets/index-*.js` ~1.73 MB, only the pre-existing chunk-size warning).
- `npm ls dompurify follow-redirects` - `3.4.18` / `1.16.3`, both marked `overridden`; `npm audit` no
  longer reports either advisory.

Note: running the full backend suite rewrites the tracked `BE/docs/db/supabase-schema.csv` via
`SupabaseSchemaExportTest` with environment-specific introspection output (defaults, sequence names). That
side effect predates this work; the file was restored to its committed content and was not part of any
fix.

Marked **unverified** in this pass (unchanged from the audit plan): the wider QA matrix of the audit's
"Remaining verification" sections 2-4 - two-user/two-course route sweeps, contest ranking races, payments
and provider stubs, upload limits, webhook replay, mobile layout and keyboard navigation - and live
provider behaviour. The fixes above were verified per finding; those end-to-end sweeps still need their own
run.
