# Backend course/module API contract

Updated 2026-10-16; supersedes the earlier C-04–C-14 draft. Backend only.
See [implementation and verification notes](docs/manager-course-api.md).

## Common rules

- Base path `/api/v1`. Manager routes require JWT role `ADMIN` or `COURSE_MANAGER`.
- Admin accesses all courses including drafts. Managers access courses where `manager_id` matches OR a `course_managers` assignment exists. Apply this rule consistently to dashboard, lists, details, modules and students.
- Course create/publish/unpublish/delete is ADMIN only. Content edits and module operations also allow assigned/primary managers.
- IDs are positive integers; fractional JSON IDs/orderIndex return 400 instead of being truncated. Unknown resources: 404; existing resources outside scope: 403.
- Success: `{"success":true,"message":"Operation completed successfully","data":...}`. POST uses HTTP 201 and message `Resource created successfully`.
- Preserve existing ApiResponse: null fields are omitted, including `data` on DELETE/errors. Errors have `success:false` and `message`; there is no JSON error-code field. Validation errors may include a field/message map in `data`.
- HTTP errors: 400 invalid input, 401 missing/invalid authentication, 403 role/ownership, 404 unknown resource, 409 dependent content/state conflict.
- UTC ISO-8601 timestamps. Price range `0`–`99999999.99`, at most two decimal places.
- Updates are partial: omitted/null fields stay unchanged. Empty/blank description or thumbnail clears the field. Supplied titles must be nonblank, max 255 characters; thumbnail max 512.
- Pagination: `page` zero-based, default 0; `size` 1–100, default 20. Invalid values: 400. Out-of-range pages: empty `content`.
- Paged data: `{content,page,size,totalElements,totalPages,first,last}`. Search is case-insensitive literal substring matching; `%` and `_` are not wildcards.

## Response objects

`CourseSummary`: `{courseId,title,slug,categoryId,categoryName,managerId,managerName,thumbnailUrl?,price,isPublished,moduleCount,studentCount,examCount,createdAt,updatedAt}`.

`CourseDetail`: all summary fields plus optional `description` and `modules` array.

`ModuleResponse`: `{moduleId,courseId,title,description?,orderIndex,questionCount,examCount}`.

Course exam counts include distinct exams linked directly or through its modules. Student count means distinct users across all enrollment statuses. Module content counts include all statuses. Module order: `orderIndex ASC,moduleId ASC`.

## C-04 — GET `/manager/courses`

Optional `search` (title/description), `categoryId`, `isPublished`, `page`, `size`, `sort`.
Sort is one `field,asc|desc` pair, default `updatedAt,desc`. Fields: `courseId`, `title`, `price`, `isPublished`, `createdAt`, `updatedAt`; use course ID as a stable tie-breaker. Invalid sort: 400.
Returns paged CourseSummary objects, with batched counts. No matching filter returns an empty page.

## C-05 — GET `/manager/courses/{id}`

Returns CourseDetail with ordered modules and their content counts. Check scope before returning data.

## C-06 — POST `/manager/courses` (ADMIN)

```json
{"title":"Python for Data Science","categoryId":3,"managerId":5,"description":"Optional","thumbnailUrl":"https://cdn.example.com/thumb.png","price":0}
```

Required title/categoryId/managerId. Price defaults to zero. Category and manager must exist (404); manager must be an ACTIVE COURSE_MANAGER (400).
Always create a draft. Insert with a unique temporary slug before the identity ID exists, then replace with a bounded server-generated `title-id` slug in the same transaction. Add the primary manager assignment. Return 201 CourseDetail.

## C-07 — PUT `/manager/courses/{id}`

Optional title/description/thumbnailUrl/categoryId/price/managerId.
Managers may change title/description/thumbnail/category only; their numeric price/managerId values are ignored, even if outside admin validation limits. Malformed JSON/types still return 400.
Admin can change all listed fields; replacement manager follows creation validation.
Transfer removes all assignments for the old primary and ensures one for the new primary, preserving other collaborators. Setting the same primary does not remove assignments.
Slug/publication/IDs cannot change here. Return CourseDetail; no enrollment/progress changes.

## C-08 — PATCH `/manager/courses/{id}/publish` (ADMIN)

Body: `{"isPublished":true}` or `{"isPublished":false}`; non-null boolean required.
Publish requires at least one module (otherwise 400); unpublish always permitted. Admin has no ownership restriction. Return CourseDetail.

## C-09 — DELETE `/manager/courses/{id}` (ADMIN)

409 if any enrollment (including COMPLETED), directly/module-linked exam, question, exam configuration, question group or legacy lesson depends on the course/modules. Unpublish instead or explicitly resolve content first.
Otherwise delete manager assignments, empty modules and course in one transaction. Never detach questions/exams or cascade away history. Decks retain user ownership and their existing SET NULL course relation.
Return 200 `{"success":true,"message":"Course deleted successfully."}`.

## C-10 — GET `/manager/courses/{id}/modules`

Returns ordered ModuleResponse array, or `[]` for an empty course.

## C-11 — POST `/manager/courses/{id}/modules`

Required title; optional description/orderIndex. Explicit order is a positive integer. Missing/null appends at max+1, starting at 1; integer overflow: 409.
Equal positions are allowed, with module ID tie-breaker; existing siblings are not renumbered. Parent course locks serialize writes. Return 201 ModuleResponse.

## C-12 — PUT `/manager/modules/{id}`

Optional title/description/orderIndex with the same rules. Cannot move the module to another course. Return ModuleResponse.

## C-13 — DELETE `/manager/modules/{id}`

409 if questions/exams/exam configurations/question groups/legacy lessons reference the module. Also 409 for the last module of a published course; unpublish first. Assigned managers or Admin may delete empty modules.
Return 200 `{"success":true,"message":"Module deleted successfully."}`.
Orphan/reassignment workflows are deferred until question ownership has a durable model.

## C-14 — GET `/manager/courses/{id}/students`

Optional search (full name/email), status (`ACTIVE` or `COMPLETED`), page/size. Invalid status: 400.
Sort by enrollment time descending then enrollment ID descending. Paged items: `{userId,fullName,email,avatarUrl?,enrolledAt,status,progress}`.
Progress is the existing stored integer percentage, not calculated/updated here. Export belongs to client.

## PUB-01 — GET `/categories` (public)

Data array `{categoryId,name,slug,description?,parentId?}`, ordered by name ascending then category ID. Manager picker belongs to user administration; callers supply an existing ACTIVE manager ID.
