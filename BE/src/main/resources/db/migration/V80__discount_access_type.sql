-- V80__discount_access_type.sql
-- Add access_type to discounts (PUBLIC or CLAIM_REQUIRED)

ALTER TABLE discounts ADD COLUMN IF NOT EXISTS access_type VARCHAR(30) NOT NULL DEFAULT 'PUBLIC';
