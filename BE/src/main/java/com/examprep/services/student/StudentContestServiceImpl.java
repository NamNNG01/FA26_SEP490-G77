package com.examprep.services.student;

import com.examprep.dto.ResponseCode;
import com.examprep.dto.student.*;
import com.examprep.entities.*;
import com.examprep.exceptions.BaseException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.*;
import com.examprep.services.AttemptPaperFactory;
import com.examprep.util.attempt.AttemptShuffler;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;

@Service
@RequiredArgsConstructor
@Transactional
public class StudentContestServiceImpl implements StudentContestService {

    private final ContestRepository contestRepository;
    private final ContestParticipantRepository participantRepository;
    private final ContestRewardRepository rewardRepository;
    private final UserRepository userRepository;
    private final ExamAttemptRepository examAttemptRepository;
    private final ExamQuestionRepository examQuestionRepository;
    private final AttemptPaperFactory attemptPaperFactory;
    private final AttemptShuffler attemptShuffler;

    private String determineStatus(Contest c, Instant now) {
        if ("CANCELLED".equals(c.getStatus())) {
            return "CANCELLED";
        }
        if (c.getStartTime() != null && now.isBefore(c.getStartTime())) {
            return "UPCOMING";
        }
        if (c.getEndTime() != null && now.isAfter(c.getEndTime())) {
            return "ENDED";
        }
        return "ONGOING";
    }

    @Override
    @Transactional(readOnly = true)
    public Page<ContestItemDto> listContests(String statusFilter, int page, int size, Long userId) {
        Pageable pageable = PageRequest.of(page, size);
        Page<Contest> pageContests = contestRepository.findAll(pageable);
        Instant now = Instant.now();

        return pageContests.map(c -> {
            String status = determineStatus(c, now);
            long registeredCount = participantRepository.countByContest_ContestId(c.getContestId());
            boolean isRegistered = userId != null && participantRepository.existsByContest_ContestIdAndUser_UserId(c.getContestId(), userId);
            int qCount = c.getExam() != null ? examQuestionRepository.findByExamExamIdOrderByOrderIndexAscExamQuestionIdAsc(c.getExam().getExamId()).size() : 0;

            return new ContestItemDto(
                    c.getContestId(),
                    c.getTitle(),
                    c.getDescription(),
                    c.getBannerUrl(),
                    c.getStartTime(),
                    c.getEndTime(),
                    c.getDurationMinutes(),
                    qCount,
                    c.getMaxParticipants(),
                    registeredCount,
                    status,
                    isRegistered
            );
        });
    }

