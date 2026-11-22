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
public class CreateReportRequestDto {
    @NotBlank(message = "Report reason is required")
    @Size(max = 500, message = "Reason must not exceed 500 characters")
    private String reason;
}
