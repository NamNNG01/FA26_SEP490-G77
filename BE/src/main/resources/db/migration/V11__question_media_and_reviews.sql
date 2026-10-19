-- V11__question_media_and_reviews.sql
CREATE TABLE IF NOT EXISTS question_media (
  media_id BIGSERIAL PRIMARY KEY,
  question_id BIGINT NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
  option_id BIGINT REFERENCES answer_options(option_id) ON DELETE CASCADE,
  url VARCHAR(512) NOT NULL,
  media_type VARCHAR(20) NOT NULL,
  alt_text VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS question_reviews (
  review_id BIGSERIAL PRIMARY KEY,
  question_id BIGINT NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
  reviewer_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  decision VARCHAR(10) NOT NULL CHECK (decision IN ('APPROVED','REJECTED')),
  note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
