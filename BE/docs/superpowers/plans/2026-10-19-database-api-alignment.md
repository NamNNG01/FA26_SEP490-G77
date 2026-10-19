# Database and API Alignment Implementation Plan

> Execute inline with superpowers:executing-plans. The user approved the fixes and database alignment after the read-only review.

**Goal:** Make Long's implemented APIs consistent with the specification and the shared PostgreSQL schema, preserving applied migration history.

**Architecture:** Keep the current controllers/services/repositories. Use JSON JDBC mappings and existing HTTP integration tests. Obtain original applied SQL before changing migration lineage; never invent matching checksums, repair history, or disable Flyway validation.

**Tech Stack:** Java 17+, Spring Boot, Hibernate, Flyway, H2 and isolated PostgreSQL 16.

**Spec:** `BE/chiacodeinter1.md`; findings and approval in the current conversation.

## Constraints and decisions

- Work in the current feature checkout: the implementation being fixed includes uncommitted files here. Preserve unrelated changes and `.env`.
- Shared DB reads only. All writes and migration experiments use the disposable localhost test database.
- Preserve V1-V8. Shared DB has V9-V16 absent from fetched branches; local V9 and V10 collide with applied versions.
- Do not fabricate the missing historical scripts or rewrite shared history. Ask for their source while implementing independent fixes.
- Keep the existing safe dependency blocks for C-09/C-13; detaching content changes ownership and requires a separate business decision.
- Incomplete drafts remain editable; publishing validates the complete generation mode.
- No new dependencies or real AI provider calls.

## Review focus

- Valid MULTI_CHOICE/FILL_BLANK random configs must round-trip.
- Invalid STATIC/RANDOM/MIXED combinations must not publish.
- Moving an exam cannot leave module configs scoped to its former course.
- JSON rubric insertion and updates must work with PostgreSQL JSONB and preserve object structure.
- New migrations must validate on fresh databases and upgrades without altering applied versions.

## Tasks

1. [ ] Recover original V9-V16 from Git refs/PRs or another verifiable source; compare against DB checksums. Record remaining blockers explicitly.
2. [x] Add regression tests for canonical question types, invalid publish mode, retained config modules, and PostgreSQL rubric JSON round-trip; run RED.
3. [x] Fix the shared service validation and JSON mapping; run focused tests and the full H2 suite GREEN.
4. [ ] Reconcile migration numbering and add only required forward schema changes once history is recovered. Test a fresh DB and an upgrade fixture with PostgreSQL/Flyway validation.
5. [x] Run the full backend suite including PostgreSQL, review the diff and document concrete results and any unresolved source requirement.

## Execution ledger

- Initial evidence: original suite 238 passed; extra PostgreSQL probes had four failing cases; a JSONB-column probe failed with SQLState 42804. Shared Flyway validation reported checksum mismatches at V9 and V10.
- Ruling: no extra worktree; copying/stashing the unrelated in-progress implementation would add risk. No commits or pushes unless requested.
- Source search: fetched all 16 GitHub PR heads, inspected all fetched branches, stashes, local SQL files and the previous packaged JAR. None contains the shared V9-V16 originals. The database stores only Flyway history; no public Supabase SQL migration source exists. User was asked asynchronously for the original source.
- RED: Exam HTTP tests failed in H2 and PostgreSQL on canonical question types, retained foreign config modules and invalid publish mode; PostgreSQL rubric API returned 500. Upgrade fixture failed because MULTIPLE_CHOICE was not normalized.
- GREEN: focused migration + H2/PostgreSQL exam run: 36 tests, zero failures/errors/skips.
- Ruling: reserve V17 for JSON/domain alignment, V18 for categories and V19 for dependency protection. Only the feature's V9/V10 are renumbered; V1-V8 remain unchanged. Their old versions have never been applied to the shared DB. Disposable old test databases must be recreated.
- Migration history recovery remains required: renumbering avoids collisions but cannot replace the missing applied V9-V16 originals. Do not repair history or disable validation to conceal this.
- Final local verification: `mvn -o -DpostgresTests=true test`: 281 tests passed, zero failures/errors/skips. Fresh PostgreSQL validates V1-V8 and V17-V19; the separate V8 upgrade fixture preserves JSON and normalizes legacy values. `git diff --check` passes, and V1-V8 match origin/main byte-for-byte.
- Independent read-only reviewer found no new correctness/data-loss/regression issues in this turn's scoped changes. The missing shared V9-V16 definitions remain the deployment blocker.
- No shared DB writes, Flyway repair, real AI calls, commits, pushes or frontend changes were performed during this fix turn.

Applied history to recover (checksums read from the shared database, not reconstructed SQL):

| Version | Original script | Checksum |
|---|---|---:|
| 9 | V9__ai_usage_logs.sql | 272848497 |
| 10 | V10__questions_updates.sql | 36963702 |
| 11 | V11__question_media_and_reviews.sql | 41921830 |
| 12 | V12__attempts_and_regrade_logs.sql | -1026876776 |
| 13 | V13__exams_updates.sql | 1021631192 |
| 14 | V14__add_question_creator.sql | 1208244515 |
| 15 | V15__add_document_course.sql | -274678117 |
| 16 | V16__add_exam_config_seed.sql | 2054019818 |
