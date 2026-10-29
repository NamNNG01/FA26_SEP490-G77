package com.examprep.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.HexFormat;

@Slf4j
@Component
public class PayosClient {
    private final RestClient client;
    private final ObjectMapper mapper;
    private final String clientId;
    private final String apiKey;
    private final String checksumKey;
    private final String returnUrl;
    private final String cancelUrl;

    public PayosClient(@Value("${app.payos.base-url}") String baseUrl,
                       @Value("${app.payos.client-id:}") String clientId,
                       @Value("${app.payos.api-key:}") String apiKey,
                       @Value("${app.payos.checksum-key:}") String checksumKey,
                       @Value("${app.payos.return-url}") String returnUrl,
                       @Value("${app.payos.cancel-url}") String cancelUrl,
                       ObjectMapper mapper) {
        this.client = RestClient.builder().baseUrl(baseUrl).build();
        this.clientId = clientId;
        this.apiKey = apiKey;
        this.checksumKey = checksumKey;
        this.returnUrl = returnUrl;
        this.cancelUrl = cancelUrl;
        this.mapper = mapper;
    }

    public record Link(String checkoutUrl, String qrCode, String paymentLinkId) {}

    public Link create(long payosOrderCode, int amountVnd, String description) {
        requireCredentials();
        String safeDescription = description.length() > 25 ? description.substring(0, 25) : description;
        String signature = sign("amount=" + amountVnd + "&cancelUrl=" + cancelUrl + "&description=" + safeDescription
                + "&orderCode=" + payosOrderCode + "&returnUrl=" + returnUrl);
        JsonNode response = client.post().uri("/v2/payment-requests")
                .header("x-client-id", clientId).header("x-api-key", apiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("orderCode", payosOrderCode, "amount", amountVnd, "description", safeDescription,
                        "cancelUrl", cancelUrl, "returnUrl", returnUrl,
                        "expiredAt", Instant.now().plusSeconds(1800).getEpochSecond(), "signature", signature))
                .retrieve().body(JsonNode.class);
        JsonNode data = response == null ? null : response.path("data");
        if (data == null || !data.hasNonNull("checkoutUrl")) {
            throw new IllegalStateException("PayOS did not return a checkout URL");
        }
        return new Link(data.path("checkoutUrl").asText(), data.path("qrCode").asText(null),
                data.path("paymentLinkId").asText(null));
    }

    public void cancel(long payosOrderCode) {
        requireCredentials();
        client.post().uri("/v2/payment-requests/{orderCode}/cancel", payosOrderCode)
                .header("x-client-id", clientId).header("x-api-key", apiKey)
                .contentType(MediaType.APPLICATION_JSON).body(Map.of("cancellationReason", "Cancelled by customer"))
                .retrieve().toBodilessEntity();
    }

    public boolean verifyWebhook(JsonNode webhook) {
        if (webhook == null || checksumKey.isBlank() || !webhook.path("data").isObject()
                || !webhook.path("signature").isTextual()) return false;
        try {
            String canonical = canonical(webhook.path("data"));
            byte[] expected = HexFormat.of().parseHex(sign(canonical));
            byte[] supplied = HexFormat.of().parseHex(webhook.path("signature").asText());
            return java.security.MessageDigest.isEqual(expected, supplied);
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }

    private String canonical(JsonNode data) {
        List<String> fields = new ArrayList<>();
        data.properties().stream().sorted(Map.Entry.comparingByKey()).forEach(entry -> {
            JsonNode value = entry.getValue();
            String text = value == null || value.isNull() ? "" : value.isContainerNode() ? compactSorted(value) : value.asText();
            fields.add(entry.getKey() + "=" + text);
        });
        return String.join("&", fields);
    }

    private String compactSorted(JsonNode value) {
        try {
            if (value.isArray()) {
                List<String> parts = new ArrayList<>();
                value.forEach(item -> parts.add(compactSorted(item)));
                return "[" + String.join(",", parts) + "]";
            }
            if (value.isObject()) {
                List<String> parts = new ArrayList<>();
                value.properties().stream().sorted(Map.Entry.comparingByKey()).forEach(e ->
                        parts.add(mapper.valueToTree(e.getKey()).toString() + ":" + compactSorted(e.getValue())));
                return "{" + String.join(",", parts) + "}";
            }
            return value.toString();
        } catch (Exception ex) {
            throw new IllegalArgumentException("Invalid PayOS webhook data");
        }
    }

    private String sign(String message) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(checksumKey.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(message.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException("PayOS signature could not be computed", ex);
        }
    }

    private void requireCredentials() {
        if (clientId.isBlank() || apiKey.isBlank() || checksumKey.isBlank()) {
            throw new IllegalStateException("PayOS is not configured; set PAYOS_CLIENT_ID, PAYOS_API_KEY and PAYOS_CHECKSUM_KEY");
        }
    }
}
