-- V42__student_part2_flashcard_and_contest.sql
-- Covers: §26.1 items 3, 4, 5, 10, 14, 15 from student-full-spec-part2.md
-- APIs: FC-01..12, FP-01..03, FV-01, CT-01..07

-- =====================================================================
-- 1. DECKS: extend for FC-01..10 (owner_id=user_id already, add mode/visibility)
-- decks table exists from V4 (user_id, course_id, title, is_public)
-- =====================================================================
ALTER TABLE decks ADD COLUMN IF NOT EXISTS mode           VARCHAR(20)  NOT NULL DEFAULT 'PERSONAL';
ALTER TABLE decks ADD COLUMN IF NOT EXISTS visibility     VARCHAR(20)  NOT NULL DEFAULT 'PRIVATE';
ALTER TABLE decks ADD COLUMN IF NOT EXISTS review_status  VARCHAR(30)  NOT NULL DEFAULT 'NONE';
ALTER TABLE decks ADD COLUMN IF NOT EXISTS review_note    TEXT;
ALTER TABLE decks ADD COLUMN IF NOT EXISTS reviewed_by    BIGINT       REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE decks ADD COLUMN IF NOT EXISTS reviewed_at    TIMESTAMP;
ALTER TABLE decks ADD COLUMN IF NOT EXISTS description    TEXT;
ALTER TABLE decks ADD COLUMN IF NOT EXISTS created_at     TIMESTAMP    NOT NULL DEFAULT NOW();
ALTER TABLE decks ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMP    NOT NULL DEFAULT NOW();
ALTER TABLE decks ADD COLUMN IF NOT EXISTS card_count     INT          NOT NULL DEFAULT 0;

-- Drop old is_public (replaced by visibility)
-- We keep is_public for backwards compat but sync it: if is_public=true → visibility=PUBLIC
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='decks' AND column_name='is_public') THEN
        UPDATE decks SET visibility = 'PUBLIC' WHERE is_public = TRUE AND visibility = 'PRIVATE';
    END IF;
END $$;

ALTER TABLE decks ADD CONSTRAINT chk_deck_mode         CHECK (mode         IN ('PERSONAL','COURSE')) ;
ALTER TABLE decks ADD CONSTRAINT chk_deck_visibility   CHECK (visibility   IN ('PRIVATE','PUBLIC'));
ALTER TABLE decks ADD CONSTRAINT chk_deck_review       CHECK (review_status IN ('NONE','PENDING_REVIEW','APPROVED','REJECTED'));

CREATE INDEX IF NOT EXISTS idx_decks_visibility ON decks(visibility) WHERE visibility = 'PUBLIC';
CREATE INDEX IF NOT EXISTS idx_decks_created_at ON decks(created_at DESC);

-- =====================================================================
-- 2. FLASHCARDS: extend for FC-04..07 (position, code_language, code_body)
--    + FC-12 (source_question_id, source_attempt_id)
-- flashcards table exists from V4 (card_id, deck_id, front_text, back_text)
-- =====================================================================
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS position           INT          NOT NULL DEFAULT 0;
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS card_type          VARCHAR(20)  NOT NULL DEFAULT 'TEXT';  -- TEXT, CODE, IMAGE
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS code_language      VARCHAR(30);   -- java, python, c, cpp
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS code_body          TEXT;
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS front_image_url    VARCHAR(512);
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS back_image_url     VARCHAR(512);
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS hint               TEXT;
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS source_question_id BIGINT REFERENCES questions(question_id) ON DELETE SET NULL;
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS source_attempt_id  BIGINT REFERENCES exam_attempts(attempt_id) ON DELETE SET NULL;
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS created_at         TIMESTAMP    NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_flashcards_position         ON flashcards(deck_id, position);
CREATE INDEX IF NOT EXISTS idx_flashcards_source_question  ON flashcards(source_question_id);

-- =====================================================================
-- 3. USER_CARD_PROGRESS: extend for FP-01..03 (wrong_count, last_reviewed_at)
-- user_card_progress exists from V4
-- =====================================================================
ALTER TABLE user_card_progress ADD COLUMN IF NOT EXISTS wrong_count       INT       NOT NULL DEFAULT 0;
ALTER TABLE user_card_progress ADD COLUMN IF NOT EXISTS last_reviewed_at  TIMESTAMP;
ALTER TABLE user_card_progress ADD COLUMN IF NOT EXISTS review_count      INT       NOT NULL DEFAULT 0;

ALTER TABLE user_card_progress ADD CONSTRAINT chk_ucp_status
    CHECK (status IN ('NEW','LEARNING','KNOWN'));

CREATE INDEX IF NOT EXISTS idx_ucp_deck_session
    ON user_card_progress(user_id, card_id, status, wrong_count DESC);

-- =====================================================================
-- 4. CARD_IMPORTS: FC-07 (bulk import) + FC-11 (poll import status)
-- =====================================================================
CREATE TABLE IF NOT EXISTS card_imports (
    import_id       BIGSERIAL    PRIMARY KEY,
    user_id         BIGINT       NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    deck_id         BIGINT       NOT NULL REFERENCES decks(deck_id) ON DELETE CASCADE,
    status          VARCHAR(20)  NOT NULL DEFAULT 'PROCESSING',
    total_rows      INT          NOT NULL DEFAULT 0,
    success_count   INT          NOT NULL DEFAULT 0,
    progress        INT          NOT NULL DEFAULT 0,  -- percent 0..100
    error_rows_json JSON,                              -- [{row, error}]
    file_name       VARCHAR(255),
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMP,
    CONSTRAINT chk_ci_status CHECK (status IN ('PROCESSING','COMPLETED','FAILED'))
);
CREATE INDEX IF NOT EXISTS idx_card_imports_user    ON card_imports(user_id);
CREATE INDEX IF NOT EXISTS idx_card_imports_deck    ON card_imports(deck_id);
CREATE INDEX IF NOT EXISTS idx_card_imports_status  ON card_imports(status);

