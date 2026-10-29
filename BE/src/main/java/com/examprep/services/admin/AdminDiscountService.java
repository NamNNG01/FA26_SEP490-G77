package com.examprep.services.admin;

import com.examprep.dto.AdminDiscountDtos.*;
import com.examprep.entities.ContestReward;
import com.examprep.entities.Discount;
import com.examprep.entities.UserDiscount;
import com.examprep.dto.ResponseCode;
import com.examprep.repositories.ContestRewardRepository;
import com.examprep.repositories.DiscountRepository;
import com.examprep.repositories.UserDiscountRepository;
import com.examprep.services.contest.ContestRules;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;

@Service
@RequiredArgsConstructor
@Transactional
public class AdminDiscountService {

    private final DiscountRepository discountRepository;
    private final UserDiscountRepository userDiscountRepository;
    private final ContestRewardRepository contestRewardRepository;
    private final ContestRules contestRules;

    @Transactional(readOnly = true)
    public Page<DiscountItem> list(String keyword, String discountType, Boolean isActive, String validity, int page, int size, String sort) {
        String kw = (keyword != null && !keyword.isBlank()) ? "%" + keyword.trim().toLowerCase() + "%" : null;
        String dt = (discountType != null && !discountType.isBlank()) ? discountType.trim().toUpperCase() : null;
        String val = (validity != null && !validity.isBlank()) ? validity.trim().toUpperCase() : null;

        String[] parts = sort.split(",");
        Sort.Direction dir = parts.length > 1 && "asc".equalsIgnoreCase(parts[1]) ? Sort.Direction.ASC : Sort.Direction.DESC;
        String prop = parts[0];
        if (!List.of("discountId", "code", "name", "createdAt", "expiredAt", "usedCount").contains(prop)) {
            prop = "createdAt";
        }
        Pageable pageable = PageRequest.of(page, size, Sort.by(dir, prop));

        Page<Discount> discounts = discountRepository.findAll((root, query, cb) -> {
            var p = cb.conjunction();
            p = cb.and(p, cb.isNull(root.get("deletedAt")));
            if (kw != null) {
                p = cb.and(p, cb.or(
                        cb.like(cb.lower(root.get("code")), kw),
                        cb.like(cb.lower(cb.coalesce(root.get("name"), "")), kw)
                ));
            }
            if (dt != null) {
                p = cb.and(p, cb.equal(root.get("discountType"), dt));
            }
            if (isActive != null) {
                p = cb.and(p, cb.equal(root.get("isActive"), isActive));
            }
            return p;
        }, pageable);

        Instant now = Instant.now();
        List<Discount> content = discounts.getContent();
        Map<Long, Long> remainingMap = contestRules.remaining(content);

        return discounts.map(d -> {
            long rem = remainingMap.getOrDefault(d.getDiscountId(), 0L);
            String vState = ContestRules.validity(d, rem, now);
            if (val != null && !val.equals(vState)) {
                return null;
            }
            return new DiscountItem(
                    d.getDiscountId(),
                    d.getCode(),
                    d.getName(),
                    d.getDiscountType(),
                    ContestRules.value(d),
                    d.getAppliesTo(),
                    d.getUsageLimit(),
                    d.getUsedCount(),
                    rem,
                    d.getStartAt(),
                    d.getExpiresAt(),
                    d.getIsActive(),
                    vState,
                    d.getCreatedAt()
            );
        });
    }

    @Transactional(readOnly = true)
    public DiscountDetail detail(Long id) {
        Discount d = discountRepository.findById(id)
                .filter(x -> x.getDeletedAt() == null)
                .orElseThrow(() -> ContestRules.error(ResponseCode.RESOURCE_NOT_FOUND, "DISCOUNT_NOT_FOUND", "Discount not found"));

        Instant now = Instant.now();
        long rem = contestRules.remaining(List.of(d)).get(id);
        String vState = ContestRules.validity(d, rem, now);

        long assigned = userDiscountRepository.findAll().stream().filter(ud -> ud.getDiscount().getDiscountId().equals(id)).count();
        long unusedAssignedCount = userDiscountRepository.findAll().stream().filter(ud -> ud.getDiscount().getDiscountId().equals(id) && !Boolean.TRUE.equals(ud.getIsUsed())).count();

        List<ContestRef> usedInContests = contestRewardRepository.findByContestContestIdOrderByRankPositionAsc(id).stream()
                .map(cr -> {
                    var c = cr.getContest();
                    return new ContestRef(c.getContestId(), c.getTitle(), ContestRules.status(c, now), cr.getRankPosition());
                }).toList();

        return new DiscountDetail(
                d.getDiscountId(),
                d.getCode(),
                d.getName(),
                d.getDescription(),
                d.getDiscountType(),
                ContestRules.value(d),
                d.getMinOrderAmount(),
                d.getMaxDiscountAmount(),
                d.getAppliesTo(),
                d.getUsageLimit(),
                d.getUsedCount(),
                rem,
                d.getStartAt(),
                d.getExpiresAt(),
                d.getIsActive(),
                vState,
                new DiscountStats(assigned, d.getUsedCount(), unusedAssignedCount, rem),
                usedInContests,
                d.getCreatedAt(),
                d.getUpdatedAt()
        );
    }

