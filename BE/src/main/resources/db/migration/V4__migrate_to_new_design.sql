-- V4__migrate_to_new_design.sql
-- Migrate Backend to NEW Database Design (28 tables) while preserving:
--   - refresh_tokens (kept beyond design for Auth rotation/logout, per user decision)
--   - enrollments.progress, exam_attempts.status, categories.parent_id, lessons table
--     (kept beyond design to avoid losing dashboard/business functionality)
-- Dropped (no code depends on them, not in new design):
--   - roles (replaced by users.role_name), password_reset_tokens (dead code), system_settings
--
-- Strategy: additive only, never edits V1-V3. Idempotent guards (IF NOT EXISTS / IF EXISTS)
-- so Flyway can apply cleanly on fresh or existing Supabase PostgreSQL.

-- =====================================================================
-- 0. EXTENSIONS + NEW REFERENCE TABLES (no dependency on altered tables)
-- =====================================================================

CREATE TABLE IF NOT EXISTS subscription_plans (
    plan_id BIGSERIAL PRIMARY KEY,
    plan_name VARCHAR(100) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    duration_days INT NOT NULL,
    ai_token_limit INT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
    notification_id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    type VARCHAR(50) NOT NULL,
    target_type VARCHAR(50),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS discounts (
    discount_id BIGSERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    discount_type VARCHAR(20) NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    usage_limit INT NOT NULL,
    used_count INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS documents (
    doc_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    generation_type VARCHAR(50) NOT NULL,
    extracted_content TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
);

-- =====================================================================
-- 1. USERS: roles.role_code -> users.role_name (preserve data first)
-- =====================================================================

-- Add new column (nullable first for backfill)
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_name VARCHAR(255);

-- Backfill from roles table if it still exists and column is null
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'roles')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role_id') THEN
        UPDATE users u SET role_name = r.role_code
        FROM roles r WHERE u.role_id = r.role_id AND u.role_name IS NULL;
    END IF;
END $$;

-- Default remaining NULLs to STUDENT (registration default)
UPDATE users SET role_name = 'STUDENT' WHERE role_name IS NULL;

ALTER TABLE users ALTER COLUMN role_name SET NOT NULL;
ALTER TABLE users ALTER COLUMN role_name SET DEFAULT 'STUDENT';

-- Widen columns to new design
ALTER TABLE users ALTER COLUMN email TYPE VARCHAR(255);
ALTER TABLE users ALTER COLUMN avatar_url TYPE VARCHAR(512);
ALTER TABLE users ALTER COLUMN status TYPE VARCHAR(20);

-- Normalize timestamps to TIMESTAMP (from TIMESTAMPTZ) to match new design.
-- USING clause preserves instant values.
DO $$
BEGIN
    BEGIN
        ALTER TABLE users ALTER COLUMN created_at TYPE TIMESTAMP USING created_at::timestamp;
    EXCEPTION WHEN others THEN NULL;
    END;
    BEGIN
        ALTER TABLE users ALTER COLUMN updated_at TYPE TIMESTAMP USING updated_at::timestamp;
    EXCEPTION WHEN others THEN NULL;
    END;
END $$;

ALTER TABLE users ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE users ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE users ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE users ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;

-- Drop old FK + column role_id (after data preserved)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role_id') THEN
        -- Drop FK constraint if exists (name may vary)
        BEGIN
            ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_id_fkey;
        EXCEPTION WHEN others THEN NULL;
        END;
        ALTER TABLE users DROP COLUMN role_id;
    END IF;
END $$;

-- =====================================================================
-- 2. CATEGORIES: SERIAL(INT)->BIGINT, +description, KEEP parent_id
-- =====================================================================

-- NOTE: categories.category_id is referenced by courses.category_id and by
-- categories.parent_id (self-FK). Postgres forbids ALTER COLUMN TYPE while FKs
-- exist, so drop them first and re-add after the type change.
ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_category_id_fkey;
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_parent_id_fkey;

ALTER TABLE categories ALTER COLUMN category_id TYPE BIGINT USING category_id::bigint;
ALTER TABLE categories ALTER COLUMN name TYPE VARCHAR(100);
ALTER TABLE categories ALTER COLUMN slug TYPE VARCHAR(100);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS description TEXT;
-- parent_id kept beyond design (dashboard compat). Widen to BIGINT to match new PK type.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'categories' AND column_name = 'parent_id') THEN
        BEGIN
            ALTER TABLE categories ALTER COLUMN parent_id TYPE BIGINT USING parent_id::bigint;
        EXCEPTION WHEN others THEN NULL;
        END;
    ELSE
        ALTER TABLE categories ADD COLUMN parent_id BIGINT REFERENCES categories(category_id) ON DELETE SET NULL;
    END IF;
