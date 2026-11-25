-- V100__drop_redundant_discussion_is_closed.sql
-- Consolidate discussion open/closed state onto discussions.status (OPEN, CLOSED, HIDDEN).
UPDATE discussions
SET status = 'CLOSED'
WHERE is_closed = TRUE
  AND status = 'OPEN';

ALTER TABLE discussions
DROP COLUMN IF EXISTS is_closed;
