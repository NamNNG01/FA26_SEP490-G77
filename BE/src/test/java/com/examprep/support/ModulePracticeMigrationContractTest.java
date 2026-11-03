package com.examprep.support;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * {@code V68__module_practice.sql} against the entities it must match.
 *
 * <p>An applied migration cannot be edited, and {@code ddl-auto=validate} refuses to start when an
 * entity declares a column the schema does not have — so the two must agree before the migration is
 * ever applied. This test keeps them locked together without a database:</p>
 *
 * <ul>
 *   <li>every {@code @Column} / {@code @JoinColumn} of the four practice entities must be declared
 *       by the migration's {@code CREATE TABLE} block for that table;</li>
 *   <li>every named constraint and index the migration promises must be present, because the
 *       integration tests and the reset safety argument depend on them;</li>
 *   <li>the foreign keys into the shared {@code questions} table must NOT cascade.</li>
 * </ul>
 *
 * <p>The migration is deliberately never executed here: the only reachable PostgreSQL is the shared
 * Supabase instance, which the work must never migrate.</p>
 */
class ModulePracticeMigrationContractTest {

    private static final Path MIGRATION = Path.of("src", "main", "resources", "db", "migration",
            "V68__module_practice.sql");

    private static final List<Class<?>> ENTITIES = List.of(
            com.examprep.entities.QuestionPracticeSession.class,
            com.examprep.entities.QuestionPracticeSessionQuestion.class,
            com.examprep.entities.QuestionPracticeAnswer.class,
            com.examprep.entities.QuestionPracticeProgress.class);

    private static final List<String> CONSTRAINTS = List.of(
            "chk_qps_mode", "chk_qps_status", "chk_qps_counts",
            "uq_qpsq_session_question", "uq_qpsq_session_order", "chk_qpsq_counts", "chk_qpsq_grading_status",
            "uq_qpa_attempt", "chk_qpa_values", "chk_qpa_grading_status", "chk_qpa_grading_error",
            "uq_qpp_user_module_question", "chk_qpp_counts", "chk_qpp_mastery");

    private static final List<String> INDEXES = List.of(
            "uq_qps_one_active", "idx_qps_user_module_status", "idx_qps_user_started",
            "idx_qpsq_session_order", "idx_qpsq_question", "idx_qpsq_session_unanswered",
            "uq_qpa_request_key", "idx_qpa_sq_attempt", "idx_qpa_grading_queue",
            "idx_qpp_user_module", "idx_qpp_user_module_mastery", "idx_qpp_user_last_answered");

    private static String sql() throws IOException {
        return Files.readString(MIGRATION, StandardCharsets.UTF_8);
    }

    /** The {@code CREATE TABLE} block of one table, from its opening parenthesis to the matching ");". */
    private static String tableBlock(String sql, String table) {
        String marker = "CREATE TABLE IF NOT EXISTS " + table + " (";
        int start = sql.indexOf(marker);
        assertTrue(start >= 0, "the migration does not create " + table);
        int end = sql.indexOf("\n);", start);
        assertTrue(end > start, "the CREATE TABLE of " + table + " is not terminated");
        return sql.substring(start, end);
    }

    private static Set<String> entityColumns(Class<?> entity) {
        Set<String> columns = new LinkedHashSet<>();
        for (Field field : entity.getDeclaredFields()) {
            if (Modifier.isStatic(field.getModifiers()) || Modifier.isTransient(field.getModifiers())
                    || field.isAnnotationPresent(Transient.class)) {
                continue;
            }
            if (field.isAnnotationPresent(OneToMany.class) || field.isAnnotationPresent(jakarta.persistence.ManyToMany.class)) {
                continue;
            }
            Column column = field.getAnnotation(Column.class);
            if (column != null && !column.name().isEmpty()) {
                columns.add(column.name());
                continue;
            }
            JoinColumn join = field.getAnnotation(JoinColumn.class);
            if (join != null && !join.name().isEmpty()
                    && (field.isAnnotationPresent(ManyToOne.class) || field.isAnnotationPresent(OneToOne.class))) {
                columns.add(join.name());
            }
        }
        return columns;
    }

    @Test
    void everyEntityColumnIsDeclaredByTheMigration() throws IOException {
        String sql = sql();
        Map<String, String> blocks = new LinkedHashMap<>();
        for (Class<?> entity : ENTITIES) {
            Table table = entity.getAnnotation(Table.class);
            assertTrue(table != null && !table.name().isEmpty(),
                    entity.getSimpleName() + " must declare its table");
            blocks.put(table.name(), tableBlock(sql, table.name()));
        }
        List<String> missing = new ArrayList<>();
        for (Map.Entry<String, String> entry : blocks.entrySet()) {
            Class<?> entity = ENTITIES.stream()
                    .filter(candidate -> entry.getKey().equals(candidate.getAnnotation(Table.class).name()))
                    .findFirst()
                    .orElseThrow();
            for (String column : entityColumns(entity)) {
                // Word-boundary match so "session_id" never satisfies "session_question_id".
                if (!entry.getValue().matches("(?s).*\\b" + column + "\\b.*")) {
                    missing.add(entry.getKey() + "." + column + " (entity " + entity.getSimpleName() + ")");
                }
            }
        }
        assertTrue(missing.isEmpty(),
                "entities declare columns the migration does not define: " + missing);
    }

