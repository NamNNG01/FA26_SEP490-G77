-- V16__add_exam_config_seed.sql
ALTER TABLE exam_config ADD COLUMN IF NOT EXISTS seed BIGINT;