-- =====================================================================
-- 5. STUDY_SESSIONS: FP-01..02 (optional session tracking)
-- =====================================================================
CREATE TABLE IF NOT EXISTS study_sessions (
    session_id      BIGSERIAL    PRIMARY KEY,
    user_id         BIGINT       NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    deck_id         BIGINT       NOT NULL REFERENCES decks(deck_id) ON DELETE CASCADE,
    mode            VARCHAR(20)  NOT NULL DEFAULT 'FLASHCARD',  -- FLASHCARD, QUIZ
    cards_studied   INT          NOT NULL DEFAULT 0,
    cards_correct   INT          NOT NULL DEFAULT 0,
    started_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    ended_at        TIMESTAMP,
    CONSTRAINT chk_ss_mode CHECK (mode IN ('FLASHCARD','QUIZ'))
);
CREATE INDEX IF NOT EXISTS idx_study_sessions_user ON study_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_study_sessions_deck ON study_sessions(deck_id);

-- =====================================================================
-- 6. CONTESTS: extend for CT-01..07
-- contests table exists from V4 (contest_id, exam_id, title, reward_config, start_time, status)
-- Need: end_time, duration_minutes, description, max_participants
-- =====================================================================
ALTER TABLE contests ADD COLUMN IF NOT EXISTS end_time          TIMESTAMP;
ALTER TABLE contests ADD COLUMN IF NOT EXISTS duration_minutes  INT          NOT NULL DEFAULT 60;
ALTER TABLE contests ADD COLUMN IF NOT EXISTS description       TEXT;
ALTER TABLE contests ADD COLUMN IF NOT EXISTS max_participants  INT;
ALTER TABLE contests ADD COLUMN IF NOT EXISTS banner_url        VARCHAR(512);
ALTER TABLE contests ADD COLUMN IF NOT EXISTS created_at        TIMESTAMP    NOT NULL DEFAULT NOW();
ALTER TABLE contests ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMP    NOT NULL DEFAULT NOW();

-- Re-set status constraint with all valid values
DO $$
BEGIN
    BEGIN
        ALTER TABLE contests DROP CONSTRAINT IF EXISTS contests_status_check;
    EXCEPTION WHEN others THEN NULL;
    END;
END $$;
ALTER TABLE contests ADD CONSTRAINT chk_contest_status
    CHECK (status IN ('UPCOMING','ONGOING','ENDED','CANCELLED'));

CREATE INDEX IF NOT EXISTS idx_contests_status     ON contests(status);
CREATE INDEX IF NOT EXISTS idx_contests_start_time ON contests(start_time);

-- =====================================================================
-- 7. CONTEST_PARTICIPANTS: extend for CT-03..07
-- contest_participants exists from V4 (score, rank, reward_claimed)
-- Need: attempt_id, joined_at, finished_at, certificate_url
-- =====================================================================
ALTER TABLE contest_participants ADD COLUMN IF NOT EXISTS attempt_id       BIGINT    REFERENCES exam_attempts(attempt_id) ON DELETE SET NULL;
ALTER TABLE contest_participants ADD COLUMN IF NOT EXISTS joined_at        TIMESTAMP NOT NULL DEFAULT NOW();
ALTER TABLE contest_participants ADD COLUMN IF NOT EXISTS finished_at      TIMESTAMP;
ALTER TABLE contest_participants ADD COLUMN IF NOT EXISTS certificate_url  VARCHAR(512);
ALTER TABLE contest_participants ADD COLUMN IF NOT EXISTS time_taken_sec   INT;

CREATE INDEX IF NOT EXISTS idx_cp_attempt ON contest_participants(attempt_id);

-- =====================================================================
-- 8. CONTEST_REWARDS: extend for CT-07 (claim reward)
-- contest_rewards exists from V6 (reward_id, contest_id, discount_id, rank_position)
-- Need: claimed, claimed_at, participant_id (who claimed)
-- =====================================================================
ALTER TABLE contest_rewards ADD COLUMN IF NOT EXISTS name           VARCHAR(255);
ALTER TABLE contest_rewards ADD COLUMN IF NOT EXISTS reward_type    VARCHAR(30)  NOT NULL DEFAULT 'DISCOUNT';  -- DISCOUNT, CERTIFICATE, POINTS
ALTER TABLE contest_rewards ADD COLUMN IF NOT EXISTS points         INT;
ALTER TABLE contest_rewards ADD COLUMN IF NOT EXISTS claimed        BOOLEAN      NOT NULL DEFAULT FALSE;
ALTER TABLE contest_rewards ADD COLUMN IF NOT EXISTS claimed_at     TIMESTAMP;
ALTER TABLE contest_rewards ADD COLUMN IF NOT EXISTS claimed_by     BIGINT       REFERENCES users(user_id) ON DELETE SET NULL;

-- discount_id can be NULL for non-discount rewards
DO $$
BEGIN
    BEGIN
        ALTER TABLE contest_rewards ALTER COLUMN discount_id DROP NOT NULL;
    EXCEPTION WHEN others THEN NULL;
    END;
END $$;

ALTER TABLE contest_rewards ADD CONSTRAINT chk_cr_type
    CHECK (reward_type IN ('DISCOUNT','CERTIFICATE','POINTS'));

CREATE INDEX IF NOT EXISTS idx_contest_rewards_claimed  ON contest_rewards(contest_id, claimed);
CREATE INDEX IF NOT EXISTS idx_contest_rewards_rank     ON contest_rewards(contest_id, rank_position);
