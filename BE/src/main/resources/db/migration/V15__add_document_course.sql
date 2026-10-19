-- V15__add_document_course.sql
ALTER TABLE documents ADD COLUMN IF NOT EXISTS course_id BIGINT REFERENCES courses(course_id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_documents_course ON documents(course_id);
