# Manager Course API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement C-04–C-14 and PUB-01 with consistent ownership and safe deletion.

**Architecture:** Keep controllers → services → repositories and dedicated DTOs. Reuse JWT, ApiResponse and the existing schema; add restrictive foreign keys where cascades could destroy content or learning history.

**Tech Stack:** Java 17+, Spring Boot 3.3.4, Spring Data JPA, PostgreSQL/Flyway, JUnit/MockMvc/H2.

**Spec:** `function.md`; approved backend decisions are recorded in `docs/manager-course-api.md`.

## Global Constraints

- No frontend changes or new runtime dependencies.
- Preserve unrelated changes, including `.env.example`; never commit credentials.
- ADMIN creates/publishes/deletes courses. ADMIN or a primary/assigned COURSE_MANAGER reads/edits course content.
- Preserve ApiResponse and its omission of null fields; errors use HTTP status plus message.
- Block destructive deletes when dependent content exists. Never edit applied migrations.
- Execute in the current checkout on a feature branch; the user authorized implementation and push.

## Review Focus

- Additional managers see identical scope in lists, details, students and dashboard; no double counting.
- Transferring the primary manager revokes their assignment while preserving other collaborators.
- Concurrent append/delete/publish/transfer operations cannot bypass ownership or delete learning data.
- A 255-character or non-Latin title creates a valid bounded unique slug; edits keep it unchanged.
- Invalid paging, sorting, prices and blank titles produce 400, never 500 or unbounded queries.

### Task 1: Contract and regression tests

**Files:** `function.md`, `docs/manager-course-api.md`, `src/test/java/com/examprep/controllers/ManagerCourseApiIntegrationTest.java`.
**Interfaces:** Exercise HTTP routes with real services/repositories using MockMvc, not service mocks.

- [x] Write approved contract, including null/empty update semantics, permission and deletion rules.
- [x] Write tests for list/details/modules/students/categories, roles, assignment/transfer, create/update/publish/delete and invalid inputs.
- [x] Run `mvn -o -Dtest=ManagerCourseApiIntegrationTest test`; expected missing routes and old dashboard scope failures.

### Task 2: Implement API and shared ownership queries

**Files:** DTOs, `CourseService`/`CourseServiceImpl`, manager/category controllers, relevant repositories and dashboard queries.
**Interfaces:** `CourseService` provides typed responses for all HTTP operations; existing dashboard repository method signatures stay unchanged.

- [x] Add DTOs, validation, filtered/paged/batched reads and consistent primary-or-assigned ownership.
- [x] Add transactional writes, bounded ID-based slug, transfer synchronization and content deletion guards.
- [x] Lock parent courses for writes to serialize module ordering, publish and assignment changes.
- [x] Run focused tests, then `mvn -o test`; expected all tests pass.

### Task 3: PostgreSQL protections and verification

**Files:** `src/main/resources/db/migration/V9__protect_course_content_deletion.sql`, PostgreSQL integration test profile, README/ARCHITECTURE links.
**Interfaces:** PostgreSQL tests use isolated local database only; never run migrations against shared Supabase as a verification step.

- [x] Add RESTRICT constraints to prevent cascades bypassing service deletion guards.
- [x] Validate fresh migrations and actual FK deletion protection on PostgreSQL when a local instance can be provisioned.
- [x] Run a fresh-context final review and address material findings with regression tests.
- [x] Record verification and limits in docs, commit only task files, push feature branch, report remote link.
