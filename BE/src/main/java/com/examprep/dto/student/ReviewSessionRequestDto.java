package com.examprep.dto.student;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ReviewSessionRequestDto {
    private String type; // wrong, bookmarked, all
    @Min(1)
    @Max(50)
    private Integer size;
}
