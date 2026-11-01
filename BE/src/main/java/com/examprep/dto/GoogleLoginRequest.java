package com.examprep.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * AUTH-09: the Google ID token produced by Google Identity Services in the
 * browser. Never trust its payload until {@code GoogleTokenVerifier} has
 * checked the signature, audience, issuer and expiry.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GoogleLoginRequest {

    @NotBlank(message = "Google ID token is required")
    private String idToken;
}
