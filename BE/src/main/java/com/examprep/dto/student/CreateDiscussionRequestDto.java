package com.examprep.dto.student;

import jakarta.validation.constraints.NotBlank;
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
    @NotBlank
    @Size(max = 200)
    private String title;
    @NotBlank
    @Size(max = 10000)
    private String content;
    private Boolean isAnonymous;
    @Size(max = 1000)
    private String imageUrl;
}
