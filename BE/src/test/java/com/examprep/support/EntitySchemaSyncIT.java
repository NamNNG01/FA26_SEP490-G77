package com.examprep.support;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import org.hibernate.boot.model.naming.CamelCaseToUnderscoresNamingStrategy;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.*;

import static org.junit.jupiter.api.Assertions.fail;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@TestPropertySource(properties = {
        "spring.jpa.hibernate.ddl-auto=validate"
})
public class EntitySchemaSyncIT extends AbstractPostgresIT {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private final CamelCaseToUnderscoresNamingStrategy namingStrategy = new CamelCaseToUnderscoresNamingStrategy();

    @Test
    public void testTwoWaySchemaSync() throws IOException {
        // 1. Load ignored columns from schema-ignore.txt
        Set<String> ignoredColumns = new HashSet<>();
        File ignoreFile = new File("src/test/resources/schema-ignore.txt");
        if (ignoreFile.exists()) {
            try (BufferedReader br = new BufferedReader(new FileReader(ignoreFile))) {
                String line;
                while ((line = br.readLine()) != null) {
                    line = line.trim();
                    if (line.isEmpty() || line.startsWith("#")) continue;
                    String[] parts = line.split("\\|");
                    ignoredColumns.add(parts[0].trim().toLowerCase());
                }
            }
        }

        // 2. Get all tables and columns from information_schema
        Map<String, Set<String>> dbTableColumns = new HashMap<>();
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'"
        );
        for (Map<String, Object> row : rows) {
            String tableName = (String) row.get("table_name");
            String columnName = (String) row.get("column_name");
            dbTableColumns.computeIfAbsent(tableName, k -> new HashSet<>()).add(columnName);
        }

        // 3. Discover all Entity classes
        List<Class<?>> entityClasses = Arrays.asList(
                com.examprep.entities.AiUsageLog.class,
                com.examprep.entities.AnswerOption.class,
                com.examprep.entities.AnswerRegradeLog.class,
                com.examprep.entities.AttemptAnswer.class,
                com.examprep.entities.AttemptAnswerOption.class,
                com.examprep.entities.Category.class,
                com.examprep.entities.CategoryAuditEvent.class,
                com.examprep.entities.Contest.class,
                com.examprep.entities.ContestParticipant.class,
                com.examprep.entities.ContestReward.class,
                com.examprep.entities.Course.class,
                com.examprep.entities.CourseManager.class,
                com.examprep.entities.Deck.class,
                com.examprep.entities.Discount.class,
                com.examprep.entities.Document.class,
                com.examprep.entities.Enrollment.class,
                com.examprep.entities.Exam.class,
                com.examprep.entities.ExamAttempt.class,
                com.examprep.entities.ExamConfig.class,
                com.examprep.entities.ExamGroup.class,
                com.examprep.entities.ExamQuestion.class,
                com.examprep.entities.Flashcard.class,
                com.examprep.entities.Module.class,
                com.examprep.entities.Notification.class,
                com.examprep.entities.PasswordResetToken.class,
                com.examprep.entities.Question.class,
                com.examprep.entities.QuestionGroup.class,
                com.examprep.entities.QuestionMedia.class,
                com.examprep.entities.QuestionReview.class,
                com.examprep.entities.RefreshToken.class,
                com.examprep.entities.SubscriptionPlan.class,
                com.examprep.entities.User.class,
                com.examprep.entities.UserCardProgress.class,
                com.examprep.entities.UserDiscount.class,
                com.examprep.entities.UserNotification.class,
                com.examprep.entities.UserSubscription.class
        );

        StringBuilder report = new StringBuilder();
        report.append("# Entity Schema Report (Sync IT)\n\n");
        report.append("| Bảng Entity | Cột DB không có field | Field không có cột DB | Lệch kiểu / Ghi chú |\n");
        report.append("|---|---|---|---|\n");

