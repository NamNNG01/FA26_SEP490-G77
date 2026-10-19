# Course/module backend handover

Authoritative contract: [function.md](../function.md). Implements C-04–C-14 and PUB-01, with no frontend changes.

Published implementation: commit `7326307` on [`feat/manager-course-api`](https://github.com/NamNNG01/FA26_SEP490-G77/tree/feat/manager-course-api/BE). This feature branch is ready for integration; it has not been merged into main or deployed to Supabase.

## Architecture

Controllers consume validated DTOs and delegate to CourseService. CourseServiceImpl owns transactions and business rules. Repositories implement scoped/paged reads and grouped counts. Entities never appear in API responses.

Primary-manager OR assigned-manager ownership applies everywhere including dashboard. EXISTS avoids double counting when primary and assignment both match or historical duplicate assignments exist. Admin-only operations also have method-security guards.

Mutations lock the parent course before checking current ownership, then lock the module if needed. Future module writers must follow this lock order for append/publish consistency. Future content writers must enforce ownership and respect protective foreign keys.

## Decisions

- DELETE refuses dependent content instead of detaching questions or deleting exams/history; completed enrollments count too.
- Question groups are protected because course/module may be their only ownership link.
- Legacy lessons are also protected by the database; deleting a module/course with lessons returns 409 rather than silently cascading them away.
- V9 replaces destructive foreign-key actions with RESTRICT, without rewriting data. Apply via Flyway; never edit V1–V8.
- Temporary unique slugs satisfy NOT NULL before the identity ID exists. Final slug fits 255 characters; empty transliterations fall back to `course`.
- Keep existing null omission and error envelope. Clients use HTTP status/message, not a nonexistent JSON code.
- Integer request fields reject fractional JSON numbers rather than letting Jackson silently truncate IDs or module positions. Existing auth/profile request DTOs contain no integer fields.
- Module positions can tie; explicit reorder does not shift siblings.
- Public course catalog, manager-picker/user administration, progress calculation and backend exports are outside this change.
- PostgreSQL verification exposed an existing Question metadata binding bug (String bound as VARCHAR to JSON); the field now uses Hibernate's JSON JDBC type without a new dependency.

## Verification

Run `mvn test` for H2 tests. ManagerCourseApiIntegrationTest exercises real HTTP/security/services/repositories. H2 creates schema from entities and does not verify Flyway/PostgreSQL.

### Isolated PostgreSQL check

The opt-in `postgresTests` tests use PostgreSQL 16 at the fixed local address below, Flyway enabled, and Hibernate `validate`. The password below is disposable test-only configuration, not a deployment credential.

```powershell
docker run --detach --rm --name examprep-manager-api-test --publish 127.0.0.1:55439:5432 --env POSTGRES_DB=examprep_manager_test --env POSTGRES_USER=examprep_test --env POSTGRES_PASSWORD=local-test-only postgres:16-alpine
docker exec examprep-manager-api-test pg_isready -U examprep_test -d examprep_manager_test
mvn "-DpostgresTests=true" "-Dtest=ManagerCoursePostgresIntegrationTest,ManagerCourseConcurrencyPostgresTest" test
docker stop examprep-manager-api-test
```

Wait for `pg_isready` to report accepting connections before Maven. The tests roll back HTTP fixtures and clean up committed concurrency fixtures. Reusing the container verifies upgrades; a new container verifies a fresh database. Default `mvn test` skips the PostgreSQL-only classes, so CI without Docker can still run H2.

To run the entire suite including PostgreSQL, use `mvn "-DpostgresTests=true" test` while that container is running. Tests verify raw SQL cannot cascade-delete legacy lessons or exam attempt history, JSON metadata round-trips, concurrent appends, publish vs last-module deletion, and transfer vs an old manager edit.

Use this isolated local database only: startup applies Flyway. Never override the test datasource with shared Supabase credentials. No shared database is migrated or verified by this change.

### Verified on 2026-10-16

- `mvn -o "-DpostgresTests=true" package`: **122 tests passed**, zero failures/errors/skips; executable Spring Boot JAR packaged successfully (Java 21 compiling for Java 17).
- Fresh PostgreSQL 16 database: **31 PostgreSQL tests passed**, full Flyway V1–V9 migration and Hibernate schema validation succeeded.
- Existing local V8 database upgraded to V9 successfully; restrictive foreign keys were checked through actual failed deletes, not only schema inspection.
- Fresh-context review completed; dashboard distinct-student counts and fractional JSON integer coercion were reproduced with failing tests, fixed, and passed on both H2 and PostgreSQL.
- `git diff --check` passed. Existing `.env.example` changes and all frontend files are excluded from the implementation commit.

### Database alignment on 2026-10-19

The shared database has applied V9-V16 from another migration lineage. The feature's old V9 deletion guard and uncommitted V10 categories migration are now V19 and V18. V1-V8 are unchanged. V17 aligns rubric/metadata columns to JSONB, normalizes legacy question types and FIXED exams to the specification, and updates the question-type constraint.

Deployment remains blocked until the exact original V9-V16 SQL files are recovered and their checksums match the shared history. Renumbering the feature's migrations does not recover those scripts. Do not run Flyway repair or disable validation to bypass missing history. An existing disposable local database with the feature's old V9/V10 must be recreated; never reset a shared database.

Run `mvn "-DpostgresTests=true" test` against the isolated server above. This now includes Category, Deck and Exam HTTP tests on PostgreSQL, JSONB rubric insert/update checks, and a separate upgrade fixture from V8 with legacy data. The migration fixture creates and drops a temporary database on that localhost test server; its disposable test account needs CREATEDB. AI HTTP tests use a local fake provider and make no real provider calls.

The shared database was inspected read-only; no migrations or application writes were run against it.

Verification: `mvn -o "-DpostgresTests=true" test` passed all **281 tests**, with zero failures, errors or skipped tests. This proves the fresh local schema and the V8 upgrade fixture; it does not restore or validate the missing shared V9-V16 definitions.

### Deployment and handover

After recovering and validating the shared migration history, deploy with V17-V19 included. V19 replaces eight foreign keys and validates existing references, which takes table locks: schedule deployment accordingly on a busy database. V1-V8 checksums are unchanged and the new migrations delete no rows.

Frontend can start against Swagger at `/swagger-ui/index.html` and the contract above. CourseManager selection must supply an existing active manager ID; a user-administration picker API is a separate responsibility. Any UI action receiving 409 should display the returned message and offer unpublish for courses.
