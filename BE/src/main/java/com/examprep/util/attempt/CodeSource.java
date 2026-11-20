package com.examprep.util.attempt;

import com.examprep.dto.ResponseCode;
import com.examprep.exceptions.BaseException;

import java.nio.charset.StandardCharsets;
import java.util.Map;

public final class CodeSource {
    public static final int MAX_BYTES = 100 * 1024;
    public static final String TOO_LARGE = "Code is larger than 100 KB";

    private CodeSource() {}

    public static boolean tooLarge(String source) {
        return source.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES;
    }

    public static void requireAllowedSize(String source) {
        if (source != null && tooLarge(source)) {
            throw sizeRejected(TOO_LARGE);
        }
    }

    public static BaseException sizeRejected(String message) {
        return new BaseException(ResponseCode.BAD_REQUEST, message, Map.of("code", "SOURCE_TOO_LARGE"));
    }
}
