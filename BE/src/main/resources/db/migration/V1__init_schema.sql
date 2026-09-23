-- V1__init_schema.sql
-- Production-Ready 5-Module Normalized Database Schema for Exam Preparation Platform

-- Enable Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- PHÂN HỆ 1: NGƯỜI DÙNG & PHÂN QUYỀN (Users & RBAC)
CREATE TABLE IF NOT EXISTS roles (
    role_id BIGSERIAL PRIMARY KEY,
    role_code VARCHAR(50) NOT NULL UNIQUE,
    role_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    user_id BIGSERIAL PRIMARY KEY,
    role_id BIGINT NOT NULL REFERENCES roles(role_id),
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    avatar_url VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- PHÂN HỆ 2: KHÓA HỌC & CẤU TRÚC NỘI DUNG (Course & Content)
CREATE TABLE IF NOT EXISTS categories (
    category_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    parent_id INT REFERENCES categories(category_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS courses (
    course_id BIGSERIAL PRIMARY KEY,
    category_id INT NOT NULL REFERENCES categories(category_id),
    manager_id BIGINT NOT NULL REFERENCES users(user_id),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    thumbnail_url VARCHAR(255),
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS enrollments (
    enrollment_id BIGSERIAL PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    enrolled_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS modules (
    module_id BIGSERIAL PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    order_index INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS lessons (
    lesson_id BIGSERIAL PRIMARY KEY,
    module_id BIGINT NOT NULL REFERENCES modules(module_id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    content_type VARCHAR(50) NOT NULL DEFAULT 'TEXT',
    content_body TEXT,
    order_index INT NOT NULL DEFAULT 0
);

-- PHÂN HỆ 3: NGÂN HÀNG CÂU HỎI (Question Bank)
CREATE TABLE IF NOT EXISTS question_groups (
    group_id BIGSERIAL PRIMARY KEY,
    module_id BIGINT REFERENCES modules(module_id) ON DELETE SET NULL,
    title VARCHAR(200) NOT NULL,
    passage_text TEXT,
    media_url VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS questions (
    question_id BIGSERIAL PRIMARY KEY,
    module_id BIGINT NOT NULL REFERENCES modules(module_id) ON DELETE CASCADE,
    group_id BIGINT REFERENCES question_groups(group_id) ON DELETE SET NULL,
    question_type VARCHAR(50) NOT NULL DEFAULT 'SINGLE_CHOICE',
    difficulty VARCHAR(50) NOT NULL DEFAULT 'MEDIUM',
    content TEXT NOT NULL,
    question_metadata JSONB,
    explanation TEXT,
    created_by BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS answer_options (
    option_id BIGSERIAL PRIMARY KEY,
    question_id BIGINT NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
    match_key VARCHAR(100),
    order_index INT NOT NULL DEFAULT 0
);

-- PHÂN HỆ 4: QUẢN LÝ ĐỀ THI & CẤU HÌNH ĐỀ (Exams & Matrix)
CREATE TABLE IF NOT EXISTS exams (
    exam_id BIGSERIAL PRIMARY KEY,
    course_id BIGINT NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    created_by BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
    title VARCHAR(200) NOT NULL,
    duration_minutes INT NOT NULL DEFAULT 60,
    is_practice BOOLEAN NOT NULL DEFAULT FALSE,
    generation_type VARCHAR(50) NOT NULL DEFAULT 'FIXED',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS exam_configs (
    config_id BIGSERIAL PRIMARY KEY,
    exam_id BIGINT NOT NULL REFERENCES exams(exam_id) ON DELETE CASCADE,
    module_id BIGINT NOT NULL REFERENCES modules(module_id) ON DELETE CASCADE,
    difficulty VARCHAR(50) NOT NULL DEFAULT 'ANY',
    number_of_questions INT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS exam_questions (
    exam_id BIGINT NOT NULL REFERENCES exams(exam_id) ON DELETE CASCADE,
    question_id BIGINT NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
    question_order INT NOT NULL DEFAULT 0,
    PRIMARY KEY (exam_id, question_id)
);

-- PHÂN HỆ 5: LỢT THI & CÂU TRẢ LỜI (Attempts & Grading)
CREATE TABLE IF NOT EXISTS exam_attempts (
    attempt_id BIGSERIAL PRIMARY KEY,
    exam_id BIGINT NOT NULL REFERENCES exams(exam_id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submit_time TIMESTAMP WITH TIME ZONE,
    total_score NUMERIC(5, 2),
    status VARCHAR(50) NOT NULL DEFAULT 'IN_PROGRESS'
);

CREATE TABLE IF NOT EXISTS attempt_answers (
    answer_id BIGSERIAL PRIMARY KEY,
    attempt_id BIGINT NOT NULL REFERENCES exam_attempts(attempt_id) ON DELETE CASCADE,
    question_id BIGINT NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
    selected_option_id BIGINT REFERENCES answer_options(option_id) ON DELETE SET NULL,
    essay_answer TEXT,
    response_data JSONB,
    is_correct BOOLEAN,
    score_earned NUMERIC(5, 2)
);

-- SYSTEM SETTINGS TABLE
CREATE TABLE IF NOT EXISTS system_settings (
    setting_id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT,
    description TEXT
);
