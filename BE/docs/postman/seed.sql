-- =====================================================================
-- ExamPrep Seed SQL for Dev / Test Environment (All Question Types)
-- Passwords for all accounts: Password123!
-- =====================================================================

-- 1. Categories
INSERT INTO categories (category_id, name, slug)
VALUES (1, 'Programming', 'programming'),
       (2, 'Enterprise Architecture', 'enterprise-architecture')
ON CONFLICT (slug) DO NOTHING;

-- 2. Users (Role names or role_id matching V1/V2)
-- Assuming users table has role_id or role_name depending on migration. We insert with role_id = 1 (Admin/Manager) or role_name.
-- Let's check how UserRepository/Auth handles users.
INSERT INTO users (user_id, email, password_hash, full_name, status, created_at, updated_at)
VALUES
(1, 'admin@examprep.local', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'System Admin', 'ACTIVE', NOW(), NOW()),
(2, 'managerA@examprep.local', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Manager Alice', 'ACTIVE', NOW(), NOW()),
(3, 'managerB@examprep.local', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Manager Bob', 'ACTIVE', NOW(), NOW()),
(4, 'managerC@examprep.local', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Manager Charlie', 'ACTIVE', NOW(), NOW()),
(5, 'student1@examprep.local', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Student Enrolled', 'ACTIVE', NOW(), NOW()),
(6, 'student2@examprep.local', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'Student Not Enrolled', 'ACTIVE', NOW(), NOW())
ON CONFLICT (email) DO NOTHING;

-- 3. Courses
INSERT INTO courses (course_id, category_id, manager_id, title, slug, description, is_published, created_at, updated_at)
VALUES
(1, 1, 2, 'Java Programming Masterclass', 'JAVA101', 'Learn Java from scratch.', TRUE, NOW(), NOW()),
(2, 2, 4, 'Spring Boot Enterprise Architecture', 'SB202', 'Build robust enterprise apps.', TRUE, NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;

-- 4. Course Managers
INSERT INTO course_managers (course_id, user_id, assigned_at)
VALUES
(1, 2, NOW()),
(1, 3, NOW()),
(2, 4, NOW())
ON CONFLICT DO NOTHING;

-- 5. Enrollments
INSERT INTO enrollments (course_id, user_id, enrolled_at, status)
VALUES (1, 5, NOW(), 'ACTIVE')
ON CONFLICT DO NOTHING;

-- 6. Modules
INSERT INTO modules (module_id, course_id, title, order_index)
VALUES
(1, 1, 'Java Basics', 1),
(2, 1, 'Advanced Java', 2),
(3, 2, 'Spring Fundamentals', 1)
ON CONFLICT DO NOTHING;

-- 7. Question Groups
INSERT INTO question_groups (group_id, module_id, title, passage_text)
VALUES (1, 1, 'Default Reading Group', 'Read the passage below and answer the questions.')
ON CONFLICT DO NOTHING;

-- 8. Subscription Plans & User Subscriptions
INSERT INTO subscription_plans (plan_id, name, ai_token_limit, price, duration_days)
VALUES
(1, 'Standard Plan', 50000, 0, 365),
(2, 'Tiny Plan (429 Test)', 200, 0, 365)
ON CONFLICT DO NOTHING;

INSERT INTO user_subscriptions (user_id, plan_id, start_date, end_date, status)
VALUES
(2, 1, NOW() - INTERVAL '1 day', NOW() + INTERVAL '30 days', 'ACTIVE'),
(3, 2, NOW() - INTERVAL '1 day', NOW() + INTERVAL '30 days', 'ACTIVE')
ON CONFLICT DO NOTHING;

-- 9. Documents
INSERT INTO documents (doc_id, course_id, title, file_path, extracted_content, created_at)
VALUES (1, 1, 'Java Overview', '/docs/java.pdf', 'Java content for AI generation.', NOW())
ON CONFLICT DO NOTHING;

-- 10. Sample Questions for All 8 Question Types
-- Note: questions table has columns: course_id, question_type, difficulty, content, question_metadata, answer_key, essay_grading_rubric, default_points, status, approval_status, creator_role, source, scoring_version, content_hash, lock_version
INSERT INTO questions (question_id, course_id, module_id, group_id, question_type, difficulty, content, default_points, status, approval_status, creator_role, source, scoring_version, content_hash, lock_version)
VALUES
(1, 1, 1, 1, 'SINGLE_CHOICE', 'EASY', 'What is the default value of an int field in Java?', 1, 'ACTIVE', 'APPROVED', 'MANAGER', 'MANUAL', 1, md5('What is the default value of an int field in Java?'), 0),
(2, 1, 1, 1, 'MULTIPLE_CHOICE', 'MEDIUM', 'Which of the following are valid Java access modifiers?', 2, 'ACTIVE', 'APPROVED', 'MANAGER', 'MANUAL', 1, md5('Which of the following are valid Java access modifiers?'), 0),
(3, 1, 1, 1, 'TRUE_FALSE', 'EASY', 'Java is a compiled and interpreted language.', 1, 'ACTIVE', 'APPROVED', 'MANAGER', 'MANUAL', 1, md5('Java is a compiled and interpreted language.'), 0),
(4, 1, 2, 1, 'MATCHING', 'HARD', 'Match the Java collection with its property.', 3, 'ACTIVE', 'APPROVED', 'MANAGER', 'MANUAL', 1, md5('Match the Java collection with its property.'), 0),
(5, 1, 2, 1, 'FILL_BLANK', 'MEDIUM', 'The keyword used to inherit a class in Java is {{1}}.', 2, 'ACTIVE', 'APPROVED', 'MANAGER', 'MANUAL', 1, md5('The keyword used to inherit a class in Java is {{1}}.'), 0),
(6, 1, 2, 1, 'ESSAY', 'HARD', 'Explain polymorphism in Java with an example.', 5, 'ACTIVE', 'APPROVED', 'MANAGER', 'MANUAL', 1, md5('Explain polymorphism in Java with an example.'), 0),
(7, 1, 1, 1, 'DIAGRAM', 'MEDIUM', 'Draw the class diagram for a library management system.', 4, 'ACTIVE', 'APPROVED', 'MANAGER', 'MANUAL', 1, md5('Draw the class diagram for a library management system.'), 0),
(8, 1, 1, 1, 'ORDERING', 'EASY', 'Order the steps of executing a Java program.', 2, 'ACTIVE', 'APPROVED', 'MANAGER', 'MANUAL', 1, md5('Order the steps of executing a Java program.'), 0)
ON CONFLICT (question_id) DO NOTHING;

-- Update metadata for DIAGRAM question (question_id = 7)
UPDATE questions
SET question_metadata = '{"drawioXml": "<mxfile><diagram>vZZbc5swEIb/DfvshbBwI8ndxG2ySdfU0iYtfdgQhW2sJ4Kkk1S//fYFlBInm0znnqQeGvaPj8ePzyY5sgyFtdX8fJ4O1qO73Z97Nn6n+0hF4sN+eI79w+H6x+bEdfh03T2N+/N8e0i91rX4f3g8f3H5Wz9oJ7L+N90d/8Iu5O7xH7NndYq1W3W5T6L7n8v1O8L2v4w4O8L2s9r1O8='}"}'::jsonb
WHERE question_id = 7;

-- Update answer_key for FILL_BLANK (question_id = 5) and MATCHING (question_id = 4)
UPDATE questions
SET answer_key = '{"blanks":[{"index":1,"accepted":["extends"],"caseSensitive":false}]}'::jsonb
WHERE question_id = 5;

UPDATE questions
SET answer_key = '{"pairs":[{"left":"List","right":"Ordered collection"},{"left":"Set","right":"Unique elements"}]}'::jsonb
WHERE question_id = 4;

-- 11. Answer Options for Choice, True/False, and Ordering questions
INSERT INTO answer_options (question_id, option_text, is_correct, order_index)
VALUES
-- Q1: SINGLE_CHOICE
(1, '0', TRUE, 0),
(1, 'null', FALSE, 1),
(1, '1', FALSE, 2),
(1, 'undefined', FALSE, 3),

-- Q2: MULTIPLE_CHOICE
(2, 'public', TRUE, 0),
(2, 'private', TRUE, 1),
(2, 'global', FALSE, 2),
(2, 'protected', TRUE, 3),

-- Q3: TRUE_FALSE
(3, 'True', TRUE, 0),
(3, 'False', FALSE, 1),

-- Q8: ORDERING
(8, 'Write source code in .java file', FALSE, 0),
(8, 'Compile with javac to bytecode (.class)', FALSE, 1),
(8, 'Run with java Virtual Machine (JVM)', FALSE, 2)
ON CONFLICT DO NOTHING;
