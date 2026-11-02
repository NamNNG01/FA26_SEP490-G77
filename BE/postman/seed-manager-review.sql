-- seed-manager-review.sql
-- Run this SQL in PostgreSQL to seed sample data for testing Manager Review APIs.
-- All timestamps are in UTC.

-- 1. Insert Users (Password hashes are dummy bcrypt)
INSERT INTO users (user_id, email, password_hash, full_name, role_name, status, created_at, updated_at)
VALUES
  (9001, 'managerA@test.com', '$2a$10$examplehashexamplehashexamplehashexamplehash', 'Manager A', 'COURSE_MANAGER', 'ACTIVE', NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC'),
  (9002, 'managerB@test.com', '$2a$10$examplehashexamplehashexamplehashexamplehash', 'Manager B', 'COURSE_MANAGER', 'ACTIVE', NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC'),
  (9003, 'admin@test.com', '$2a$10$examplehashexamplehashexamplehashexamplehash', 'Admin User', 'ADMIN', 'ACTIVE', NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC'),
  (9004, 'studentA@test.com', '$2a$10$examplehashexamplehashexamplehashexamplehash', 'Student A', 'STUDENT', 'ACTIVE', NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC')
ON CONFLICT (user_id) DO NOTHING;

-- 2. Insert Categories
INSERT INTO categories (category_id, name, slug, created_at)
VALUES (5001, 'Computer Science', 'computer-science', NOW() AT TIME ZONE 'UTC')
ON CONFLICT (category_id) DO NOTHING;

-- 3. Insert Courses
INSERT INTO courses (course_id, manager_id, category_id, title, slug, price, is_published, created_at, updated_at)
VALUES
  (7001, 9001, 5001, 'Java Advanced Course', 'java-advanced', 0, true, NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC'),
  (7002, 9002, 5001, 'Python Course', 'python-course', 0, true, NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC')
ON CONFLICT (course_id) DO NOTHING;

-- 4. Insert Modules
INSERT INTO modules (module_id, course_id, title, order_index, created_at, updated_at)
VALUES (8001, 7001, 'OOP Advanced', 1, NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC')
ON CONFLICT (module_id) DO NOTHING;

-- 5. Insert Question Contributions (Pending)
INSERT INTO question_contributions (contribution_id, user_id, course_id, module_id, type, question_type, title, content, difficulty, options_json, status, resubmission_count, version, submitted_at, updated_at)
VALUES
  (1, 9004, 7001, 8001, 'QUESTION', 'SINGLE_CHOICE', 'Sample Contribution 1', 'What is polymorphism?', 'MEDIUM', '[{\"optionText\":\"Many forms\",\"isCorrect\":true,\"orderIndex\":0},{\"optionText\":\"Single form\",\"isCorrect\":false,\"orderIndex\":1}]', 'PENDING', 0, 0, NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC'),
  (2, 9004, 7001, 8001, 'QUESTION', 'SINGLE_CHOICE', 'Sample Contribution 2', 'What is inheritance?', 'EASY', '[{\"optionText\":\"Reusability\",\"isCorrect\":true,\"orderIndex\":0},{\"optionText\":\"None\",\"isCorrect\":false,\"orderIndex\":1}]', 'PENDING', 0, 0, NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC')
ON CONFLICT (contribution_id) DO NOTHING;

-- 6. Insert Decks (Pending review)
INSERT INTO decks (deck_id, user_id, course_id, module_id, title, description, is_public, visibility, review_status, resubmission_count, version, created_at, updated_at, submitted_at)
VALUES
  (1, 9004, 7001, 8001, 'Java OOP Deck', 'Important OOP terms', false, 'PRIVATE', 'PENDING', 0, 0, NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC')
ON CONFLICT (deck_id) DO NOTHING;

-- 7. Insert Flashcards for Deck 1
INSERT INTO flashcards (card_id, deck_id, front_text, back_text, position, created_at)
VALUES
  (101, 1, 'Class', 'Blueprint of an object', 1, NOW() AT TIME ZONE 'UTC'),
  (102, 1, 'Object', 'Instance of a class', 2, NOW() AT TIME ZONE 'UTC')
ON CONFLICT (card_id) DO NOTHING;

-- Cleanup script instructions:
-- DELETE FROM flashcards WHERE deck_id = 1;
-- DELETE FROM decks WHERE deck_id = 1;
-- DELETE FROM question_contributions WHERE contribution_id IN (1, 2);
-- DELETE FROM modules WHERE module_id = 8001;
-- DELETE FROM courses WHERE course_id IN (7001, 7002);
-- DELETE FROM categories WHERE category_id = 5001;
-- DELETE FROM users WHERE user_id BETWEEN 9001 AND 9004;
