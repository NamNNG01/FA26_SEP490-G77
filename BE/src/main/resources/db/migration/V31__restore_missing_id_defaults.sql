-- V31__restore_missing_id_defaults.sql
-- V1/V4/V6 create these ids as BIGSERIAL, but a restored database lost the sequence and default,
-- so inserts failed with "null value in column ... violates not-null constraint".
-- Recreate them only where missing; on a healthy database this just re-syncs the sequence.
DO $$
DECLARE
    t record;
    seq text;
BEGIN
    FOR t IN SELECT * FROM (VALUES
        ('exam_config', 'config_id'),
        ('attempt_answers', 'attempt_answer_id'),
        ('contest_rewards', 'reward_id')) AS v(tbl, col)
    LOOP
        IF to_regclass(t.tbl) IS NULL THEN CONTINUE; END IF;
        seq := pg_get_serial_sequence(t.tbl, t.col);
        IF seq IS NULL THEN
            seq := t.tbl || '_' || t.col || '_seq';
            EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I', seq);
            EXECUTE format('ALTER SEQUENCE %I OWNED BY %I.%I', seq, t.tbl, t.col);
            EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT nextval(%L)', t.tbl, t.col, seq);
        END IF;
        EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM %I), 0) + 1, false)', seq, t.col, t.tbl);
    END LOOP;
END $$;
