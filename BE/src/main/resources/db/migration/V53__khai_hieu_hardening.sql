-- V53__khai_hieu_hardening.sql
-- MQ-03: one active quiz job per (student, document). The application check alone is racy, so the
-- database enforces it and legacy duplicates are failed (their reservations are refunded).

CREATE TEMP TABLE tmp_duplicate_quiz_jobs ON COMMIT DROP AS
SELECT job_id FROM (
    SELECT job_id,
           ROW_NUMBER() OVER (PARTITION BY user_id, doc_id ORDER BY created_at DESC, job_id DESC) AS row_num
    FROM quiz_generation_jobs
    WHERE status IN ('PENDING', 'PROCESSING')
) ranked
WHERE row_num > 1;

UPDATE quiz_generation_jobs j
SET status = 'FAILED',
    error_message = 'DUPLICATE_ACTIVE_JOB',
    completed_at = NOW(),
    updated_at = NOW()
FROM tmp_duplicate_quiz_jobs d
WHERE j.job_id = d.job_id;

UPDATE ai_usage_logs l
SET status = 'FAILED',
    reserved_tokens = 0,
    error_message = 'DUPLICATE_ACTIVE_JOB'
FROM quiz_generation_jobs j
JOIN tmp_duplicate_quiz_jobs d ON d.job_id = j.job_id
WHERE l.log_id = j.ai_usage_log_id
  AND l.status = 'PENDING';

CREATE UNIQUE INDEX IF NOT EXISTS uq_qgj_user_doc_active
    ON quiz_generation_jobs(user_id, doc_id)
    WHERE status IN ('PENDING', 'PROCESSING');
