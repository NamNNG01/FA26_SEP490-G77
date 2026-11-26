package com.examprep.services;

import com.examprep.exceptions.BaseException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;

import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class MaterialStorageImageTest {
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0};
    private final MaterialStorage unconfigured = new MaterialStorage("local", "target/x", "", "", "");

    @Test void sniffsTheFormatFromMagicBytes() {
        assertEquals("png", MaterialStorage.imageFormat(PNG));
        assertEquals("jpeg", MaterialStorage.imageFormat(new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 0}));
        assertEquals("gif", MaterialStorage.imageFormat("GIF89a".getBytes(StandardCharsets.US_ASCII)));
        assertEquals("webp", MaterialStorage.imageFormat("RIFF\0\0\0\0WEBPVP8 ".getBytes(StandardCharsets.US_ASCII)));
        assertNull(MaterialStorage.imageFormat("<svg onload=alert(1)>".getBytes(StandardCharsets.UTF_8)));
        assertNull(MaterialStorage.imageFormat("%PDF-1.7".getBytes(StandardCharsets.US_ASCII)));
    }

    @Test void rejectsBadInputBeforeReachingCloudinary() {
        assertEquals("UNSUPPORTED_FILE_TYPE", code(() -> unconfigured.storeImage("x", "<svg/>".getBytes(StandardCharsets.UTF_8), false)));
        assertEquals("FILE_TOO_LARGE", code(() -> unconfigured.storeImage("x", new byte[(int) MaterialStorage.MAX_IMAGE_BYTES + 1], false)));
        assertEquals("BAD_REQUEST", code(() -> unconfigured.storeImage("x", new byte[0], false)));
        assertEquals("STORAGE_ERROR", code(() -> unconfigured.storeImage("x", PNG, false)));
    }

    @Test void uploadsBinaryMultipartAndRetriesTransientFailure() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://api.cloudinary.com");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        MaterialStorage storage = new MaterialStorage("cloudinary", "target/x", "demo", "key", "secret", builder.build());

        server.expect(requestTo("https://api.cloudinary.com/v1_1/demo/image/upload"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.BAD_GATEWAY));

        server.expect(requestTo("https://api.cloudinary.com/v1_1/demo/image/upload"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().string(allOf(
                        containsString("filename=\"upload.png\""),
                        containsString("Content-Type: image/png"),
                        not(containsString("data:image/png;base64"))
                )))
                .andRespond(withSuccess(
                        "{\"secure_url\":\"https://res.cloudinary.com/demo/image/upload/v1/x.png\",\"public_id\":\"x\",\"format\":\"png\",\"width\":1,\"height\":1,\"bytes\":9}",
                        MediaType.APPLICATION_JSON));

        MaterialStorage.StoredImage stored = storage.storeImage("x", PNG, false);
        assertEquals("https://res.cloudinary.com/demo/image/upload/v1/x.png", stored.url());
        server.verify();
    }

    @Test void doesNotRetryClientErrors() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://api.cloudinary.com");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        MaterialStorage storage = new MaterialStorage("cloudinary", "target/x", "demo", "key", "secret", builder.build());

        server.expect(requestTo("https://api.cloudinary.com/v1_1/demo/image/upload"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.BAD_REQUEST));

        assertEquals("STORAGE_ERROR", code(() -> storage.storeImage("x", PNG, false)));
        server.verify();
    }

    private static String code(Runnable call) {
        return assertThrows(BaseException.class, call::run).getResponseCode().getCode();
    }
}
