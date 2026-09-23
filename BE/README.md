# Exam Preparation Platform - Backend (`BE`)

Welcome to the backend service of the **Exam Preparation Platform**. This repository houses the core Spring Boot RESTful backend API integrated with Supabase PostgreSQL.

---

## 📚 Core Project Documentation

Before contributing or modifying code, please review the following source-of-truth documents:

- 🏛️ [ARCHITECTURE.md](ARCHITECTURE.md) — System Architecture, Tech Stack, Package Layout, Domain Boundaries & Security Design.
- 📜 [RULES.md](RULES.md) — Coding Standards, Layering Constraints, Flyway Migration Rules & Exception Conventions.

---

## 🛠️ Tech Stack & Prerequisites

### Prerequisites
- **Java Development Kit (JDK):** 17 LTS or higher
- **Build Tool:** Maven 3.8+
- **Database:** Supabase PostgreSQL instance (or local PostgreSQL 15+)
- **IDE:** IntelliJ IDEA / VS Code / Eclipse with Lombok plugin enabled

### Technology Stack
- **Spring Boot:** 3.3.x (Web, Data JPA, Security, Validation)
- **Database:** Supabase PostgreSQL + HikariCP
- **Migration:** Flyway Migration Core
- **Authentication:** Spring Security + JWT
- **Documentation:** Springdoc OpenAPI / Swagger UI
- **Utilities:** Lombok, MapStruct

---

## 📁 Repository Directory Structure

```
BE/
├── ARCHITECTURE.md              # System Architecture Specification
├── RULES.md                     # Coding Standards & Layering Rules
├── README.md                    # Developer Setup & Onboarding Guide (This file)
├── pom.xml                      # Maven Build Configuration
└── src/
    ├── main/
    │   ├── java/
    │   │   └── com/
    │   │       └── examprep/
    │   │           ├── ExamPrepBackendApplication.java
    │   │           ├── common/  # Shared utilities, BaseEntity, Exception handling, Response wrappers
    │   │           ├── domain/  # Feature modules (user, question, exam, attempt, analytics)
    │   │           └── security/# JWT Filter, Token Provider, Security Config
    │   └── resources/
    │       ├── application.yml         # Base Configuration
    │       ├── application-dev.yml     # Development Profile Config
    │       ├── application-prod.yml    # Production Profile Config
    │       └── db/
    │           └── migration/          # Flyway Database Migration Scripts
    └── test/                           # Unit & Integration Tests
```

---

## 🚀 Quick Start & Local Setup

### 1. Configure Environment Variables
Copy or set the following environment variables or configure them in `src/main/resources/application-dev.yml`:

```properties
SUPABASE_DB_URL=jdbc:postgresql://<your-supabase-host>:5432/<db_name>?sslmode=require
SUPABASE_DB_USERNAME=postgres
SUPABASE_DB_PASSWORD=<your-database-password>
JWT_SECRET=<your-256-bit-secret-key-or-supabase-jwt-secret>
```

### 2. Build the Project
Clean and compile the project using Maven:

```bash
# Navigate to the BE directory
cd BE

# Compile project
mvn clean compile
```

### 3. Run Database Migrations & Start Application
Run the Spring Boot application with the `dev` profile active:

```bash
mvn spring-boot:run -Dspring-boot.run.profiles=dev
```

Upon startup, Flyway will automatically apply pending SQL migration scripts from `src/main/resources/db/migration/` to your Supabase PostgreSQL instance.

---

## 📖 API Documentation & Endpoints

Once the application is running locally:

- **Interactive Swagger UI:** [http://localhost:8080/swagger-ui/index.html](http://localhost:8080/swagger-ui/index.html)
- **OpenAPI 3.0 Spec JSON:** [http://localhost:8080/v3/api-docs](http://localhost:8080/v3/api-docs)
- **Health Check Endpoint:** `GET http://localhost:8080/api/v1/health`

---

## 🧪 Testing & Verification

Run the test suite:

```bash
mvn test
```

Package the application for deployment:

```bash
mvn clean package -DskipTests=false
```

---

## 🤝 Contribution Guidelines

1. Always follow the guidelines in [RULES.md](RULES.md).
2. Never commit hardcoded secret keys or database passwords.
3. Ensure all entity changes are accompanied by a new Flyway migration script in `src/main/resources/db/migration/`.
4. Wrap API responses in `ApiResponse<T>` and throw custom `BaseException` variants for error conditions.
