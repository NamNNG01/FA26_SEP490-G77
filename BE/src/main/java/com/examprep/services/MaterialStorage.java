package com.examprep.services;

import com.examprep.dto.ResponseCode;
import com.examprep.exceptions.BaseException;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * MQ-01 file store. Spec 13.1 allows Cloudinary or a local folder; §26.2 picks Cloudinary for
 * private material, uploaded as a signed raw asset that is not publicly listable. The provider is
 * chosen by configuration so development and tests need no Cloudinary credentials.
 */
@Slf4j
@Component
public class MaterialStorage {
    private static final String PROVIDER_CLOUDINARY = "cloudinary";

    private final String provider;
    private final Path localDir;
    private final String cloudName;
    private final String apiKey;
    private final String apiSecret;
    private final RestClient cloudinary;

    public MaterialStorage(@Value("${app.storage.provider:cloudinary}") String provider,
                           @Value("${app.storage.local-dir:data/materials}") String localDir,
                           @Value("${app.cloudinary.cloud-name:}") String cloudName,
                           @Value("${app.cloudinary.api-key:}") String apiKey,
                           @Value("${app.cloudinary.api-secret:}") String apiSecret) {
        this.provider = provider;
        this.localDir = Paths.get(localDir);
        this.cloudName = cloudName == null ? "" : cloudName.trim();
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.apiSecret = apiSecret == null ? "" : apiSecret.trim();
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout((int) Duration.ofSeconds(10).toMillis());
        requestFactory.setReadTimeout((int) Duration.ofSeconds(60).toMillis());
        this.cloudinary = RestClient.builder()
                .baseUrl("https://api.cloudinary.com")
                .requestFactory(requestFactory)
                .build();
    }

    /** Stable, filesystem-safe identifier fragment for one upload. */
    public String newPublicId(Long userId, String fileName) {
        return "materials/user" + userId + "/" + UUID.randomUUID() + "-" + sanitize(fileName);
    }

    /**
     * Stores the bytes and returns the reference persisted in {@code documents.file_url}.
     *
     * @throws BaseException {@code 502 STORAGE_ERROR} when the configured store rejects the upload
     */
    public String store(String publicId, String fileName, byte[] bytes) {
        if (PROVIDER_CLOUDINARY.equalsIgnoreCase(provider)) {
            return cloudinaryUpload(publicId, bytes);
        }
        return localStore(publicId, bytes);
    }

    private String localStore(String publicId, byte[] bytes) {
        try {
            Files.createDirectories(localDir);
            String relative = publicId.replace('/', '_');
            Path target = localDir.resolve(relative);
            Files.write(target, bytes);
            return target.toString().replace('\\', '/');
        } catch (IOException ex) {
            log.warn("Local material storage failed: {}", ex.getMessage());
            throw new BaseException(ResponseCode.STORAGE_ERROR, "Material file could not be stored");
        }
    }

    /**
     * Best-effort removal for a file whose {@code documents} row was never committed. Failures are
     * logged, never thrown, so the original database error still reaches the caller.
     */
    public void delete(String publicId) {
        if (publicId == null || publicId.isBlank()) {
            return;
        }
        try {
            if (PROVIDER_CLOUDINARY.equalsIgnoreCase(provider)) {
                cloudinaryDelete(publicId);
            } else {
                Files.deleteIfExists(localDir.resolve(publicId.replace('/', '_')));
            }
        } catch (Exception ex) {
            log.warn("Material cleanup failed: {}", ex.getMessage());
        }
    }

    private void cloudinaryDelete(String publicId) {
        if (cloudName.isEmpty() || apiKey.isEmpty() || apiSecret.isEmpty()) {
            return;
        }
        long timestamp = Instant.now().getEpochSecond();
        Map<String, String> signed = new TreeMap<>();
        signed.put("public_id", publicId);
        signed.put("timestamp", String.valueOf(timestamp));

        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        signed.forEach(form::add);
        form.add("api_key", apiKey);
        form.add("signature", sha1(signable(signed) + apiSecret));
        cloudinary.post()
                .uri("/v1_1/{cloud}/raw/destroy", cloudName)
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(form)
                .retrieve()
                .toBodilessEntity();
    }

    private String cloudinaryUpload(String publicId, byte[] bytes) {
        if (cloudName.isEmpty() || apiKey.isEmpty() || apiSecret.isEmpty()) {
            throw new BaseException(ResponseCode.STORAGE_ERROR,
                    "Cloudinary is not configured; set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET");
        }
        long timestamp = Instant.now().getEpochSecond();
        // "token" access control = authenticated delivery: the asset is never publicly listable and
        // only a signed URL can fetch it (spec 26.2: type = authenticated + signed URL).
        Map<String, String> signed = new TreeMap<>();
        signed.put("access_control", "[{\"type\":\"token\"}]");
        signed.put("public_id", publicId);
        signed.put("timestamp", String.valueOf(timestamp));

        return signedUpload("raw", signed, "application/octet-stream", bytes).path("secure_url").asText();
    }

