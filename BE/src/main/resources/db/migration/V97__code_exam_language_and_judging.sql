-- Keep the first supported language for legacy configurations that offered several.
-- Configurations with no supported language use Java, the existing editor default.
UPDATE code_question_configs AS config
SET allowed_languages = jsonb_build_array(COALESCE((
    SELECT entry.language
    FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(config.allowed_languages) = 'array'
             THEN config.allowed_languages ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS entry(language, position)
    WHERE entry.language IN ('JAVA', 'PYTHON', 'C', 'CPP')
    ORDER BY entry.position
    LIMIT 1
), 'JAVA'))
WHERE config.allowed_languages NOT IN ('["JAVA"]'::jsonb, '["PYTHON"]'::jsonb, '["C"]'::jsonb, '["CPP"]'::jsonb);

INSERT INTO code_question_configs (question_id, allowed_languages)
SELECT q.question_id, '["JAVA"]'::jsonb
FROM questions q
WHERE q.question_type = 'CODE'
ON CONFLICT (question_id) DO NOTHING;

ALTER TABLE code_question_configs
    ALTER COLUMN allowed_languages DROP DEFAULT,
    ADD CONSTRAINT chk_code_question_single_language CHECK (
        allowed_languages IN ('["JAVA"]'::jsonb, '["PYTHON"]'::jsonb, '["C"]'::jsonb, '["CPP"]'::jsonb)
    );

-- Prefer the language actually used to judge this exact source in CD-05.
UPDATE attempt_answers AS answer
SET response = jsonb_set(answer.response, '{language}', to_jsonb(COALESCE((
    SELECT submission.language
    FROM code_submissions submission
    WHERE submission.attempt_answer_id = answer.attempt_answer_id
      AND submission.source_code = answer.response ->> 'text'
      AND submission.language IN ('JAVA', 'PYTHON', 'C', 'CPP')
    ORDER BY submission.submitted_at DESC, submission.submission_id DESC
    LIMIT 1
), config.allowed_languages ->> 0)))
FROM code_question_configs config
WHERE config.question_id = answer.question_id
  AND jsonb_typeof(answer.response -> 'text') = 'string'
  AND (answer.response ->> 'language' IS NULL);

ALTER TABLE exam_attempts
    ADD COLUMN code_judging_token UUID,
    ADD COLUMN code_judging_until TIMESTAMP WITH TIME ZONE;

ALTER TABLE attempt_answers
    DROP CONSTRAINT IF EXISTS chk_grading_error,
    ADD CONSTRAINT chk_grading_error CHECK (grading_error IS NULL OR grading_error IN (
        'AI_TIMEOUT', 'AI_UPSTREAM_ERROR', 'AI_INVALID_OUTPUT', 'DIAGRAM_TOO_LARGE', 'TEXT_TOO_LONG', 'QUOTA_REFUNDED',
        'CODE_EXECUTION_UNAVAILABLE', 'CODE_NO_TEST_CASES', 'CODE_SOURCE_REJECTED'
    ));

CREATE INDEX idx_exam_attempts_in_progress_deadline
    ON exam_attempts (deadline_at, attempt_id)
    WHERE status = 'IN_PROGRESS';
