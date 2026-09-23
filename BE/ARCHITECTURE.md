# Exam Preparation Platform - Backend Architecture Specification

**Version:** 1.1.0  
**Target Environment:** Spring Boot 3.x + Supabase (PostgreSQL)  
**Status:** Approved Source of Truth  

---

## 1. Executive Summary & Architecture Goals

The **Exam Preparation Platform** backend provides a scalable, secure, and maintainable foundation for managing question banks, assembling exams, conducting timed exam attempts, auto-grading submissions, and analyzing student performance.

### Key Architectural Principles
- **Clean Layered Architecture (Modular Monolith):** Decouples REST controllers, business services, domain models, and infrastructure persistence adapters.
- **Stateless & Scalable Security:** Integrates Spring Security with JWT (aligned with Supabase Auth) for stateless HTTP request authentication.
- **Database Schema Evolution:** Database schema updates are managed exclusively via Flyway migrations targeting Supabase PostgreSQL.
- **Unified API Design & Standardized Contracts:** Consistent response wrappers (`ApiResponse<T>`), standardized error responses, and automated OpenAPI (Swagger) documentation.

---

## 2. Technology Stack Matrix

| Component | Technology | Version / Tool | Purpose |
| :--- | :--- | :--- | :--- |
| **Language** | Java | 17 LTS / 21 | Core programming language |
| **Framework** | Spring Boot | 3.3.x | Application framework |
| **Security** | Spring Security + JJWT + BCrypt | 6.x / 0.12.x | Authentication, authorization, password hashing, JWT verification |
| **Database** | Supabase PostgreSQL | 15+ | Relational database host |
| **Migration** | Flyway | 10.x | Database schema migration and versioning |
| **ORM / Data Access** | Spring Data JPA / Hibernate | 6.x | Entity mapping, JPA Auditing, repository abstractions |
| **API Documentation** | Springdoc OpenAPI | 2.6.x | Automated Swagger UI & OpenAPI 3.0 specification |
| **Utilities** | Lombok | Latest | Boilerplate reduction (getters, setters, builders) |
| **Build Tool** | Maven | 3.8+ | Dependency management and build lifecycle |

---

## 3. High-Level System Architecture

```
                                +---------------------------+
                                |  Client Apps (Web / Mobile)|
                                +-------------+-------------+
                                              |
                                     HTTP / REST API (JSON)
                                              v
+-----------------------------------------------------------------------------------+
| Spring Boot Backend (BE)                                                          |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  | Web / Security Layer                                                        |  |
|  | - CorsFilter, JwtAuthenticationFilter                                       |  |
|  | - Controllers (@RestController)                                              |  |
|  | - Exception Handlers (@RestControllerAdvice)                                 |  |
|  +--------------------------------------+--------------------------------------+  |
|                                         |                                         |
|                                         v                                         |
|  +-----------------------------------------------------------------------------+  |
|  | Business / Application Layer                                                |  |
|  | - AuthService & Business Services (@Service)                                 |  |
|  | - Refresh Token Rotation Engine                                             |  |
|  | - DTO Mappers                                                               |  |
|  +--------------------------------------+--------------------------------------+  |
|                                         |                                         |
|                                         v                                         |
|  +-----------------------------------------------------------------------------+  |
|  | Infrastructure / Data Layer                                                 |  |
|  | - Spring Data JPA Repositories (@Repository)                                 |  |
|  | - JPA Entities & Custom Types                                               |  |
|  | - HikariCP Connection Pool                                                  |  |
|  +--------------------------------------+--------------------------------------+  |
|                                         |                                         |
+-----------------------------------------|-----------------------------------------+
                                          |
                                          v
                         +---------------------------------+
                         | Supabase PostgreSQL Database    |
                         | (Managed Tables & Flyway Schema)|
                         +---------------------------------+
```

---

## 4. Package-by-Layer Architecture

The codebase follows a simple **package-by-layer** structure: responsibilities are separated by technical layer rather than by feature, keeping the architecture easy to navigate as the platform grows.

| Package                    | Responsibility                                                        |
|----------------------------|-----------------------------------------------------------------------|
| `com.examprep.controllers` | REST Controllers: thin HTTP adapters that delegate to services.       |
| `com.examprep.services`    | Business logic & transactions (`@Service`).                          |
| `com.examprep.repositories`| Spring Data JPA repositories.                                        |
| `com.examprep.entities`    | JPA entities mapped to Flyway-managed tables.                        |
| `com.examprep.dto`         | Request/Response DTOs, validation, and the `ApiResponse` wrapper.    |
| `com.examprep.security`    | JWT provider, authentication filters, principal, entry points.       |
| `com.examprep.config`      | Spring configuration (Security, CORS, OpenAPI, Auditing).            |
| `com.examprep.exceptions`  | Custom exceptions and the global exception handler.                  |

Layering flows strictly downward: `controllers → services → repositories`. Functional areas are expressed as responsibilities of the service layer, pulling entities/repositories as needed:

1. **User & Auth** — User profiles, role definitions (`ADMIN`, `COURSE_MANAGER`, `STUDENT`).
   - Authentication APIs (AUTH-01 to AUTH-05): Register, Login, Refresh Token Rotation, Logout, Logout-all.
   - Token storage: `refresh_tokens`, `password_reset_tokens`.

