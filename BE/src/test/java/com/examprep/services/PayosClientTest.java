package com.examprep.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HexFormat;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import static org.junit.jupiter.api.Assertions.*;

/**
 * PY-03 security rule: only a webhook whose HMAC-SHA256 signature over the canonical {@code data}
 * is valid may unlock a plan; PY-01 must send the signed payload PayOS expects.
 */
class PayosClientTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String CHECKSUM_KEY = "checksum-secret";
    private static final ExecutorService WORKERS = Executors.newCachedThreadPool();
    private static final List<CapturedRequest> REQUESTS = Collections.synchronizedList(new ArrayList<>());
    private static volatile String createReply;
    private static HttpServer server;
    private static String baseUrl;

    private record CapturedRequest(String uri, String clientId, String apiKey, String body) {}

    @BeforeAll
    static void startPayos() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.setExecutor(WORKERS);
        server.createContext("/", PayosClientTest::handle);
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterAll
    static void stopPayos() {
        server.stop(0);
        WORKERS.shutdownNow();
    }

    @BeforeEach
    void reset() {
        REQUESTS.clear();
        createReply = "{}";
    }

    // =================================================================================
    // webhook signature
    // =================================================================================

    @Test
    void verifyWebhookAcceptsOnlyTheCorrectSignature() {
        PayosClient client = client("cid", "api-key", CHECKSUM_KEY);
        ObjectNode data = webhookData();
        String signature = hmacHex(CHECKSUM_KEY, canonical(data));

        assertTrue(client.verifyWebhook(webhook(data, signature)));

        // Tampering with any signed field invalidates the signature.
        ObjectNode tampered = data.deepCopy();
        tampered.put("amount", 1);
        assertFalse(client.verifyWebhook(webhook(tampered, signature)));

        String flipped = (signature.startsWith("0") ? "1" : "0") + signature.substring(1);
        assertFalse(client.verifyWebhook(webhook(data, flipped)));
        assertFalse(client.verifyWebhook(webhook(data, "not-hex")));
        assertFalse(client.verifyWebhook(null));

        ObjectNode missingSignature = JSON.createObjectNode();
        missingSignature.set("data", data);
        assertFalse(client.verifyWebhook(missingSignature));

        ObjectNode nonObjectData = JSON.createObjectNode();
        nonObjectData.put("data", "not-an-object");
        nonObjectData.put("signature", signature);
        assertFalse(client.verifyWebhook(nonObjectData));
    }

    @Test
    void verifyWebhookIsIndependentOfTheFieldOrderInTheJsonBody() {
        PayosClient client = client("cid", "api-key", CHECKSUM_KEY);
        ObjectNode data = webhookData();
        String signature = hmacHex(CHECKSUM_KEY, canonical(data));

        // Same pairs, reversed insertion order: the canonical form sorts by key.
        ObjectNode reversed = JSON.createObjectNode();
        List<String> names = new ArrayList<>();
        data.fieldNames().forEachRemaining(names::add);
        java.util.Collections.reverse(names);
        names.forEach(name -> reversed.set(name, data.get(name)));

        assertTrue(client.verifyWebhook(webhook(reversed, signature)));
    }

    @Test
    void verifyWebhookFailsClosedWhenNoChecksumKeyIsConfigured() {
        PayosClient client = client("cid", "api-key", "");
        ObjectNode data = webhookData();

        assertFalse(client.verifyWebhook(webhook(data, "00")));
    }

    // =================================================================================
    // checkout link creation
    // =================================================================================

    @Test
    void createSignsAndSendsTheExpectedPayload() throws Exception {
        createReply = """
                {"code":"00","desc":"success","data":{"checkoutUrl":"https://pay.payos.vn/x",
                 "qrCode":"qr-data","paymentLinkId":"pl-123"}}""";
        PayosClient client = client("client-1", "api-key-1", CHECKSUM_KEY);

        PayosClient.Link link = client.create(1001L, 50_000, "A description that is far longer than 25 chars");

        assertEquals("https://pay.payos.vn/x", link.checkoutUrl());
        assertEquals("qr-data", link.qrCode());
        assertEquals("pl-123", link.paymentLinkId());

        assertEquals(1, REQUESTS.size());
        CapturedRequest request = REQUESTS.get(0);
        assertEquals("/v2/payment-requests", request.uri());
        assertEquals("client-1", request.clientId());
        assertEquals("api-key-1", request.apiKey());
        JsonNode body = JSON.readTree(request.body());
        assertEquals(1001L, body.path("orderCode").asLong());
        assertEquals(50_000, body.path("amount").asInt());
        String description = body.path("description").asText();
        assertEquals(25, description.length());
        assertEquals("A description that is far", description);
        assertEquals("https://student.example/return", body.path("returnUrl").asText());
        assertEquals("https://student.example/cancel", body.path("cancelUrl").asText());
        assertTrue(body.path("expiredAt").asLong() > java.time.Instant.now().getEpochSecond());
        String expected = hmacHex(CHECKSUM_KEY, "amount=50000&cancelUrl=https://student.example/cancel&description="
                + description + "&orderCode=1001&returnUrl=https://student.example/return");
        assertEquals(expected, body.path("signature").asText());
    }

    @Test
    void createFailsWithoutCredentialsAndWhenPayosReturnsNoCheckoutUrl() {
        PayosClient unconfigured = client("", "", "");
        assertThrows(IllegalStateException.class, () -> unconfigured.create(1L, 10_000, "order"));
        assertEquals(0, REQUESTS.size());

        createReply = """
                {"code":"99","desc":"error"}""";
        PayosClient client = client("client-1", "api-key-1", CHECKSUM_KEY);
        assertThrows(IllegalStateException.class, () -> client.create(1L, 10_000, "order"));
    }

    // =================================================================================
    // helpers
    // =================================================================================

    private PayosClient client(String clientId, String apiKey, String checksumKey) {
        return new PayosClient(baseUrl, clientId, apiKey, checksumKey,
                "https://student.example/return", "https://student.example/cancel", JSON);
    }

    private ObjectNode webhookData() {
        ObjectNode data = JSON.createObjectNode();
        data.put("orderCode", 123);
        data.put("amount", 50_000);
        data.put("description", "ORDER 123");
        data.put("accountNumber", "0123456789");
        data.put("reference", "TF-123");
        data.put("transactionDateTime", "2026-10-29 10:00:00");
        data.put("currency", "VND");
        data.put("paymentLinkId", "pl-1");
        data.put("code", "00");
        data.put("desc", "success");
        return data;
    }

    private ObjectNode webhook(ObjectNode data, String signature) {
        ObjectNode webhook = JSON.createObjectNode();
        webhook.put("code", "00");
        webhook.put("desc", "success");
        webhook.put("success", true);
        webhook.set("data", data);
        webhook.put("signature", signature);
        return webhook;
    }

    /** The PayOS canonical form: key=value&key=value, keys sorted alphabetically. */
    private static String canonical(ObjectNode data) {
        List<String> parts = new ArrayList<>();
        data.properties().stream()
                .sorted(java.util.Map.Entry.comparingByKey())
                .forEach(entry -> parts.add(entry.getKey() + "=" + entry.getValue().asText()));
        return String.join("&", parts);
    }

    private static String hmacHex(String key, String message) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(message.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static void handle(HttpExchange exchange) throws IOException {
        String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        REQUESTS.add(new CapturedRequest(exchange.getRequestURI().getPath(),
                exchange.getRequestHeaders().getFirst("x-client-id"),
                exchange.getRequestHeaders().getFirst("x-api-key"), body));
        byte[] bytes = createReply.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(200, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }
}
