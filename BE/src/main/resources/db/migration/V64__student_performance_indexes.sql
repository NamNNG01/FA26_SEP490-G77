-- V64__student_performance_indexes.sql
-- Indexes to optimize Student & Contribution APIs (listContests, listContestHistory, listDiscussions upvotes, listContributions)

CREATE INDEX IF NOT EXISTS idx_qc_user_submitted_at ON question_contributions(user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_qc_user_type_status_submitted ON question_contributions(user_id, type, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_disc_upvotes_user_disc ON discussion_upvotes(user_id, discussion_id);
CREATE INDEX IF NOT EXISTS idx_cp_user_joined_at ON contest_participants(user_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS idx_contests_status_start_time ON contests(status, start_time DESC) WHERE deleted_at IS NULL;
