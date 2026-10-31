package com.examprep.services.contest;

import com.examprep.dto.ContestDtos.*;
import com.examprep.dto.ResponseCode;
import com.examprep.entities.*;
import com.examprep.exceptions.BaseException;
import com.examprep.repositories.*;
import com.examprep.security.UserPrincipal;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

import static com.examprep.services.contest.ContestRules.*;

/**
 * API 9 (section 6.4): pays one contest in one transaction, all or nothing. Locks the contest first, then its
 * discounts in id order, so two managers (or a double click) cannot pay twice or deadlock.
 */
@Service
@RequiredArgsConstructor
public class ContestRewardPayer {
    private final ContestRepository contests;
    private final ContestRewardRepository rewards;
    private final ContestParticipantRepository participants;
    private final DiscountRepository discounts;
    private final UserDiscountRepository userDiscounts;
    private final UserRepository users;
    private final ManagerContestService manager;
    private final ContestRanker ranker;
    private final ContestRules rules;
    private final EntityManager em;

    /** Called once per contest; API 10 calls it outside any transaction, so each contest commits on its own. */
    @Transactional
    public PayResult pay(UserPrincipal user, Long contestId) {
        Contest contest = manager.scoped(user, contests.findForUpdate(contestId));
        // open-in-view keeps one persistence context for the whole request: API 10 loaded every contest before
        // paying, and FOR UPDATE alone hands back that cached copy, so re-read it under the lock.
        em.refresh(contest);
        Instant now = Instant.now();
        if (!PENDING_REWARD.equals(status(contest, now))) {
            throw error(ResponseCode.CONFLICT, "CONTEST_NOT_PENDING_REWARD", "This contest is not waiting for its rewards.");
        }
        if (contest.getRankedAt() == null) throw error(ResponseCode.CONFLICT, "RANKING_NOT_READY", "Ranks are not calculated yet.");
        ranker.rank(contest); // scores may have been regraded since the scheduler ranked

        Map<Integer, ContestParticipant> byRank = new HashMap<>();
        participants.findByContestContestIdOrderByParticipantIdAsc(contestId).forEach(p -> { if (p.getRank() != null) byRank.putIfAbsent(p.getRank(), p); });
        List<ContestReward> prizes = rewards.findByContestContestIdOrderByRankPositionAsc(contestId).stream()
                .filter(r -> byRank.containsKey(r.getRankPosition())).toList();
        Map<Long, Discount> locked = discounts.lockAll(prizes.stream().map(r -> r.getDiscount().getDiscountId()).collect(Collectors.toSet()))
                .stream().peek(em::refresh).collect(Collectors.toMap(Discount::getDiscountId, d -> d));
        SortedMap<Integer, Discount> winning = new TreeMap<>();
        prizes.forEach(r -> winning.put(r.getRankPosition(), locked.get(r.getDiscount().getDiscountId())));
        List<Issue> issues = rules.issues(winning, now, true);
        if (!issues.isEmpty()) {
            throw new BaseException(ResponseCode.CONFLICT, "Không thể trả thưởng do có discount không khả dụng",
                    Map.of("code", "REWARD_PAYMENT_BLOCKED", "issues", issues));
        }

        List<PaidWinner> winners = new ArrayList<>();
        for (Map.Entry<Integer, Discount> prize : winning.entrySet()) {
            ContestParticipant p = byRank.get(prize.getKey());
            Discount d = prize.getValue();
            UserDiscount voucher = userDiscounts.save(UserDiscount.builder().user(p.getUser()).discount(d).isUsed(false)
                    .sourceType("CONTEST").sourceId(contestId).build());
            p.setRewardClaimed(true);
            p.setRewardUserDiscount(voucher);
            p.setRewardGrantedAt(now);
            manager.notify(p.getUser(), contest, "Chúc mừng bạn đạt hạng " + prize.getKey() + " – " + contest.getTitle(),
                    "Bạn nhận được mã giảm giá " + d.getCode() + " (" + valueText(d) + "). Xem trong mục Ưu đãi của tôi.", "CONTEST_REWARD");
            winners.add(new PaidWinner(prize.getKey(), p.getUser().getUserId(), p.getUser().getFullName(),
                    new WinnerDiscount(d.getDiscountId(), d.getCode())));
        }
        contest.setStatus(REWARDED);
        contest.setRewardedAt(now);
        contest.setRewardedBy(users.getReferenceById(user.getId()));
        contests.flush();
        return new PayResult(contestId, REWARDED, now, winners.size(), winners);
    }

    /** "50%" or "30000đ" (section 6.5). */
    private static String valueText(Discount d) {
        java.math.BigDecimal value = ContestRules.value(d);
        return (value == null ? "0" : value.toPlainString()) + ("PERCENT".equals(d.getDiscountType()) ? "%" : "đ");
    }
}
