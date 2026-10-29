package com.examprep.dto.student;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreateDiscussionRequestDto {
    @NotNull
    private Long courseId;
    @NotBlank
    @Size(max = 200)
    private String title;
    @NotBlank
    @Size(max = 10000)
    private String content;
    @NotBlank
    private String tag; // question, tip
    private Boolean isAnonymous;
}
