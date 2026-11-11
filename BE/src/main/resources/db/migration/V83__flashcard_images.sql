ALTER TABLE flashcards ADD COLUMN front_image_url VARCHAR(1000);
ALTER TABLE flashcards ADD COLUMN back_image_url VARCHAR(1000);
ALTER TABLE flashcards ALTER COLUMN front_text DROP NOT NULL;
ALTER TABLE flashcards ALTER COLUMN back_text DROP NOT NULL;
