package com.examprep.dto;

import jakarta.validation.constraints.*;
import lombok.Getter;
import lombok.Setter;

public final class CategoryRequests {
    private CategoryRequests() {}

    public record Create(@NotBlank @Size(max = 255) @Pattern(regexp = "(?sU).*\\S.*") String code,
                         @NotBlank @Size(max = 255) @Pattern(regexp = "(?sU).*\\S.*") String name,
                         Integer sortOrder, Boolean isActive) {}

    @Getter
    @Setter
    public static class Update {
        @Null(message = "Category code cannot be changed")
        private String code;
        @Size(max = 255)
        @Pattern(regexp = "(?sU).*\\S.*", message = "must not be blank")
        private String name;
        private Integer sortOrder;
        private Boolean isActive;
    }
}