END $$;

-- =====================================================================
-- 3. COURSES: +slug, +price, widen types
-- =====================================================================

ALTER TABLE courses ALTER COLUMN category_id TYPE BIGINT USING category_id::bigint;
-- Re-add FKs dropped before the categories PK type change
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'courses_category_id_fkey') THEN
        ALTER TABLE courses ADD CONSTRAINT courses_category_id_fkey
            FOREIGN KEY (category_id) REFERENCES categories(category_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'categories_parent_id_fkey') THEN
        ALTER TABLE categories ADD CONSTRAINT categories_parent_id_fkey
            FOREIGN KEY (parent_id) REFERENCES categories(category_id) ON DELETE SET NULL;
    END IF;
END $$;
ALTER TABLE courses ALTER COLUMN title TYPE VARCHAR(255);
ALTER TABLE courses ALTER COLUMN thumbnail_url TYPE VARCHAR(512);

ALTER TABLE courses ADD COLUMN IF NOT EXISTS slug VARCHAR(255);
-- Backfill slug for existing rows: slugify title + course_id to guarantee uniqueness
UPDATE courses SET slug = LOWER(REGEXP_REPLACE(title, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || course_id
WHERE slug IS NULL;
ALTER TABLE courses ALTER COLUMN slug SET NOT NULL;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'courses_slug_unique') THEN
        ALTER TABLE courses ADD CONSTRAINT courses_slug_unique UNIQUE (slug);
    END IF;
END $$;

ALTER TABLE courses ADD COLUMN IF NOT EXISTS price DECIMAL(10,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
    BEGIN
        ALTER TABLE courses ALTER COLUMN created_at TYPE TIMESTAMP USING created_at::timestamp;
    EXCEPTION WHEN others THEN NULL;
    END;
    BEGIN
        ALTER TABLE courses ALTER COLUMN updated_at TYPE TIMESTAMP USING updated_at::timestamp;
    EXCEPTION WHEN others THEN NULL;
    END;
END $$;

-- =====================================================================
-- 4. COURSE_MANAGERS (new join table, kept alongside courses.manager_id)
-- =====================================================================

CREATE TABLE IF NOT EXISTS course_managers (
    course_manager_id BIGSERIAL PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_course_managers_course ON course_managers(course_id);
CREATE INDEX IF NOT EXISTS idx_course_managers_user ON course_managers(user_id);

-- Backfill: each course's manager becomes a course_manager row (idempotent)
INSERT INTO course_managers (course_id, user_id, assigned_at)
SELECT c.course_id, c.manager_id, CURRENT_TIMESTAMP
FROM courses c
WHERE NOT EXISTS (
    SELECT 1 FROM course_managers cm WHERE cm.course_id = c.course_id AND cm.user_id = c.manager_id
);

-- =====================================================================
-- 5. ENROLLMENTS: +paid_amount, KEEP progress, widen status
-- =====================================================================

ALTER TABLE enrollments ALTER COLUMN status TYPE VARCHAR(20);
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(10,2) NOT NULL DEFAULT 0;
-- progress kept beyond design (V3 column). Ensure exists for fresh DBs that skipped V3 ordering issues.
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS progress INT NOT NULL DEFAULT 0;
DO $$
BEGIN
    BEGIN
        ALTER TABLE enrollments ALTER COLUMN enrolled_at TYPE TIMESTAMP USING enrolled_at::timestamp;
    EXCEPTION WHEN others THEN NULL;
    END;
END $$;

CREATE TABLE IF NOT EXISTS user_subscriptions (
    subscription_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    plan_id BIGINT NOT NULL REFERENCES subscription_plans(plan_id) ON DELETE RESTRICT,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    status VARCHAR(20) NOT NULL,
    paid_amount DECIMAL(10,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plan ON user_subscriptions(plan_id);

-- =====================================================================
-- 6. MODULES: +description, widen title
-- =====================================================================

ALTER TABLE modules ALTER COLUMN title TYPE VARCHAR(255);
ALTER TABLE modules ADD COLUMN IF NOT EXISTS description TEXT;

-- =====================================================================
-- 7. QUESTION_GROUPS: +course_id, title nullable, -media_url
-- =====================================================================

ALTER TABLE question_groups ADD COLUMN IF NOT EXISTS course_id BIGINT REFERENCES courses(course_id) ON DELETE SET NULL;
ALTER TABLE question_groups ALTER COLUMN title DROP NOT NULL;
ALTER TABLE question_groups ALTER COLUMN title TYPE VARCHAR(255);
ALTER TABLE question_groups DROP COLUMN IF EXISTS media_url;
CREATE INDEX IF NOT EXISTS idx_question_groups_course ON question_groups(course_id);

-- =====================================================================
-- 8. QUESTIONS: module nullable, -created_by, explanation->ai_explanation,
--    +status, +essay_grading_rubric, difficulty nullable, question_metadata JSON
-- =====================================================================

-- Drop FK-created_by column constraint first if exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'questions' AND column_name = 'created_by') THEN
        BEGIN
            ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_created_by_fkey;
        EXCEPTION WHEN others THEN NULL;
        END;
        ALTER TABLE questions DROP COLUMN created_by;
    END IF;
END $$;

ALTER TABLE questions ALTER COLUMN module_id DROP NOT NULL;
ALTER TABLE questions ALTER COLUMN difficulty DROP NOT NULL;
ALTER TABLE questions ALTER COLUMN difficulty DROP DEFAULT;
ALTER TABLE questions ALTER COLUMN question_type TYPE VARCHAR(50);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'questions' AND column_name = 'explanation')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'questions' AND column_name = 'ai_explanation') THEN
        ALTER TABLE questions RENAME COLUMN explanation TO ai_explanation;
    END IF;
END $$;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS ai_explanation TEXT;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS essay_grading_rubric TEXT;
-- question_metadata: JSON per new design (JSON, not JSONB, for H2/Postgres compat)
-- Convert legacy JSONB from V1 to JSON first, then ensure column exists.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'questions' AND column_name = 'question_metadata' AND udt_name = 'jsonb') THEN
        ALTER TABLE questions ALTER COLUMN question_metadata TYPE JSON USING question_metadata::text::JSON;
    END IF;
END $$;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_metadata JSON;

DO $$
BEGIN
    BEGIN
        ALTER TABLE questions ALTER COLUMN created_at TYPE TIMESTAMP USING created_at::timestamp;
    EXCEPTION WHEN others THEN NULL;
    END;
END $$;

-- =====================================================================
-- 9. ANSWER_OPTIONS: -match_key
-- =====================================================================

ALTER TABLE answer_options DROP COLUMN IF EXISTS match_key;

-- =====================================================================
-- 10. EXAMS: course nullable, +module_id, +description, +status, widen title
-- =====================================================================

ALTER TABLE exams ALTER COLUMN title TYPE VARCHAR(255);
ALTER TABLE exams ALTER COLUMN course_id DROP NOT NULL;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS module_id BIGINT REFERENCES modules(module_id) ON DELETE SET NULL;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE exams ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'DRAFT';

-- Backfill created_by NULLs before enforcing NOT NULL (new design requires NOT NULL)
UPDATE exams SET created_by = (SELECT MIN(user_id) FROM users) WHERE created_by IS NULL;
-- If still NULL (no users yet on fresh DB), keep nullable to avoid migration failure;
-- application-level validation enforces presence. Only enforce NOT NULL when safe.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM exams WHERE created_by IS NULL) THEN
        ALTER TABLE exams ALTER COLUMN created_by SET NOT NULL;
    END IF;
