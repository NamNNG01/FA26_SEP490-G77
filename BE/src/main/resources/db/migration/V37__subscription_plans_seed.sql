-- V37__subscription_plans_seed.sql

INSERT INTO subscription_plans (plan_name, price, duration_days, ai_token_limit)
SELECT 'Basic', 49000, 30, 200000
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE plan_name = 'Basic');

INSERT INTO subscription_plans (plan_name, price, duration_days, ai_token_limit)
SELECT 'Standard', 99000, 30, 600000
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE plan_name = 'Standard');

INSERT INTO subscription_plans (plan_name, price, duration_days, ai_token_limit)
SELECT 'Premium', 199000, 30, 2000000
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE plan_name = 'Premium');
