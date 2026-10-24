-- V29__question_answer_sequences.sql
-- Ensure sequences exist for questions and answer_options and sync with max(id)
DO $$
DECLARE
    seq_name text;
    max_id bigint;
BEGIN
    -- Questions sequence
    SELECT pg_get_serial_sequence('questions', 'question_id') INTO seq_name;
    IF seq_name IS NULL THEN
        seq_name := 'questions_question_id_seq';
        EXECUTE 'CREATE SEQUENCE IF NOT EXISTS ' || seq_name;
        EXECUTE 'ALTER TABLE questions ALTER COLUMN question_id SET DEFAULT nextval(''' || seq_name || ''')';
    END IF;
    SELECT COALESCE(MAX(question_id), 1) INTO max_id FROM questions;
    EXECUTE 'SELECT setval(''' || seq_name || ''', ' || max_id || ', true)';

    -- Answer options sequence
    SELECT pg_get_serial_sequence('answer_options', 'option_id') INTO seq_name;
    IF seq_name IS NULL THEN
        seq_name := 'answer_options_option_id_seq';
        EXECUTE 'CREATE SEQUENCE IF NOT EXISTS ' || seq_name;
        EXECUTE 'ALTER TABLE answer_options ALTER COLUMN option_id SET DEFAULT nextval(''' || seq_name || ''')';
    END IF;
    SELECT COALESCE(MAX(option_id), 1) INTO max_id FROM answer_options;
    EXECUTE 'SELECT setval(''' || seq_name || ''', ' || max_id || ', true)';
END $$;
