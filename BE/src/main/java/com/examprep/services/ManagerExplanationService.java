package com.examprep.services;

import com.examprep.dto.ResponseCode;
import com.examprep.dto.question.QuestionAiExplanationRequest;
import com.examprep.dto.question.QuestionAiExplanationResponse;
import com.examprep.entities.AiUsageLog;
import com.examprep.entities.ManagerExplanationJob;
import com.examprep.entities.ManagerExplanationJobItem;
import com.examprep.entities.Question;
import com.examprep.entities.User;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.ForbiddenException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.ManagerExplanationJobItemRepository;
import com.examprep.repositories.ManagerExplanationJobRepository;
import com.examprep.repositories.QuestionRepository;
import com.examprep.security.QuestionAccessPolicy;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * AI-04 manager service: validates ownership, reserves monthly AI token quota, queues background
 * explanation jobs, and resolves {@code NONE | PENDING | READY | FAILED} status for question DTOs.
 */
@Service
@RequiredArgsConstructor
public class ManagerExplanationService {

    public static final String STATUS_NONE = "NONE";
    public static final String STATUS_PENDING = "PENDING";
    public static final String STATUS_READY = "READY";
    public static final String STATUS_FAILED = "FAILED";

    private final QuestionRepository questions;
    private final ManagerExplanationJobRepository jobs;
    private final ManagerExplanationJobItemRepository jobItems;
    private final QuestionAccessPolicy accessPolicy;
    private final ManagerExplanationWorker worker;
    private final ManagerAiQuotaService quotaService;

    @Transactional
    public QuestionAiExplanationResponse queueExplanations(QuestionAiExplanationRequest request, User currentUser) {
        if (request == null || request.getQuestionIds() == null || request.getQuestionIds().isEmpty()) {
            throw new BadRequestException("questionIds must contain 1 to 500 question ids");
        }
        Set<Long> uniqueIds = new LinkedHashSet<>(request.getQuestionIds());
        List<Question> found = questions.findActiveByIdsWithHierarchy(uniqueIds);
        if (found.size() != uniqueIds.size()) {
            throw new ResourceNotFoundException("Question not found");
        }
        Map<Long, Question> byId = new HashMap<>(found.size() * 2);
        for (Question q : found) {
            if (!accessPolicy.canModify(currentUser, q)) {
                throw new ForbiddenException("You do not have permission to modify this question");
            }
            byId.put(q.getQuestionId(), q);
        }

        Set<Long> pendingIds = new HashSet<>(jobItems.findPendingQuestionIds(uniqueIds));
        List<Question> toQueue = new ArrayList<>();
        int skippedCount = 0;
        for (Long id : uniqueIds) {
            Question q = byId.get(id);
            boolean isPending = pendingIds.contains(id);
            boolean hasExplanation = q.getAiExplanation() != null && !q.getAiExplanation().isBlank();
            if (isPending || (!request.isOverwrite() && hasExplanation)) {
                skippedCount++;
                continue;
            }
            toQueue.add(q);
        }

        if (toQueue.isEmpty()) {
            return QuestionAiExplanationResponse.builder()
                    .jobId(null)
                    .queuedCount(0)
                    .skippedCount(skippedCount)
                    .estimatedTokens(0L)
                    .remainingTokens(quotaService.snapshot(currentUser.getUserId()).remainingTokens())
                    .build();
        }

        AiUsageLog usageLog = quotaService.reserveForExplanationJob(currentUser.getUserId(), toQueue);

        Instant now = Instant.now();
        ManagerExplanationJob job = jobs.save(ManagerExplanationJob.builder()
                .user(currentUser)
                .overwrite(request.isOverwrite())
                .status(ManagerExplanationWorker.JOB_PENDING)
                .totalCount(toQueue.size())
                .aiUsageLogId(usageLog.getLogId())
                .createdAt(now)
                .updatedAt(now)
                .build());

        List<ManagerExplanationJobItem> items = new ArrayList<>(toQueue.size());
        for (Question q : toQueue) {
            items.add(ManagerExplanationJobItem.builder()
                    .job(job)
                    .question(q)
                    .status(ManagerExplanationWorker.ITEM_PENDING)
                    .updatedAt(now)
                    .build());
        }
        jobItems.saveAll(items);

        Long jobId = job.getJobId();
        dispatchAfterCommit(jobId);

        long remainingAfterReserve = quotaService.snapshot(currentUser.getUserId()).remainingTokens();
        return QuestionAiExplanationResponse.builder()
                .jobId(jobId)
                .queuedCount(toQueue.size())
                .skippedCount(skippedCount)
                .estimatedTokens(Long.valueOf(usageLog.getReservedTokens()))
                .remainingTokens(remainingAfterReserve)
                .build();
    }

    @Transactional(readOnly = true)
    public Map<Long, String> resolveExplanationStatuses(Collection<Question> questionList) {
        if (questionList == null || questionList.isEmpty()) {
            return Map.of();
        }
        List<Long> ids = questionList.stream().map(Question::getQuestionId).toList();
        Set<Long> pendingIds = new HashSet<>(jobItems.findPendingQuestionIds(ids));
        Map<Long, String> latestItemStatuses = new HashMap<>();
        for (Object[] row : jobItems.findLatestItemStatusesByQuestionIds(ids)) {
            if (row != null && row.length >= 2 && row[0] != null && row[1] != null) {
                latestItemStatuses.put(((Number) row[0]).longValue(), String.valueOf(row[1]));
            }
        }
        Map<Long, String> result = new HashMap<>(questionList.size() * 2);
        for (Question q : questionList) {
            Long id = q.getQuestionId();
            if (pendingIds.contains(id)) {
                result.put(id, STATUS_PENDING);
            } else if (q.getAiExplanation() != null && !q.getAiExplanation().isBlank()) {
                result.put(id, STATUS_READY);
            } else if (ManagerExplanationWorker.ITEM_FAILED.equals(latestItemStatuses.get(id))) {
                result.put(id, STATUS_FAILED);
            } else {
                result.put(id, STATUS_NONE);
            }
        }
        return result;
    }

    @Transactional(readOnly = true)
    public Set<Long> findPendingQuestionIds(Collection<Long> questionIds) {
        if (questionIds == null || questionIds.isEmpty()) {
            return Set.of();
        }
        return new HashSet<>(jobItems.findPendingQuestionIds(questionIds));
    }

    private void dispatchAfterCommit(Long jobId) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    worker.dispatch(jobId);
                }
            });
        } else {
            worker.dispatch(jobId);
        }
    }
}