END $$;

DO $$
BEGIN
    BEGIN
        ALTER TABLE exams ALTER COLUMN created_at TYPE TIMESTAMP USING created_at::timestamp;
    EXCEPTION WHEN others THEN NULL;
    END;
END $$;
CREATE INDEX IF NOT EXISTS idx_exams_course ON exams(course_id);
CREATE INDEX IF NOT EXISTS idx_exams_module ON exams(module_id);

-- =====================================================================
-- 11. EXAM_CONFIG: rename exam_configs -> exam_config, +question_type, module nullable
-- =====================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'exam_configs')
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'exam_config') THEN
        ALTER TABLE exam_configs RENAME TO exam_config;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS exam_config (
    config_id BIGSERIAL PRIMARY KEY,
    exam_id BIGINT NOT NULL REFERENCES exams(exam_id) ON DELETE CASCADE,
    question_type VARCHAR(50) NOT NULL DEFAULT 'SINGLE_CHOICE',
    number_of_questions INT NOT NULL DEFAULT 1,
    module_id BIGINT REFERENCES modules(module_id) ON DELETE CASCADE,
    difficulty VARCHAR(50)
);

-- If table came from rename, migrate its shape to new design
ALTER TABLE exam_config ADD COLUMN IF NOT EXISTS question_type VARCHAR(50) NOT NULL DEFAULT 'SINGLE_CHOICE';
ALTER TABLE exam_config ALTER COLUMN module_id DROP NOT NULL;
ALTER TABLE exam_config ALTER COLUMN difficulty DROP NOT NULL;
ALTER TABLE exam_config ALTER COLUMN difficulty DROP DEFAULT;