    @Test
    void everyNamedConstraintAndIndexIsDeclared() throws IOException {
        String sql = sql();
        List<String> missing = new ArrayList<>();
        for (String constraint : CONSTRAINTS) {
            if (!sql.contains("conname = '" + constraint + "'")) {
                missing.add("CONSTRAINT " + constraint);
            }
        }
        for (String index : INDEXES) {
            if (!sql.contains(index)) {
                missing.add("INDEX " + index);
            }
        }
        assertTrue(missing.isEmpty(), "the migration does not declare: " + missing);
    }

    /** The reset must never be able to delete a shared question through a cascade. */
    @Test
    void foreignKeysIntoTheQuestionBankDoNotCascade() throws IOException {
        for (String line : sql().split("\\R")) {
            String trimmed = line.trim();
            if (trimmed.contains("REFERENCES questions")) {
                assertFalse(trimmed.toUpperCase().contains("ON DELETE"),
                        "a practice table cascades into the shared question bank: " + trimmed);
            }
        }
    }

    /**
     * The reset relies on the session → paper → answers cascade, so those two foreign keys must keep
     * it, and the session's own owner rows must stay reachable.
     */
    @Test
    void theSessionCascadeIsDeclared() throws IOException {
        String sql = sql();
        assertTrue(sql.contains("REFERENCES question_practice_sessions (session_id) ON DELETE CASCADE"),
                "session questions must cascade from their session");
        assertTrue(sql.contains("REFERENCES question_practice_session_questions (session_question_id) ON DELETE CASCADE"),
                "practice answers must cascade from their session question");
    }

    /** One open run per (student, module) is enforced by a partial unique index, not by application code alone. */
    @Test
    void theOpenSessionIndexIsPartialOnInProgress() throws IOException {
        String sql = sql();
        int index = sql.indexOf("uq_qps_one_active");
        assertTrue(index >= 0, "uq_qps_one_active is missing");
        String definition = sql.substring(index, sql.indexOf(';', index));
        assertTrue(definition.toUpperCase().contains("WHERE") && definition.contains("IN_PROGRESS"),
                "uq_qps_one_active must be partial on status = 'IN_PROGRESS': " + definition);
    }

    /** A migration that was already applied must never be edited; this one must still be the newest. */
    @Test
    void noLaterMigrationExistsYet() throws IOException {
        Path folder = MIGRATION.getParent();
        List<String> versions = new ArrayList<>();
        try (var stream = Files.list(folder)) {
            stream.filter(path -> path.getFileName().toString().matches("V\\d+__.*\\.sql"))
                    .forEach(path -> versions.add(path.getFileName().toString()));
        }
        String newest = versions.stream()
                .max((left, right) -> Integer.compare(version(left), version(right)))
                .orElseThrow();
        assertTrue(newest.startsWith("V68__"),
                "V68__module_practice.sql is no longer the newest migration (newest is " + newest + ")");
    }

    private static int version(String fileName) {
        return Integer.parseInt(fileName.substring(1, fileName.indexOf("__")));
    }

    /**
     * PostgreSQL index and table names are schema-global, so two migrations creating the same name
     * abort the whole Flyway run — the failure mode this repo has already hit once (the V63/V64/V65
     * renumbering). Every name V68 creates must therefore be new.
     */
    @Test
    void noObjectNameCollidesWithAnAlreadyAppliedMigration() throws IOException {
        Set<String> mine = createdNames(sql());
        assertFalse(mine.isEmpty(), "the scan found no objects in V68 — the pattern is broken");

        Set<String> clashes = new LinkedHashSet<>();
        Path folder = MIGRATION.getParent();
        try (var stream = Files.list(folder)) {
            for (Path path : stream.filter(p -> p.getFileName().toString().matches("V\\d+__.*\\.sql")).toList()) {
                if (path.getFileName().toString().equals(MIGRATION.getFileName().toString())) {
                    continue;
                }
                Set<String> theirs = createdNames(Files.readString(path, StandardCharsets.UTF_8));
                for (String name : mine) {
                    if (theirs.contains(name)) {
                        clashes.add(name + " (also created by " + path.getFileName() + ")");
                    }
                }
            }
        }
        assertTrue(clashes.isEmpty(), "V68 reuses names another migration already creates: " + clashes);
    }

    /** Every table, index and constraint name a migration introduces. */
    private static Set<String> createdNames(String sql) {
        Set<String> names = new LinkedHashSet<>();
        collect(sql, "(?i)CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+([a-z_][a-z0-9_]*)", names);
        collect(sql, "(?i)CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+IF\\s+NOT\\s+EXISTS\\s+([a-z_][a-z0-9_]*)", names);
        collect(sql, "(?i)ADD\\s+CONSTRAINT\\s+([a-z_][a-z0-9_]*)", names);
        collect(sql, "(?i)^\\s*CONSTRAINT\\s+([a-z_][a-z0-9_]*)", names);
        return names;
    }

    private static void collect(String sql, String pattern, Set<String> into) {
        var matcher = java.util.regex.Pattern.compile(pattern, java.util.regex.Pattern.MULTILINE).matcher(sql);
        while (matcher.find()) {
            into.add(matcher.group(1).toLowerCase());
        }
    }
}
