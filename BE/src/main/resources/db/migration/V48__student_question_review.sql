-- V48__student_question_review.sql
CREATE TABLE IF NOT EXISTS question_review (
    review_id         BIGSERIAL    PRIMARY KEY,
    student_id        BIGINT       NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    question_id       BIGINT       NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
    status            VARCHAR(30)  NOT NULL DEFAULT 'WRONG_BOOKMARKED',
    bookmark          BOOLEAN      NOT NULL DEFAULT FALSE,
    wrong_count       INT          NOT NULL DEFAULT 1,
    last_wrong_choice VARCHAR(50),
    first_wrong_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    last_practiced_at TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_student_question_review UNIQUE (student_id, question_id),
    CONSTRAINT chk_qr_status CHECK (status IN ('WRONG_BOOKMARKED','ANSWERED_BOOKMARKED'))
);

CREATE INDEX IF NOT EXISTS idx_qr_student ON question_review(student_id);
CREATE INDEX IF NOT EXISTS idx_qr_question ON question_review(question_id);
CREATE INDEX IF NOT EXISTS idx_qr_last_practiced ON question_review(student_id, last_practiced_at DESC);
