-- V54__drop_document_contribution_columns.sql
-- Remove document contribution columns that are no longer used after removing CQ-02

ALTER TABLE question_contributions DROP COLUMN IF EXISTS file_url;
ALTER TABLE question_contributions DROP COLUMN IF EXISTS file_name;
ALTER TABLE question_contributions DROP COLUMN IF EXISTS file_size_kb;
