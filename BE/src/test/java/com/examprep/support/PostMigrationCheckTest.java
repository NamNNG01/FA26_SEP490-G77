package com.examprep.support;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

public class PostMigrationCheckTest extends AbstractPostgresIT {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    public void runPostMigrationChecks() throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("# Post-V32 Migration Check Report\n\n");

        // 1. Unmigrated answers check
        Long unmigrated = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM attempt_answers WHERE response IS NULL AND (selected_option_id IS NOT NULL OR essay_answer IS NOT NULL)",
                Long.class
        );
        sb.append("- Unmigrated answers (response IS NULL with old choice/essay): ").append(unmigrated).append(" (Expected: 0)\n");
        assertEquals(0L, unmigrated);

        // 2. Null deadlines check
        Long nullDeadlines = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM exam_attempts WHERE deadline_at IS NULL",
                Long.class
        );
        sb.append("- Exam attempts with null deadline_at: ").append(nullDeadlines).append(" (Expected: 0)\n");
        assertEquals(0L, nullDeadlines);

        // 3. Attempt status distribution
        sb.append("## Exam Attempt Statuses\n");
        List<Map<String, Object>> statuses = jdbcTemplate.queryForList("SELECT status, COUNT(*) as cnt FROM exam_attempts GROUP BY status");
        sb.append("| Status | Count |\n|---|---|\n");
        for (Map<String, Object> r : statuses) {
            sb.append(String.format("| %s | %s |\n", r.get("status"), r.get("cnt")));
        }
        sb.append("\n");

        // 4. Empty explanation check
        Long emptyExps = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM questions WHERE ai_explanation = ''",
                Long.class
        );
        sb.append("- Questions with empty string explanation: ").append(emptyExps).append(" (Expected: 0)\n");
        assertEquals(0L, emptyExps);

        // 5. Subscription plans count
        Long plansCount = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM subscription_plans", Long.class);
        sb.append("- Total subscription plans: ").append(plansCount).append(" (Expected >= 3)\n");
        assertTrue(plansCount >= 3);

        File reportDir = new File("docs/db");
        if (!reportDir.exists()) {
            reportDir.mkdirs();
        }
        try (FileWriter fw = new FileWriter(new File(reportDir, "post-v32-check.md"))) {
            fw.write(sb.toString());
        }
    }

    @Test
    @Transactional
    public void testCheckConstraintsRejectInvalidData() {
        // Test invalid exam attempt status
        assertThrows(Exception.class, () -> {
            jdbcTemplate.update("INSERT INTO exam_attempts (exam_id, user_id, start_time, deadline_at, status) VALUES (1, 1, NOW(), NOW(), 'INVALID_STATUS')");
        });
    }
}
