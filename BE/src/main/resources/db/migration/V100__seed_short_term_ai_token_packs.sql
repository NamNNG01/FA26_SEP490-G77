-- V100__seed_short_term_ai_token_packs.sql
-- Seed short-term exam-cram AI Token Packs (7-day and 14-day) for crash exam preparation.

INSERT INTO subscription_plans (plan_name, price, duration_days, ai_token_limit, is_active, sort_order, features_json, created_at, updated_at)
SELECT
    '7-Day AI Sprint Pack',
    29000,
    7,
    150000,
    TRUE,
    10,
    '["Short-term 7-day AI token boost for crash exam prep","150,000 AI tokens for explanations, quiz & flashcard generation","Instant activation via PayOS QR checkout"]'::json,
    NOW(),
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM subscription_plans WHERE LOWER(plan_name) = '7-day ai sprint pack' AND deleted_at IS NULL
);

INSERT INTO subscription_plans (plan_name, price, duration_days, ai_token_limit, is_active, sort_order, features_json, created_at, updated_at)
SELECT
    '14-Day Exam Cram Pack',
    59000,
    14,
    350000,
    TRUE,
    11,
    '["Short-term 14-day AI token boost for intensive revision","350,000 AI tokens for explanations, essay grading & personalization","Instant activation via PayOS QR checkout"]'::json,
    NOW(),
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM subscription_plans WHERE LOWER(plan_name) = '14-day exam cram pack' AND deleted_at IS NULL
);
