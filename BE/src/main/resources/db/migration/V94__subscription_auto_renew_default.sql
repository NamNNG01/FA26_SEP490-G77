-- Paid plans always auto-renew; the student-facing toggle (SB-04) has been removed.
ALTER TABLE user_subscriptions ALTER COLUMN auto_renew SET DEFAULT TRUE;

UPDATE user_subscriptions
SET auto_renew = TRUE
WHERE status = 'ACTIVE' AND auto_renew = FALSE;
