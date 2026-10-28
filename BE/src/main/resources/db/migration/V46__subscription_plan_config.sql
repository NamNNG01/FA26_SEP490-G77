-- V46__subscription_plan_config.sql
-- Subscription plans enhancements, sort_order and unique name index

ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- Backfill sort_order if 0 or null
WITH ranked AS (
    SELECT plan_id, ROW_NUMBER() OVER (ORDER BY plan_id) as rn
    FROM subscription_plans
)
UPDATE subscription_plans sp
SET sort_order = ranked.rn
FROM ranked
WHERE sp.plan_id = ranked.plan_id AND (sp.sort_order = 0 OR sp.sort_order IS NULL);

-- Deduplicate case-insensitive plan names for active/non-deleted plans
DO $$
DECLARE
    rec RECORD;
    new_name TEXT;
BEGIN
    FOR rec IN
        SELECT p1.plan_id, p1.plan_name
        FROM subscription_plans p1
        WHERE p1.deleted_at IS NULL
          AND EXISTS (
              SELECT 1 FROM subscription_plans p2
              WHERE p2.deleted_at IS NULL
                AND p2.plan_id < p1.plan_id
                AND LOWER(p2.plan_name) = LOWER(p1.plan_name)
          )
    LOOP
        new_name := rec.plan_name || ' (' || rec.plan_id || ')';
        WHILE EXISTS (SELECT 1 FROM subscription_plans WHERE plan_name = new_name) LOOP
            new_name := new_name || ' (2)';
        END LOOP;
        UPDATE subscription_plans SET plan_name = new_name WHERE plan_id = rec.plan_id;
    END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_subscription_plans_lower_name ON subscription_plans(LOWER(plan_name)) WHERE deleted_at IS NULL;
