-- Student reports of a wrong question, the manager ticket that groups them, its history, and the
-- regrade jobs a correction starts. At most one open ticket (PENDING / IN_PROGRESS) per question:
-- a second report of the same question joins the open ticket.

CREATE TABLE IF NOT EXISTS question_issues (
    issue_id              BIGSERIAL PRIMARY KEY,
    question_id           BIGINT       NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
    course_id             BIGINT       REFERENCES courses(course_id) ON DELETE SET NULL,
    issue_type            VARCHAR(30)  NOT NULL,
    status                VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    assigned_to           BIGINT       REFERENCES users(user_id) ON DELETE SET NULL,
    duplicate_of_issue_id BIGINT       REFERENCES question_issues(issue_id) ON DELETE SET NULL,
    resolution_type       VARCHAR(40),
    resolution_note       TEXT,
    resolved_by           BIGINT       REFERENCES users(user_id) ON DELETE SET NULL,
    resolved_at           TIMESTAMP,
    created_at            TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_qi_issue_type CHECK (issue_type IN ('WRONG_CONTENT','WRONG_ANSWER','WRONG_EXPLANATION','AI_EXPLANATION_ERROR','MISSING_MEDIA','OTHER')),
    CONSTRAINT chk_qi_status CHECK (status IN ('PENDING','IN_PROGRESS','RESOLVED','REJECTED','DUPLICATE')),
    CONSTRAINT chk_qi_resolution_type CHECK (resolution_type IS NULL OR resolution_type IN (
        'CONTENT_CORRECTED','EXPLANATION_CORRECTED','AI_EXPLANATION_CORRECTED','ANSWER_CORRECTED',
        'RUBRIC_CORRECTED','QUESTION_VOIDED','OTHER_CORRECTION'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_question_issues_open ON question_issues(question_id) WHERE status IN ('PENDING','IN_PROGRESS');
CREATE INDEX IF NOT EXISTS idx_question_issues_course_status ON question_issues(course_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS question_issue_reports (
    report_id      BIGSERIAL PRIMARY KEY,
    issue_id       BIGINT        NOT NULL REFERENCES question_issues(issue_id) ON DELETE CASCADE,
    user_id        BIGINT        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    issue_type     VARCHAR(30)   NOT NULL,
    description    TEXT          NOT NULL,
    attachment_url VARCHAR(1000),
    created_at     TIMESTAMP     NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_question_issue_reports_user UNIQUE (issue_id, user_id),
    CONSTRAINT chk_qir_issue_type CHECK (issue_type IN ('WRONG_CONTENT','WRONG_ANSWER','WRONG_EXPLANATION','AI_EXPLANATION_ERROR','MISSING_MEDIA','OTHER'))
);
CREATE INDEX IF NOT EXISTS idx_question_issue_reports_user ON question_issue_reports(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS question_issue_history (
    history_id  BIGSERIAL PRIMARY KEY,
    issue_id    BIGINT      NOT NULL REFERENCES question_issues(issue_id) ON DELETE CASCADE,
    actor_id    BIGINT      REFERENCES users(user_id) ON DELETE SET NULL,
    action      VARCHAR(30) NOT NULL,
    from_status VARCHAR(20),
    to_status   VARCHAR(20),
    note        TEXT,
    created_at  TIMESTAMP   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_question_issue_history_issue ON question_issue_history(issue_id, created_at);

CREATE TABLE IF NOT EXISTS question_regrade_jobs (
    job_id                BIGSERIAL PRIMARY KEY,
    issue_id              BIGINT      NOT NULL REFERENCES question_issues(issue_id) ON DELETE CASCADE,
    question_id           BIGINT      NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
    resolution_type       VARCHAR(40) NOT NULL,
    status                VARCHAR(25) NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    question_version_from INT,
    question_version_to   INT         NOT NULL,
    total_answers         INT         NOT NULL DEFAULT 0,
    processed_answers     INT         NOT NULL DEFAULT 0,
    failed_answers        INT         NOT NULL DEFAULT 0,
    reason                TEXT,
    confirmed_by          BIGINT      REFERENCES users(user_id) ON DELETE SET NULL,
    confirmed_at          TIMESTAMP,
    finished_at           TIMESTAMP,
    created_at            TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMP   NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_qrj_status CHECK (status IN ('PENDING_CONFIRMATION','RUNNING','COMPLETED','PARTIAL_FAILED','FAILED','CANCELLED'))
);
CREATE INDEX IF NOT EXISTS idx_question_regrade_jobs_issue ON question_regrade_jobs(issue_id, created_at DESC);
