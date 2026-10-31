package com.examprep.services.student;

import com.examprep.dto.ResponseCode;
import com.examprep.dto.attempt.Snapshots;
import com.examprep.dto.student.*;
import com.examprep.entities.*;
import com.examprep.exceptions.BaseException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.*;
import com.examprep.services.AttemptPaperFactory;
import com.examprep.services.contest.ContestRules;
import com.examprep.util.attempt.AttemptShuffler;
import jakarta.persistence.criteria.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

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
    private final AttemptAnswerRepository answerRepository;

    private static final int DRAFT_SEQ_EMPTY = -1;
    private static final String GRADING_AUTO = "AUTO";

    private String determineStatus(Contest c, Instant now) {
        if ("CANCELLED".equals(c.getStatus())) {
            return "CANCELLED";
        }
        if ("REWARDED".equals(c.getStatus())) {
            return "ENDED";
        }
        if (c.getStartTime() != null && now.isBefore(c.getStartTime())) {
            return "UPCOMING";
        }
        if (c.getEndTime() != null && now.isAfter(c.getEndTime())) {
            return "ENDED";
        }
        return "ONGOING";
    }

    private Predicate statusPredicate(String status, Root<Contest> root, CriteriaBuilder cb, Instant now) {
        Path<String> stored = root.get("status");
        Path<Instant> start = root.get("startTime");
        Path<Instant> end = root.get("endTime");
        return switch (status) {
            case "UPCOMING" -> cb.and(cb.equal(stored, "PUBLISHED"), cb.greaterThan(start, now));
            case "ONGOING" -> cb.and(cb.equal(stored, "PUBLISHED"), cb.lessThanOrEqualTo(start, now), cb.or(cb.isNull(end), cb.greaterThan(end, now)));
            case "ENDED" -> cb.or(
                    cb.and(cb.equal(stored, "PUBLISHED"), cb.isNotNull(end), cb.lessThan(end, now)),
                    cb.equal(stored, "REWARDED")
            );
            case "CANCELLED" -> cb.equal(stored, "CANCELLED");
            default -> cb.conjunction();
        };
    }

    @Override
    @Transactional(readOnly = true)
    public Page<ContestItemDto> listContests(String statusFilter, Long courseId, Instant from, Instant to, int page, int size, Long userId) {
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "startTime"));
        Instant now = Instant.now();

        List<String> statuses = new ArrayList<>();
        if (statusFilter != null && !statusFilter.isBlank()) {
            for (String s : statusFilter.split(",")) {
                statuses.add(s.strip().toUpperCase(Locale.ROOT));
            }
        }

        Specification<Contest> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.isNull(root.get("deletedAt")));
            predicates.add(cb.notEqual(root.get("status"), "DRAFT"));
            if (courseId != null) {
                predicates.add(cb.equal(root.get("course").get("courseId"), courseId));
            }
            if (from != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("startTime"), from));
            }
            if (to != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("startTime"), to));
            }
            if (!statuses.isEmpty()) {
                List<Predicate> statusPredicates = new ArrayList<>();
                for (String s : statuses) {
                    statusPredicates.add(statusPredicate(s, root, cb, now));
                }
                predicates.add(cb.or(statusPredicates.toArray(new Predicate[0])));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };

        Page<Contest> pageContests = contestRepository.findAll(spec, pageable);
        List<Long> contestIds = pageContests.getContent().stream().map(Contest::getContestId).toList();

        Map<Long, Long> registeredCounts = new HashMap<>();
        Map<Long, Boolean> registeredUsers = new HashMap<>();
        List<ContestReward> allRewards = new ArrayList<>();

        if (!contestIds.isEmpty()) {
            participantRepository.countByContests(contestIds).forEach(row -> registeredCounts.put((Long) row[0], ((Number) row[1]).longValue()));
            if (userId != null) {
                participantRepository.findByContest_ContestIdIn(contestIds).stream()
                        .filter(p -> p.getUser().getUserId().equals(userId))
                        .forEach(p -> registeredUsers.put(p.getContest().getContestId(), true));
            }
            allRewards = rewardRepository.findByContest_ContestIdIn(contestIds);
        }

        Map<Long, List<ContestItemDto.RewardItem>> rewardMap = allRewards.stream()
                .collect(Collectors.groupingBy(
                        r -> r.getContest().getContestId(),
                        Collectors.mapping(r -> new ContestItemDto.RewardItem(
                                r.getRankPosition(),
                                r.getDiscount() != null ? r.getDiscount().getCode() : r.getName(),
                                r.getDiscount() != null ? r.getDiscount().getDiscountType() : r.getRewardType(),
                                ContestRules.value(r.getDiscount())
                        ), Collectors.toList())
                ));

        return pageContests.map(c -> {
            String status = determineStatus(c, now);
            long registeredCount = registeredCounts.getOrDefault(c.getContestId(), 0L);
            boolean isRegistered = registeredUsers.getOrDefault(c.getContestId(), false);
            int qCount = c.getExam() != null ? examQuestionRepository.findByExamExamIdOrderByOrderIndexAscExamQuestionIdAsc(c.getExam().getExamId()).size() : 0;

            ContestItemDto.CourseRef courseRef = c.getCourse() != null ? new ContestItemDto.CourseRef(c.getCourse().getCourseId(), c.getCourse().getTitle()) : null;
            List<ContestItemDto.RewardItem> rewards = rewardMap.getOrDefault(c.getContestId(), List.of());

            return ContestItemDto.builder()
                    .contestId(c.getContestId())
                    .title(c.getTitle())
                    .description(c.getDescription())
                    .bannerUrl(c.getBannerUrl())
                    .startTime(c.getStartTime())
                    .endTime(c.getEndTime())
                    .durationMinutes(c.getDurationMinutes())
                    .questionCount(qCount)
                    .maxParticipants(c.getMaxParticipants())
                    .registeredCount(registeredCount)
                    .status(status)
                    .isRegistered(isRegistered)
                    .course(courseRef)
                    .rewards(rewards)
                    .build();
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

        // Check if student has an active IN_PROGRESS attempt for this exam/contest
        List<ExamAttempt> activeAttempts = examAttemptRepository.findByUser_UserIdAndExam_ExamIdAndStatusAndMode(
                userId, c.getExam().getExamId(), "IN_PROGRESS", "CONTEST");
        if (!activeAttempts.isEmpty()) {
            ExamAttempt att = activeAttempts.get(0);
            List<AttemptAnswer> rows = answerRepository.findByAttemptIdOrdered(att.getAttemptId());
            List<Question> questions = rows.isEmpty()
                    ? freezePaper(att, c.getExam())
                    : rows.stream().map(AttemptAnswer::getQuestion).toList();
            return new ContestStartResponseDto(att.getAttemptId(), c.getExam().getExamId(), c.getDurationMinutes(), att.getDeadlineAt(), questionDtos(questions));
        }

        ContestParticipant participant = participantRepository.findByContest_ContestIdAndUser_UserId(contestId, userId)
                .orElseGet(() -> {
                    User user = userRepository.findById(userId).orElseThrow();
                    return participantRepository.save(ContestParticipant.builder().contest(c).user(user).joinedAt(Instant.now()).build());
                });

        Instant durationDeadline = now.plusSeconds((long) c.getDurationMinutes() * 60);
        Instant deadlineAt = (c.getEndTime() != null && durationDeadline.isAfter(c.getEndTime())) ? c.getEndTime() : durationDeadline;

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
        examAttemptRepository.flush();
        List<Question> questions = freezePaper(attempt, c.getExam());

        // Only assign participant.attemptId if currently null (first official attempt)
        if (participant.getAttemptId() == null) {
            participant.setAttemptId(attempt.getAttemptId());
            participantRepository.save(participant);
        }

        return new ContestStartResponseDto(attempt.getAttemptId(), c.getExam().getExamId(), c.getDurationMinutes(), deadlineAt, questionDtos(questions));
    }

    private List<Question> freezePaper(ExamAttempt attempt, Exam exam) {
        long seed = AttemptShuffler.newSeed();
        AttemptShuffler shuffler = new AttemptShuffler(seed);
        AttemptPaperFactory.Paper paper = attemptPaperFactory.resolve(exam, shuffler, seed);
        List<Question> questions = paper.items().stream().map(AttemptPaperFactory.Item::question).toList();
        Map<Long, List<AnswerOption>> optionsMap = attemptPaperFactory.optionsOf(questions);

        attempt.setExamSnapshot(attemptPaperFactory.write(new Snapshots.ExamSnapshot(
                exam.getExamId(), exam.getTitle(), exam.getMaxScore(), exam.getDurationMinutes(), seed, paper.items().size())));
        examAttemptRepository.save(attempt);

        List<AttemptAnswer> rows = new ArrayList<>();
        int order = 1;
        for (AttemptPaperFactory.Item item : paper.items()) {
            Question question = item.question();
            List<AnswerOption> questionOptions = optionsMap.getOrDefault(question.getQuestionId(), List.of());
            Snapshots.KeySnapshot key = attemptPaperFactory.key(question, questionOptions);
            Snapshots.DisplayQuestion display = attemptPaperFactory.display(question, key, questionOptions, order++, shuffler);
            rows.add(AttemptAnswer.builder()
                    .attempt(attempt)
                    .question(question)
                    .displaySnapshot(attemptPaperFactory.write(display))
                    .keySnapshot(attemptPaperFactory.write(key))
                    .draftSeq(DRAFT_SEQ_EMPTY)
                    .weightSnapshot(item.weight())
                    .questionVersion(question.getScoringVersion() == null ? 1 : question.getScoringVersion())
                    .gradingStatus(GRADING_AUTO)
                    .build());
        }
        answerRepository.saveAll(rows);
        return questions;
    }

    private List<ContestStartResponseDto.QuestionDto> questionDtos(List<Question> questions) {
        Map<Long, List<AnswerOption>> optionsMap = attemptPaperFactory.optionsOf(questions);
        List<ContestStartResponseDto.QuestionDto> qDtos = new ArrayList<>();
        int idx = 1;
        for (Question q : questions) {
            List<AnswerOption> opts = optionsMap.getOrDefault(q.getQuestionId(), List.of());
            List<ContestStartResponseDto.OptionDto> optDtos = opts.stream().map(o -> new ContestStartResponseDto.OptionDto(o.getOptionId(), o.getOptionText())).toList();
            qDtos.add(new ContestStartResponseDto.QuestionDto(q.getQuestionId(), idx++, q.getQuestionType(), q.getContent(), optDtos));
        }
        return qDtos;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> getLeaderboard(Long contestId, Long userId) {
        Contest c = contestRepository.findById(contestId)
                .orElseThrow(() -> new ResourceNotFoundException("Contest not found"));
        Instant now = Instant.now();

        if (c.getEndTime() != null && now.isBefore(c.getEndTime())) {
            Map<String, Object> res = new HashMap<>();
            res.put("generatedAt", Instant.now());
            res.put("rows", List.of());
            res.put("message", "Bảng xếp hạng sẽ mở sau khi kết thúc");
            return res;
        }

        List<ContestParticipant> participants = participantRepository.findByContest_ContestIdOrderByScoreDescFinishedAtAsc(contestId);
        List<ContestReward> rewards = rewardRepository.findByContest_ContestId(contestId);
        Map<Integer, ContestReward> rewardByRank = rewards.stream()
                .collect(Collectors.toMap(ContestReward::getRankPosition, r -> r, (r1, r2) -> r1));

        List<Map<String, Object>> rows = new ArrayList<>();
        int rank = 1;
        boolean userIncluded = false;

        for (ContestParticipant p : participants) {
            boolean isCurrentUser = userId != null && p.getUser().getUserId().equals(userId);
            if (isCurrentUser) {
                userIncluded = true;
            }
            int actualRank = p.getRank() != null ? p.getRank() : rank;
            if (rank <= 10 || isCurrentUser) {
                Map<String, Object> row = new HashMap<>();
                row.put("rank", actualRank);
                row.put("userId", p.getUser().getUserId());
                row.put("studentName", p.getUser().getFullName());
                row.put("avatarUrl", p.getUser().getAvatarUrl() != null ? p.getUser().getAvatarUrl() : "");
                row.put("score", p.getScore() != null ? p.getScore() : BigDecimal.ZERO);
                row.put("completedAt", p.getFinishedAt() != null ? p.getFinishedAt() : Instant.now());
                row.put("isCurrentUser", isCurrentUser);

                ContestReward r = rewardByRank.get(actualRank);
                if (r != null) {
                    Map<String, Object> rewardMap = new HashMap<>();
                    rewardMap.put("rankPosition", r.getRankPosition());
                    rewardMap.put("discountCode", r.getDiscount() != null ? r.getDiscount().getCode() : (r.getName() != null ? r.getName() : ""));
                    rewardMap.put("discountType", r.getDiscount() != null ? r.getDiscount().getDiscountType() : r.getRewardType());
                    rewardMap.put("value", ContestRules.value(r.getDiscount()));
                    row.put("reward", rewardMap);
                } else {
                    row.put("reward", null);
                }
                rows.add(row);
            }
            rank++;
        }

        Map<String, Object> result = new HashMap<>();
        result.put("generatedAt", Instant.now());
        result.put("rows", rows);
        return result;
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
        List<ContestResultDto.RewardItemDto> rewardDtos = new ArrayList<>();

        if (p.getRank() != null) {
            for (ContestReward r : rewards) {
                if (Objects.equals(r.getRankPosition(), p.getRank())) {
                    boolean isRewarded = "REWARDED".equals(c.getStatus());
                    boolean granted = p.getRewardGrantedAt() != null;
                    boolean claimed = Boolean.TRUE.equals(r.getClaimed()) || Boolean.TRUE.equals(p.getRewardClaimed());
                    boolean claimable = isRewarded && granted && !claimed;

                    String valText = "";
                    if (r.getDiscount() != null) {
                        BigDecimal v = ContestRules.value(r.getDiscount());
                        valText = (v != null ? v.toPlainString() : "") + ("PERCENT".equals(r.getDiscount().getDiscountType()) ? "%" : "đ");
                    } else if (r.getName() != null) {
                        valText = r.getName();
                    }

                    rewardDtos.add(new ContestResultDto.RewardItemDto(
                            r.getRewardId(),
                            r.getRewardType(),
                            valText,
                            r.getName(),
                            claimed,
                            r.getRankPosition(),
                            claimable
                    ));
                }
            }
        }

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
    public Page<ContestHistoryItemDto> listContestHistory(Long courseId, Instant from, Instant to, int page, int size, Long userId) {
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "joinedAt"));
        Instant now = Instant.now();

        Specification<ContestParticipant> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("user").get("userId"), userId));
            Join<ContestParticipant, Contest> contestJoin = root.join("contest", JoinType.INNER);
            predicates.add(cb.isNull(contestJoin.get("deletedAt")));
            if (courseId != null) {
                predicates.add(cb.equal(contestJoin.get("course").get("courseId"), courseId));
            }
            if (from != null) {
                predicates.add(cb.greaterThanOrEqualTo(contestJoin.get("startTime"), from));
            }
            if (to != null) {
                predicates.add(cb.lessThanOrEqualTo(contestJoin.get("startTime"), to));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };

        Page<ContestParticipant> cpPage = participantRepository.findAll(spec, pageable);

        return cpPage.map(cp -> {
            Contest c = cp.getContest();
            ContestHistoryItemDto.CourseRef courseRef = c.getCourse() != null ? new ContestHistoryItemDto.CourseRef(c.getCourse().getCourseId(), c.getCourse().getTitle()) : null;
            return new ContestHistoryItemDto(
                    c.getContestId(),
                    c.getTitle(),
                    cp.getJoinedAt(),
                    cp.getScore(),
                    cp.getRank(),
                    determineStatus(c, now),
                    courseRef,
                    c.getStartTime()
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

        ContestParticipant p = participantRepository.findByContest_ContestIdAndUser_UserId(contestId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Participation not found"));

        if (!"REWARDED".equals(c.getStatus()) || p.getRewardGrantedAt() == null) {
            throw new BaseException(ResponseCode.CONFLICT, "REWARD_NOT_GRANTED", "Reward not granted yet");
        }

        ContestReward reward = rewardRepository.findByRewardIdAndContest_ContestId(rewardId, contestId)
                .orElseThrow(() -> new ResourceNotFoundException("Reward not found"));

        if (p.getRank() == null || !Objects.equals(reward.getRankPosition(), p.getRank())) {
            throw new BaseException(ResponseCode.FORBIDDEN, "Not your reward / rank mismatch");
        }

        if (Boolean.TRUE.equals(reward.getClaimed()) || Boolean.TRUE.equals(p.getRewardClaimed())) {
            return new ClaimRewardResponseDto(
                    reward.getRewardId(),
                    reward.getRewardType(),
                    reward.getName(),
                    true,
                    reward.getClaimedAt() != null ? reward.getClaimedAt() : now
            );
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        reward.setClaimed(true);
        reward.setClaimedAt(now);
        reward.setClaimedBy(user);
        rewardRepository.save(reward);

        p.setRewardClaimed(true);
        participantRepository.save(p);

        return new ClaimRewardResponseDto(
                reward.getRewardId(),
                reward.getRewardType(),
                reward.getName(),
                true,
                now
        );
    }
}
