-- V61__material_multi_course.sql
-- A material is one stored file of one student. The same file may be used for several of the
-- student's courses, so the single documents.course_id becomes the document_courses join table.
-- Uploads are de-duplicated by the SHA-256 of the file content per owner.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS sha256 VARCHAR(64);
-- Provider key of the stored file (Cloudinary public id / local file id), needed to delete it.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_key VARCHAR(512);

CREATE TABLE IF NOT EXISTS document_courses (
    doc_id     BIGINT    NOT NULL REFERENCES documents(doc_id) ON DELETE CASCADE,
    course_id  BIGINT    NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (doc_id, course_id)
);
CREATE INDEX IF NOT EXISTS idx_document_courses_course ON document_courses(course_id, doc_id);

-- Move every existing material's course into the join table before the column goes away.
INSERT INTO document_courses (doc_id, course_id)
SELECT doc_id, course_id
FROM documents
WHERE course_id IS NOT NULL
ON CONFLICT (doc_id, course_id) DO NOTHING;

-- The old upload path stored one row per (file, course). Merge rows of the same student that hold
-- the same file name, size and extracted text; the oldest row survives.
DROP TABLE IF EXISTS tmp_document_dupes;
CREATE TEMP TABLE tmp_document_dupes AS
SELECT d.doc_id AS dup_id, keep.doc_id AS keep_id
FROM documents d
JOIN (
    SELECT user_id,
           file_name,
           file_size_kb,
           md5(extracted_content) AS content_hash,
           MIN(doc_id)            AS doc_id
    FROM documents
    WHERE file_name IS NOT NULL
    GROUP BY user_id, file_name, file_size_kb, md5(extracted_content)
    HAVING COUNT(*) > 1
) keep
  ON keep.user_id = d.user_id
 AND keep.file_name = d.file_name
 AND keep.file_size_kb IS NOT DISTINCT FROM d.file_size_kb
 AND keep.content_hash = md5(d.extracted_content)
WHERE d.doc_id <> keep.doc_id;

-- Course links and generated questions move to the surviving row.
INSERT INTO document_courses (doc_id, course_id)
SELECT merged.doc_id, merged.course_id
FROM (
    SELECT DISTINCT m.keep_id AS doc_id, dc.course_id
    FROM tmp_document_dupes m
    JOIN document_courses dc ON dc.doc_id = m.dup_id
) merged
ON CONFLICT (doc_id, course_id) DO NOTHING;

UPDATE questions q
SET source_document_id = m.keep_id
FROM tmp_document_dupes m
WHERE q.source_document_id = m.dup_id;

-- Two merged rows may both have an active job. Keep the newest one per (student, surviving
-- document) and refund the reservations of the others, exactly like V56.
DROP TABLE IF EXISTS tmp_document_dupe_jobs;
CREATE TEMP TABLE tmp_document_dupe_jobs AS
SELECT job_id FROM (
    SELECT j.job_id,
           ROW_NUMBER() OVER (
               PARTITION BY j.user_id, COALESCE(m.keep_id, j.doc_id)
               ORDER BY j.created_at DESC, j.job_id DESC) AS row_num
    FROM quiz_generation_jobs j
    LEFT JOIN tmp_document_dupes m ON m.dup_id = j.doc_id
    WHERE j.status IN ('PENDING', 'PROCESSING')
) ranked
WHERE row_num > 1;

UPDATE quiz_generation_jobs j
SET status = 'FAILED',
    error_message = 'DUPLICATE_ACTIVE_JOB',
    completed_at = NOW(),
    updated_at = NOW()
FROM tmp_document_dupe_jobs d
WHERE j.job_id = d.job_id;

UPDATE ai_usage_logs l
SET status = 'FAILED',
    reserved_tokens = 0,
    error_message = 'DUPLICATE_ACTIVE_JOB'
FROM quiz_generation_jobs j
JOIN tmp_document_dupe_jobs d ON d.job_id = j.job_id
WHERE l.log_id = j.ai_usage_log_id
  AND l.status = 'PENDING';

UPDATE quiz_generation_jobs j
SET doc_id = m.keep_id
FROM tmp_document_dupes m
WHERE j.doc_id = m.dup_id;

DELETE FROM documents d
USING tmp_document_dupes m
WHERE d.doc_id = m.dup_id;

DROP TABLE IF EXISTS tmp_document_dupe_jobs;
DROP TABLE IF EXISTS tmp_document_dupes;

DROP INDEX IF EXISTS idx_documents_course;
ALTER TABLE documents DROP COLUMN IF EXISTS course_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_user_sha256
    ON documents(user_id, sha256)
    WHERE sha256 IS NOT NULL;
