package com.examprep.util.attempt;

import com.examprep.dto.attempt.Snapshots;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** UTC243 - FILL_BLANK grading honours caseSensitive=true. */
class AttemptGraderFillBlankTest {

    private final ObjectMapper json = new ObjectMapper();

    private Snapshots.KeySnapshot key() {
        return new Snapshots.KeySnapshot(null, null, List.of(new Snapshots.Blank(1, List.of("Paris"), true)), null, null, null);
    }

    private JsonNode response(String value) throws Exception {
        return json.readTree("{\"blanks\":{\"1\":\"" + value + "\"}}");
    }

    @Test
    void utc243_caseSensitiveBlankRejectsDifferentCase() throws Exception {
        AttemptGrader.Grade grade = AttemptGrader.grade("FILL_BLANK", response("paris"), key(), BigDecimal.ONE);
        assertFalse(grade.correct());
        assertEquals(0, grade.score().compareTo(BigDecimal.ZERO));
    }

    @Test
    void utc243_caseSensitiveBlankAcceptsExactSpelling() throws Exception {
        AttemptGrader.Grade grade = AttemptGrader.grade("FILL_BLANK", response("Paris"), key(), BigDecimal.ONE);
        assertTrue(grade.correct());
        assertEquals(0, grade.score().compareTo(BigDecimal.ONE));
    }
}
