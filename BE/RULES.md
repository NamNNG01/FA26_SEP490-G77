# Exam Preparation Platform - Development Rules & Coding Standards

**Version:** 1.1.0  
**Scope:** Backend (`BE`) Engineering Team  
**Status:** Mandatory Compliance Required  

---

## 1. Core Engineering Principles

1. **Clean Code & Self-Documenting Design:** Code must be expressive, clean, and concise. Avoid redundant comments that restate what the code clearly does.
2. **Explicit Layering & Single Responsibility:** Components must strictly adhere to their assigned architectural layer (`controllers` → `services` → `repositories`).
3. **No Direct Entity Exposure:** Database entities (`@Entity`) MUST NEVER be returned directly by Controller endpoints or accepted as request parameters. Use dedicated Data Transfer Objects (`DTO`s).
4. **Zero Tolerance for Silent Error Swallowing:** Exceptions must be logged and handled explicitly via the global exception hierarchy. Never use empty `catch` blocks or fallback dummy returns.

---

## 2. Code Style & Convention Guidelines

### 2.1 Naming Conventions
- **Classes & Interfaces:** PascalCase (e.g., `ExamService`, `QuestionRepository`, `JwtAuthenticationFilter`).
- **Methods & Variables:** camelCase (e.g., `calculateTotalScore`, `userAttemptId`).
- **Constants & Enums:** UPPER_SNAKE_CASE (e.g., `MAX_ATTEMPT_LIMIT`, `EXAM_NOT_FOUND`).
- **Database Tables:** lower_snake_case plural (e.g., `users`, `exams`, `question_choices`).
- **Database Columns:** lower_snake_case (e.g., `created_at`, `passing_score`).

### 2.2 Lombok Usage Rules
- **ALLOWED:** `@Getter`, `@Setter`, `@Builder`, `@NoArgsConstructor`, `@AllArgsConstructor`, `@RequiredArgsConstructor`, `@Slf4j`.
- **FORBIDDEN ON JPA ENTITIES:** `@Data` or `@EqualsAndHashCode`. Using `@Data` on Hibernate entities causes infinite recursion in `hashCode()` and `toString()` when bidirectional lazy associations exist.
- **Entity Builder Rule:** When using `@Builder` on entities, always supply `@NoArgsConstructor` and `@AllArgsConstructor` to preserve JPA reflection capabilities.

---

## 3. Layer Boundary & Architectural Rules

```
[ HTTP Controller ] 
       │ (Consumes/Produces DTOs only; Uses @Valid)
       ▼
[ Business Service ] 
       │ (Manages Transactions @Transactional; Executes Business Logic)
       ▼
[ JPA Repository ] 
       │ (Data Access Objects; JPQL / Native Queries)
       ▼
[ PostgreSQL / Supabase ]
```

### 3.0 Package Layout (Package-by-Layer)
All code lives under the base package `com.examprep` and follows a flat, layer-based layout:

```
com.examprep/
├── controllers/   # @RestController
├── services/      # @Service
├── repositories/  # Spring Data JPA repositories
├── entities/      # JPA @Entity
├── dto/           # Request/Response DTOs + ApiResponse/ResponseCode wrappers
├── security/      # JWT & Spring Security components
├── config/        # @Configuration classes
└── exceptions/    # Custom exceptions + GlobalExceptionHandler
```

- Layering flows strictly downward: `controllers → services → repositories`.
- There are no feature-scoped packages — controllers and services MUST NOT introduce or depend on them; features are expressed through classes in the shared layer packages.
- Cross-cutting types live in fixed homes: response wrappers (`ApiResponse`, `ResponseCode`) in `dto/`; custom exceptions in `exceptions/`; configuration in `config/`.

### 3.1 Controller Rules (`@RestController`)
- Controllers MUST be light wrappers over services.
- Controllers MUST return `ResponseEntity<ApiResponse<T>>`.
- Request DTOs MUST be annotated with `@Valid` and appropriate Jakarta validation annotations (`@NotBlank`, `@NotNull`, `@Min`, `@Max`).
- Controllers MUST NOT contain business decisions, direct entity references, or JDBC/JPA logic.

