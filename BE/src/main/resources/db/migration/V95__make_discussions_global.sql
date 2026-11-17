-- Discussions are global; enrollment is only an eligibility check for student posting.
DROP INDEX IF EXISTS idx_discussions_course;
DROP INDEX IF EXISTS idx_discussions_course_pinned;
DROP INDEX IF EXISTS idx_disc_course_tag_upvotes;
DROP INDEX IF EXISTS idx_disc_course_tag_comments;
DROP INDEX IF EXISTS idx_disc_course_approval;
ALTER TABLE discussions DROP COLUMN IF EXISTS course_id;
