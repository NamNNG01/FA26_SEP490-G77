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
    /** The course the post belongs to (DI-03). Required: never default to "some" enrollment. */
    @NotNull
    private Long courseId;
    @NotBlank
    @Size(max = 200)
    private String title;
    @NotBlank
    @Size(max = 10000)
    private String content;
    /** question, tip or announcement; null means question. */
    @Size(max = 20)
    private String tag;
    private Boolean isAnonymous;
    @Size(max = 1000)
    private String imageUrl;
}
