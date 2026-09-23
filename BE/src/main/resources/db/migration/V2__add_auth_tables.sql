-- V2__add_auth_tables.sql
-- Seed system roles and add authentication token tables

-- 1. Seed System Roles
INSERT INTO roles (role_id, role_code, role_name) VALUES 
(1, 'ADMIN', 'Quản trị viên'),
(2, 'COURSE_MANAGER', 'Quản lý khóa học'),
(3, 'STUDENT', 'Học viên'),
(4, 'GRADER', 'Người chấm thi')
ON CONFLICT (role_code) DO NOTHING;

-- Reset roles sequence
SELECT setval('roles_role_id_seq', (SELECT MAX(role_id) FROM roles));

-- 2. Create Refresh Tokens Table
CREATE TABLE IF NOT EXISTS refresh_tokens (
    refresh_token_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create Password Reset Tokens Table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    reset_token_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens(token_hash);
