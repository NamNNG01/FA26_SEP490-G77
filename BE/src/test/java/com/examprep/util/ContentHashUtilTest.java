package com.examprep.util;

import org.junit.jupiter.api.Test;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class ContentHashUtilTest {

    @Test
    void testSameHashDespiteWhitespaceAndCase() {
        String content1 = "  What is  2+2?   ";
        String content2 = "what  is 2+2?";
        List<String> options = Arrays.asList("4", "3");

        String hash1 = ContentHashUtil.computeHash(content1, options, null);
        String hash2 = ContentHashUtil.computeHash(content2, Arrays.asList("3", "4"), null);

        assertEquals(hash1, hash2, "Hashes should match regardless of whitespace, case, or option order");
    }

    @Test
    void testDifferentHashForDifferentContent() {
        String hash1 = ContentHashUtil.computeHash("Question A", Arrays.asList("1", "2"), null);
        String hash2 = ContentHashUtil.computeHash("Question B", Arrays.asList("1", "2"), null);

        assertNotEquals(hash1, hash2);
    }

    @Test
    void testDuplicateOptionTextCountsPreservedInHash() {
        String content = "Test Question";
        List<String> options1 = Arrays.asList("Apple", "Apple", "Banana");
        List<String> options2 = Arrays.asList("Apple", "Banana");

        String hash1 = ContentHashUtil.computeHash(content, options1);
        String hash2 = ContentHashUtil.computeHash(content, options2);

        assertNotEquals(hash1, hash2, "Hashes must differ when option counts differ even if option values overlap");
    }
}
