package com.examprep.services;

import com.examprep.dto.*;
import com.examprep.security.UserPrincipal;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

public interface ManagerExamService {
    PageResponse<ExamResponse> list(UserPrincipal user, String search, Long courseId, Long moduleId, String status, String kind, int page, int size);
    ExamResponse detail(UserPrincipal user, Long id);
    ExamResponse create(UserPrincipal user, ExamRequests.Create request);
    ExamResponse update(UserPrincipal user, Long id, ExamRequests.Update request);
    ExamResponse.Published publish(UserPrincipal user, Long id, ExamRequests.Publish request);
    void delete(UserPrincipal user, Long id);
    ExamResponse.QuestionLink addQuestion(UserPrincipal user, Long id, ExamRequests.QuestionLink request);
    ExamResponse.QuestionLink updateQuestionWeight(UserPrincipal user, Long id, Long linkId, ExamRequests.QuestionWeight request);
    void removeQuestion(UserPrincipal user, Long id, Long linkId);
    ExamResponse.GroupLink addGroup(UserPrincipal user, Long id, ExamRequests.GroupLink request);
    void removeGroup(UserPrincipal user, Long id, Long linkId);
    Map<String,Object> rubric(UserPrincipal user, Long questionId, ExamRequests.Rubric request);
    ExamResponse.Imported importQuestions(UserPrincipal user, Long id, String text, boolean dryRun, List<ExamRequests.ImportItem> items);
}
