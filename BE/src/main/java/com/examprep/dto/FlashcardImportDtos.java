package com.examprep.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.List;

public final class FlashcardImportDtos {
    private FlashcardImportDtos() {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record ValidationError(
            String code,
            String message
    ) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record PreviewCardDto(
            /** 1-based card order, excluding the header and ignored rows. */
            int rowIndex,
            String frontText,
            String backText,
            boolean valid,
            boolean duplicate,
            List<ValidationError> errors,
            /** Original 1-based table row (or PDF text line) for diagnostics. */
            int sourceRowIndex
    ) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record PreviewWarning(
            String code,
            String message
    ) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record PreviewResponse(
            String fileName,
            String fileType,
            String templateVersion,
            int totalRows,
            int validCount,
            int invalidCount,
            int duplicateCount,
            List<PreviewCardDto> cards,
            List<PreviewWarning> warnings
    ) {}

    public record NewDeckRequest(
            @NotBlank @Size(max = 255) String title,
            String description,
            Boolean isPublic,
            @Positive Long courseId,
            @Positive Long moduleId
    ) {}

    public record CardInput(
            @NotBlank @Size(max = 2000) String frontText,
            @NotBlank @Size(max = 2000) String backText
    ) {}

    public record BulkSaveRequest(
            Long deckId,
            @Valid NewDeckRequest newDeck,
            @NotBlank String source, // IMPORT or AI
            Long aiGenerationId,
            Boolean skipDuplicates, // default true
            @Valid @Size(max = 500) List<CardInput> cards
    ) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record BulkSaveResponse(
            Long deckId,
            int createdCount,
            int skippedDuplicateCount,
            List<Long> cardIds
    ) {}
}
