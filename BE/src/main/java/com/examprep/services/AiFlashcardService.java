package com.examprep.services;

import com.examprep.dto.AiFlashcardDtos;
import com.examprep.security.UserPrincipal;
import org.springframework.web.multipart.MultipartFile;

/**
 * Group E contract (Deadline 2 API 31–33).
 *
 * <p>API 31 queues one generation job; API 32 polls it; API 33 reports the caller's quota.
 * The worker itself is {@link FlashcardGenerationWorker}.</p>
 */
public interface AiFlashcardService {

    /** API 31: validates the request, reserves AI quota and returns the queued job. */
    AiFlashcardDtos.GenerateAccepted generate(UserPrincipal user, MultipartFile file, String text,
            Integer numberOfCards, String language, String style, String focusTopic, Long courseId);

    /** API 32: poll one generation; only its owner may read it. */
    AiFlashcardDtos.GenerationDetail generation(Long userId, Long generationId);

    /** API 33: current FREE/PLAN quota window of the caller. */
    AiFlashcardDtos.UsageInfo usage(Long userId);
}
