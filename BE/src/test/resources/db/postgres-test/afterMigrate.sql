-- Flyway callback (test-only, postgres-test profile): runs after every migrate.
-- Question and AnswerOption use @SequenceGenerator(allocationSize = 50), but no versioned
-- migration sets these sequences to INCREMENT BY 50 (V30 only does exam_questions).
-- Without this, Hibernate refuses to start on a freshly migrated database.
ALTER SEQUENCE IF EXISTS questions_question_id_seq INCREMENT BY 50;
ALTER SEQUENCE IF EXISTS answer_options_option_id_seq INCREMENT BY 50;
