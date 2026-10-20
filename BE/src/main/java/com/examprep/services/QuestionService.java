package com.examprep.services;

import com.examprep.dto.question.*;
import com.examprep.entities.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

public interface QuestionService {
    Page<QuestionListItemDto> getQuestions(Long courseId, List<Long> courseIds, Long moduleId, Long groupId, String questionType,
                                          String difficulty, String status, String approvalStatus, String creatorRole,
                                          String source, Long createdBy, String skillTag, String search,
                                          Pageable pageable, User currentUser);

    QuestionDetailDto createQuestion(QuestionCreateRequest request, User currentUser);

    List<QuestionDetailDto> createQuestionsBatch(Long courseId, Long moduleId, List<QuestionCreateRequest> requests, User currentUser);

    QuestionDetailDto getQuestionById(Long id, User currentUser);

    QuestionDetailDto updateQuestion(Long id, QuestionUpdateRequest request, User currentUser);

    void deleteQuestion(Long id, User currentUser);

    QuestionDetailDto duplicateQuestion(Long id, User currentUser);

    QuestionDetailDto updateQuestionStatus(Long id, QuestionStatusRequest request, User currentUser);

    AiGenerateResponse generateAiQuestions(AiGenerateRequest request, User currentUser);

    List<QuestionDetailDto> saveAiQuestions(AiSaveRequest request, User currentUser);

    byte[] generateExcelTemplate(Long courseId, User currentUser);

    QuestionImportResult importExcel(Long courseId, MultipartFile file, boolean dryRun, User currentUser);

    byte[] exportExcel(Long courseId, String questionType, String status, String difficulty, User currentUser);
}
