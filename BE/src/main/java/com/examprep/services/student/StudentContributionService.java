package com.examprep.services.student;

import com.examprep.dto.question.QuestionCreateRequest;
import com.examprep.dto.student.ContributionDetailDto;
import com.examprep.dto.student.ContributionItemDto;
import com.examprep.dto.student.TipContributionRequestDto;
import org.springframework.data.domain.Page;

import java.util.Map;

public interface StudentContributionService {
    Map<String, Object> createQuestionContribution(QuestionCreateRequest request, Long userId);
    Map<String, Object> createTipContribution(TipContributionRequestDto request, Long userId);
    Page<ContributionItemDto> listContributions(String type, String status, int page, int size, Long userId);
    ContributionDetailDto getContributionDetail(Long contributionId, Long userId);
    Map<String, Object> resubmitContribution(Long contributionId, Object requestBody, Long userId);
}
