-- V91__subscription_plan_cleanup.sql
-- 1) Free Plan is the default 30-day plan (an admin-created row had drifted to 365 days).
-- 2) Every sellable plan gets a real feature list (pricing page / admin detail render features_json).
-- 3) The leftover "Tiny Plan (429 Test)" row is retired; its active subscribers continue on Free Plan.
-- 4) Every STUDENT account holds an active Free Plan subscription unless it already has an active plan.
-- Idempotent: safe to re-run on a database that already received these changes.

-- =====================================================================
-- 1) Free Plan: 30-day duration, and create it on databases that never had one.
-- =====================================================================
INSERT INTO subscription_plans (plan_name, price, duration_days, ai_token_limit, is_active, sort_order, features_json, created_at, updated_at)
SELECT 'Free Plan', 0, 30, 10000, TRUE, 0, '[]'::json, NOW(), NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM subscription_plans WHERE LOWER(plan_name) = 'free plan' AND deleted_at IS NULL
);

UPDATE subscription_plans
SET duration_days = 30, updated_at = NOW()
WHERE LOWER(plan_name) = 'free plan' AND deleted_at IS NULL AND duration_days <> 30;

-- Free Plan is the entry tier: a small AI allowance, far below Basic.
UPDATE subscription_plans
SET ai_token_limit = 10000, updated_at = NOW()
WHERE LOWER(plan_name) = 'free plan' AND deleted_at IS NULL AND ai_token_limit <> 10000;

-- =====================================================================
-- 2) Feature lists — each tier repeats the tier below and adds its own capability.
--    The AI limits quoted here match ai_token_limit on the same row.
-- =====================================================================
UPDATE subscription_plans
SET features_json = '["Access to all free courses and sample exams","Unlimited module practice attempts","Progress tracking and study history","10,000 AI tokens for explanations and flashcards","Access to public contests"]'::json,
    updated_at = NOW()
WHERE LOWER(plan_name) = 'free plan' AND deleted_at IS NULL;

UPDATE subscription_plans
SET features_json = '["Everything in Free Plan","Full access to all paid courses for 30 days","200,000 AI tokens for explanations and quiz generation","AI flashcard generation from your documents"]'::json,
    updated_at = NOW()
WHERE LOWER(plan_name) = 'basic' AND deleted_at IS NULL;

UPDATE subscription_plans
SET features_json = '["Everything in Basic","Full access to all paid courses for 30 days","600,000 AI tokens — three times the Basic allowance","AI essay grading with detailed feedback","Personalised weak-topic recommendations"]'::json,
    updated_at = NOW()
WHERE LOWER(plan_name) = 'standard' AND deleted_at IS NULL;

UPDATE subscription_plans
SET features_json = '["Everything in Standard","Full access to all paid courses for 30 days","2,000,000 AI tokens for unlimited AI study","AI smart practice and full weakness reports","Early access to new features and contests"]'::json,
    updated_at = NOW()
WHERE LOWER(plan_name) = 'premium' AND deleted_at IS NULL;

-- =====================================================================
-- 3) Retire the leftover "Tiny Plan" test plan.
--    Active subscribers are moved to Free Plan first so no ACTIVE row is stranded.
-- =====================================================================
UPDATE user_subscriptions s
SET plan_id = free_plan.plan_id
FROM (
    SELECT plan_id FROM subscription_plans
    WHERE LOWER(plan_name) = 'free plan' AND deleted_at IS NULL
    ORDER BY plan_id LIMIT 1
) AS free_plan
WHERE s.status = 'ACTIVE'
  AND s.plan_id IN (
      SELECT plan_id FROM subscription_plans
      WHERE deleted_at IS NULL
        AND (LOWER(plan_name) LIKE 'tiny plan%' OR LOWER(plan_name) IN ('tẻdg', 'tèdg'))
  );

UPDATE subscription_plans
SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW()
WHERE deleted_at IS NULL
  AND (LOWER(plan_name) LIKE 'tiny plan%' OR LOWER(plan_name) IN ('tẻdg', 'tèdg'));

-- =====================================================================
-- 4) Default Free Plan membership for every STUDENT without an active subscription.
--    Students who bought a plan keep theirs ("except students who upgraded").
-- =====================================================================
INSERT INTO user_subscriptions (user_id, plan_id, start_date, end_date, status, paid_amount, auto_renew, created_at)
SELECT u.user_id, fp.plan_id, NOW(), NOW() + (fp.duration_days || ' days')::interval, 'ACTIVE', 0, FALSE, NOW()
FROM users u
CROSS JOIN (
    SELECT plan_id, duration_days FROM subscription_plans
    WHERE LOWER(plan_name) = 'free plan' AND deleted_at IS NULL
    ORDER BY plan_id LIMIT 1
) AS fp
WHERE u.role_name = 'STUDENT'
  AND NOT EXISTS (
      SELECT 1 FROM user_subscriptions s
      WHERE s.user_id = u.user_id AND s.status = 'ACTIVE' AND s.start_date <= NOW() AND s.end_date >= NOW()
  );

-- =====================================================================
-- 5) Renumber display order so the retired row leaves no gap (sort_order = index).
-- =====================================================================
WITH ranked AS (
    SELECT plan_id, ROW_NUMBER() OVER (ORDER BY sort_order, plan_id) - 1 AS rn
    FROM subscription_plans
    WHERE deleted_at IS NULL
)
UPDATE subscription_plans sp
SET sort_order = ranked.rn, updated_at = NOW()
FROM ranked
WHERE sp.plan_id = ranked.plan_id AND sp.sort_order <> ranked.rn;
