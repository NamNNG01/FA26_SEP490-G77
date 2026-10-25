package com.examprep.dto.attempt;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * Request bodies of the student attempt APIs (spec 6.3 SA-03, 6.4 SA-04).
 */
public final class AttemptRequests {
    private AttemptRequests() {}

    /**
     * SA-03 batch draft save. At most 50 items, {@code seq} is mandatory and strictly increasing
     * per question so an out-of-order retry can never overwrite a newer answer.
     */
    public record DraftSave(
            @NotNull @Size(max = 50) List<@Valid Draft> answers) {

        public record Draft(
                @NotNull Long questionId,
                @NotNull Integer seq,
                JsonNode response) {}
    }

    /** SA-04 submit body: the whole draft, or nothing when every answer is already stored. */
    public record Submit(
            @Size(max = 50) List<@Valid Draft> answers) {

        @JsonIgnoreProperties(ignoreUnknown = true)
        public record Draft(
                @NotNull Long questionId,
                Integer seq,
                JsonNode response) {}
    }
}