-- =====================================================================
-- 12. EXAM_QUESTIONS: surrogate PK + order_index rename + points
-- =====================================================================

-- Rename question_order -> order_index if old name exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'exam_questions' AND column_name = 'question_order')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'exam_questions' AND column_name = 'order_index') THEN
        ALTER TABLE exam_questions RENAME COLUMN question_order TO order_index;
    END IF;
END $$;
ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS order_index INT NOT NULL DEFAULT 0;
ALTER TABLE exam_questions ADD COLUMN IF NOT EXISTS points DECIMAL(5,2) NOT NULL DEFAULT 1;

-- Surrogate PK: drop composite PK, add exam_question_id
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'exam_questions' AND column_name = 'exam_question_id') THEN
        -- Drop old composite PK (name defaults to exam_questions_pkey)
        ALTER TABLE exam_questions DROP CONSTRAINT IF EXISTS exam_questions_pkey;
        ALTER TABLE exam_questions ADD COLUMN exam_question_id BIGSERIAL;
        -- Backfill is automatic for new BIGSERIAL on existing rows in PG>=10?
        -- Ensure no NULLs (for PG versions that leave NULLs on ADD COLUMN):
        UPDATE exam_questions SET exam_question_id = nextval('exam_questions_exam_question_id_seq')
        WHERE exam_question_id IS NULL;
        ALTER TABLE exam_questions ALTER COLUMN exam_question_id SET NOT NULL;
        ALTER TABLE exam_questions ADD PRIMARY KEY (exam_question_id);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_exam_questions_exam ON exam_questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_questions_question ON exam_questions(question_id);

-- =====================================================================
-- 13. EXAM_GROUPS (new)
-- =====================================================================

CREATE TABLE IF NOT EXISTS exam_groups (
    exam_group_id BIGSERIAL PRIMARY KEY,
    exam_id BIGINT NOT NULL REFERENCES exams(exam_id) ON DELETE CASCADE,
    group_id BIGINT NOT NULL REFERENCES question_groups(group_id) ON DELETE CASCADE,
    order_index INT NOT NULL DEFAULT 0,
    points DECIMAL(5,2) NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_exam_groups_exam ON exam_groups(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_groups_group ON exam_groups(group_id);

-- =====================================================================
-- 14. EXAM_ATTEMPTS: KEEP status, normalize timestamps
-- =====================================================================

-- status kept beyond design (dashboard/tests rely on IN_PROGRESS/GRADED)
ALTER TABLE exam_attempts ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'IN_PROGRESS';
DO $$
BEGIN
    BEGIN
        ALTER TABLE exam_attempts ALTER COLUMN start_time TYPE TIMESTAMP USING start_time::timestamp;
    EXCEPTION WHEN others THEN NULL;
    END;
    BEGIN
        ALTER TABLE exam_attempts ALTER COLUMN submit_time TYPE TIMESTAMP USING submit_time::timestamp;
    EXCEPTION WHEN others THEN NULL;
    END;
END $$;

-- =====================================================================
-- 15. ATTEMPT_ANSWERS: rename answer_id -> attempt_answer_id, -response_data
-- =====================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'attempt_answers' AND column_name = 'answer_id')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'attempt_answers' AND column_name = 'attempt_answer_id') THEN
        ALTER TABLE attempt_answers RENAME COLUMN answer_id TO attempt_answer_id;
    END IF;
END $$;
ALTER TABLE attempt_answers DROP COLUMN IF EXISTS response_data;

-- =====================================================================
-- 16. FLASHCARDS DOMAIN (new): decks, flashcards, user_card_progress
-- =====================================================================

