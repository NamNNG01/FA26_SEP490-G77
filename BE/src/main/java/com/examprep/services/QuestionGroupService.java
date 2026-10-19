package com.examprep.services;

import com.examprep.dto.PageResponse;
import com.examprep.dto.QuestionGroupCreateRequest;
import com.examprep.dto.QuestionGroupResponse;
import com.examprep.dto.QuestionGroupUpdateRequest;

public interface QuestionGroupService {

    PageResponse<QuestionGroupResponse> getQuestionGroups(Long currentUserId, String currentUserRole,
                                                          Long courseId, Long moduleId, String search,
                                                          int page, int size);

    QuestionGroupResponse createQuestionGroup(Long currentUserId, String currentUserRole,
                                              QuestionGroupCreateRequest request);

    QuestionGroupResponse updateQuestionGroup(Long currentUserId, String currentUserRole,
                                              Long groupId, QuestionGroupUpdateRequest request);

    void deleteQuestionGroup(Long currentUserId, String currentUserRole, Long groupId);
}
