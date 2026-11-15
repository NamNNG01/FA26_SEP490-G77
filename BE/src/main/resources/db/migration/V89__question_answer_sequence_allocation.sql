-- V89__question_answer_sequence_allocation.sql
-- Question and AnswerOption carry @SequenceGenerator(allocationSize = 50), so Hibernate uses a
-- pooled sequence optimizer and validates the database increment at startup ("The increment size
-- of the sequence is set to [1] ... while the entity expects [50]").
-- V29 created these sequences like plain BIGSERIALs (increment 1) and V30 fixed only
-- exam_questions; the test-only afterMigrate.sql callback papered over the mismatch. Bring both
-- sequences in line with the entity mapping and re-sync them so the next pooled block starts
-- above the current maximum id.
ALTER SEQUENCE IF EXISTS questions_question_id_seq INCREMENT BY 50;
SELECT setval('questions_question_id_seq', COALESCE((SELECT MAX(question_id) FROM questions), 1), true);
ALTER SEQUENCE IF EXISTS answer_options_option_id_seq INCREMENT BY 50;
SELECT setval('answer_options_option_id_seq', COALESCE((SELECT MAX(option_id) FROM answer_options), 1), true);