    public DiscountDetail create(DiscountWriteRequest req) {
        validateRequest(req, null);
        String upperCode = req.code().trim().toUpperCase();
        if (discountRepository.findByCodeIgnoreCaseAndDeletedAtIsNull(upperCode).isPresent()) {
            throw ContestRules.error(ResponseCode.CONFLICT, "DISCOUNT_CODE_EXISTS", "Discount code already exists");
        }

        BigDecimal val = req.value();
        BigDecimal percent = "PERCENT".equalsIgnoreCase(req.discountType()) ? val : null;
        BigDecimal amount = "PERCENT".equalsIgnoreCase(req.discountType()) ? null : val;

        Discount d = Discount.builder()
                .code(upperCode)
                .name(req.name())
                .description(req.description())
                .discountType(req.discountType().toUpperCase())
                .value(amount)
                .percent(percent)
                .usageLimit(req.usageLimit())
                .minOrderAmount(req.minOrderAmount())
                .maxDiscountAmount(req.maxDiscountAmount())
                .appliesTo(req.appliesTo().toUpperCase())
                .startAt(req.startAt())
                .expiresAt(req.expiredAt())
                .isActive(req.isActive() != null ? req.isActive() : true)
                .usedCount(0)
                .build();

        Discount saved = discountRepository.save(d);
        return detail(saved.getDiscountId());
    }

    public DiscountDetail update(Long id, DiscountWriteRequest req) {
        Discount d = discountRepository.findById(id)
                .filter(x -> x.getDeletedAt() == null)
                .orElseThrow(() -> ContestRules.error(ResponseCode.RESOURCE_NOT_FOUND, "DISCOUNT_NOT_FOUND", "Discount not found"));

        validateRequest(req, d);
        String upperCode = req.code().trim().toUpperCase();
        if (!d.getCode().equalsIgnoreCase(upperCode) && discountRepository.findByCodeIgnoreCaseAndDeletedAtIsNull(upperCode).isPresent()) {
            throw ContestRules.error(ResponseCode.CONFLICT, "DISCOUNT_CODE_EXISTS", "Discount code already exists");
        }

        long assignedCount = userDiscountRepository.findAll().stream().filter(ud -> ud.getDiscount().getDiscountId().equals(id)).count();
        boolean locked = assignedCount > 0 || d.getUsedCount() > 0;

        if (locked) {
            if (!d.getCode().equalsIgnoreCase(upperCode) || !d.getDiscountType().equalsIgnoreCase(req.discountType())
                    || !Objects.equals(ContestRules.value(d), req.value()) || !d.getAppliesTo().equalsIgnoreCase(req.appliesTo())) {
                throw ContestRules.error(ResponseCode.CONFLICT, "DISCOUNT_FIELD_LOCKED", "Locked fields cannot be modified after assignment or usage");
            }
            long unusedAssigned = userDiscountRepository.findAll().stream().filter(ud -> ud.getDiscount().getDiscountId().equals(id) && !Boolean.TRUE.equals(ud.getIsUsed())).count();
            if (req.usageLimit() < d.getUsedCount() + unusedAssigned) {
                throw ContestRules.error(ResponseCode.CONFLICT, "USAGE_LIMIT_TOO_LOW", "Usage limit cannot be less than used plus assigned unused count");
            }
        }

        BigDecimal val = req.value();
        BigDecimal percent = "PERCENT".equalsIgnoreCase(req.discountType()) ? val : null;
        BigDecimal amount = "PERCENT".equalsIgnoreCase(req.discountType()) ? null : val;

        d.setCode(upperCode);
        d.setName(req.name());
        d.setDescription(req.description());
        d.setDiscountType(req.discountType().toUpperCase());
        d.setValue(amount);
        d.setPercent(percent);
        d.setUsageLimit(req.usageLimit());
        d.setMinOrderAmount(req.minOrderAmount());
        d.setMaxDiscountAmount(req.maxDiscountAmount());
        d.setAppliesTo(req.appliesTo().toUpperCase());
        d.setStartAt(req.startAt());
        d.setExpiresAt(req.expiredAt());
        if (req.isActive() != null) d.setIsActive(req.isActive());

        discountRepository.save(d);
        return detail(id);
    }

