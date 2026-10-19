package com.examprep.services;

import com.examprep.dto.exam.*;
import com.examprep.entities.User;

import java.util.List;

public interface ExamService {
    ExamResponse createRandomExam(ExamRandomRequest request, User currentUser);
    ExamResponse updateExam(Long examId, ExamUpdateRequest request, User currentUser);
    ExamResponse publishExam(Long examId, User currentUser);
    ExamResponse getExamDetail(Long examId, User currentUser, boolean studentView);
    List<ExamResponse> getExamsForCourse(Long courseId, User currentUser);

    ExamResponse addQuestionToExam(Long examId, ExamAddQuestionRequest request, User currentUser);
    ExamResponse removeQuestionFromExam(Long examId, Long examQuestionId, User currentUser);
    ExamResponse reorderExamQuestions(Long examId, ExamReorderRequest request, User currentUser);

    AttemptResponse submitAttempt(AttemptSubmitRequest request, User currentUser);
    void processPendingAiEssays();
    void processRegrades();
    void manualEssayRegrade(Long questionId, User currentUser);
}
