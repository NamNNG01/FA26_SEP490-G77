package com.examprep.dto.question;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class QuestionStatusRequest {
    @NotBlank(message = "Status is required")
    private String status; // ACTIVE, INACTIVE, DRAFT
    private Long lockVersion;
}
