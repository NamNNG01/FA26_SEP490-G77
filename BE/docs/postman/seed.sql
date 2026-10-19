-- =====================================================================
-- ExamPrep Seed SQL for Dev / Test Environment
-- Passwords for all accounts: Password123! (BCrypt hashed below)
-- =====================================================================

-- 1. Users
INSERT INTO users (email, password_hash, full_name, role_name, status, created_at, updated_at)
VALUES
('admin@examprep.local', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'System Admin', 'ADMIN', 'ACTIVE', NOW(), NOW()),
('managerA@examprep.local', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Manager Alice', 'COURSE_MANAGER', 'ACTIVE', NOW(), NOW()),
('managerB@examprep.local', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Manager Bob', 'COURSE_MANAGER', 'ACTIVE', NOW(), NOW()),
('managerC@examprep.local', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Manager Charlie', 'COURSE_MANAGER', 'ACTIVE', NOW(), NOW()),
('student1@examprep.local', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Student Enrolled', 'STUDENT', 'ACTIVE', NOW(), NOW()),
('student2@examprep.local', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Student Not Enrolled', 'STUDENT', 'ACTIVE', NOW(), NOW())
ON CONFLICT (email) DO NOTHING;

-- 2. Courses
-- 2. Courses
INSERT INTO courses (
    title,
    slug,
    description,
    price,
    is_published,
    created_at,
    updated_at
)
VALUES
(
    'Java Programming Masterclass',
    'JAVA101',
    'Learn Java from scratch to advanced.',
    0,
    TRUE,
    NOW(),
    NOW()
),
(
    'Spring Boot Enterprise Architecture',
    'SB202',
    'Build robust enterprise apps with Spring Boot.',
    0,
    TRUE,
    NOW(),
    NOW()
)
ON CONFLICT (slug) DO NOTHING;

-- 3. Course Managers
INSERT INTO course_managers (course_id, user_id, assigned_at)
SELECT c.course_id, u.user_id, NOW()
FROM courses c, users u
WHERE (c.code = 'JAVA101' AND u.email IN ('managerA@examprep.local', 'managerB@examprep.local'))
   OR (c.code = 'SB202' AND u.email = 'managerC@examprep.local')
ON CONFLICT DO NOTHING;

-- 4. Enrollments
INSERT INTO enrollments (course_id, user_id, enrolled_at, status)
SELECT c.course_id, u.user_id, NOW(), 'ACTIVE'
FROM courses c, users u
WHERE c.code = 'JAVA101' AND u.email = 'student1@examprep.local'
ON CONFLICT DO NOTHING;

-- 5. Modules
INSERT INTO modules (course_id, title, display_order)
SELECT c.course_id, m.title, m.display_order
FROM courses c, (VALUES
    ('JAVA101', 'Java Basics', 1),
    ('JAVA101', 'Object Oriented Programming', 2),
    ('SB202', 'Spring Fundamentals', 1),
    ('SB202', 'Spring Security & JPA', 2)
) AS m(code, title, display_order)
WHERE c.code = m.code
ON CONFLICT DO NOTHING;

-- 6. Question Groups
INSERT INTO question_groups (course_id, title)
SELECT c.course_id, 'General Question Group'
FROM courses c
ON CONFLICT DO NOTHING;

-- 7. Subscription Plans & User Subscriptions
INSERT INTO subscription_plans (name, ai_token_limit, price, duration_days)
VALUES
('Standard Plan', 50000, 0, 365),
('Tiny Plan (429 Test)', 200, 0, 365)
ON CONFLICT DO NOTHING;

INSERT INTO user_subscriptions (user_id, plan_id, start_date, end_date, status)
SELECT u.user_id, p.plan_id, NOW() - INTERVAL '1 day', NOW() + INTERVAL '30 days', 'ACTIVE'
FROM users u, subscription_plans p
WHERE (u.email = 'managerA@examprep.local' AND p.ai_token_limit = 50000)
   OR (u.email = 'managerB@examprep.local' AND p.ai_token_limit = 200)
ON CONFLICT DO NOTHING;

-- 8. Documents
INSERT INTO documents (course_id, title, file_path, extracted_content, created_at)
SELECT c.course_id, 'Java Overview Document', '/docs/java_overview.pdf', 'Java is a high-level, class-based, object-oriented programming language designed to have as few implementation dependencies as possible.', NOW()
FROM courses c WHERE c.code = 'JAVA101'
UNION ALL
SELECT c.course_id, 'Spring Boot Architecture', '/docs/spring_arch.pdf', 'Spring Boot makes it easy to create stand-alone, production-grade Spring based Applications that you can "just run".', NOW()
FROM courses c WHERE c.code = 'SB202'
ON CONFLICT DO NOTHING;

-- 9. Sample Questions (6 types)
INSERT INTO questions (course_id, question_type, difficulty, content, explanation, default_points, status, approval_status, creator_role, source, scoring_version, content_hash, lock_version)
SELECT c.course_id, q.qtype, q.diff, q.content, 'Explanation here', q.pts, q.st, q.ast, 'COURSE_MANAGER', 'MANUAL', 1, md5(q.content), 1
FROM courses c, (VALUES
    ('SINGLE_CHOICE', 'EASY', 'What is the default value of an int field in Java?', 1, 'ACTIVE', 'APPROVED'),
    ('MULTIPLE_CHOICE', 'MEDIUM', 'Which of the following are valid Java access modifiers?', 2, 'ACTIVE', 'APPROVED'),
    ('TRUE_FALSE', 'EASY', 'Java is a compiled and interpreted language.', 1, 'DRAFT', 'PENDING'),
    ('MATCHING', 'HARD', 'Match the Java collection with its property.', 3, 'INACTIVE', 'APPROVED'),
    ('FILL_BLANK', 'MEDIUM', 'The keyword used to inherit a class in Java is ____.', 2, 'ACTIVE', 'STUDENT_PENDING'),
    ('ESSAY', 'HARD', 'Explain polymorphism in Java with an example.', 5, 'ACTIVE', 'APPROVED')
) AS q(qtype, diff, content, pts, st, ast)
WHERE c.code = 'JAVA101'
ON CONFLICT DO NOTHING;

-- 10. Exam Published & Attempt
INSERT INTO exams (course_id, title, duration_minutes, status, created_at, updated_at)
SELECT c.course_id, 'Java Midterm Exam', 60, 'PUBLISHED', NOW(), NOW()
FROM courses c WHERE c.code = 'JAVA101'
ON CONFLICT DO NOTHING;
