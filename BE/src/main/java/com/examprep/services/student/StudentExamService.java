package com.examprep.services.student;

import com.examprep.dto.student.*;
import org.springframework.data.domain.Page;

public interface StudentExamService {
    ExamDetailDto getExamDetail(Long examId, Long userId);
    ActiveAttemptDto getActiveAttempt(Long examId, Long userId);
    Page<MyExamDto> listMyExams(int page, int size, Long userId);
}
