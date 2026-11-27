-- V105: Deep AI explanations (SE-03, MP-10) and Manager background AI explanation jobs (AI-04).

ALTER TABLE attempt_answers
    ADD COLUMN IF NOT EXISTS deep_explanation TEXT;

CREATE TABLE IF NOT EXISTS question_practice_deep_explanations (
    practice_answer_id BIGINT PRIMARY KEY REFERENCES question_practice_answers(practice_answer_id) ON DELETE CASCADE,
    explanation TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS manager_explanation_jobs (
    job_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id),
    overwrite BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    total_count INT NOT NULL DEFAULT 0,
    succeeded_count INT NOT NULL DEFAULT 0,
    failed_count INT NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS manager_explanation_job_items (
    item_id BIGSERIAL PRIMARY KEY,
    job_id BIGINT NOT NULL REFERENCES manager_explanation_jobs(job_id) ON DELETE CASCADE,
    question_id BIGINT NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'SUCCEEDED', 'FAILED')),
    error_message TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mgr_expl_jobs_status_updated
    ON manager_explanation_jobs(status, updated_at);

CREATE INDEX IF NOT EXISTS idx_mgr_expl_job_items_job
    ON manager_explanation_job_items(job_id);

CREATE INDEX IF NOT EXISTS idx_mgr_expl_job_items_q_status
    ON manager_explanation_job_items(question_id, status);

CREATE INDEX IF NOT EXISTS idx_mgr_expl_job_items_q_id
    ON manager_explanation_job_items(question_id, item_id DESC);