    public StatusUpdateResponse updateStatus(Long id, StatusUpdateRequest req) {
        Discount d = discountRepository.findById(id)
                .filter(x -> x.getDeletedAt() == null)
                .orElseThrow(() -> ContestRules.error(ResponseCode.RESOURCE_NOT_FOUND, "DISCOUNT_NOT_FOUND", "Discount not found"));

        d.setIsActive(req.isActive());
        discountRepository.save(d);

        Instant now = Instant.now();
        List<AffectedContest> affected = new ArrayList<>();
        if (!req.isActive()) {
            contestRewardRepository.findAll().stream()
                    .filter(cr -> cr.getDiscount() != null && cr.getDiscount().getDiscountId().equals(id))
                    .map(ContestReward::getContest)
                    .filter(c -> c.getDeletedAt() == null && !ContestRules.CANCELLED.equals(c.getStatus()) && !ContestRules.REWARDED.equals(c.getStatus()))
                    .distinct()
                    .forEach(c -> {
                        String st = ContestRules.status(c, now);
                        if (List.of(ContestRules.UPCOMING, ContestRules.ONGOING, ContestRules.PENDING_REWARD).contains(st)) {
                            affected.add(new AffectedContest(c.getContestId(), c.getTitle(), st));
                        }
                    });
        }

        return new StatusUpdateResponse(id, req.isActive(), affected);
    }

    public void delete(Long id) {
        Discount d = discountRepository.findById(id)
                .filter(x -> x.getDeletedAt() == null)
                .orElseThrow(() -> ContestRules.error(ResponseCode.RESOURCE_NOT_FOUND, "DISCOUNT_NOT_FOUND", "Discount not found"));

        boolean inUse = contestRewardRepository.findAll().stream()
                .anyMatch(cr -> cr.getDiscount() != null && cr.getDiscount().getDiscountId().equals(id)
                        && cr.getContest().getDeletedAt() == null
                        && !ContestRules.CANCELLED.equals(cr.getContest().getStatus())
                        && !ContestRules.REWARDED.equals(cr.getContest().getStatus()));
        if (inUse) {
            throw ContestRules.error(ResponseCode.CONFLICT, "DISCOUNT_IN_USE", "Discount is currently in use by active contests");
        }

        boolean hasAssignments = userDiscountRepository.findAll().stream()
                .anyMatch(ud -> ud.getDiscount().getDiscountId().equals(id));
        if (hasAssignments) {
            throw ContestRules.error(ResponseCode.CONFLICT, "DISCOUNT_HAS_ASSIGNMENTS", "Discount has existing assignments; please deactivate instead");
        }

        d.setDeletedAt(Instant.now());
        discountRepository.save(d);
    }

    @Transactional(readOnly = true)
    public Page<AssignmentItem> assignments(Long id, Boolean isUsed, String keyword, int page, int size) {
        discountRepository.findById(id).filter(x -> x.getDeletedAt() == null)
                .orElseThrow(() -> ContestRules.error(ResponseCode.RESOURCE_NOT_FOUND, "DISCOUNT_NOT_FOUND", "Discount not found"));

        String kw = (keyword != null && !keyword.isBlank()) ? keyword.trim().toLowerCase() : null;
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "assignedAt"));

        List<UserDiscount> all = userDiscountRepository.findAll();
        List<AssignmentItem> filtered = new ArrayList<>();
        for (UserDiscount ud : all) {
            if (!ud.getDiscount().getDiscountId().equals(id)) continue;
            if (isUsed != null && !isUsed.equals(ud.getIsUsed())) continue;
            var u = ud.getUser();
            if (kw != null) {
                boolean matchName = u.getFullName() != null && u.getFullName().toLowerCase().contains(kw);
                boolean matchEmail = u.getEmail() != null && u.getEmail().toLowerCase().contains(kw);
                if (!matchName && !matchEmail) continue;
            }
            SourceRef source = ud.getSourceType() != null ? new SourceRef(ud.getSourceType(), ud.getSourceId(), null) : null;
            filtered.add(new AssignmentItem(
                    ud.getUserDiscountId(),
                    new UserRef(u.getUserId(), u.getFullName(), u.getEmail()),
                    ud.getIsUsed(),
                    ud.getAssignedAt(),
                    ud.getUsedAt(),
                    source
            ));
        }

        int start = (int) pageable.getOffset();
        int end = Math.min((start + pageable.getPageSize()), filtered.size());
        List<AssignmentItem> pageContent = start > filtered.size() ? List.of() : filtered.subList(start, end);

        return new org.springframework.data.domain.PageImpl<>(pageContent, pageable, filtered.size());
    }

    private void validateRequest(DiscountWriteRequest req, Discount existing) {
        if ("PERCENT".equalsIgnoreCase(req.discountType())) {
            if (req.value().compareTo(BigDecimal.ONE) < 0 || req.value().compareTo(BigDecimal.valueOf(100)) > 0) {
                throw ContestRules.invalid("value", "PERCENT discount value must be between 1 and 100");
            }
        } else if ("FIXED_AMOUNT".equalsIgnoreCase(req.discountType())) {
            if (req.value().compareTo(BigDecimal.ZERO) <= 0) {
                throw ContestRules.invalid("value", "FIXED_AMOUNT discount value must be greater than 0");
            }
        } else {
            throw ContestRules.invalid("discountType", "discountType must be PERCENT or FIXED_AMOUNT");
        }

        if (req.startAt() != null && req.expiredAt() != null && !req.expiredAt().isAfter(req.startAt())) {
            throw ContestRules.invalid("expiredAt", "expiredAt must be after startAt");
        }
    }
}
