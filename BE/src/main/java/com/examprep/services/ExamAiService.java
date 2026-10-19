package com.examprep.services;

import com.examprep.dto.ExamAiDraftResponse;
import com.examprep.dto.ExamAiRequest;
import com.examprep.security.UserPrincipal;

public interface ExamAiService {
    ExamAiDraftResponse generate(UserPrincipal user, ExamAiRequest request);
    ExamAiDraftResponse generateFromMaterial(UserPrincipal user, ExamAiRequest request, String material, String fileName);
}
