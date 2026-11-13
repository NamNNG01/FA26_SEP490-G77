-- Keep CODE contribution payload until a manager approves and promotes it.
ALTER TABLE question_contributions
    ADD COLUMN IF NOT EXISTS code_config_json JSONB,
    ADD COLUMN IF NOT EXISTS test_cases_json JSONB;
