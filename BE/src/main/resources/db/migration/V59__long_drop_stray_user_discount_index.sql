-- V59__long_drop_stray_user_discount_index.sql
-- The dev DB still has a plain unique index on user_discounts(user_id, discount_id) that no migration creates
-- (V44 only dropped the V4 UNIQUE constraint). It stops one student from winning the same voucher in two
-- contests, which spec 6.4 allows: uniqueness is (user, discount, source_type, source_id), see V44.
DROP INDEX IF EXISTS uq_user_discounts_user_discount;
