package com.examprep.services;

import com.examprep.exceptions.BaseException;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.*;

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

    private static String code(Runnable call) {
        return assertThrows(BaseException.class, call::run).getResponseCode().getCode();
    }
}
