-- V51__optimization_indexes.sql
CREATE INDEX IF NOT EXISTS idx_qr_student_practiced ON question_review(student_id, last_practiced_at DESC);
CREATE INDEX IF NOT EXISTS idx_qr_student_wrong ON question_review(student_id, wrong_count DESC, last_practiced_at DESC);
CREATE INDEX IF NOT EXISTS idx_cp_contest_score ON contest_participants(contest_id, score DESC, finished_at ASC);
CREATE INDEX IF NOT EXISTS idx_attempts_user_status ON exam_attempts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_disc_course_tag_upvotes ON discussions(course_id, tag, upvote_count DESC);
CREATE INDEX IF NOT EXISTS idx_disc_course_tag_comments ON discussions(course_id, tag, comment_count DESC);
