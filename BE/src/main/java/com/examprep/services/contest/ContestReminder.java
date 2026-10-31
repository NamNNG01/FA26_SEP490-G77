package com.examprep.services.contest;

import com.examprep.entities.Contest;
import com.examprep.entities.ContestParticipant;
import com.examprep.repositories.ContestParticipantRepository;
import com.examprep.repositories.ContestRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/** Notifies every registered participant once, when a published contest starts within 5 minutes. */
@Slf4j
@Component
public class ContestReminder {
    static final Duration AHEAD = Duration.ofMinutes(5);

    private final ContestRepository contests;
    private final ContestParticipantRepository participants;
    private final ManagerContestService manager;
    private final TransactionTemplate tx;

    public ContestReminder(ContestRepository contests, ContestParticipantRepository participants, ManagerContestService manager,
                           PlatformTransactionManager transactionManager) {
        this.contests = contests;
        this.participants = participants;
        this.manager = manager;
        this.tx = new TransactionTemplate(transactionManager);
    }

    @Scheduled(fixedDelayString = "${app.contest.remind-ms:60000}")
    public void remindDue() {
        Instant now = Instant.now();
        List<Long> due = tx.execute(s -> contests.findDueForReminder(now, now.plus(AHEAD)));
        for (Long id : due) {
            try {
                tx.executeWithoutResult(s -> remind(id));
            } catch (RuntimeException ex) {
                log.warn("Reminding contest {} failed: {}", id, ex.getClass().getSimpleName());
            }
        }
    }

    void remind(Long id) {
        Contest contest = contests.findForUpdate(id).orElse(null); // row lock: never remind twice
        Instant now = Instant.now();
        if (contest == null || contest.getReminderSentAt() != null || !ContestRules.PUBLISHED.equals(contest.getStatus())
                || !contest.getStartTime().isAfter(now)) return;
        long minutes = (Duration.between(now, contest.getStartTime()).getSeconds() + 59) / 60; // published late: fewer than 5
        for (ContestParticipant p : participants.findByContestContestIdOrderByParticipantIdAsc(id)) {
            manager.notify(p.getUser(), contest, "Cuộc thi sắp bắt đầu – " + contest.getTitle(),
                    "Cuộc thi \"" + contest.getTitle() + "\" sẽ bắt đầu sau " + minutes + " phút.", "CONTEST_REMINDER");
        }
        contest.setReminderSentAt(now);
    }
}
