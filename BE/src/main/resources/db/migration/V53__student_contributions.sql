-- V53__student_contributions.sql
-- Covers: CQ-01 to CQ-06 student contributions (questions, documents, tips)

CREATE TABLE IF NOT EXISTS question_contributions (
    contribution_id       BIGSERIAL    PRIMARY KEY,
    user_id               BIGINT       NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    course_id             BIGINT       NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    type                  VARCHAR(30)  NOT NULL DEFAULT 'QUESTION', -- QUESTION, DOCUMENT, TIP
    title                 VARCHAR(500),
    content               TEXT         NOT NULL,
    module_id             BIGINT       REFERENCES modules(module_id) ON DELETE SET NULL,
    group_id              BIGINT       REFERENCES question_groups(question_group_id) ON DELETE SET NULL,
    question_type         VARCHAR(50),
    options_json          JSON,
    answer_key_json       JSON,
    explanation           TEXT,
    difficulty            VARCHAR(20),
    category_ids          JSON,
    essay_grading_rubric_json JSON,
    question_metadata_json JSON,
    file_url              VARCHAR(512),
    file_name             VARCHAR(255),
    file_size_kb          INT,
    source_reference      VARCHAR(500),
    status                VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    review_note           TEXT,
    reviewed_by           BIGINT       REFERENCES users(user_id) ON DELETE SET NULL,
    reviewed_at           TIMESTAMP,
    accepted_question_id  BIGINT       REFERENCES questions(question_id) ON DELETE SET NULL,
    resubmission_count    INT          NOT NULL DEFAULT 0,
    submitted_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- Idempotent column additions if table already existed from V41
ALTER TABLE question_contributions ADD COLUMN IF NOT EXISTS type VARCHAR(30) NOT NULL DEFAULT 'QUESTION';
ALTER TABLE question_contributions ADD COLUMN IF NOT EXISTS title VARCHAR(500);
ALTER TABLE question_contributions ADD COLUMN IF NOT EXISTS module_id BIGINT REFERENCES modules(module_id) ON DELETE SET NULL;
ALTER TABLE question_contributions ADD COLUMN IF NOT EXISTS group_id BIGINT REFERENCES question_groups(question_group_id) ON DELETE SET NULL;
ALTER TABLE question_contributions ADD COLUMN IF NOT EXISTS essay_grading_rubric_json JSON;
ALTER TABLE question_contributions ADD COLUMN IF NOT EXISTS question_metadata_json JSON;
ALTER TABLE question_contributions ADD COLUMN IF NOT EXISTS file_name VARCHAR(255);
ALTER TABLE question_contributions ADD COLUMN IF NOT EXISTS file_size_kb INT;
ALTER TABLE question_contributions ADD COLUMN IF NOT EXISTS source_reference VARCHAR(500);
ALTER TABLE question_contributions ADD COLUMN IF NOT EXISTS resubmission_count INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_contributions_user   ON question_contributions(user_id);
CREATE INDEX IF NOT EXISTS idx_contributions_course ON question_contributions(course_id);
CREATE INDEX IF NOT EXISTS idx_contributions_type   ON question_contributions(type);
CREATE INDEX IF NOT EXISTS idx_contributions_status ON question_contributions(status);
