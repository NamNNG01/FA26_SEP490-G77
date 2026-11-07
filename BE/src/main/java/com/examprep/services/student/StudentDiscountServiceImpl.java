package com.examprep.services.student;

import com.examprep.dto.student.StudentDiscountDtos;
import com.examprep.entities.Contest;
import com.examprep.entities.Discount;
import com.examprep.entities.UserDiscount;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.ContestRepository;
import com.examprep.repositories.UserDiscountRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;

@Service
@RequiredArgsConstructor
public class StudentDiscountServiceImpl implements StudentDiscountService {

    private final UserDiscountRepository userDiscountRepository;
    private final ContestRepository contestRepository;

    @Override
    @Transactional(readOnly = true)
    public Page<StudentDiscountDtos.StudentDiscountItemDto> listStudentDiscounts(Long userId, String status, String sourceType, int page, int size) {
        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "assignedAt"));
        Instant now = Instant.now();
        Page<UserDiscount> udPage = userDiscountRepository.findByUserAndFilters(userId, sourceType, status, now, pageable);

        return udPage.map(ud -> mapToItemDto(ud, now));
    }

    @Override
    @Transactional(readOnly = true)
    public StudentDiscountDtos.StudentDiscountDetailDto getStudentDiscountDetail(Long userId, Long userDiscountId) {
        Instant now = Instant.now();
        UserDiscount ud = userDiscountRepository.findById(userDiscountId)
                .orElseGet(() -> userDiscountRepository.findFirstByUserUserIdAndDiscountDiscountIdAndIsUsedFalse(userId, userDiscountId)
                        .orElseThrow(() -> new ResourceNotFoundException("Discount not found")));

        if (!ud.getUser().getUserId().equals(userId)) {
            throw new ResourceNotFoundException("Discount not found");
        }

        StudentDiscountDtos.StudentDiscountItemDto item = mapToItemDto(ud, now);
        StudentDiscountDtos.ContestSourceInfo contestInfo = null;

        if ("CONTEST".equals(ud.getSourceType()) && ud.getSourceId() != null) {
            Contest c = contestRepository.findById(ud.getSourceId()).orElse(null);
            if (c != null) {
                contestInfo = new StudentDiscountDtos.ContestSourceInfo(
                        c.getContestId(),
                        c.getTitle(),
                        c.getStartTime(),
                        c.getEndTime()
                );
            }
        }

        return StudentDiscountDtos.StudentDiscountDetailDto.builder()
                .userDiscountId(item.getUserDiscountId())
                .discountId(item.getDiscountId())
                .code(item.getCode())
                .name(item.getName())
                .description(item.getDescription())
                .discountType(item.getDiscountType())
                .value(item.getValue())
                .startAt(item.getStartAt())
                .expiresAt(item.getExpiresAt())
                .appliesTo(item.getAppliesTo())
                .minOrderAmount(item.getMinOrderAmount())
                .maxDiscountAmount(item.getMaxDiscountAmount())
                .status(item.getStatus())
                .assignedAt(item.getAssignedAt())
                .usedAt(item.getUsedAt())
                .sourceType(item.getSourceType())
                .sourceId(item.getSourceId())
                .contestInfo(contestInfo)
                .build();
    }

    private StudentDiscountDtos.StudentDiscountItemDto mapToItemDto(UserDiscount ud, Instant now) {
        Discount d = ud.getDiscount();
        String computedStatus = computeStatus(ud, d, now);
        BigDecimal val = d.getValue() != null ? d.getValue() : d.getPercent();

        return StudentDiscountDtos.StudentDiscountItemDto.builder()
                .userDiscountId(ud.getUserDiscountId())
                .discountId(d.getDiscountId())
                .code(d.getCode())
                .name(d.getName())
                .description(d.getDescription())
                .discountType(d.getDiscountType())
                .value(val)
                .startAt(d.getStartAt())
                .expiresAt(d.getExpiresAt())
                .appliesTo(d.getAppliesTo())
                .minOrderAmount(d.getMinOrderAmount())
                .maxDiscountAmount(d.getMaxDiscountAmount())
                .status(computedStatus)
                .assignedAt(ud.getAssignedAt())
                .usedAt(ud.getUsedAt())
                .sourceType(ud.getSourceType())
                .sourceId(ud.getSourceId())
                .build();
    }

    private String computeStatus(UserDiscount ud, Discount d, Instant now) {
        if (Boolean.TRUE.equals(ud.getIsUsed())) {
            return "USED";
        }
        if (d.getDeletedAt() != null || !Boolean.TRUE.equals(d.getIsActive())) {
            return "REVOKED";
        }
        if (d.getExpiresAt() != null && !d.getExpiresAt().isAfter(now)) {
            return "EXPIRED";
        }
        return "AVAILABLE";
    }
}
