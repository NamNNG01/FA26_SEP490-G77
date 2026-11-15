-- V87__discussion_moderation_and_images.sql
-- 1. Bổ sung trường lưu ảnh và phê duyệt cho thảo luận
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS image_url VARCHAR(1000);
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'APPROVED';

-- Ràng buộc approval_status: PENDING, APPROVED, REJECTED
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_disc_approval_status'
    ) THEN
        ALTER TABLE discussions ADD CONSTRAINT chk_disc_approval_status
            CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED'));
    END IF;
END $$;

ALTER TABLE discussions ADD COLUMN IF NOT EXISTS reviewed_by BIGINT REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;
ALTER TABLE discussions ADD COLUMN IF NOT EXISTS rejection_reason VARCHAR(1000);

-- Đánh index cho truy vấn lọc bài thảo luận theo khóa học và trạng thái duyệt
CREATE INDEX IF NOT EXISTS idx_disc_course_approval ON discussions(course_id, approval_status, created_at DESC);

-- 2. Bổ sung trường ảnh và thông tin kiểm duyệt cho bình luận
ALTER TABLE discussion_comments ADD COLUMN IF NOT EXISTS image_url VARCHAR(1000);
ALTER TABLE discussion_comments ADD COLUMN IF NOT EXISTS hidden_by BIGINT REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE discussion_comments ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMP;
ALTER TABLE discussion_comments ADD COLUMN IF NOT EXISTS hidden_reason VARCHAR(500);
