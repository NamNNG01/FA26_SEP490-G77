-- V74__question_review_mastery.sql
-- The mistake notebook now hears right answers too: correct_streak counts right answers in a row since the last
-- wrong one, and QuestionReviewRecorder takes a question out of the wrong list after 2 of them.
-- last_wrong_choice now holds the readable answer (option texts, blanks, essay text) instead of clipped raw JSON.
ALTER TABLE question_review ADD COLUMN IF NOT EXISTS correct_streak INT NOT NULL DEFAULT 0;
ALTER TABLE question_review ALTER COLUMN last_wrong_choice TYPE VARCHAR(500);
