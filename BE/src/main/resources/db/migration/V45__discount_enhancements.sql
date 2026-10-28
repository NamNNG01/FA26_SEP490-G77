-- V45__discount_enhancements.sql
-- Discount enhancements, code normalization and indexes

ALTER TABLE discounts ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE discounts ADD COLUMN IF NOT EXISTS start_at TIMESTAMP;
ALTER TABLE discounts ADD COLUMN IF NOT EXISTS applies_to VARCHAR(20) NOT NULL DEFAULT 'ALL';
ALTER TABLE discounts ADD COLUMN IF NOT EXISTS min_order_amount NUMERIC(12,2);
ALTER TABLE discounts ADD COLUMN IF NOT EXISTS max_discount_amount NUMERIC(12,2);
ALTER TABLE discounts ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();
ALTER TABLE discounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();
ALTER TABLE discounts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- Backfill null codes
UPDATE discounts
SET code = 'LEGACY-' || discount_id
WHERE code IS NULL;

ALTER TABLE discounts ALTER COLUMN code SET NOT NULL;

-- Deduplicate case-insensitive codes for active/non-deleted discounts before creating unique index
DO $$
DECLARE
    rec RECORD;
    new_code TEXT;
BEGIN
    FOR rec IN
        SELECT d1.discount_id, d1.code
        FROM discounts d1
        WHERE d1.deleted_at IS NULL
          AND EXISTS (
              SELECT 1 FROM discounts d2
              WHERE d2.deleted_at IS NULL
                AND d2.discount_id < d1.discount_id
                AND UPPER(d2.code) = UPPER(d1.code)
          )
    LOOP
        new_code := rec.code || '-' || rec.discount_id;
        WHILE EXISTS (SELECT 1 FROM discounts WHERE code = new_code) LOOP
            new_code := new_code || '-X';
        END LOOP;
        UPDATE discounts SET code = new_code WHERE discount_id = rec.discount_id;
    END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_discounts_upper_code ON discounts(UPPER(code)) WHERE deleted_at IS NULL;
