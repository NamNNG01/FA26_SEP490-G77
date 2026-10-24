-- V30__exam_question_sequence.sql
-- ExamQuestion ids now come from a pooled sequence (allocationSize = 50) so Hibernate can batch
-- exam link inserts. The increment must match allocationSize or Hibernate refuses to start.
ALTER SEQUENCE exam_questions_exam_question_id_seq INCREMENT BY 50;
SELECT setval('exam_questions_exam_question_id_seq', COALESCE((SELECT MAX(exam_question_id) FROM exam_questions), 1), true);
