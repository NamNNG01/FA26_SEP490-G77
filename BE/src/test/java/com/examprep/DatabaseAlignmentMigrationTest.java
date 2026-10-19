package com.examprep;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

import java.sql.DriverManager;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** Upgrade fixtures use a disposable database on the fixed localhost test server. */
@EnabledIfSystemProperty(named = "postgresTests", matches = "true")
class DatabaseAlignmentMigrationTest {
    @Test void upgradePreservesJsonAndTeamQuestionTypesAndNormalizesExamMode() throws Exception {
        String server = "jdbc:postgresql://127.0.0.1:55439/";
        String database = "alignment_" + UUID.randomUUID().toString().replace("-", "");
        var configuration = Flyway.configure().dataSource(server + database, "examprep_test", "local-test-only")
                .locations("classpath:db/migration");
        try (var admin = DriverManager.getConnection(server + "postgres", "examprep_test", "local-test-only");
             var administration = admin.createStatement()) {
            administration.execute("CREATE DATABASE " + database);
            try (var connection = DriverManager.getConnection(server + database, "examprep_test", "local-test-only");
                 var sql = connection.createStatement()) {
                configuration.target("8").load().migrate();
                sql.execute("INSERT INTO questions(question_type,content,question_metadata,essay_grading_rubric) "
                        + "VALUES ('MULTIPLE_CHOICE','Legacy quiz','{\"language\":\"java\"}','{\"totalPoints\":4}'),"
                        + "('FILL_BLANK','Legacy fill',NULL,NULL)");
                sql.execute("INSERT INTO users(email,password_hash,full_name,role_name) "
                        + "VALUES ('migration-test@example.com','test','Migration test','ADMIN')");
                sql.execute("INSERT INTO exams(created_by,title,generation_type) SELECT user_id,'Legacy exam','FIXED' FROM users");
                sql.execute("INSERT INTO exam_config(exam_id,question_type,number_of_questions) "
                        + "SELECT exam_id,'MULTIPLE_CHOICE',1 FROM exams");
                configuration.target("latest").load().migrate();
                try (var rows = sql.executeQuery("SELECT question_type,pg_typeof(question_metadata)::text,"
                        + "pg_typeof(essay_grading_rubric)::text,question_metadata ->> 'language',"
                        + "essay_grading_rubric::jsonb ->> 'totalPoints' FROM questions WHERE content='Legacy quiz'")) {
                    rows.next();
                    assertEquals("MULTIPLE_CHOICE", rows.getString(1));
                    assertEquals("jsonb", rows.getString(2));
                    assertEquals("jsonb", rows.getString(3));
                    assertEquals("java", rows.getString(4));
                    assertEquals("4", rows.getString(5));
                }
                try (var rows = sql.executeQuery("SELECT question_type FROM questions WHERE content='Legacy fill'")) {
                    rows.next(); assertEquals("FILL_BLANK", rows.getString(1));
                }
                sql.execute("INSERT INTO questions(question_type,content) VALUES ('ORDERING','Order these'),('MULTIPLE_CHOICE','Choose many')");
                try (var rows = sql.executeQuery("SELECT generation_type FROM exams")) {
                    rows.next(); assertEquals("STATIC", rows.getString(1));
                }
                try (var rows = sql.executeQuery("SELECT question_type FROM exam_config")) {
                    rows.next(); assertEquals("MULTIPLE_CHOICE", rows.getString(1));
                }
                configuration.load().validate();
            } finally {
                administration.execute("DROP DATABASE " + database + " WITH (FORCE)");
            }
        }
    }
}
