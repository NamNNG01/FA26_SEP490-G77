-- V71__student_pages_perf_indexes.sql
-- Performance optimization indexes for the 4 Student pages (Courses, Exams, Materials, Saved Questions)

CREATE INDEX IF NOT EXISTS idx_documents_user_created ON documents (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_gen_jobs_user_doc_status ON quiz_generation_jobs (user_id, doc_id, status);
CREATE INDEX IF NOT EXISTS idx_answer_options_question ON answer_options (question_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_user_exam_status ON exam_attempts (user_id, exam_id, status);
