package com.examprep.services.contest;

import com.examprep.dto.ContestDtos.*;
import com.examprep.dto.PageResponse;
import com.examprep.dto.ResponseCode;
import com.examprep.entities.*;
import com.examprep.repositories.*;
import com.examprep.security.UserPrincipal;
import jakarta.persistence.criteria.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

import static com.examprep.services.contest.ContestRules.*;

/**
 * Course manager contest APIs 1-8, 11, 12 (Deadline 2 section 3). Scope: the course's manager or an assigned
 * co-manager (ADMIN sees everything). A contest outside the scope is 404, a courseId outside it 403.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class ManagerContestService {
    private static final int MAX_REWARDS = 50;
    private static final Map<String, String> SORTS = Map.of("startTime", "startTime", "endTime", "endTime", "title", "title", "createdAt", "createdAt");
    private static final Set<String> RUBRIC_TYPES = Set.of("ESSAY", "DIAGRAM");

    private final ContestRepository contests;
    private final ContestRewardRepository rewards;
    private final ContestParticipantRepository participants;
    private final DiscountRepository discounts;
    private final ExamRepository exams;
    private final CourseRepository courses;
    private final CourseManagerRepository assignments;
    private final UserRepository users;
    private final NotificationRepository notifications;
    private final UserNotificationRepository userNotifications;
    private final ContestRules rules;

    /** A validated API 3/4 body. ranks: rankPosition -> discount, ordered. */
    record Plan(Exam exam, String title, String description, Instant start, Instant end, SortedMap<Integer, Discount> ranks) { }

    // ------------------------------------------------------------------ API 1

    @Transactional(readOnly = true)
    public PageResponse<ListItem> list(UserPrincipal user, String keyword, String status, Long courseId, Instant from, Instant to,
                                       int page, int size, String sort) {
        checkPage(page, size);
        if (courseId != null) managedCourse(user, courseId);
        List<String> statuses = new ArrayList<>();
        if (status != null && !status.isBlank()) {
            for (String s : status.split(",")) {
                String value = s.strip().toUpperCase(Locale.ROOT);
                if (!DERIVED.contains(value)) throw invalid("status", "status must be one of " + DERIVED);
                statuses.add(value);
            }
        }
        Instant now = Instant.now();
        Specification<Contest> spec = (root, query, cb) -> {
            List<Predicate> where = new ArrayList<>();
            where.add(cb.isNull(root.get("deletedAt")));
            if (!admin(user)) where.add(managedBy(root.get("course"), query, cb, user.getId()));
            if (courseId != null) where.add(cb.equal(root.get("course").get("courseId"), courseId));
            if (keyword != null && !keyword.isBlank()) where.add(cb.like(cb.lower(root.get("title")), like(keyword), '!'));
            if (from != null) where.add(cb.greaterThanOrEqualTo(root.get("startTime"), from));
            if (to != null) where.add(cb.lessThanOrEqualTo(root.get("startTime"), to));
            if (!statuses.isEmpty()) where.add(cb.or(statuses.stream().map(s -> statusPredicate(s, root, cb, now)).toArray(Predicate[]::new)));
            return cb.and(where.toArray(Predicate[]::new));
        };
        Page<Contest> result = contests.findAll(spec, PageRequest.of(page, size, sort(sort)));
        List<Long> ids = result.getContent().stream().map(Contest::getContestId).toList();
        Map<Long, Long> joined = counts(ids.isEmpty() ? List.of() : participants.countByContests(ids));
        Map<Long, Long> prizes = counts(ids.isEmpty() ? List.of() : rewards.countByContests(ids));
        return PageResponse.of(result, result.getContent().stream().map(c -> {
            String derived = status(c, now), ranking = rankingStatus(c, now);
            return new ListItem(c.getContestId(), c.getTitle(), courseRef(c.getCourse()), new ExamRef(c.getExam().getExamId(), c.getExam().getTitle()),
                    c.getStartTime(), c.getEndTime(), derived, c.getStatus(), ranking, joined.getOrDefault(c.getContestId(), 0L),
                    prizes.getOrDefault(c.getContestId(), 0L), PENDING_REWARD.equals(derived) && "READY".equals(ranking),
                    c.getRewardedAt(), c.getCreatedAt());
        }).toList());
    }

    /** Section 1.5 translated to SQL, so filtering happens before paging. */
    private static Predicate statusPredicate(String status, Root<Contest> root, CriteriaBuilder cb, Instant now) {
        Path<String> stored = root.get("status");
        Path<Instant> start = root.get("startTime"), end = root.get("endTime");
        return switch (status) {
            case UPCOMING -> cb.and(cb.equal(stored, PUBLISHED), cb.greaterThan(start, now));
            case ONGOING -> cb.and(cb.equal(stored, PUBLISHED), cb.lessThanOrEqualTo(start, now), cb.greaterThan(end, now));
            case PENDING_REWARD -> cb.and(cb.equal(stored, PUBLISHED), cb.lessThanOrEqualTo(end, now));
            default -> cb.equal(stored, status);
        };
    }

    private static Predicate managedBy(Path<Course> course, CriteriaQuery<?> query, CriteriaBuilder cb, Long userId) {
        Subquery<Long> assigned = query.subquery(Long.class);
        Root<CourseManager> cm = assigned.from(CourseManager.class);
        assigned.select(cm.get("courseManagerId")).where(cb.equal(cm.get("course"), course), cb.equal(cm.get("user").get("userId"), userId));
        return cb.or(cb.equal(course.get("manager").get("userId"), userId), cb.exists(assigned));
    }

    // ------------------------------------------------------------------ API 2 / 3 / 4

    @Transactional(readOnly = true)
    public Detail detail(UserPrincipal user, Long id) {
        return detail(scoped(user, contests.findLive(id)));
    }

    public Detail create(UserPrincipal user, ContestWrite body) {
        Plan plan = validate(user, body, -1L);
        Contest contest = contests.save(Contest.builder().exam(plan.exam()).course(plan.exam().getCourse())
                .createdBy(users.getReferenceById(user.getId())).title(plan.title()).description(plan.description())
                .durationMinutes(plan.exam().getDurationMinutes()).startTime(plan.start()).endTime(plan.end()).status(DRAFT).build());
        replaceRewards(contest, plan.ranks());
        return detail(contest);
    }

    public Detail update(UserPrincipal user, Long id, ContestWrite body) {
        Contest contest = scoped(user, contests.findForUpdate(id));
        Instant now = Instant.now();
        String status = status(contest, now);
        switch (status) {
            case REWARDED, CANCELLED -> throw locked("A " + status.toLowerCase(Locale.ROOT) + " contest cannot be changed.");
            case DRAFT -> apply(contest, validate(user, body, id));
            case UPCOMING -> {
                Plan plan = validate(user, body, id);
                boolean moved = !plan.exam().getExamId().equals(contest.getExam().getExamId()) || !plan.start().equals(contest.getStartTime())
                        || !rankIds(plan.ranks()).equals(rankIds(currentRanks(contest)));
                if (moved) publishChecks(plan.start(), plan.ranks());
                apply(contest, plan);
            }
            case ONGOING -> {
                Plan plan = fields(body);
                if (!plan.start().equals(contest.getStartTime()) || !body.examId().equals(contest.getExam().getExamId())
                        || !rankIds(body).equals(rankIds(currentRanks(contest)))) {
                    throw locked("While the contest runs only title, description and a later endTime can change.");
                }
                if (plan.end().isBefore(contest.getEndTime())) throw locked("endTime can only be extended while the contest runs.");
                contest.setTitle(plan.title());
                contest.setDescription(plan.description());
                contest.setEndTime(plan.end());
            }
            default -> { // PENDING_REWARD
                Plan plan = fields(body);
                if (!plan.start().equals(contest.getStartTime()) || !plan.end().equals(contest.getEndTime())
                        || !body.examId().equals(contest.getExam().getExamId())) {
                    throw locked("After the contest ended only title, description and prize discounts can change.");
                }
                SortedMap<Integer, Discount> current = currentRanks(contest);
                SortedMap<Integer, Discount> next = ranks(body.rewards());
                if (!next.keySet().equals(current.keySet())) {
                    throw error(ResponseCode.CONFLICT, "REWARD_RANK_LOCKED", "Ranks cannot be added or removed after the contest ended.");
                }
                SortedMap<Integer, Discount> changed = new TreeMap<>();
                next.forEach((rank, d) -> { if (!d.getDiscountId().equals(current.get(rank).getDiscountId())) changed.put(rank, d); });
                if (!changed.isEmpty()) prizeChecks(next, changed);
                contest.setTitle(plan.title());
                contest.setDescription(plan.description());
                replaceRewards(contest, next);
            }
        }
        contests.flush();
        return detail(contest);
    }

    // ------------------------------------------------------------------ API 5 / 6 / 7

    public Detail publish(UserPrincipal user, Long id) {
        Contest contest = scoped(user, contests.findForUpdate(id));
        if (!DRAFT.equals(contest.getStatus())) throw locked("Only a draft contest can be published.");
        SortedMap<Integer, Discount> ranks = currentRanks(contest);
        Plan plan = validate(user, new ContestWrite(contest.getTitle(), contest.getDescription(), contest.getExam().getExamId(),
                contest.getStartTime(), contest.getEndTime(), ranks.entrySet().stream()
                .map(e -> new RewardWrite(e.getKey(), e.getValue().getDiscountId())).toList()), id);
        publishChecks(plan.start(), plan.ranks());
        contest.setStatus(PUBLISHED);
        contests.flush();
        return detail(contest);
    }

    public Detail cancel(UserPrincipal user, Long id, String reason) {
        Contest contest = scoped(user, contests.findForUpdate(id));
        if (REWARDED.equals(contest.getStatus()) || CANCELLED.equals(contest.getStatus())) {
            throw locked("A " + contest.getStatus().toLowerCase(Locale.ROOT) + " contest cannot be cancelled.");
        }
        String text = reason == null ? null : reason.strip();
        if (text != null && text.length() > 1000) throw invalid("reason", "reason must be at most 1000 characters");
        List<ContestParticipant> joined = participants.findByContestContestIdOrderByParticipantIdAsc(id);
        if (!joined.isEmpty() && (text == null || text.isEmpty())) throw invalid("reason", "reason is required when the contest has participants");
        contest.setStatus(CANCELLED);
        contest.setCancelledAt(Instant.now());
        contest.setCancelReason(text == null || text.isEmpty() ? null : text);
        for (ContestParticipant p : joined) {
            notify(p.getUser(), "Cuộc thi đã bị huỷ – " + contest.getTitle(),
                    "Cuộc thi \"" + contest.getTitle() + "\" đã bị huỷ" + (contest.getCancelReason() == null ? "." : ": " + contest.getCancelReason()),
                    "CONTEST_CANCELLED");
        }
        contests.flush();
        return detail(contest);
    }

    public void delete(UserPrincipal user, Long id) {
        Contest contest = scoped(user, contests.findForUpdate(id));
        if (!DRAFT.equals(contest.getStatus())) throw locked("Only a draft contest can be deleted.");
        contest.setDeletedAt(Instant.now());
    }

    // ------------------------------------------------------------------ API 8

    @Transactional(readOnly = true)
    public PageResponse<LeaderboardRow> leaderboard(UserPrincipal user, Long id, int page, int size) {
        checkPage(page, size);
        Contest contest = scoped(user, contests.findLive(id));
        if (!"READY".equals(rankingStatus(contest, Instant.now()))) {
            throw error(ResponseCode.CONFLICT, "RANKING_NOT_READY", "Ranks are not calculated yet.");
        }
        Map<Integer, Discount> prizes = new HashMap<>();
        rewards.findByContestContestIdOrderByRankPositionAsc(id).forEach(r -> prizes.put(r.getRankPosition(), r.getDiscount()));
        Page<ContestParticipant> result = participants.findRanked(id, PageRequest.of(page, size));
        return PageResponse.of(result, result.getContent().stream().map(p -> {
            Discount d = prizes.get(p.getRank());
            return new LeaderboardRow(p.getRank(), new LeaderboardUser(p.getUser().getUserId(), p.getUser().getFullName(), p.getUser().getAvatarUrl()),
                    p.getScore(), p.getTimeTakenSec(), p.getFinishedAt(),
                    d == null ? null : new PlannedReward(d.getDiscountId(), d.getCode(), d.getDiscountType(), ContestRules.value(d)),
                    p.getRewardGrantedAt() != null, p.getRewardGrantedAt());
        }).toList());
    }

    // ------------------------------------------------------------------ API 11 / 12

    @Transactional(readOnly = true)
    public PageResponse<ExamOption> examOptions(UserPrincipal user, Long courseId, String keyword, int page, int size) {
        checkPage(page, size);
        if (courseId == null) throw invalid("courseId", "courseId is required");
        managedCourse(user, courseId);
        Page<Exam> result = contests.findEligibleExams(courseId, like(keyword), PageRequest.of(page, size));
        List<Long> ids = result.getContent().stream().map(Exam::getExamId).toList();
        Map<Long, Long> counts = questionCounts(ids);
        Set<Long> essay = essayExams(ids);
        return PageResponse.of(result, result.getContent().stream().map(e -> new ExamOption(e.getExamId(), e.getTitle(), courseId,
                e.getDurationMinutes(), e.getMaxScore(), counts.getOrDefault(e.getExamId(), 0L), essay.contains(e.getExamId()),
                e.getPublishedAt())).toList());
    }

    @Transactional(readOnly = true)
    public PageResponse<DiscountOption> discountOptions(String keyword, int page, int size) {
        checkPage(page, size);
        Page<Discount> result = discounts.findContestPrizes(Instant.now(), like(keyword), PageRequest.of(page, size));
        Map<Long, Long> remaining = rules.remaining(result.getContent());
        return PageResponse.of(result, result.getContent().stream().map(d -> new DiscountOption(d.getDiscountId(), d.getCode(), d.getName(),
                d.getDiscountType(), ContestRules.value(d), remaining.get(d.getDiscountId()), d.getExpiresAt())).toList());
    }

    // ------------------------------------------------------------------ validation (API 3 table)

    /** Rules 1-5: fields, exam eligibility, time window, prize ranks, exam not in another live contest. */
    Plan validate(UserPrincipal user, ContestWrite body, Long excludeContestId) {
        Plan fields = fields(body);
        Exam exam = exams.findForUpdate(body.examId()).orElse(null); // lock: two contests racing for one exam
        if (exam == null || exam.getCourse() == null || !manages(user, exam.getCourse()) || !"PUBLISHED".equals(exam.getStatus())
                || Boolean.TRUE.equals(exam.getIsPractice()) || !Exam.MODE_EXAM.equals(exam.getMode())) {
            throw error(ResponseCode.UNPROCESSABLE_VALIDATION_ERROR, "EXAM_NOT_ELIGIBLE",
                    "The exam must be a published, non-practice exam of a course you manage.");
        }
        if (Duration.between(fields.start(), fields.end()).toMinutes() < exam.getDurationMinutes()) {
            throw invalid("endTime", "endTime - startTime must be at least the exam duration (" + exam.getDurationMinutes() + " minutes)");
        }
        SortedMap<Integer, Discount> ranks = ranks(body.rewards());
        if (contests.countActiveForExam(exam.getExamId(), excludeContestId) > 0) {
            throw error(ResponseCode.CONFLICT, "EXAM_ALREADY_IN_ACTIVE_CONTEST", "This exam is already used by another contest.");
        }
        return new Plan(exam, fields.title(), fields.description(), fields.start(), fields.end(), ranks);
    }

    /** Field-level rules (VALIDATION_FAILED with field names). */
    private Plan fields(ContestWrite body) {
        List<Map<String, String>> errors = new ArrayList<>();
        String title = body.title() == null ? "" : body.title().strip();
        if (title.isEmpty()) errors.add(Map.of("field", "title", "message", "title is required"));
        else if (title.length() > 255) errors.add(Map.of("field", "title", "message", "title must be at most 255 characters"));
        if (body.description() != null && body.description().length() > 5000) {
            errors.add(Map.of("field", "description", "message", "description must be at most 5000 characters"));
        }
        if (body.examId() == null) errors.add(Map.of("field", "examId", "message", "examId is required"));
        if (body.startTime() == null) errors.add(Map.of("field", "startTime", "message", "startTime is required"));
        if (body.endTime() == null) errors.add(Map.of("field", "endTime", "message", "endTime is required"));
        else if (body.startTime() != null && !body.endTime().isAfter(body.startTime())) {
            errors.add(Map.of("field", "endTime", "message", "endTime phải sau startTime"));
        }
        if (!errors.isEmpty()) throw invalid(errors);
        String description = body.description() == null || body.description().isBlank() ? null : body.description().strip();
        return new Plan(null, title, description, body.startTime(), body.endTime(), null);
    }

    /** Rule 5: at most 50, positive, unique, contiguous from 1, each discount exists and is not deleted. */
    private SortedMap<Integer, Discount> ranks(List<RewardWrite> rewardsBody) {
        List<RewardWrite> list = rewardsBody == null ? List.of() : rewardsBody;
        if (list.size() > MAX_REWARDS) throw rankInvalid("At most " + MAX_REWARDS + " prize ranks.");
        SortedMap<Integer, Long> wanted = new TreeMap<>();
        for (RewardWrite r : list) {
            if (r == null || r.rankPosition() == null || r.rankPosition() < 1 || r.discountId() == null) {
                throw rankInvalid("Each reward needs a rankPosition >= 1 and a discountId.");
            }
            if (wanted.put(r.rankPosition(), r.discountId()) != null) throw rankInvalid("rankPosition " + r.rankPosition() + " is repeated.");
        }
        if (!wanted.isEmpty() && wanted.lastKey() != wanted.size()) throw rankInvalid("rankPosition must run 1, 2, 3, ... without gaps.");
        Map<Long, Discount> found = discounts.findAllById(new HashSet<>(wanted.values())).stream()
                .collect(Collectors.toMap(Discount::getDiscountId, d -> d));
        SortedMap<Integer, Discount> ranks = new TreeMap<>();
        wanted.forEach((rank, discountId) -> {
            Discount d = found.get(discountId);
            if (d == null || d.getDeletedAt() != null) throw rankInvalid("Discount " + discountId + " does not exist.");
            ranks.put(rank, d);
        });
        return ranks;
    }

    /** Rules 6-9 (publish, and UPCOMING edits of exam/start/rewards). */
    private void publishChecks(Instant start, SortedMap<Integer, Discount> ranks) {
        if (!start.isAfter(Instant.now())) throw invalid("startTime", "startTime must be in the future to publish");
        if (ranks.isEmpty()) throw error(ResponseCode.UNPROCESSABLE_VALIDATION_ERROR, "REWARDS_REQUIRED", "Add at least one prize before publishing.");
        prizeChecks(ranks, ranks);
    }

    /** Rules 7-8 for the given ranks; quota is judged on all ranks sharing a discount. */
    private void prizeChecks(SortedMap<Integer, Discount> all, SortedMap<Integer, Discount> checked) {
        Set<Long> ids = checked.values().stream().map(Discount::getDiscountId).collect(Collectors.toSet());
        SortedMap<Integer, Discount> scope = new TreeMap<>();
        all.forEach((rank, d) -> { if (ids.contains(d.getDiscountId())) scope.put(rank, d); });
        List<Issue> issues = rules.issues(scope, Instant.now(), false);
        List<Issue> unavailable = issues.stream().filter(i -> !"DISCOUNT_QUOTA_NOT_ENOUGH".equals(i.reason())).toList();
        if (!unavailable.isEmpty()) {
            throw error(ResponseCode.UNPROCESSABLE_VALIDATION_ERROR, "DISCOUNT_NOT_AVAILABLE", "Some prize discounts cannot be used.", "issues", unavailable);
        }
        if (!issues.isEmpty()) {
            throw error(ResponseCode.UNPROCESSABLE_VALIDATION_ERROR, "DISCOUNT_QUOTA_NOT_ENOUGH", "A discount has fewer uses left than prize ranks.", "issues", issues);
        }
    }

    private static com.examprep.exceptions.BaseException rankInvalid(String message) {
        return error(ResponseCode.UNPROCESSABLE_VALIDATION_ERROR, "REWARD_RANK_INVALID", message);
    }

    private void apply(Contest contest, Plan plan) {
        contest.setTitle(plan.title());
        contest.setDescription(plan.description());
        contest.setExam(plan.exam());
        contest.setCourse(plan.exam().getCourse());
        contest.setDurationMinutes(plan.exam().getDurationMinutes());
        contest.setStartTime(plan.start());
        contest.setEndTime(plan.end());
        replaceRewards(contest, plan.ranks());
    }

    /** Replaces the prize list, keeping the row (and rewardId) of every rank that stays. */
    void replaceRewards(Contest contest, SortedMap<Integer, Discount> ranks) {
        List<ContestReward> existing = contest.getContestId() == null ? List.of() : rewards.findByContestContestIdOrderByRankPositionAsc(contest.getContestId());
        Map<Integer, ContestReward> byRank = existing.stream().collect(Collectors.toMap(ContestReward::getRankPosition, r -> r));
        List<ContestReward> removed = existing.stream().filter(r -> !ranks.containsKey(r.getRankPosition())).toList();
        rewards.deleteAll(removed);
        rewards.flush();
        ranks.forEach((rank, d) -> {
            ContestReward row = byRank.get(rank);
            if (row == null) rewards.save(ContestReward.builder().contest(contest).rankPosition(rank).discount(d).build());
            else row.setDiscount(d);
        });
        rewards.flush();
    }

    private SortedMap<Integer, Discount> currentRanks(Contest contest) {
        SortedMap<Integer, Discount> ranks = new TreeMap<>();
        rewards.findByContestContestIdOrderByRankPositionAsc(contest.getContestId()).forEach(r -> ranks.put(r.getRankPosition(), r.getDiscount()));
        return ranks;
    }

    private static Map<Integer, Long> rankIds(SortedMap<Integer, Discount> ranks) {
        Map<Integer, Long> ids = new TreeMap<>();
        ranks.forEach((rank, d) -> ids.put(rank, d.getDiscountId()));
        return ids;
    }

    private static Map<Integer, Long> rankIds(ContestWrite body) {
        Map<Integer, Long> ids = new TreeMap<>();
        if (body.rewards() != null) body.rewards().forEach(r -> { if (r != null) ids.put(r.rankPosition(), r.discountId()); });
        return ids;
    }

    // ------------------------------------------------------------------ detail (API 2 body)

    Detail detail(Contest contest) {
        Instant now = Instant.now();
        String status = status(contest, now), ranking = rankingStatus(contest, now);
        List<ContestReward> prizeRows = rewards.findByContestContestIdOrderByRankPositionAsc(contest.getContestId());
        Map<Integer, ContestParticipant> byRank = new HashMap<>();
        long joined = participants.countByContestContestId(contest.getContestId());
        if ("READY".equals(ranking)) {
            participants.findByContestContestIdOrderByParticipantIdAsc(contest.getContestId())
                    .forEach(p -> { if (p.getRank() != null) byRank.putIfAbsent(p.getRank(), p); });
        }
        Map<Long, Long> remaining = rules.remaining(prizeRows.stream().map(ContestReward::getDiscount).toList());
        List<RewardView> prizes = prizeRows.stream().map(r -> {
            Discount d = r.getDiscount();
            ContestParticipant p = byRank.get(r.getRankPosition());
            return new RewardView(r.getRewardId(), r.getRankPosition(),
                    new DiscountInfo(d.getDiscountId(), d.getCode(), d.getName(), d.getDiscountType(), ContestRules.value(d), d.getIsActive(),
                            validity(d, remaining.get(d.getDiscountId()), now)),
                    p == null ? null : new Winner(p.getUser().getUserId(), p.getUser().getFullName(), p.getScore()),
                    p != null && p.getRewardGrantedAt() != null);
        }).toList();
        boolean payable = PENDING_REWARD.equals(status) && "READY".equals(ranking);
        List<Issue> blockers = List.of();
        if (payable) {
            SortedMap<Integer, Discount> winning = new TreeMap<>();
            prizeRows.forEach(r -> { if (byRank.containsKey(r.getRankPosition())) winning.put(r.getRankPosition(), r.getDiscount()); });
            blockers = rules.issues(winning, now, true);
        }
        Exam exam = contest.getExam();
        Long examId = exam.getExamId();
        User rewardedBy = contest.getRewardedBy();
        return new Detail(contest.getContestId(), contest.getTitle(), contest.getDescription(), status, contest.getStatus(), ranking,
                contest.getStartTime(), contest.getEndTime(), courseRef(contest.getCourse()),
                new ExamInfo(examId, exam.getTitle(), exam.getDurationMinutes(), exam.getMaxScore(), questionCounts(List.of(examId)).getOrDefault(examId, 0L)),
                prizes, prizes.size(), joined, contest.getRankedAt(), contest.getRewardedAt(),
                rewardedBy == null ? null : new UserRef(rewardedBy.getUserId(), rewardedBy.getFullName()),
                contest.getCancelledAt(), contest.getCancelReason(), blockers,
                !REWARDED.equals(status) && !CANCELLED.equals(status), DRAFT.equals(status),
                !REWARDED.equals(status) && !CANCELLED.equals(status), payable);
    }

    private Map<Long, Long> questionCounts(List<Long> examIds) {
        Map<Long, Long> counts = new HashMap<>();
        if (examIds.isEmpty()) return counts;
        exams.findQuestionTypesByExamIds(examIds).forEach(r -> counts.merge((Long) r[0], 1L, Long::sum));
        contests.randomQuestionCounts(examIds).forEach(r -> counts.merge((Long) r[0], r[1] == null ? 0L : ((Number) r[1]).longValue(), Long::sum));
        return counts;
    }

    private Set<Long> essayExams(List<Long> examIds) {
        Set<Long> essay = new HashSet<>();
        if (examIds.isEmpty()) return essay;
        exams.findQuestionTypesByExamIds(examIds).forEach(r -> { if (RUBRIC_TYPES.contains((String) r[1])) essay.add((Long) r[0]); });
        exams.findConfigTypesByExamIds(examIds).forEach(r -> { if (RUBRIC_TYPES.contains((String) r[1])) essay.add((Long) r[0]); });
        return essay;
    }

    // ------------------------------------------------------------------ scope and helpers

    /** 404 when missing, deleted or outside the caller's courses (spec section 3: never reveal existence). */
    Contest scoped(UserPrincipal user, Optional<Contest> found) {
        Contest contest = found.orElseThrow(ContestRules::notFound);
        if (contest.getCourse() == null || !manages(user, contest.getCourse())) throw notFound();
        return contest;
    }

    boolean manages(UserPrincipal user, Course course) {
        return admin(user) || course.getManager().getUserId().equals(user.getId())
                || assignments.existsByCourseCourseIdAndUserUserId(course.getCourseId(), user.getId());
    }

    private void managedCourse(UserPrincipal user, Long courseId) {
        Course course = courses.findById(courseId).orElse(null);
        if (course == null || !manages(user, course)) {
            throw error(ResponseCode.FORBIDDEN, "FORBIDDEN_COURSE", "You do not manage this course.");
        }
    }

    void notify(User user, String title, String content, String type) {
        Notification n = notifications.save(Notification.builder().title(title).content(content).type(type).targetType("USER").build());
        userNotifications.save(UserNotification.builder().user(user).notification(n).isRead(false).build());
    }

    private static boolean admin(UserPrincipal user) { return User.ROLE_ADMIN.equals(user.getRole()); }

    private static CourseRef courseRef(Course course) {
        return course == null ? null : new CourseRef(course.getCourseId(), course.getTitle());
    }

    private static Map<Long, Long> counts(List<Object[]> rows) {
        Map<Long, Long> map = new HashMap<>();
        rows.forEach(r -> map.put((Long) r[0], ((Number) r[1]).longValue()));
        return map;
    }

    private static String like(String keyword) {
        String text = keyword == null ? "" : keyword.strip().toLowerCase(Locale.ROOT);
        return "%" + text.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
    }

    private static void checkPage(int page, int size) {
        if (page < 0 || size < 1 || size > 100) throw invalid("size", "page must be >= 0 and size 1-100");
    }

    private static Sort sort(String sort) {
        if (sort == null || sort.isBlank()) return Sort.by(Sort.Direction.DESC, "startTime").and(Sort.by(Sort.Direction.DESC, "contestId"));
        String[] parts = sort.split(",");
        String field = SORTS.get(parts[0].strip());
        if (field == null) throw invalid("sort", "sort must be one of " + SORTS.keySet());
        Sort.Direction direction = parts.length > 1 && "asc".equalsIgnoreCase(parts[1].strip()) ? Sort.Direction.ASC : Sort.Direction.DESC;
        return Sort.by(direction, field).and(Sort.by(direction, "contestId"));
    }
}
