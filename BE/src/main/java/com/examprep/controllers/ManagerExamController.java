package com.examprep.controllers;

import com.examprep.dto.*;
import com.examprep.exceptions.BadRequestException;
import com.examprep.security.UserPrincipal;
import com.examprep.services.ManagerExamService;
import com.examprep.services.MaterialTextReader;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/manager")
@RequiredArgsConstructor
public class ManagerExamController {
    private final ManagerExamService service;
    private final MaterialTextReader reader;

    @GetMapping("/exams")
    public ResponseEntity<ApiResponse<PageResponse<ExamResponse>>> list(@AuthenticationPrincipal UserPrincipal user,
            @RequestParam(required=false) String search, @RequestParam(required=false) Long courseId,
            @RequestParam(required=false) Long moduleId, @RequestParam(required=false) String status,
            @RequestParam(required=false) String examKind, @RequestParam(defaultValue="0") int page,
            @RequestParam(defaultValue="20") int size) {
        return ResponseEntity.ok(ApiResponse.success(service.list(user,search,courseId,moduleId,status,examKind,page,size)));
    }
    @GetMapping("/exams/{id}")
    public ResponseEntity<ApiResponse<ExamResponse>> detail(@AuthenticationPrincipal UserPrincipal user,@PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(service.detail(user,id)));
    }
    @PostMapping("/exams")
    public ResponseEntity<ApiResponse<ExamResponse>> create(@AuthenticationPrincipal UserPrincipal user,@Valid @RequestBody ExamRequests.Create request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(service.create(user,request),ResponseCode.CREATED.getMessage()));
    }
    @PutMapping("/exams/{id}")
    public ResponseEntity<ApiResponse<ExamResponse>> update(@AuthenticationPrincipal UserPrincipal user,@PathVariable Long id,@Valid @RequestBody ExamRequests.Update request) {
        return ResponseEntity.ok(ApiResponse.success(service.update(user,id,request)));
    }
    @PatchMapping("/exams/{id}/publish")
    public ResponseEntity<ApiResponse<ExamResponse.Published>> publish(@AuthenticationPrincipal UserPrincipal user,@PathVariable Long id,@Valid @RequestBody ExamRequests.Publish request) {
        return ResponseEntity.ok(ApiResponse.success(service.publish(user,id,request)));
    }
    @DeleteMapping("/exams/{id}")
    public ResponseEntity<ApiResponse<Void>> delete(@AuthenticationPrincipal UserPrincipal user,@PathVariable Long id) {
        service.delete(user,id); return ResponseEntity.ok(ApiResponse.success(null,"Exam deleted successfully."));
    }
    @PostMapping("/exams/{id}/questions")
    public ResponseEntity<ApiResponse<ExamResponse.QuestionLink>> addQuestion(@AuthenticationPrincipal UserPrincipal user,@PathVariable Long id,@Valid @RequestBody ExamRequests.QuestionLink request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(service.addQuestion(user,id,request),ResponseCode.CREATED.getMessage()));
    }
    @DeleteMapping("/exams/{id}/questions/{linkId}")
    public ResponseEntity<ApiResponse<Void>> removeQuestion(@AuthenticationPrincipal UserPrincipal user,@PathVariable Long id,@PathVariable Long linkId) {
        service.removeQuestion(user,id,linkId); return ResponseEntity.ok(ApiResponse.success(null,"Question removed from exam."));
    }
    @PostMapping("/exams/{id}/groups")
    public ResponseEntity<ApiResponse<ExamResponse.GroupLink>> addGroup(@AuthenticationPrincipal UserPrincipal user,@PathVariable Long id,@Valid @RequestBody ExamRequests.GroupLink request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(service.addGroup(user,id,request),ResponseCode.CREATED.getMessage()));
    }
    @DeleteMapping("/exams/{id}/groups/{linkId}")
    public ResponseEntity<ApiResponse<Void>> removeGroup(@AuthenticationPrincipal UserPrincipal user,@PathVariable Long id,@PathVariable Long linkId) {
        service.removeGroup(user,id,linkId); return ResponseEntity.ok(ApiResponse.success(null,"Group removed from exam."));
    }
    @PutMapping("/questions/{id}/rubric")
    public ResponseEntity<ApiResponse<Map<String,Object>>> rubric(@AuthenticationPrincipal UserPrincipal user,@PathVariable Long id,@Valid @RequestBody ExamRequests.Rubric request) {
        return ResponseEntity.ok(ApiResponse.success(service.rubric(user,id,request)));
    }
    @PostMapping(value="/exams/{id}/import",consumes="multipart/form-data")
    public ResponseEntity<ApiResponse<ExamResponse.Imported>> importQuestions(@AuthenticationPrincipal UserPrincipal user,@PathVariable Long id,
            @RequestParam MultipartFile file,@RequestParam(required = false) List<BigDecimal> points) {
        // Check access/state before parsing untrusted files.
        ExamResponse exam=service.detail(user,id);
        if (!"DRAFT".equals(exam.status())) throw new com.examprep.exceptions.ResourceConflictException("Unpublish the exam before importing.");
        if (file.getSize()>10*1024*1024) throw new BadRequestException("File must be at most 10MB.");
        try {
            return ResponseEntity.ok(ApiResponse.success(service.importQuestions(user,id,reader.read(file.getOriginalFilename(),file.getBytes()),points),"Questions imported successfully."));
        } catch(IOException e) { throw new BadRequestException("Could not read the uploaded file."); }
    }
}
