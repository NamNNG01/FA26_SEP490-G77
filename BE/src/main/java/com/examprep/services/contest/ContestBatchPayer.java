package com.examprep.services.contest;

import com.examprep.dto.ContestDtos.*;
import com.examprep.dto.ResponseCode;
import com.examprep.entities.Contest;
import com.examprep.exceptions.BaseException;
import com.examprep.repositories.ContestRepository;
import com.examprep.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.*;

import static com.examprep.services.contest.ContestRules.*;

/**
 * API 10. Deliberately not transactional: every contest is paid through {@link ContestRewardPayer#pay}, which opens
 * its own transaction, in endTime order, so one blocked contest never undoes another.
 */
@Service
@RequiredArgsConstructor
public class ContestBatchPayer {
    private static final int MAX_BATCH = 20;

    private final ContestRepository contests;
    private final ManagerContestService manager;
    private final ContestRewardPayer payer;

    public record Outcome(BatchResult result, String message) { }

    public Outcome payAll(UserPrincipal user, BatchPayRequest body) {
        List<Long> ids = body == null || body.contestIds() == null ? List.of() : body.contestIds();
        if (ids.isEmpty()) throw invalid("contestIds", "contestIds must not be empty");
        if (ids.size() > MAX_BATCH) throw error(ResponseCode.BAD_REQUEST, "BATCH_TOO_LARGE", "At most " + MAX_BATCH + " contests per batch.");
        if (ids.contains(null) || new HashSet<>(ids).size() != ids.size()) throw invalid("contestIds", "contestIds must be distinct ids");

        List<Contest> found = new ArrayList<>();
        Set<Long> visible = new HashSet<>();
        for (Contest c : contests.findAllById(ids)) {
            if (c.getDeletedAt() == null && c.getCourse() != null && manager.manages(user, c.getCourse())) {
                found.add(c);
                visible.add(c.getContestId());
            }
        }
        found.sort(Comparator.comparing(Contest::getEndTime).thenComparing(Contest::getContestId));

        List<BatchRow> rows = new ArrayList<>();
        for (Contest c : found) {
            try {
                PayResult paid = payer.pay(user, c.getContestId());
                rows.add(new BatchRow(c.getContestId(), c.getTitle(), true, paid.status(), paid.rewardsGranted(), paid.rewardedAt(),
                        null, null, null));
            } catch (BaseException ex) {
                rows.add(failure(c.getContestId(), c.getTitle(), ex));
            }
        }
        for (Long id : ids) {
            if (!visible.contains(id)) rows.add(failure(id, null, notFound()));
        }
        int succeeded = (int) rows.stream().filter(BatchRow::success).count();
        return new Outcome(new BatchResult(rows.size(), succeeded, rows.size() - succeeded, rows),
                "Đã trả thưởng " + succeeded + "/" + rows.size() + " contest");
    }

    @SuppressWarnings("unchecked")
    private static BatchRow failure(Long id, String title, BaseException ex) {
        Map<String, Object> data = ex.getData() instanceof Map<?, ?> map ? (Map<String, Object>) map : Map.of();
        Object code = data.getOrDefault("code", ex.getResponseCode().getCode());
        List<Issue> issues = data.get("issues") instanceof List<?> list ? (List<Issue>) list : null;
        return new BatchRow(id, title, false, null, null, null, String.valueOf(code), ex.getMessage(), issues);
    }
}
