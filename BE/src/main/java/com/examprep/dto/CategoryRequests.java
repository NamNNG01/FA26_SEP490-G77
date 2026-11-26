package com.examprep.dto;

import jakarta.validation.constraints.*;
import lombok.Getter;
import lombok.Setter;

public final class CategoryRequests {
    private CategoryRequests() {}

    public record Create(
            @NotBlank @Size(max = 255) @Pattern(regexp = "(?sU).*\\S.*", message = "must not be blank") String name,
            @Size(max = 1000, message = "Description must not exceed 1000 characters") String description,
            Integer sortOrder,
            Boolean isActive,
            Long parentId
    ) {}

    @Getter
    @Setter
    public static class Update {
        @Size(max = 255)
        @Pattern(regexp = "(?sU).*\\S.*", message = "must not be blank")
        private String name;
        @Size(max = 1000, message = "Description must not exceed 1000 characters")
        private String description;
        private boolean descriptionPresent;
        private Integer sortOrder;
        private Boolean isActive;
        private Long parentId;

        public void setDescription(String description) {
            this.description = description;
            this.descriptionPresent = true;
        }
    }
}
