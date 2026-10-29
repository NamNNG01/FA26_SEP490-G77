package com.examprep.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.NotBlank;
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
            int rowIndex,
            String frontText,
            String backText,
            boolean valid,
            boolean duplicate,
            List<ValidationError> errors
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
            Long courseId
    ) {}

    public record CardInput(
            @NotBlank String frontText,
            @NotBlank String backText
    ) {}

    public record BulkSaveRequest(
            Long deckId,
            NewDeckRequest newDeck,
            @NotBlank String source, // IMPORT or AI
            Long aiGenerationId,
            Boolean skipDuplicates, // default true
            List<CardInput> cards
    ) {}

    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record BulkSaveResponse(
            Long deckId,
            int createdCount,
            int skippedDuplicateCount,
            List<Long> cardIds
    ) {}
}
