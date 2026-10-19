-- Forward migration: shared database versions V9-V16 are already occupied.
ALTER TABLE categories ALTER COLUMN name TYPE VARCHAR(255);
ALTER TABLE categories ADD COLUMN code VARCHAR(255);
UPDATE categories SET code = 'LEGACY-' || category_id;
ALTER TABLE categories ALTER COLUMN code SET NOT NULL;
ALTER TABLE categories ALTER COLUMN code SET DEFAULT ('LEGACY-' || upper(md5(random()::text || clock_timestamp()::text)));
ALTER TABLE categories ADD CONSTRAINT uq_categories_code UNIQUE (code);
ALTER TABLE categories ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE categories ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE categories ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE category_audit_events (
    audit_id BIGSERIAL PRIMARY KEY,
    category_id BIGINT NOT NULL REFERENCES categories(category_id),
    actor_id BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_category_audit_category ON category_audit_events(category_id);
