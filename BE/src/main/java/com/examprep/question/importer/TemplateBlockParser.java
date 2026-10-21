package com.examprep.question.importer;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class TemplateBlockParser {

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RawBlock {
        private int startLine;
        private String questionType;
        private List<String> blockLines;
    }

    public List<RawBlock> parseBlocks(List<String> textLines) {
        List<RawBlock> blocks = new ArrayList<>();
        Pattern typePattern = Pattern.compile("^\\[TYPE:\\s*([A-Za-z_]+)\\]$", Pattern.CASE_INSENSITIVE);

        RawBlock currentBlock = null;
        for (int i = 0; i < textLines.size(); i++) {
            int lineNum = i + 1;
            String line = textLines.get(i);
            if (line == null || line.trim().isEmpty()) {
                continue;
            }
            if (line.startsWith("PART ") || line.startsWith("APEPP —") || line.startsWith("Course /")) {
                // Skip header/part lines
                continue;
            }

            Matcher matcher = typePattern.matcher(line);
            if (matcher.matches()) {
                if (currentBlock != null) {
                    blocks.add(currentBlock);
                }
                String qType = matcher.group(1).toUpperCase();
                currentBlock = RawBlock.builder()
                        .startLine(lineNum)
                        .questionType(qType)
                        .blockLines(new ArrayList<>())
                        .build();
            } else {
                if (currentBlock != null) {
                    currentBlock.getBlockLines().add(line);
                }
            }
        }
        if (currentBlock != null) {
            blocks.add(currentBlock);
        }
        return blocks;
    }
}