### 3.2 Service Rules (`@Service`)
- Service interfaces MUST be named `*Service` (e.g., `AuthService`) and their implementations `*ServiceImpl` (e.g., `AuthServiceImpl`), both in `services/`.
- All business operations MUST be declared within service classes/interfaces.
- Read-only operations MUST be annotated with `@Transactional(readOnly = true)`.
- State-modifying operations MUST be annotated with `@Transactional`.
- Services MUST NOT import `jakarta.servlet.*` or Spring Web classes (`HttpServletRequest`, `HttpStatus`, etc.).

### 3.3 Entity & Repository Rules (`@Entity`, `@Repository`)
- Entities MUST match the Flyway-managed schema: `BIGINT`/`BIGSERIAL` IDENTITY primary keys (no UUID PKs unless the table declares one) and MUST NOT declare columns that do not exist in migrations (e.g., a `deleted` flag without a corresponding column).
- Audit timestamps (`created_at`/`updated_at`) SHOULD be mapped with `@CreatedDate`/`@LastModifiedDate` + `AuditingEntityListener` where those columns exist.
- Entity relationships (`@ManyToOne`, `@OneToMany`) MUST default to `FetchType.LAZY` to prevent N+1 query problems (except `@ManyToOne` lookups already proven hot, e.g., `User.role`).
- Native SQL queries in repositories MUST use parameterized positional (`?1`) or named (`:param`) bindings to prevent SQL injection vulnerabilities.

---

## 4. Exception Handling Rules

1. **Custom Business Exceptions:**
   - Throw specialized domain exceptions extending `BaseException` (e.g., `ResourceNotFoundException`, `ExamAlreadySubmittedException`, `UnauthorizedException`).
2. **Error Codes:**
   - Every custom exception MUST map to a predefined `ResponseCode` enum value containing HTTP status code, internal error code string, and default user-friendly message.
3. **Global Handling:**
   - All uncaught exceptions pass through `GlobalExceptionHandler`. Unhandled system exceptions are logged as `ERROR` with full stack traces and returned as `500 INTERNAL_SERVER_ERROR` without exposing internal stack traces to the client.

---

## 5. Database & Flyway Migration Rules

1. **Zero Manual Schema Modifications:** Database structure changes in Supabase must ALWAYS be executed through Flyway SQL migration scripts located in `src/main/resources/db/migration/`.
2. **Migration Naming Standard:**
   - Format: `V{VERSION}__{DESCRIPTION}.sql`
   - Example: `V1__init_schema.sql`, `V2__add_question_tags_table.sql`.
   - Note double underscore `__` separating version and description.
3. **Immutability of Applied Migrations:** Applied Flyway migration files MUST NEVER be edited or deleted once merged into `main`. Create a new additive migration version for schema updates.
4. **Hibernate Schema Auto:**
   - `spring.jpa.hibernate.ddl-auto` MUST be set to `validate` in development and `none` in production.

---

## 6. Security & Sensitive Data Rules

1. **No Sensitive Data Logging:** Passwords, JWT secrets, bearer tokens, or PII (Personally Identifiable Information) MUST NEVER be output to log files or standard output.
2. **Method Security:** Secure service methods or controllers using `@PreAuthorize("hasRole('ADMIN')")` or `@PreAuthorize("hasAnyRole('COURSE_MANAGER', 'ADMIN')")`.
3. **Environment Configuration:** Secret keys and database credentials MUST be referenced via environment variables or Spring configuration placeholders (e.g., `${SUPABASE_DB_URL}`). Never hardcode credentials in `application.yml` or source code.

---

## 7. API Versioning & URL Structure

- Base API URL path prefix: `/api/v1`
- Plural nouns for resource endpoints: `/api/v1/exams`, `/api/v1/questions`, `/api/v1/attempts`.
- HTTP Method semantics:
  - `GET`: Retrieve resource(s).
  - `POST`: Create resource or execute action (e.g., submit attempt).
  - `PUT` / `PATCH`: Update resource.
  - `DELETE`: Delete/Soft-delete resource.
