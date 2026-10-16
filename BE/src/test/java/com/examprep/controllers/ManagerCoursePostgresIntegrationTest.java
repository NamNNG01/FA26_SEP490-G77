package com.examprep.controllers;

import com.examprep.entities.Question;
import org.hibernate.Session;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.test.context.ActiveProfiles;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import java.sql.SQLException;
import java.sql.Savepoint;

/** Opt-in, isolated localhost PostgreSQL only; runs inherited HTTP tests with Flyway enabled. */
@EnabledIfSystemProperty(named = "postgresTests", matches = "true")
@ActiveProfiles(value = "postgres-test", inheritProfiles = false)
class ManagerCoursePostgresIntegrationTest extends ManagerCourseApiIntegrationTest {
    @Test
    void questionMetadataRoundTripsAsJsonRatherThanVarchar() throws Exception {
        Question question = Question.builder().questionType("SINGLE_CHOICE").content("JSON question")
                .questionMetadata("{\"source\":\"course-api-test\"}").build();
        em.persist(question);
        em.flush();
        assertEquals("course-api-test", em.createNativeQuery("SELECT question_metadata ->> 'source' FROM questions WHERE question_id = :id")
                .setParameter("id", question.getQuestionId()).getSingleResult());
        em.clear();
        assertEquals(json.readTree("{\"source\":\"course-api-test\"}"),
                json.readTree(em.find(Question.class, question.getQuestionId()).getQuestionMetadata()));
    }

    @Test
    void rawDeletesCannotCascadeAwayLegacyLessonsOrExamHistory() {
        em.flush();
        em.unwrap(Session.class).doWork(connection -> {
            try (var statement = connection.createStatement()) {
                long courseId;
                try (var rows = statement.executeQuery("SELECT max(course_id) FROM courses")) {
                    rows.next();
                    courseId = rows.getLong(1);
                }
                long moduleId;
                try (var rows = statement.executeQuery("INSERT INTO modules(course_id,title,order_index) VALUES (" + courseId + ",'Legacy',1) RETURNING module_id")) {
                    rows.next();
                    moduleId = rows.getLong(1);
                }
                statement.executeUpdate("INSERT INTO lessons(module_id,title) VALUES (" + moduleId + ",'Keep this lesson')");
                Savepoint savepoint = connection.setSavepoint();
                SQLException rejected = assertThrows(SQLException.class,
                        () -> statement.executeUpdate("DELETE FROM modules WHERE module_id = " + moduleId));
                assertEquals("23503", rejected.getSQLState());
                connection.rollback(savepoint);
                try (var rows = statement.executeQuery("SELECT count(*) FROM lessons WHERE module_id = " + moduleId)) {
                    rows.next();
                    assertEquals(1, rows.getInt(1));
                }
                statement.executeUpdate("DELETE FROM lessons WHERE module_id = " + moduleId);
                long userId;
                try (var rows = statement.executeQuery("SELECT min(user_id) FROM users")) {
                    rows.next();
                    userId = rows.getLong(1);
                }
                long examId;
                try (var rows = statement.executeQuery("INSERT INTO exams(course_id,created_by,title) VALUES (" + courseId + "," + userId + ",'Keep exam') RETURNING exam_id")) {
                    rows.next();
                    examId = rows.getLong(1);
                }
                statement.executeUpdate("INSERT INTO exam_attempts(exam_id,user_id) VALUES (" + examId + "," + userId + ")");
                Savepoint history = connection.setSavepoint();
                SQLException courseRejected = assertThrows(SQLException.class,
                        () -> statement.executeUpdate("DELETE FROM courses WHERE course_id = " + courseId));
                assertEquals("23503", courseRejected.getSQLState());
                connection.rollback(history);
                try (var rows = statement.executeQuery("SELECT count(*) FROM exam_attempts WHERE exam_id = " + examId)) {
                    rows.next();
                    assertEquals(1, rows.getInt(1));
                }
            }
        });
    }

    @Test
    void protectedForeignKeysRestrictDeletionIncludingRenamedExamConfigsAndLegacyLessons() {
        Number restrictive = (Number) em.createNativeQuery("""
                SELECT count(*) FROM pg_constraint c
                JOIN pg_class t ON t.oid = c.conrelid
                JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
                WHERE c.contype = 'f' AND c.confdeltype = 'r' AND
                (t.relname, a.attname) IN (
                  ('enrollments','course_id'), ('exams','course_id'), ('exams','module_id'),
                  ('questions','module_id'), ('exam_config','module_id'),
                  ('question_groups','course_id'), ('question_groups','module_id'), ('lessons','module_id'))
                """).getSingleResult();
        assertEquals(8, restrictive.intValue());
    }
}
