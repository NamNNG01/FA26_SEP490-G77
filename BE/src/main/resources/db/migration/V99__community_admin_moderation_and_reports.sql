-- V99__community_admin_moderation_and_reports.sql
-- 1. Thêm thông tin khóa quyền cộng đồng (mute) cho người dùng
ALTER TABLE users ADD COLUMN IF NOT EXISTS community_muted_until TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS community_mute_reason VARCHAR(500);

-- 2. Bảng báo cáo vi phạm (report) cho bài thảo luận và bình luận
CREATE TABLE IF NOT EXISTS discussion_reports (
    report_id BIGSERIAL PRIMARY KEY,
    target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('DISCUSSION', 'COMMENT')),
    discussion_id BIGINT NOT NULL REFERENCES discussions(discussion_id) ON DELETE CASCADE,
    comment_id BIGINT REFERENCES discussion_comments(comment_id) ON DELETE CASCADE,
    reporter_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    reason VARCHAR(500) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RESOLVED', 'DISMISSED')),
    resolved_by BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
    resolved_at TIMESTAMP,
    resolution_note VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_discussion_reports_status ON discussion_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_discussion_reports_discussion ON discussion_reports(discussion_id);
