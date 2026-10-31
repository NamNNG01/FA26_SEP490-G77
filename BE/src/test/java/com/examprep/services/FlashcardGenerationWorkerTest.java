package com.examprep.services;

import org.junit.jupiter.api.Test;

import java.text.Normalizer;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Deterministic unit tests for the AI draft validation rules (no Spring, no async worker):
 * blank cards dropped, duplicates removed, sides clipped to 2000 chars, NFC-normalised dedupe key.
 */
class FlashcardGenerationWorkerTest {

    @Test
    void parseCardsDropsBlankDedupesAndClips() {
        String longBack = "x".repeat(2_500);
        String text = "```json\n{\"cards\":["
                + "{\"frontText\":\"Photosynthesis là gì?\",\"backText\":\"Quá trình quang hợp\"},"
                + "{\"frontText\":\"  photosynthesis LÀ GÌ?  \",\"backText\":\"quá trình   quang hợp\"},"
                + "{\"frontText\":\"Kept\",\"backText\":\"" + longBack + "\"},"
                + "{\"frontText\":\"Blank back\",\"backText\":\"   \"}"
                + "]}\n```";

        List<FlashcardGenerationWorker.Card> cards = FlashcardGenerationWorker.parseCards(text, 20);

        assertEquals(2, cards.size());
        assertEquals("c1", cards.get(0).tempId());
        assertEquals("Photosynthesis là gì?", cards.get(0).frontText());
        assertEquals("c2", cards.get(1).tempId());
        assertEquals("Kept", cards.get(1).frontText());
        assertEquals(2_000, cards.get(1).backText().length());
    }

    @Test
    void parseCardsDedupesComposedAndDecomposedVietnamese() {
        String composed = "Hệ thống quang hợp";
        String decomposed = Normalizer.normalize(composed, Normalizer.Form.NFD);
        String text = "{\"cards\":["
                + "{\"frontText\":\"" + composed + "\",\"backText\":\"A\"},"
                + "{\"frontText\":\"" + decomposed + "\",\"backText\":\"a\"}]}";

        assertEquals(1, FlashcardGenerationWorker.parseCards(text, 20).size());
    }

    @Test
    void parseCardsRejectsAnEmptyDraft() {
        RuntimeException failure = assertThrows(RuntimeException.class,
                () -> FlashcardGenerationWorker.parseCards("{\"cards\":[]}", 20));

        assertEquals("AI_INVALID_OUTPUT", failure.getMessage());
    }
}