        boolean hasErrors = false;
        List<String> errorMessages = new ArrayList<>();

        Map<String, Class<?>> tableToEntity = new HashMap<>();
        for (Class<?> clazz : entityClasses) {
            if (!clazz.isAnnotationPresent(Entity.class)) continue;
            Table tableAnn = clazz.getAnnotation(Table.class);
            String tableName = tableAnn != null && !tableAnn.name().isEmpty() ? tableAnn.name() : namingStrategy.toPhysicalTableName(org.hibernate.boot.model.naming.Identifier.toIdentifier(clazz.getSimpleName()), null).getText();
            tableToEntity.put(tableName, clazz);

            Set<String> dbCols = dbTableColumns.getOrDefault(tableName, Collections.emptySet());
            Set<String> entityCols = new HashSet<>();

            for (Field field : clazz.getDeclaredFields()) {
                if (Modifier.isStatic(field.getModifiers()) || Modifier.isTransient(field.getModifiers()) || field.isAnnotationPresent(Transient.class)) {
                    continue;
                }
                if (field.isAnnotationPresent(jakarta.persistence.OneToMany.class) ||
                    field.isAnnotationPresent(jakarta.persistence.ManyToMany.class)) {
                    continue;
                }

                String colName = null;
                if (field.isAnnotationPresent(Column.class)) {
                    Column colAnn = field.getAnnotation(Column.class);
                    if (!colAnn.name().isEmpty()) {
                        colName = colAnn.name();
                        if (colName.startsWith("\"") && colName.endsWith("\"")) {
                            colName = colName.substring(1, colName.length() - 1);
                        }
                    }
                }
                if (colName == null && (field.isAnnotationPresent(jakarta.persistence.ManyToOne.class) || field.isAnnotationPresent(jakarta.persistence.OneToOne.class))) {
                    if (field.isAnnotationPresent(jakarta.persistence.JoinColumn.class)) {
                        jakarta.persistence.JoinColumn joinAnn = field.getAnnotation(jakarta.persistence.JoinColumn.class);
                        if (!joinAnn.name().isEmpty()) {
                            colName = joinAnn.name();
                        }
                    }
                }
                if (colName == null) {
                    colName = namingStrategy.toPhysicalColumnName(org.hibernate.boot.model.naming.Identifier.toIdentifier(field.getName()), null).getText();
                }
                entityCols.add(colName);
            }

            Set<String> missingFieldInEntity = new HashSet<>();
            for (String dbCol : dbCols) {
                if (!entityCols.contains(dbCol) && !ignoredColumns.contains(tableName + "." + dbCol)) {
                    missingFieldInEntity.add(dbCol);
                }
            }

            Set<String> missingColInDb = new HashSet<>(entityCols);
            missingColInDb.removeAll(dbCols);

            if (!missingFieldInEntity.isEmpty() || !missingColInDb.isEmpty()) {
                hasErrors = true;
                if (!missingFieldInEntity.isEmpty()) {
                    errorMessages.add("Table " + tableName + " has DB columns without entity fields: " + missingFieldInEntity);
                }
                if (!missingColInDb.isEmpty()) {
                    errorMessages.add("Table " + tableName + " has entity fields without DB columns: " + missingColInDb);
                }
            }

            report.append(String.format("| %s | %s | %s | %s |\n",
                    tableName,
                    missingFieldInEntity.isEmpty() ? "None" : String.join(", ", missingFieldInEntity),
                    missingColInDb.isEmpty() ? "None" : String.join(", ", missingColInDb),
                    "None"
            ));
        }

        File reportDir = new File("docs/db");
        if (!reportDir.exists()) {
            reportDir.mkdirs();
        }
        try (FileWriter writer = new FileWriter(new File(reportDir, "entity-schema-report.md"))) {
            writer.write(report.toString());
        }

        if (hasErrors) {
            fail("Schema sync failures:\n" + String.join("\n", errorMessages));
        }
    }
}
