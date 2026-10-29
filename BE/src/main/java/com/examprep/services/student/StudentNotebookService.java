package com.examprep.services.student;

import com.examprep.dto.student.QuestionReviewItemDto;
import com.examprep.dto.student.ReviewSessionRequestDto;
import com.examprep.dto.student.ReviewSessionResponseDto;
import org.springframework.data.domain.Page;

import java.util.List;
import java.util.Map;

public interface StudentNotebookService {
    Page<QuestionReviewItemDto> listSavedQuestions(String type, String examType, Long categoryId, String search, int page, int size, Long userId);
    Map<String, Object> toggleBookmark(Long questionId, Long userId);
    void deleteSavedQuestion(Long reviewId, Long userId);
    ReviewSessionResponseDto startReviewSession(ReviewSessionRequestDto request, Long userId);
    List<QuestionReviewItemDto> getWeakSpots(int limit, Long userId);
}
