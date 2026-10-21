package com.examprep.dto.question;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ImportPreviewResponse {
    private String fileName;
    private String fileType; // "PDF" | "DOCX"
    private int totalBlocks;
    private int totalValid;
    private int totalErrors;
    private List<ImportBlockResult> blocks;
}
