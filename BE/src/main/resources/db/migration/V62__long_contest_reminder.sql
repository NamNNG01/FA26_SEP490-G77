-- Contest reminder 5 minutes before start: set once the participants were notified.
ALTER TABLE contests ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ NULL;
