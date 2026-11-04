-- V69: Support additional practice modes for question_practice_sessions
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_qps_mode') THEN
        ALTER TABLE question_practice_sessions DROP CONSTRAINT chk_qps_mode;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_qps_mode_v2') THEN
        ALTER TABLE question_practice_sessions DROP CONSTRAINT chk_qps_mode_v2;
    END IF;
    ALTER TABLE question_practice_sessions ADD CONSTRAINT chk_qps_mode_v2
        CHECK (mode IN ('ALL', 'REVIEW', 'WRONG', 'BOOKMARKED', 'RANDOM', 'TARGET'));
END $$;
