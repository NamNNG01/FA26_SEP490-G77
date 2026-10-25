package com.examprep.support;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.util.List;
import java.util.Map;

public class PreMigrationCheckTest extends AbstractPostgresIT {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    public void runPreMigrationChecks() throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("# Pre-V32 Migration Check Report\n\n");

        // a. Attempt status
        sb.append("## 1. Exam Attempts Status\n");
        try {
            List<Map<String, Object>> rows = jdbcTemplate.queryForList("SELECT status, COUNT(*) as cnt FROM exam_attempts GROUP BY status");
            sb.append("| Status | Count |\n|---|---|\n");
            for (Map<String, Object> row : rows) {
                sb.append(String.format("| %s | %s |\n", row.get("status"), row.get("cnt")));
            }
        } catch (Exception e) {
            sb.append("Error or table empty: ").append(e.getMessage()).append("\n");
        }
        sb.append("\n");

        // b. Old choice data
        sb.append("## 2. Old Choice Data Counts\n");
        try {
            Long optIdCnt = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM attempt_answers WHERE selected_option_id IS NOT NULL", Long.class);
            Long optTableCnt = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM attempt_answer_options", Long.class);
            Long essayCnt = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM attempt_answers WHERE essay_answer IS NOT NULL", Long.class);
            sb.append("- attempt_answers with selected_option_id IS NOT NULL: ").append(optIdCnt).append("\n");
            sb.append("- attempt_answer_options total rows: ").append(optTableCnt).append("\n");
            sb.append("- attempt_answers with essay_answer IS NOT NULL: ").append(essayCnt).append("\n");
        } catch (Exception e) {
            sb.append("Error: ").append(e.getMessage()).append("\n");
        }
        sb.append("\n");

        // c. Duplicates for UNIQUE
        sb.append("## 3. Duplicate Checks (attempt_answers & exam_questions)\n");
        try {
            List<Map<String, Object>> aaDupes = jdbcTemplate.queryForList("SELECT attempt_id, question_id, COUNT(*) as cnt FROM attempt_answers GROUP BY 1,2 HAVING COUNT(*) > 1");
            List<Map<String, Object>> eqDupes = jdbcTemplate.queryForList("SELECT exam_id, question_id, COUNT(*) as cnt FROM exam_questions GROUP BY 1,2 HAVING COUNT(*) > 1");
            sb.append("- attempt_answers duplicates: ").append(aaDupes.size()).append("\n");
            sb.append("- exam_questions duplicates: ").append(eqDupes.size()).append("\n");
        } catch (Exception e) {
            sb.append("Error: ").append(e.getMessage()).append("\n");
        }
        sb.append("\n");

        // d. Strange values in questions
        sb.append("## 4. Question Status, Types & Approval Status\n");
        try {
            sb.append("### Status\n");
            for (Map<String, Object> r : jdbcTemplate.queryForList("SELECT status, COUNT(*) as cnt FROM questions GROUP BY status")) {
                sb.append(r.get("status")).append(": ").append(r.get("cnt")).append("\n");
            }
            sb.append("### Question Type\n");
            for (Map<String, Object> r : jdbcTemplate.queryForList("SELECT question_type, COUNT(*) as cnt FROM questions GROUP BY question_type")) {
                sb.append(r.get("question_type")).append(": ").append(r.get("cnt")).append("\n");
            }
            sb.append("### Approval Status\n");
            try {
                for (Map<String, Object> r : jdbcTemplate.queryForList("SELECT approval_status, COUNT(*) as cnt FROM questions GROUP BY approval_status")) {
                    sb.append(r.get("approval_status")).append(": ").append(r.get("cnt")).append("\n");
                }
            } catch (Exception e) {
                sb.append("approval_status column might not exist yet.\n");
            }
        } catch (Exception e) {
            sb.append("Error: ").append(e.getMessage()).append("\n");
        }
        sb.append("\n");

        // e. Explanations
        sb.append("## 5. Explanations in Questions\n");
        try {
            Map<String, Object> exp = jdbcTemplate.queryForMap("SELECT COUNT(*) FILTER (WHERE ai_explanation IS NULL) AS null_cnt, COUNT(*) FILTER (WHERE ai_explanation = '') AS empty_cnt, COUNT(*) FILTER (WHERE ai_explanation <> '') AS filled_cnt FROM questions");
            sb.append("- Null count: ").append(exp.get("null_cnt")).append("\n");
            sb.append("- Empty count: ").append(exp.get("empty_cnt")).append("\n");
            sb.append("- Filled count: ").append(exp.get("filled_cnt")).append("\n");
        } catch (Exception e) {
            sb.append("Error: ").append(e.getMessage()).append("\n");
        }
        sb.append("\n");

        // f. Existing constraints
        sb.append("## 6. Existing Constraints\n");
        try {
            List<Map<String, Object>> constraints = jdbcTemplate.queryForList(
                    "SELECT conrelid::regclass as tbl, conname, pg_get_constraintdef(oid) as def " +
                    "FROM pg_constraint " +
                    "WHERE conrelid IN ('ai_usage_logs'::regclass, 'exam_attempts'::regclass, 'questions'::regclass, 'attempt_answers'::regclass) " +
                    "AND contype IN ('c','u')"
            );
            sb.append("| Table | Constraint Name | Definition |\n|---|---|---|\n");
            for (Map<String, Object> c : constraints) {
                sb.append(String.format("| %s | %s | %s |\n", c.get("tbl"), c.get("conname"), c.get("def")));
            }
        } catch (Exception e) {
            sb.append("Error: ").append(e.getMessage()).append("\n");
        }
        sb.append("\n");

        // g. Existing columns check
        sb.append("## 7. Column Existence Check\n");
        try {
            List<Map<String, Object>> cols = jdbcTemplate.queryForList(
                    "SELECT table_name, column_name FROM information_schema.columns " +
                    "WHERE table_name IN ('attempt_answers','exam_attempts','questions','ai_usage_logs') " +
                    "AND column_name IN ('display_snapshot','key_snapshot','draft_seq','weight_snapshot'," +
                    "'deadline_at','submitted_at','auto_submitted','exam_snapshot','replaced_by','archived_at'," +
                    "'ai_explanation_source','ai_explanation_version','billing_source','reserved_tokens','question_count','attempt_id')"
            );
            sb.append("| Table | Column |\n|---|---|\n");
            for (Map<String, Object> col : cols) {
                sb.append(String.format("| %s | %s |\n", col.get("table_name"), col.get("column_name")));
            }
        } catch (Exception e) {
            sb.append("Error: ").append(e.getMessage()).append("\n");
        }

        File reportDir = new File("docs/db");
        if (!reportDir.exists()) {
            reportDir.mkdirs();
        }
        try (FileWriter fw = new FileWriter(new File(reportDir, "pre-v32-check.md"))) {
            fw.write(sb.toString());
        }
    }
}
