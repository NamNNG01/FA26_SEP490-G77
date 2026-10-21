-- C-15: modules can be hidden from students without deleting them. Existing modules stay visible.
ALTER TABLE modules ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'VISIBLE';
ALTER TABLE modules ADD CONSTRAINT chk_modules_status CHECK (status IN ('VISIBLE', 'HIDDEN'));
