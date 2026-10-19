package com.examprep.util;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.List;
import java.util.stream.Collectors;

public class ContentHashUtil {

    public static String normalizeText(String text) {
        if (text == null) return "";
        return text.trim().toLowerCase().replaceAll("\\s+", " ");
    }

    public static String computeHash(String content, List<String> options, String answerKey) {
        StringBuilder sb = new StringBuilder();
        sb.append("content:").append(normalizeText(content)).append("|");
        if (options != null && !options.isEmpty()) {
            List<String> sortedOptions = options.stream()
                    .map(ContentHashUtil::normalizeText)
                    .sorted()
                    .collect(Collectors.toList());
            sb.append("options:").append(String.join(",", sortedOptions)).append("|");
        }
        if (answerKey != null && !answerKey.trim().isEmpty()) {
            sb.append("answerKey:").append(normalizeText(answerKey)).append("|");
        }

        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashBytes = digest.digest(sb.toString().getBytes(StandardCharsets.UTF_8));
            StringBuilder hexString = new StringBuilder();
            for (byte b : hashBytes) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 algorithm not available", e);
        }
    }
}
