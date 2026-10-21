package com.examprep.services;

import com.examprep.dto.question.ImportPreviewResponse;
import com.examprep.entities.User;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;

public interface QuestionImportService {
    ImportPreviewResponse previewImport(MultipartFile file, Long courseId, Long moduleId, String difficulty, User user) throws Exception;
    ResponseEntity<Resource> downloadTemplate(String format) throws Exception;
}