    @Override
    public Map<String, Object> registerContest(Long contestId, Long userId) {
        Contest c = contestRepository.findById(contestId)
                .orElseThrow(() -> new ResourceNotFoundException("Contest not found"));
        Instant now = Instant.now();

        if (c.getStartTime() != null && !now.isBefore(c.getStartTime())) {
            throw new BaseException(ResponseCode.CONFLICT, "Contest already started");
        }
        if (participantRepository.existsByContest_ContestIdAndUser_UserId(contestId, userId)) {
            throw new BaseException(ResponseCode.CONFLICT, "Already registered");
        }
        if (c.getMaxParticipants() != null) {
            long currentCount = participantRepository.countByContest_ContestId(contestId);
            if (currentCount >= c.getMaxParticipants()) {
                throw new BaseException(ResponseCode.CONFLICT, "Contest full");
            }
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        ContestParticipant participant = ContestParticipant.builder()
                .contest(c)
                .user(user)
                .rewardClaimed(false)
                .joinedAt(Instant.now())
                .build();
        participantRepository.save(participant);

        long registeredCount = participantRepository.countByContest_ContestId(contestId);
        return Map.of("contestId", contestId, "registeredCount", registeredCount);
    }

    @Override
    public ContestStartResponseDto startContest(Long contestId, Long userId) {
        Contest c = contestRepository.findById(contestId)
                .orElseThrow(() -> new ResourceNotFoundException("Contest not found"));
        Instant now = Instant.now();

        if (c.getStartTime() != null && now.isBefore(c.getStartTime())) {
            throw new BaseException(ResponseCode.FORBIDDEN, "Contest not started");
        }
        if (c.getEndTime() != null && now.isAfter(c.getEndTime())) {
            throw new BaseException(ResponseCode.FORBIDDEN, "Contest ended");
        }

        ContestParticipant participant = participantRepository.findByContest_ContestIdAndUser_UserId(contestId, userId)
                .orElseGet(() -> {
                    User user = userRepository.findById(userId).orElseThrow();
                    return participantRepository.save(ContestParticipant.builder().contest(c).user(user).joinedAt(Instant.now()).build());
                });

        if (participant.getAttemptId() != null) {
            Optional<ExamAttempt> existingAtt = examAttemptRepository.findById(participant.getAttemptId());
            if (existingAtt.isPresent() && "IN_PROGRESS".equals(existingAtt.get().getStatus())) {
                ExamAttempt att = existingAtt.get();
                List<Question> questions = attemptPaperFactory.resolve(c.getExam(), attemptShuffler, 123L).items().stream().map(AttemptPaperFactory.Item::question).toList();
                Map<Long, List<AnswerOption>> optionsMap = attemptPaperFactory.optionsOf(questions);
                List<ContestStartResponseDto.QuestionDto> qDtos = new ArrayList<>();
                int idx = 1;
                for (Question q : questions) {
                    List<AnswerOption> opts = optionsMap.getOrDefault(q.getQuestionId(), List.of());
                    List<ContestStartResponseDto.OptionDto> optDtos = opts.stream().map(o -> new ContestStartResponseDto.OptionDto(o.getOptionId(), o.getOptionText())).toList();
                    qDtos.add(new ContestStartResponseDto.QuestionDto(q.getQuestionId(), idx++, q.getQuestionType(), q.getContent(), optDtos));
                }
                return new ContestStartResponseDto(att.getAttemptId(), c.getExam().getExamId(), c.getDurationMinutes(), att.getDeadlineAt(), qDtos);
            }
        }

        Instant durationDeadline = now.plusSeconds((long) c.getDurationMinutes() * 60);
        Instant deadlineAt = (c.getEndTime() != null && durationDeadline.isAfter(c.getEndTime())) ? c.getEndTime() : durationDeadline;

        AttemptPaperFactory.Paper paper = attemptPaperFactory.resolve(c.getExam(), attemptShuffler, System.currentTimeMillis());
        List<Question> questions = paper.items().stream().map(AttemptPaperFactory.Item::question).toList();
        Map<Long, List<AnswerOption>> optionsMap = attemptPaperFactory.optionsOf(questions);

        User user = userRepository.findById(userId).orElseThrow();
        ExamAttempt attempt = ExamAttempt.builder()
                .user(user)
                .exam(c.getExam())
                .mode("CONTEST")
                .status("IN_PROGRESS")
                .startTime(now)
                .deadlineAt(deadlineAt)
                .autoSubmitted(false)
                .build();
        examAttemptRepository.save(attempt);

        participant.setAttemptId(attempt.getAttemptId());
        participantRepository.save(participant);

        List<ContestStartResponseDto.QuestionDto> qDtos = new ArrayList<>();
        int idx = 1;
        for (Question q : questions) {
            List<AnswerOption> opts = optionsMap.getOrDefault(q.getQuestionId(), List.of());
            List<ContestStartResponseDto.OptionDto> optDtos = opts.stream().map(o -> new ContestStartResponseDto.OptionDto(o.getOptionId(), o.getOptionText())).toList();
            qDtos.add(new ContestStartResponseDto.QuestionDto(q.getQuestionId(), idx++, q.getQuestionType(), q.getContent(), optDtos));
        }

        return new ContestStartResponseDto(attempt.getAttemptId(), c.getExam().getExamId(), c.getDurationMinutes(), deadlineAt, qDtos);
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> getLeaderboard(Long contestId, Long userId) {
        Contest c = contestRepository.findById(contestId)
                .orElseThrow(() -> new ResourceNotFoundException("Contest not found"));
        Instant now = Instant.now();

        if (c.getEndTime() != null && now.isBefore(c.getEndTime())) {
            return Map.of(
                    "generatedAt", Instant.now(),
                    "rows", List.of(),
                    "message", "Bảng xếp hạng sẽ mở sau khi kết thúc"
            );
        }

        List<ContestParticipant> participants = participantRepository.findByContest_ContestIdOrderByScoreDescFinishedAtAsc(contestId);
        List<Map<String, Object>> rows = new ArrayList<>();
        int rank = 1;
        boolean userIncluded = false;

        for (ContestParticipant p : participants) {
            boolean isCurrentUser = p.getUser().getUserId().equals(userId);
            if (isCurrentUser) {
                userIncluded = true;
            }
            if (rank <= 10 || isCurrentUser) {
                rows.add(Map.of(
                        "rank", p.getRank() != null ? p.getRank() : rank,
                        "userId", p.getUser().getUserId(),
                        "studentName", p.getUser().getFullName(),
                        "score", p.getScore() != null ? p.getScore() : BigDecimal.ZERO,
                        "completedAt", p.getFinishedAt() != null ? p.getFinishedAt() : Instant.now(),
                        "isCurrentUser", isCurrentUser
                ));
            }
            rank++;
        }

        return Map.of(
                "generatedAt", Instant.now(),
                "rows", rows
        );
    }

    @Override
    @Transactional(readOnly = true)
    public ContestResultDto getContestResult(Long contestId, Long userId) {
        Contest c = contestRepository.findById(contestId)
                .orElseThrow(() -> new ResourceNotFoundException("Contest not found"));
        Instant now = Instant.now();

        if (c.getEndTime() != null && now.isBefore(c.getEndTime())) {
            throw new BaseException(ResponseCode.CONFLICT, "Contest not ended");
        }

        ContestParticipant p = participantRepository.findByContest_ContestIdAndUser_UserId(contestId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Participation not found"));

        long totalParticipants = participantRepository.countByContest_ContestId(contestId);
        List<ContestReward> rewards = rewardRepository.findByContest_ContestId(contestId);
        List<ContestResultDto.RewardItemDto> rewardDtos = rewards.stream()
                .map(r -> new ContestResultDto.RewardItemDto(
                        r.getRewardId(),
                        r.getRewardType(),
                        r.getName() != null ? r.getName() : (r.getDiscount() != null ? r.getDiscount().getCode() : ""),
                        r.getName(),
                        Boolean.TRUE.equals(r.getClaimed())
                ))
                .toList();

        return new ContestResultDto(
                p.getRank(),
                p.getScore(),
                totalParticipants,
                p.getCertificateUrl(),
                rewardDtos
        );
    }

    @Override
    @Transactional(readOnly = true)
    public Page<ContestHistoryItemDto> listContestHistory(int page, int size, Long userId) {
        Pageable pageable = PageRequest.of(page, size);
        Page<ContestParticipant> cpPage = participantRepository.findByUser_UserIdOrderByJoinedAtDesc(userId, pageable);
        Instant now = Instant.now();

        return cpPage.map(cp -> {
            Contest c = cp.getContest();
            return new ContestHistoryItemDto(
                    c.getContestId(),
                    c.getTitle(),
                    cp.getJoinedAt(),
                    cp.getScore(),
                    cp.getRank(),
                    determineStatus(c, now)
            );
        });
    }

    @Override
    public ClaimRewardResponseDto claimReward(Long contestId, Long rewardId, Long userId) {
        Contest c = contestRepository.findById(contestId)
                .orElseThrow(() -> new ResourceNotFoundException("Contest not found"));
        Instant now = Instant.now();

        if (c.getEndTime() != null && now.isBefore(c.getEndTime())) {
            throw new BaseException(ResponseCode.CONFLICT, "Contest not ended");
        }

        ContestReward reward = rewardRepository.findByRewardIdAndContest_ContestId(rewardId, contestId)
                .orElseThrow(() -> new ResourceNotFoundException("Reward not found"));

        if (Boolean.TRUE.equals(reward.getClaimed())) {
            return new ClaimRewardResponseDto(
                    reward.getRewardId(),
                    reward.getRewardType(),
                    reward.getName(),
                    true,
                    reward.getClaimedAt()
            );
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        reward.setClaimed(true);
        reward.setClaimedAt(Instant.now());
        reward.setClaimedBy(user);
        rewardRepository.save(reward);

        return new ClaimRewardResponseDto(
                reward.getRewardId(),
                reward.getRewardType(),
                reward.getName(),
                true,
                reward.getClaimedAt()
        );
    }
}
