-- Checkout / discount / subscription hardening.
-- A checkout holds a discount usage reservation from link creation until payment, cancellation or
-- expiry, so the usage cap and the one-per-student rule cannot be overrun by concurrent calls.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS discount_reserved BOOLEAN NOT NULL DEFAULT FALSE;

-- Keep only the newest live link per target; older duplicates were created by the checkout race.
WITH ranked_target AS (
    SELECT payment_id,
           ROW_NUMBER() OVER (PARTITION BY user_id, type, ref_id ORDER BY created_at DESC, payment_id DESC) AS row_num
    FROM payments
    WHERE status = 'PENDING'
)
UPDATE payments p
SET status = 'CANCELLED',
    cancelled_at = NOW(),
    updated_at = NOW()
FROM ranked_target r
WHERE p.payment_id = r.payment_id
  AND r.row_num > 1;

-- A student may hold at most one live checkout per discount code.
WITH ranked_discount AS (
    SELECT payment_id,
           ROW_NUMBER() OVER (PARTITION BY user_id, discount_id ORDER BY created_at DESC, payment_id DESC) AS row_num
    FROM payments
    WHERE status = 'PENDING'
      AND discount_id IS NOT NULL
)
UPDATE payments p
SET status = 'CANCELLED',
    cancelled_at = NOW(),
    updated_at = NOW()
FROM ranked_discount r
WHERE p.payment_id = r.payment_id
  AND r.row_num > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_pending_target
    ON payments(user_id, type, ref_id)
    WHERE status = 'PENDING';

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_pending_user_discount
    ON payments(user_id, discount_id)
    WHERE status = 'PENDING' AND discount_id IS NOT NULL;

-- One ACTIVE subscription per user; the webhook already supersedes current/future rows, this is the
-- database backstop against two webhooks racing.
WITH ranked_subscriptions AS (
    SELECT subscription_id,
           ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY end_date DESC, subscription_id DESC) AS row_num
    FROM user_subscriptions
    WHERE status = 'ACTIVE'
)
UPDATE user_subscriptions s
SET status = 'SUPERSEDED',
    auto_renew = FALSE
FROM ranked_subscriptions r
WHERE s.subscription_id = r.subscription_id
  AND r.row_num > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_us_active_user
    ON user_subscriptions(user_id)
    WHERE status = 'ACTIVE';

-- Spec 19 allows a code question up to 30 seconds; V55 capped the column at 5 seconds.
ALTER TABLE code_question_configs DROP CONSTRAINT IF EXISTS code_question_configs_time_limit_ms_check;
ALTER TABLE code_question_configs ADD CONSTRAINT chk_cqc_time_limit
    CHECK (time_limit_ms BETWEEN 1 AND 30000);
