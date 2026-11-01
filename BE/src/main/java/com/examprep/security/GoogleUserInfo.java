package com.examprep.security;

/**
 * The claims AUTH-09 needs out of a verified Google ID token. Built only by
 * {@link GoogleTokenVerifier}, so its values have already been checked against
 * Google's signature, audience, issuer and expiry before anyone reads them.
 *
 * @param googleId      the stable Google subject id ("sub")
 * @param email         the Google account email
 * @param emailVerified whether Google has verified ownership of that address
 * @param fullName      the profile display name, may be absent
 * @param avatarUrl     the profile picture URL, may be absent
 */
public record GoogleUserInfo(
        String googleId,
        String email,
        boolean emailVerified,
        String fullName,
        String avatarUrl) {
}
