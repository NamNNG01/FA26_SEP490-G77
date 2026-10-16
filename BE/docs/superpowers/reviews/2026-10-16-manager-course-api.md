# Manager course API final review

Reviewed by a fresh read-only reviewer on 2026-10-16 against `function.md`, RULES.md and the implementation plan. No critical findings or confirmed minor findings.

## Required fix

The existing dashboard recent-course projection used COUNT(enrollment) while the new list/detail contract counts distinct students. A student with two enrollment rows appeared twice on the dashboard. Extended the real integration test to reproduce 2 instead of 1, then changed the projection to COUNT(DISTINCT e.user.userId).

## Additional verified validation fix

Reviewer suggested reproducing Jackson's fractional-number coercion. HTTP test confirmed orderIndex 1.9 was accepted as 1. Integer coercion is now disabled; regression tests cover fractional module positions and category/manager IDs. Existing auth/profile request DTOs have no integer fields.

## Review coverage and limits

- Examined primary/assigned manager scope, duplicate counts, transfer revocation, course-before-module locking, safe deletion, JSON mapping, migrations and API contract.
- Implementer's full suite before these final fixes passed 120 tests. Final post-fix verification is recorded in [handover](../../manager-course-api.md).
- Reviewer did not independently run tests while the executor was writing test reports. Root verified actual Maven output.
- No shared/production database was accessed; production migration duration and live data remain deployment concerns.
