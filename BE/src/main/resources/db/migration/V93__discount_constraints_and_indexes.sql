-- Keep discount values and lookup columns consistent with the application.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_discounts_type'
          AND conrelid = 'discounts'::regclass
    ) THEN
        ALTER TABLE discounts
            ADD CONSTRAINT chk_discounts_type
            CHECK (discount_type IN ('PERCENT', 'FIXED_AMOUNT'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_discounts_applies_to'
          AND conrelid = 'discounts'::regclass
    ) THEN
        ALTER TABLE discounts
            ADD CONSTRAINT chk_discounts_applies_to
            CHECK (applies_to IN ('COURSE', 'SUBSCRIPTION', 'ALL'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_discounts_discount_used
    ON user_discounts(discount_id, is_used);

CREATE INDEX IF NOT EXISTS idx_contest_rewards_discount
    ON contest_rewards(discount_id);
