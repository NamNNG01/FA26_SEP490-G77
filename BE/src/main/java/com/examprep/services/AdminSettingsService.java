package com.examprep.services;

import com.examprep.entities.SystemSetting;
import com.examprep.exceptions.BadRequestException;
import com.examprep.repositories.SystemSettingRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Instant;

/**
 * Reads and writes the admin System Settings document (UM System Settings). The whole screen is
 * one JSON object stored under a single key: the server validates and persists it verbatim, so a
 * saved section survives a reload instead of pretending to be saved.
 */
@Service
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
public class AdminSettingsService {

    /** The single settings document of the platform screen. */
    public static final String PLATFORM_SETTINGS_KEY = "platform";

    /** A settings document larger than this is a client bug, not a configuration. */
    static final int MAX_DOCUMENT_BYTES = 64 * 1024;

    private final SystemSettingRepository settings;
    private final ObjectMapper json;

    /** The stored document, or an empty object when nothing has been saved yet. */
    @Transactional(readOnly = true)
    public JsonNode get() {
        return settings.findById(PLATFORM_SETTINGS_KEY)
                .map(row -> read(row.getSettingValue()))
                .orElseGet(json::createObjectNode);
    }

    /** Stores the document and answers with what was stored. */
    @Transactional
    public JsonNode save(JsonNode document, Long userId) {
        if (document == null || !document.isObject()) {
            throw new BadRequestException("Settings must be a JSON object");
        }
        validateAiSection(document.path("ai"));
        String serialized = document.toString();
        if (serialized.getBytes(StandardCharsets.UTF_8).length > MAX_DOCUMENT_BYTES) {
            throw new BadRequestException("Settings document is too large");
        }
        settings.save(SystemSetting.builder()
                .settingKey(PLATFORM_SETTINGS_KEY)
                .settingValue(serialized)
                .updatedAt(Instant.now())
                .updatedBy(userId)
                .build());
        return document;
    }

    private static void validateAiSection(JsonNode ai) {
        if (ai == null || ai.isMissingNode() || ai.isNull()) {
            return;
        }
        if (!ai.isObject()) {
            throw new BadRequestException("ai settings must be a JSON object");
        }
        JsonNode limitNode = ai.path("managerMonthlyTokenLimit");
        if (limitNode.isMissingNode() || limitNode.isNull()) {
            return;
        }
        long parsed = parseNonNegativeLimit(limitNode);
        if (parsed < 0) {
            throw new BadRequestException("Manager monthly AI token limit must be a non-negative integer.");
        }
    }

    /** Parses a non-negative whole number from either a JSON number or numeric string; returns -1 if invalid. */
    public static long parseNonNegativeLimit(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return -1;
        }
        if (node.isIntegralNumber()) {
            return node.asLong(-1);
        }
        if (node.isTextual()) {
            String raw = node.asText().strip();
            if (raw.isEmpty()) {
                return -1;
            }
            try {
                return Long.parseLong(raw);
            } catch (NumberFormatException ex) {
                return -1;
            }
        }
        return -1;
    }

    private JsonNode read(String value) {
        try {
            JsonNode node = json.readTree(value);
            return node != null && node.isObject() ? node : json.createObjectNode();
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Stored system settings are unreadable", ex);
        }
    }
}
