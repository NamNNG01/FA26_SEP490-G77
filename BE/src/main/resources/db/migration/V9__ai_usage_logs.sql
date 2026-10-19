-- V9__ai_usage_logs.sql
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  log_id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(user_id),
  course_id BIGINT REFERENCES courses(course_id),
  purpose VARCHAR(20) NOT NULL CHECK (purpose IN ('QUESTION_GEN','ESSAY_GRADING')),
  model VARCHAR(100), request_params JSONB, result JSONB,
  input_tokens INT, output_tokens INT,
  status VARCHAR(10) NOT NULL CHECK (status IN ('SUCCESS','FAILED','TIMEOUT')),
  error_message TEXT, duration_ms INT,
  saved_at TIMESTAMP,
  attempt_answer_id BIGINT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_quota ON ai_usage_logs(user_id, created_at);
