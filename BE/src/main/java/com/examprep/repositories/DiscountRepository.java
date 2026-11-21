package com.examprep.repositories;

import com.examprep.entities.Discount;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface DiscountRepository extends JpaRepository<Discount, Long>, JpaSpecificationExecutor<Discount> {
    Optional<Discount> findByCodeIgnoreCaseAndDeletedAtIsNull(String code);

    @Modifying
    @Query("update Discount d set d.usedCount = case when d.usedCount < d.usageLimit then d.usedCount + 1 else d.usedCount end where d.discountId = :discountId")
    int incrementUsedCount(@Param("discountId") Long discountId);

    @Modifying
    @Query("update Discount d set d.usedCount = d.usedCount + 1 "
            + "where d.discountId = :discountId and d.usedCount < d.usageLimit "
            + "and d.isActive = true and d.deletedAt is null "
            + "and (d.startAt is null or d.startAt <= :now) "
            + "and (d.expiresAt is null or d.expiresAt > :now)")
    int reserveUsage(@Param("discountId") Long discountId, @Param("now") Instant now);

    @Modifying
    @Query("update Discount d set d.usedCount = case when d.usedCount > 0 then d.usedCount - 1 else 0 end "
            + "where d.discountId = :discountId")
    int releaseUsage(@Param("discountId") Long discountId);

    @Query("SELECT d FROM Discount d WHERE d.isActive = true AND d.deletedAt IS NULL AND (d.expiresAt IS NULL OR d.expiresAt > :now) " +
            "AND d.appliesTo IN ('COURSE', 'ALL') AND d.accessType = 'CLAIM_REQUIRED' " +
            "AND d.usageLimit - d.usedCount - CASE WHEN (SELECT COUNT(ud) FROM UserDiscount ud WHERE ud.discount = d AND ud.isUsed = false) " +
            "> (SELECT COUNT(p) FROM Payment p WHERE p.discount = d AND p.status = 'PENDING' AND p.discountReserved = true) " +
            "THEN ((SELECT COUNT(ud) FROM UserDiscount ud WHERE ud.discount = d AND ud.isUsed = false) " +
            "- (SELECT COUNT(p) FROM Payment p WHERE p.discount = d AND p.status = 'PENDING' AND p.discountReserved = true)) ELSE 0L END > 0 " +
            "AND (LOWER(d.code) LIKE :keyword ESCAPE '!' OR LOWER(COALESCE(d.name, '')) LIKE :keyword ESCAPE '!') ORDER BY d.discountId DESC")
    Page<Discount> findContestPrizes(@Param("now") Instant now, @Param("keyword") String keyword, Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT d FROM Discount d WHERE d.discountId IN :ids ORDER BY d.discountId")
    List<Discount> lockAll(@Param("ids") Collection<Long> ids);
}
