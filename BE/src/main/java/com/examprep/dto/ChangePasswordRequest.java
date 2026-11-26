package com.examprep.dto;

import com.examprep.util.validation.ValidPassword;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChangePasswordRequest {

    @NotBlank(message = "Current password is required")
    private String currentPassword;

    @Schema(description = "At least 8 characters, with at least one uppercase letter, one number, and one symbol, and at most 72 UTF-8 bytes.")
    @NotBlank(message = "New password is required")
    @ValidPassword
    private String newPassword;
}
