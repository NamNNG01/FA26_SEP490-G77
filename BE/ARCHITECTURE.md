# Exam Preparation Platform - Backend Architecture Specification

**Version:** 2.1.0  
**Target Environment:** Spring Boot 3.x + Supabase (PostgreSQL)  
**Status:** Approved Source of Truth  

---

## 1. Executive Summary & Architecture Goals

The **Exam Preparation Platform** backend provides a scalable, secure, and maintainable foundation for managing question banks, assembling exams, conducting timed exam attempts, auto-grading submissions, and analyzing student performance.

### Key Architectural Principles
- **Package-by-Layer Architecture:** All code lives under the base package `com.examprep` and is organized into eight flat technical-layer packages (`controllers`, `services`, `repositories`, `entities`, `dto`, `security`, `config`, `exceptions`) — there are no feature-scoped packages.
- **Stateless & Scalable Security:** Spring Security with stateless JWT authentication (HMAC-SHA256) and role-based authorization on every request.
- **Database Schema Evolution:** Database schema updates are managed exclusively via Flyway migrations targeting Supabase PostgreSQL.
- **Unified API Design & Standardized Contracts:** Consistent response wrappers (`ApiResponse<T>`), standardized error responses, and automated OpenAPI (Swagger) documentation.

---

## 2. Technology Stack Matrix

| Component | Technology | Version / Tool | Purpose |
| :--- | :--- | :--- | :--- |
| **Language** | Java | 17 LTS | Core programming language |
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
Client Apps (Web / Mobile)
        |
        |  HTTP / REST API (JSON)
        v
Spring Boot Backend (BE)
        |
        +-- Presentation & Security Layer
        |     controllers/   REST endpoints (AuthController, HealthController)
        |     security/      JwtAuthenticationFilter, JwtTokenProvider,
        |                    RestAuthenticationEntryPoint (401), RestAccessDeniedHandler (403)
        |     exceptions/    GlobalExceptionHandler (@RestControllerAdvice)
        |     config/        SecurityConfig, CorsConfig, SwaggerConfig, JpaAuditingConfig
        |
        v  delegates to
        +-- Business Layer
        |     services/      AuthService / AuthServiceImpl (@Service, @Transactional)
        |     dto/           Request/Response DTOs + ApiResponse<T> envelope
        |
        v  persists via
        +-- Data Layer
        |     repositories/  Spring Data JPA repositories (@Repository)
        |     entities/      JPA entities mapped to Flyway-managed tables
        |     (HikariCP connection pool)
        |
        v
Supabase PostgreSQL Database (Flyway-managed schema)
```

---

## 4. Package-by-Layer Architecture

The codebase follows a **package-by-layer** structure: responsibilities are separated by technical layer rather than by feature, keeping the architecture easy to navigate as the platform grows.

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

**Source tree (key classes):**

```
com.examprep/
|-- ExamPrepBackendApplication.java      # Application entry point
|-- controllers/
|   |-- AuthController.java              # AUTH-01..05 endpoints
|   +-- HealthController.java            # Health check
|-- services/
|   |-- AuthService.java                 # Auth service interface
|   +-- AuthServiceImpl.java             # Auth business logic
|-- repositories/
|   |-- UserRepository.java
|   |-- RoleRepository.java
|   |-- RefreshTokenRepository.java
|   +-- PasswordResetTokenRepository.java
|-- entities/
|   |-- User.java / Role.java
|   |-- RefreshToken.java
|   +-- PasswordResetToken.java
|-- dto/
|   |-- ApiResponse.java / ResponseCode.java          # Response envelope
|   |-- RegisterRequest / LoginRequest / LoginResponse / LogoutRequest
|   |-- RefreshTokenRequest / TokenResponse
|   +-- UserResponse.java / RoleResponse.java
|-- security/
|   |-- JwtTokenProvider.java            # Issue/validate JWT, SHA-256 hashing
|   |-- JwtAuthenticationFilter.java     # Per-request bearer-token filter
|   |-- UserPrincipal.java               # Authenticated principal
|   |-- RestAuthenticationEntryPoint.java      # 401 JSON body
|   +-- RestAccessDeniedHandler.java           # 403 JSON body
|-- config/
|   |-- SecurityConfig.java / CorsConfig.java / SwaggerConfig.java
|   +-- JpaAuditingConfig.java
+-- exceptions/
    |-- BaseException.java / BadRequestException.java
    |-- UnauthorizedException.java / ResourceNotFoundException.java
    +-- GlobalExceptionHandler.java
```

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
- **Refresh Token Rotation (AUTH-03):** Using a refresh token revokes it atomically (`UPDATE ... WHERE revoked_at IS NULL`) and issues a new Access Token + Refresh Token pair. The atomic guard guarantees each refresh token can be redeemed at most once, even under concurrent requests.
- **Credential Check Order (AUTH-02):** The password is verified *before* the account-status check, so inactive accounts and invalid credentials produce indistinguishable responses (prevents account-status enumeration).

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

DASH-01/02/03 (`GET /api/v1/dashboard/student` / `course-manager` / `admin`) are **implemented** — see §5.2.

---

## 6. Database Strategy (Supabase PostgreSQL)

1. **Schema Evolution:**
   - Managed exclusively via Flyway (`V1__init_schema.sql`, `V2__add_auth_tables.sql`).
   - `spring.jpa.hibernate.ddl-auto` is set to `validate` in `dev` and `none` in `prod`.

2. **Entity Design Conventions:**
   - `User`, `Role`, `RefreshToken`, `PasswordResetToken` use `BIGSERIAL` PKs (`user_id`, `role_id`, `refresh_token_id`, `reset_token_id`).
   - Audit timestamps (`created_at`) are mapped consistently with `@CreatedDate` + `AuditingEntityListener` on all four auth entities (enabled by `JpaAuditingConfig`).
   - No soft-delete flags (`deleted`): the schema declares no such columns, and entities MUST NOT declare columns absent from migrations (see `RULES.md` §3.3).

---

## 7. Standardized API Response & Exception Contract

All REST endpoints return data wrapped in `ApiResponse<T>`:

```json
{
  "success": true,
  "message": "Login successful.",
  "data": { ... }
}
```

Errors use the same envelope with `success: false`:

```json
{
  "success": false,
  "message": "Access denied."
}
```

**Status code semantics:**
- `401 Unauthorized` — missing / invalid / expired authentication token (`RestAuthenticationEntryPoint`).
- `403 Forbidden` — authenticated but insufficient role (`RestAccessDeniedHandler`).
- `500 Internal Server Error` — unhandled exceptions; the full stack trace is logged server-side but never returned to the client (`GlobalExceptionHandler`).