CREATE TABLE IF NOT EXISTS decks (
    deck_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    course_id BIGINT REFERENCES courses(course_id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    is_public BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_decks_user ON decks(user_id);
CREATE INDEX IF NOT EXISTS idx_decks_course ON decks(course_id);

CREATE TABLE IF NOT EXISTS flashcards (
    card_id BIGSERIAL PRIMARY KEY,
    deck_id BIGINT NOT NULL REFERENCES decks(deck_id) ON DELETE CASCADE,
    front_text TEXT NOT NULL,
    back_text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_flashcards_deck ON flashcards(deck_id);

CREATE TABLE IF NOT EXISTS user_card_progress (
    progress_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    card_id BIGINT NOT NULL REFERENCES flashcards(card_id) ON DELETE CASCADE,
    is_starred BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(30) NOT NULL DEFAULT 'NEW',
    UNIQUE (user_id, card_id)
);
CREATE INDEX IF NOT EXISTS idx_user_card_progress_user ON user_card_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_card_progress_card ON user_card_progress(card_id);

-- =====================================================================
-- 17. NOTIFICATIONS DOMAIN (new): user_notifications
-- =====================================================================

CREATE TABLE IF NOT EXISTS user_notifications (
    user_notification_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    notification_id BIGINT NOT NULL REFERENCES notifications(notification_id) ON DELETE CASCADE,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (user_id, notification_id)
);
CREATE INDEX IF NOT EXISTS idx_user_notifications_user ON user_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_notification ON user_notifications(notification_id);

-- =====================================================================
-- 18. DISCOUNT DOMAIN (new): user_discounts
-- =====================================================================

CREATE TABLE IF NOT EXISTS user_discounts (
    user_discount_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    discount_id BIGINT NOT NULL REFERENCES discounts(discount_id) ON DELETE CASCADE,
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, discount_id)
);
CREATE INDEX IF NOT EXISTS idx_user_discounts_user ON user_discounts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_discounts_discount ON user_discounts(discount_id);

-- =====================================================================
-- 19. CONTEST DOMAIN (new): contests, contest_participants, contest_reward
-- =====================================================================

CREATE TABLE IF NOT EXISTS contests (
    contest_id BIGSERIAL PRIMARY KEY,
    exam_id BIGINT NOT NULL REFERENCES exams(exam_id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    reward_config JSON,
    start_time TIMESTAMP NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'UPCOMING'
);
CREATE INDEX IF NOT EXISTS idx_contests_exam ON contests(exam_id);

CREATE TABLE IF NOT EXISTS contest_participants (
    participant_id BIGSERIAL PRIMARY KEY,
    contest_id BIGINT NOT NULL REFERENCES contests(contest_id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    score DECIMAL(5,2),
    rank INT,
    reward_claimed BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (contest_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_contest_participants_contest ON contest_participants(contest_id);
CREATE INDEX IF NOT EXISTS idx_contest_participants_user ON contest_participants(user_id);

CREATE TABLE IF NOT EXISTS contest_reward (
    reward_id BIGSERIAL PRIMARY KEY,
    contest_id BIGINT NOT NULL REFERENCES contests(contest_id) ON DELETE CASCADE,
    discount_id BIGINT NOT NULL REFERENCES discounts(discount_id) ON DELETE RESTRICT,
    rank_position INT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contest_reward_contest ON contest_reward(contest_id);

-- =====================================================================
-- 20. REFRESH_TOKENS (kept beyond design for Auth, per user decision)
-- =====================================================================

CREATE TABLE IF NOT EXISTS refresh_tokens (
    refresh_token_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

-- Normalize refresh_tokens timestamps if table pre-existed with TIMESTAMPTZ
DO $$
BEGIN
    BEGIN
        ALTER TABLE refresh_tokens ALTER COLUMN expires_at TYPE TIMESTAMP USING expires_at::timestamp;
    EXCEPTION WHEN others THEN NULL;
    END;
    BEGIN
        ALTER TABLE refresh_tokens ALTER COLUMN revoked_at TYPE TIMESTAMP USING revoked_at::timestamp;
    EXCEPTION WHEN others THEN NULL;
    END;
    BEGIN
        ALTER TABLE refresh_tokens ALTER COLUMN created_at TYPE TIMESTAMP USING created_at::timestamp;
    EXCEPTION WHEN others THEN NULL;
    END;
END $$;

-- =====================================================================
-- 21. DROP OBSOLETE (not in new design, no code uses them)
-- =====================================================================

DROP TABLE IF EXISTS password_reset_tokens;
DROP TABLE IF EXISTS system_settings;
DROP TABLE IF EXISTS roles;

-- =====================================================================
-- 22. PERFORMANCE INDEXES (new design + kept dashboard queries)
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role_name ON users(role_name);
CREATE INDEX IF NOT EXISTS idx_courses_slug ON courses(slug);
CREATE INDEX IF NOT EXISTS idx_courses_category ON courses(category_id);
CREATE INDEX IF NOT EXISTS idx_courses_manager ON courses(manager_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_user ON enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_questions_module ON questions(module_id);
CREATE INDEX IF NOT EXISTS idx_questions_group ON questions(group_id);
CREATE INDEX IF NOT EXISTS idx_answer_options_question ON answer_options(question_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_exam ON exam_attempts(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_user ON exam_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_attempt_answers_attempt ON attempt_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_attempt_answers_question ON attempt_answers(question_id);
