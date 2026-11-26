package com.examprep.util.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Unified backend password policy:
 * - At least 8 characters
 * - At least one uppercase letter (\p{Lu}), one digit (\p{N}), and one symbol ([\p{P}\p{S}])
 * - At most 72 UTF-8 bytes (BCrypt input limit)
 */
public class ValidPasswordValidator implements ConstraintValidator<ValidPassword, String> {

    public static final int MIN_LENGTH = 8;
    public static final int BCRYPT_MAX_BYTES = 72;
    private static final Pattern COMPLEXITY =
            Pattern.compile("(?s)(?=.*\\p{Lu})(?=.*\\p{N})(?=.*[\\p{P}\\p{S}]).*");

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        if (value == null || value.isBlank()) {
            // Leave missing/blank handling to @NotBlank so field error messages stay deterministic.
            return true;
        }
        Optional<String> error = violation(value);
        if (error.isEmpty()) {
            return true;
        }
        context.disableDefaultConstraintViolation();
        context.buildConstraintViolationWithTemplate(error.get()).addConstraintViolation();
        return false;
    }

    public static Optional<String> violation(String password) {
        if (password == null || password.isBlank()) {
            return Optional.of("Password is required");
        }
        if (password.length() < MIN_LENGTH) {
            return Optional.of("Password must be at least 8 characters");
        }
        if (!COMPLEXITY.matcher(password).matches()) {
            return Optional.of("Password must include at least one uppercase letter, one number, and one symbol");
        }
        if (password.getBytes(StandardCharsets.UTF_8).length > BCRYPT_MAX_BYTES) {
            return Optional.of("Password must not exceed 72 UTF-8 bytes");
        }
        return Optional.empty();
    }
}
