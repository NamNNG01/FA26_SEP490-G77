package com.examprep.question.importer;

import org.springframework.web.multipart.MultipartFile;
import java.util.List;

public interface DocumentTextExtractor {
    List<String> extractText(MultipartFile file) throws Exception;
}
