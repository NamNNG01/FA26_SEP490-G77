package com.examprep.services.contest;

import com.examprep.entities.Contest;
import com.examprep.entities.ContestParticipant;
import com.examprep.entities.ExamAttempt;
import com.examprep.repositories.ContestParticipantRepository;
import com.examprep.repositories.ContestRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Section 6.3: ranks ended contests once every attempt is finished and graded. Never grants rewards and never
 * changes the contest status; the contest stays PENDING_REWARD until a manager pays (API 9 / 10).
 */
@Slf4j
@Component
public class ContestRanker {
    private static final Duration STUCK = Duration.ofHours(24);
    private static final Comparator<ContestParticipant> ORDER = Comparator
            .comparing(ContestParticipant::getScore, Comparator.reverseOrder())
            .thenComparing(ContestParticipant::getTimeTakenSec, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(ContestParticipant::getFinishedAt, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(ContestParticipant::getParticipantId);

    private final ContestRepository contests;
    private final ContestParticipantRepository participants;
    private final TransactionTemplate tx;

    public ContestRanker(ContestRepository contests, ContestParticipantRepository participants, PlatformTransactionManager transactionManager) {
        this.contests = contests;
        this.participants = participants;
        this.tx = new TransactionTemplate(transactionManager);
    }

    @Scheduled(fixedDelayString = "${app.contest.rank-ms:60000}")
    public void rankDue() {
        List<Long> due = tx.execute(s -> contests.findDueForRanking(Instant.now()));
        for (Long id : due) {
            try {
                tx.executeWithoutResult(s -> rankIfReady(id));
            } catch (RuntimeException ex) {
                log.warn("Ranking contest {} failed: {}", id, ex.getClass().getSimpleName());
            }
        }
    }

    private void rankIfReady(Long id) {
        // ponytail: a row lock per contest; with several app instances add SKIP LOCKED (spec section 10.5).
        Contest contest = contests.findForUpdate(id).orElse(null);
        Instant now = Instant.now();
        if (contest == null || contest.getRankedAt() != null || !ContestRules.PUBLISHED.equals(contest.getStatus())
                || contest.getEndTime().isAfter(now)) return;
        List<Long> attemptIds = participants.findByContestContestIdOrderByParticipantIdAsc(id).stream()
                .map(ContestParticipant::getAttemptId).filter(Objects::nonNull).toList();
        if (!attemptIds.isEmpty() && (participants.countUnfinishedAttempts(attemptIds) > 0 || participants.countPendingGrading(attemptIds) > 0)) {
            if (contest.getEndTime().plus(STUCK).isBefore(now)) log.warn("Contest {} still waits for attempts or grading after 24h", id);
            return;
        }
        rank(contest);
        contest.setRankedAt(now);
    }

    /**
     * Recomputes every participant's score, time and rank from their contest attempt (also used right before
     * paying rewards, since answers may have been regraded). Order: score desc, time asc, submission asc, id asc.
     */
    public void rank(Contest contest) {
        List<ContestParticipant> rows = participants.findByContestContestIdOrderByParticipantIdAsc(contest.getContestId());
        List<Long> attemptIds = rows.stream().map(ContestParticipant::getAttemptId).filter(Objects::nonNull).toList();
        Map<Long, ExamAttempt> attempts = attemptIds.isEmpty() ? Map.of() : participants.findAttempts(attemptIds).stream()
                .collect(Collectors.toMap(ExamAttempt::getAttemptId, Function.identity()));
        for (ContestParticipant p : rows) {
            ExamAttempt a = p.getAttemptId() == null ? null : attempts.get(p.getAttemptId());
            if (a == null) continue; // no contest attempt: keep whatever score the participant row holds
            boolean finished = Set.of("SUBMITTED", "COMPLETED").contains(a.getStatus()) && a.getSubmittedAt() != null;
            p.setScore(finished ? a.getTotalScore() : null);
            p.setFinishedAt(finished ? a.getSubmittedAt() : null);
            p.setTimeTakenSec(finished ? (int) Math.max(0, a.getStartTime().until(a.getSubmittedAt(), ChronoUnit.SECONDS)) : null);
        }
        List<ContestParticipant> scored = rows.stream().filter(p -> p.getScore() != null).sorted(ORDER).toList();
        rows.forEach(p -> p.setRank(null));
        for (int i = 0; i < scored.size(); i++) scored.get(i).setRank(i + 1);
        participants.flush();
    }
}
