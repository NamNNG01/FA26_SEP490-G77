package com.examprep;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

@EnabledIfSystemProperty(named = "postgresTests", matches = "true")
class CodeExamMigrationPostgresTest {

    @Test
    void upgradesLegacyCodeLanguagesAndRestoresTheLanguageOfTheJudgedSource() throws Exception {
        String server = "jdbc:postgresql://localhost:5433/";
        String database = "code_exam_" + UUID.randomUUID().toString().replace("-", "");
        var config = Flyway.configure().dataSource(server + database, "postgres", "postgres")
                .locations("classpath:db/migration");
        try (var admin = DriverManager.getConnection(server + "postgres", "postgres", "postgres");
             var administration = admin.createStatement()) {
            administration.execute("CREATE DATABASE " + database);
            try (var connection = DriverManager.getConnection(server + database, "postgres", "postgres");
                 var sql = connection.createStatement()) {
                config.target("96").load().migrate();
                sql.execute("""
                        INSERT INTO questions(question_type,content) VALUES
                            ('CODE','Empty'), ('CODE','Multiple'), ('CODE','No config');
                        INSERT INTO code_question_configs(question_id,allowed_languages)
                            SELECT question_id, CASE content WHEN 'Empty' THEN '[]'::jsonb ELSE '["PYTHON","JAVA"]'::jsonb END
                            FROM questions WHERE content IN ('Empty','Multiple');
                        INSERT INTO users(email,password_hash,full_name,role_name)
                            VALUES ('code-exam-migration@example.com','test','Migration test','STUDENT');
                        INSERT INTO exam_attempts(user_id,start_time,deadline_at,status)
                            SELECT user_id,now(),now(),'COMPLETED' FROM users WHERE email='code-exam-migration@example.com';
                        INSERT INTO attempt_answers(attempt_id,question_id,response)
                            SELECT attempt_id,question_id,'{"text":"source"}'::jsonb
                            FROM exam_attempts CROSS JOIN questions WHERE content IN ('Empty','Multiple');
                        INSERT INTO code_submissions(attempt_answer_id,attempt_id,question_id,user_id,language,source_code,status)
                            SELECT aa.attempt_answer_id,aa.attempt_id,aa.question_id,a.user_id,'PYTHON','source','PASSED'
                            FROM attempt_answers aa JOIN exam_attempts a USING(attempt_id)
                            JOIN questions q USING(question_id) WHERE q.content='Empty';
                        """);
                config.target("latest").load().migrate();
                Map<String, String> languages = new LinkedHashMap<>();
                try (var rows = sql.executeQuery("""
                        SELECT q.content, c.allowed_languages ->> 0
                        FROM code_question_configs c JOIN questions q USING(question_id)
                        WHERE q.content IN ('Empty','Multiple','No config')
                        """)) {
                    while (rows.next()) languages.put(rows.getString(1), rows.getString(2));
                }
                assertEquals(Map.of("Empty", "JAVA", "Multiple", "PYTHON", "No config", "JAVA"), languages);
                try (var rows = sql.executeQuery("""
                        SELECT aa.response ->> 'language' FROM attempt_answers aa
                        JOIN questions q USING(question_id) WHERE q.content='Empty'
                        """)) {
                    rows.next();
                    assertEquals("PYTHON", rows.getString(1));
                }
                SQLException invalid = assertThrows(SQLException.class, () -> sql.execute("""
                        UPDATE code_question_configs SET allowed_languages = '[]'
                        WHERE question_id = (SELECT question_id FROM questions WHERE content='Empty')
                        """));
                assertEquals("23514", invalid.getSQLState());
                config.load().validate();
            } finally {
                administration.execute("DROP DATABASE " + database + " WITH (FORCE)");
            }
        }
    }
}
