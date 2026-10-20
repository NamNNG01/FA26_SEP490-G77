package com.examprep.controllers;

import com.examprep.dto.*;
import com.examprep.exceptions.BadRequestException;
import com.examprep.security.UserPrincipal;
import com.examprep.services.ExamAiService;
import com.examprep.services.MaterialTextReader;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/manager/exam-builder/ai")
@PreAuthorize("hasAnyRole('COURSE_MANAGER', 'ADMIN')")
@RequiredArgsConstructor
public class ExamAiController {
    private final ExamAiService service;
    private final MaterialTextReader materials;
    private final ObjectMapper json;

    @PostMapping("/generate")
    public ResponseEntity<ApiResponse<ExamAiDraftResponse>> generate(@AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody ExamAiRequest request) {
        return ResponseEntity.ok(ApiResponse.success(service.generate(user, request)));
    }

    @PostMapping(value = "/generate-from-material", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<ExamAiDraftResponse>> material(@AuthenticationPrincipal UserPrincipal user,
            @RequestParam MultipartFile file, @RequestParam Long courseId, @RequestParam(required = false) Long moduleId,
            @RequestParam Integer questionCount, @RequestParam String difficultyDistribution,
            @RequestParam String questionTypes, @RequestParam(required = false) String language) {
        try {
            if (file.getSize() > 10 * 1024 * 1024) throw new BadRequestException("Material must not exceed 10 MB.");
            ExamAiRequest request = new ExamAiRequest(courseId, moduleId, null, questionCount,
                    json.readValue(difficultyDistribution, new TypeReference<Map<String, Integer>>() { }),
                    json.readValue(questionTypes, new TypeReference<List<ExamAiRequest.TypeCount>>() { }), null, language, false);
            return ResponseEntity.ok(ApiResponse.success(service.generateFromMaterial(user, request,
                    materials.read(file.getOriginalFilename(), file.getBytes()), file.getOriginalFilename())));
        } catch (JsonProcessingException ex) {
            throw new BadRequestException("difficultyDistribution and questionTypes must contain valid JSON.");
        } catch (IOException ex) {
            throw new BadRequestException("Could not read uploaded material.");
        }
    }
}
