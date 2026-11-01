package com.examprep.security;

import com.examprep.exceptions.UnauthorizedException;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.jackson2.JacksonFactory;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.util.Collections;

/**
 * AUTH-09: turns the Google ID token the browser collected into trusted claims.
 *
 * <p>{@link GoogleIdTokenVerifier} checks the RS256 signature against Google's
 * published JWKS (fetched once and cached), the audience against our own client
 * id, the issuer ({@code accounts.google.com}), and the expiry. Anything that
 * fails those checks comes back as {@code null} and is rejected here — the
 * payload is never trusted on its own.
 *
 * <p>With no {@code app.google.client-id} configured the verifier is disabled
 * and every call is rejected, so a half-configured deployment cannot accept a
 * token minted for somebody else's client id.
 */
@Slf4j
@Component
public class GoogleTokenVerifier {

    private final GoogleIdTokenVerifier verifier;

    public GoogleTokenVerifier(@Value("${app.google.client-id:}") String clientId) {
        String configuredClientId = clientId == null ? "" : clientId.trim();
        if (configuredClientId.isEmpty()) {
            log.warn("app.google.client-id is not set — AUTH-09 Google Sign-In is disabled.");
            this.verifier = null;
            return;
        }
        this.verifier = new GoogleIdTokenVerifier.Builder(
                new NetHttpTransport(), JacksonFactory.getDefaultInstance())
                .setAudience(Collections.singletonList(configuredClientId))
                .build();
        log.info("AUTH-09 Google Sign-In is enabled.");
    }

    /**
     * @throws UnauthorizedException when Google Sign-In is disabled, or the
     *                               token is malformed, expired, signed for
     *                               another client, or not issued by Google.
     */
    public GoogleUserInfo verify(String idToken) {
        if (verifier == null) {
            throw new UnauthorizedException("Google Sign-In is not configured on the server.");
        }

        GoogleIdToken token;
        try {
            token = verifier.verify(idToken);
        } catch (GeneralSecurityException | IOException e) {
            // Never echo the token or the underlying crypto detail to the client.
            log.warn("Google ID token verification could not be completed: {}", e.getClass().getSimpleName());
            throw new UnauthorizedException("Could not verify the Google ID token.");
        } catch (IllegalArgumentException e) {
            // Malformed JWT: GoogleIdToken.parse throws before any check runs.
            throw new UnauthorizedException("Invalid Google ID token.");
        }

        if (token == null) {
            throw new UnauthorizedException("Invalid or expired Google ID token.");
        }

        GoogleIdToken.Payload payload = token.getPayload();
        String subject = asText(payload.get("sub"));
        if (subject == null || subject.isBlank()) {
            throw new UnauthorizedException("The Google ID token has no subject identifier.");
        }

        // Every claim is read through the generic accessor: a claim Google
        // happens to send in an unexpected shape then reads as absent instead
        // of throwing a ClassCastException out of the typed accessors.
        Object emailVerified = payload.get("email_verified");

        return new GoogleUserInfo(
                subject,
                asText(payload.get("email")),
                Boolean.TRUE.equals(emailVerified) || "true".equals(emailVerified),
                asText(payload.get("name")),
                asText(payload.get("picture")));
    }

    /** The "sub" claim is a JSON string, but read it defensively. */
    private static String asText(Object claim) {
        if (claim == null) {
            return null;
        }
        String text = claim.toString().trim();
        return text.isEmpty() ? null : text;
    }
}
