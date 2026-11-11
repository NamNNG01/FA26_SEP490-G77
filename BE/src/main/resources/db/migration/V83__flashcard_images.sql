-- V42 already added both columns as VARCHAR(512); IF NOT EXISTS keeps this runnable there, then widen to 1000.
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS front_image_url VARCHAR(1000);
ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS back_image_url VARCHAR(1000);
ALTER TABLE flashcards ALTER COLUMN front_image_url TYPE VARCHAR(1000);
ALTER TABLE flashcards ALTER COLUMN back_image_url TYPE VARCHAR(1000);
ALTER TABLE flashcards ALTER COLUMN front_text DROP NOT NULL;
ALTER TABLE flashcards ALTER COLUMN back_text DROP NOT NULL;