    /** Uploaded public image as Cloudinary describes it. */
    public record StoredImage(String url, String publicId, String format, int width, int height, long bytes) {}

    public static final long MAX_IMAGE_BYTES = 5L * 1024 * 1024;

    /**
     * Validates and uploads a public image (avatar, course thumbnail, question media). Images always go to
     * Cloudinary whatever {@code app.storage.provider} says: the browser needs a public URL, a disk path is useless.
     * With {@code overwrite} the same publicId is replaced in place, so re-uploading an avatar leaves no orphan.
     *
     * @throws BaseException 400 FILE_TOO_LARGE / UNSUPPORTED_FILE_TYPE, 502 STORAGE_ERROR
     */
    public StoredImage storeImage(String publicId, byte[] bytes, boolean overwrite) {
        if (bytes == null || bytes.length == 0) {
            throw new BaseException(ResponseCode.BAD_REQUEST, "File must contain data", Map.of("code", "EMPTY_FILE"));
        }
        if (bytes.length > MAX_IMAGE_BYTES) {
            throw new BaseException(ResponseCode.FILE_TOO_LARGE, "Image must not exceed 5MB", Map.of("code", "FILE_TOO_LARGE"));
        }
        String format = imageFormat(bytes);
        if (format == null) {
            throw new BaseException(ResponseCode.UNSUPPORTED_FILE_TYPE, "Only JPG, PNG, WEBP and GIF images are supported",
                    Map.of("code", "UNSUPPORTED_FILE_TYPE"));
        }
        if (cloudName.isEmpty() || apiKey.isEmpty() || apiSecret.isEmpty()) {
            throw new BaseException(ResponseCode.STORAGE_ERROR,
                    "Cloudinary is not configured; set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET");
        }
        Map<String, String> signed = new TreeMap<>();
        signed.put("public_id", publicId);
        signed.put("timestamp", String.valueOf(Instant.now().getEpochSecond()));
        if (overwrite) {
            signed.put("overwrite", "true");
            signed.put("invalidate", "true");
        }
        JsonNode r = signedUpload("image", signed, "image/" + format, bytes);
        return new StoredImage(r.path("secure_url").asText(), r.path("public_id").asText(publicId),
                r.path("format").asText(format), r.path("width").asInt(), r.path("height").asInt(), r.path("bytes").asLong(bytes.length));
    }

    /** Magic-byte sniffing: the client's filename and content type are not trusted. SVG is refused (it can carry script). */
    static String imageFormat(byte[] b) {
        if (b.length >= 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF) return "jpeg";
        if (b.length >= 8 && (b[0] & 0xFF) == 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G') return "png";
        if (b.length >= 6 && b[0] == 'G' && b[1] == 'I' && b[2] == 'F' && b[3] == '8') return "gif";
        if (b.length >= 12 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
                && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') return "webp";
        return null;
    }

    private JsonNode signedUpload(String resourceType, Map<String, String> signed, String mime, byte[] bytes) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("file", "data:" + mime + ";base64," + Base64.getEncoder().encodeToString(bytes));
        signed.forEach(form::add);
        form.add("api_key", apiKey);
        form.add("signature", sha1(signable(signed) + apiSecret));

        JsonNode response;
        try {
            response = cloudinary.post()
                    .uri("/v1_1/{cloud}/{type}/upload", cloudName, resourceType)
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(form)
                    .retrieve()
                    .body(JsonNode.class);
        } catch (RuntimeException ex) {
            log.warn("Cloudinary upload failed: {}", ex.getMessage());
            throw new BaseException(ResponseCode.STORAGE_ERROR, "File storage rejected the upload");
        }
        String url = response == null ? null : response.path("secure_url").asText(null);
        if (url == null || url.isBlank()) {
            String message = response == null ? "empty response" : response.path("error").path("message").asText("unknown error");
            log.warn("Cloudinary upload rejected: {}", message);
            throw new BaseException(ResponseCode.STORAGE_ERROR, "File storage rejected the upload");
        }
        return response;
    }

    private String signable(Map<String, String> signed) {
        return signed.entrySet().stream()
                .map(entry -> entry.getKey() + "=" + entry.getValue())
                .collect(Collectors.joining("&"));
    }

    private String sha1(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-1");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-1 is not available", ex);
        }
    }

    private static String sanitize(String fileName) {
        String name = fileName == null || fileName.isBlank() ? "material" : fileName;
        String cleaned = name.replaceAll("[^a-zA-Z0-9._-]", "_").toLowerCase(Locale.ROOT);
        return cleaned.length() > 80 ? cleaned.substring(cleaned.length() - 80) : cleaned;
    }
}
