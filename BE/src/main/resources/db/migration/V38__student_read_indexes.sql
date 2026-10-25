-- V38__student_read_indexes.sql
CREATE INDEX IF NOT EXISTS idx_courses_published_title ON courses (is_published, title);
CREATE INDEX IF NOT EXISTS idx_enrollments_user_status ON enrollments (user_id, status);
CREATE INDEX IF NOT EXISTS idx_exams_course_status ON exams (course_id, status);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_user_exam ON exam_attempts (user_id, exam_id);
CREATE INDEX IF NOT EXISTS idx_decks_course ON decks (course_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_deck ON flashcards (deck_id);
CREATE INDEX IF NOT EXISTS idx_user_card_progress_user_card ON user_card_progress (user_id, card_id);