2. **Question Bank** (planned)
   - Question management: Single Choice (MCQ), Multiple Choice, True/False, Essay/Fill-in-the-blank.
   - Categorization: Subjects, topics, tags, difficulty levels (EASY, MEDIUM, HARD).
   - Answer choices and explanation metadata.

3. **Exam & Quiz Engine** (planned)
   - Exam configuration: Duration (minutes), passing score, shuffle questions option, max attempt limit.
   - Question assignment: Static question lists or dynamic random question pools by topic/difficulty.

4. **Exam Submission & Attempt Engine** (planned)
   - Exam session lifecycle: Start Attempt → Submit Answers → Auto-Grade / Finalize Attempt.
   - Timer validation (server-side elapsed time enforcement).
   - Automated scoring for objective questions and feedback generation.

5. **Analytics** (planned)
   - Student performance tracking, history reports, score distributions, and topic weakness analysis.

---

## 5. Security Architecture & Authentication Workflow

### 5.1 Token Specification & Refresh Token Rotation
- **Access Token Expiration:** 15 minutes (`900` seconds).
- **Refresh Token Expiration:** 7 days.
- **JWT Claims Payload:**
  ```json
  {
    "sub": "101",
    "email": "student@gmail.com",
    "role": "STUDENT",
    "iat": 1758330000,
    "exp": 1758330900
  }
  ```
- **Token Hashing:** Raw refresh tokens are issued to clients; only SHA-256 hashes (`token_hash`) are persisted in `refresh_tokens`.
- **Refresh Token Rotation (AUTH-03):** Using a refresh token invalidates it (`revoked_at = NOW()`) and generates a new Access Token + Refresh Token pair.

### 5.2 Role-Based Access Control (RBAC) & Endpoint Matrix

| Endpoint Pattern | Method | Permitted Roles | Description |
| :--- | :--- | :--- | :--- |
| `/api/v1/auth/register` | POST | Public | AUTH-01: Register Student |
| `/api/v1/auth/login` | POST | Public | AUTH-02: Login |
| `/api/v1/auth/refresh` | POST | Public | AUTH-03: Refresh Token Rotation |
| `/api/v1/auth/logout` | POST | Authenticated | AUTH-04: Logout Session |
| `/api/v1/auth/logout-all` | POST | Authenticated | AUTH-05: Logout All Sessions |
| `/api/v1/health` | GET | Public | Health Check |
| `/v3/api-docs/**`, `/swagger-ui/**` | GET | Public | OpenAPI Documentation |
| `/api/v1/student/**` | ANY | `STUDENT`, `ADMIN` | Student Features |
| `/api/v1/manager/**` | ANY | `COURSE_MANAGER`, `ADMIN` | Course Manager Features |
| `/api/v1/admin/**` | ANY | `ADMIN` | Administrative APIs |
| `/api/v1/dashboard/student` | GET | `STUDENT` | DASH-01: Student Dashboard |
| `/api/v1/dashboard/course-manager` | GET | `COURSE_MANAGER` | DASH-02: Course Manager Dashboard |
| `/api/v1/dashboard/admin` | GET | `ADMIN` | DASH-03: Admin Dashboard |

### 5.3 Endpoint Roadmap (agreed in API contract, NOT yet implemented)
These endpoints are part of the agreed API contract but intentionally deferred until their feature domains are built:

| ID | Endpoint | Notes |
| :--- | :--- | :--- |
| AUTH-06 | `POST /api/v1/auth/password/forgot` | Requires email delivery (SMTP) — deferred |
| AUTH-07 | `POST /api/v1/auth/password/reset` | Uses `password_reset_tokens` — deferred |
| AUTH-08 | `PUT /api/v1/auth/password/change` | Authenticated; revokes refresh tokens after change — deferred |
| USER-01 | `GET /api/v1/users/me` | Requires `createdAt` added to `UserResponse` — deferred |
| USER-02 | `PUT /api/v1/users/me` | Profile update (`fullName`, `avatarUrl`) — deferred |
| DASH-01/02/03 | `GET /api/v1/dashboard/student` / `course-manager` / `admin` | Requires course/exam/attempt domain code — deferred |

---

## 6. Database Strategy (Supabase PostgreSQL)

1. **Schema Evolution:**
   - Managed exclusively via Flyway (`V1__init_schema.sql`, `V2__add_auth_tables.sql`).
   - `spring.jpa.hibernate.ddl-auto` is set to `validate` in `dev` and `none` in `prod`.

2. **Entity Design Conventions:**
   - `User`, `Role`, `RefreshToken`, `PasswordResetToken` use `BIGSERIAL` PKs (`user_id`, `role_id`, `refresh_token_id`, `reset_token_id`).
   - No soft-delete flags (`deleted`): the schema declares no such columns, and entities MUST NOT declare columns absent from migrations (see `RULES.md` §3.3).

---

## 7. Standardized API Response & Exception Contract

All REST endpoints return data wrapped in `ApiResponse<T>`:

```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": { ... }
}
```
