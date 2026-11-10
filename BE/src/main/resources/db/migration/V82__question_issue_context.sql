-- Question issue reports carry where the student met the question (exam / result / practice / notebook),
-- which question number it was, the question version they saw, a snapshot of their answer and the answer
-- they think is right. Tickets get a stored priority (sortable) and a WITHDRAWN status for a ticket whose
-- every reporter took their report back. Regrade logs remember their job so a reporter can see the score change.

ALTER TABLE question_issue_reports
    ADD COLUMN IF NOT EXISTS source                VARCHAR(20),
    ADD COLUMN IF NOT EXISTS attempt_id            BIGINT REFERENCES exam_attempts(attempt_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS practice_session_id   BIGINT REFERENCES question_practice_sessions(session_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS question_number       INT,
    ADD COLUMN IF NOT EXISTS question_lock_version BIGINT,
    ADD COLUMN IF NOT EXISTS context_snapshot      TEXT,
    ADD COLUMN IF NOT EXISTS suggested_option_ids  TEXT,
    ADD COLUMN IF NOT EXISTS suggested_answer      TEXT;

ALTER TABLE question_issue_reports DROP CONSTRAINT IF EXISTS chk_qir_source;
ALTER TABLE question_issue_reports ADD CONSTRAINT chk_qir_source
    CHECK (source IS NULL OR source IN ('EXAM','EXAM_RESULT','PRACTICE','NOTEBOOK','OTHER'));

ALTER TABLE question_issues
    ADD COLUMN IF NOT EXISTS priority_score   INT       NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_reported_at TIMESTAMP;
UPDATE question_issues i SET last_reported_at = (SELECT MAX(r.created_at) FROM question_issue_reports r WHERE r.issue_id = i.issue_id)
WHERE last_reported_at IS NULL;

ALTER TABLE question_issues DROP CONSTRAINT IF EXISTS chk_qi_status;
ALTER TABLE question_issues ADD CONSTRAINT chk_qi_status
    CHECK (status IN ('PENDING','IN_PROGRESS','RESOLVED','REJECTED','DUPLICATE','WITHDRAWN'));
CREATE INDEX IF NOT EXISTS idx_question_issues_priority ON question_issues(priority_score DESC, created_at DESC);

ALTER TABLE answer_regrade_logs
    ADD COLUMN IF NOT EXISTS regrade_job_id BIGINT REFERENCES question_regrade_jobs(job_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_answer_regrade_logs_job ON answer_regrade_logs(regrade_job_id);
