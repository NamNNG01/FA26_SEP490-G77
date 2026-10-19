-- Forward migration: shared database versions V9-V16 are already occupied.
-- Prevent accidental content/history loss, including concurrent inserts after
-- the service's dependency checks. No rows are detached or removed.
-- Discover names because renamed exam_configs retains its original FK name.
DO $$
DECLARE
    edge RECORD;
    existing_fk RECORD;
BEGIN
    FOR edge IN
        SELECT * FROM (VALUES
            ('enrollments', 'course_id', 'courses', 'course_id'),
            ('exams', 'course_id', 'courses', 'course_id'),
            ('questions', 'module_id', 'modules', 'module_id'),
            ('exams', 'module_id', 'modules', 'module_id'),
            ('exam_config', 'module_id', 'modules', 'module_id'),
            ('question_groups', 'module_id', 'modules', 'module_id'),
            ('question_groups', 'course_id', 'courses', 'course_id'),
            ('lessons', 'module_id', 'modules', 'module_id')
        ) AS edges(child_table, child_column, parent_table, parent_column)
    LOOP
        FOR existing_fk IN
            SELECT c.conname FROM pg_constraint c
            JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
            WHERE c.contype = 'f' AND c.conrelid = to_regclass(edge.child_table)
              AND a.attname = edge.child_column
        LOOP
            EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', edge.child_table, existing_fk.conname);
        END LOOP;
        EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I(%I) ON DELETE RESTRICT',
            edge.child_table, edge.child_table || '_' || edge.child_column || '_fkey',
            edge.child_column, edge.parent_table, edge.parent_column);
    END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_modules_course_order ON modules(course_id, order_index, module_id);
