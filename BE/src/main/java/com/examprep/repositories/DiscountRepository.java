package com.examprep.repositories;

import com.examprep.entities.Discount;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
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
public interface DiscountRepository extends JpaRepository<Discount, Long> {
    Optional<Discount> findByCodeIgnoreCaseAndDeletedAtIsNull(String code);

    /** Atomic counter: concurrent payments never lose a usage. */
    @Modifying
    @Query("update Discount d set d.usedCount = d.usedCount + 1 where d.discountId = :discountId")
    int incrementUsedCount(@Param("discountId") Long discountId);

    /** Contest API 12: active, not deleted, not expired, usable for courses, remaining (section 6.2) above zero. */
    @Query("SELECT d FROM Discount d WHERE d.isActive = true AND d.deletedAt IS NULL AND (d.expiresAt IS NULL OR d.expiresAt > :now) " +
            "AND d.appliesTo IN ('COURSE', 'ALL') " +
            "AND d.usageLimit - d.usedCount - (SELECT COUNT(ud) FROM UserDiscount ud WHERE ud.discount = d AND ud.isUsed = false) > 0 " +
            "AND (LOWER(d.code) LIKE :keyword ESCAPE '!' OR LOWER(COALESCE(d.name, '')) LIKE :keyword ESCAPE '!') ORDER BY d.discountId DESC")
    Page<Discount> findContestPrizes(@Param("now") Instant now, @Param("keyword") String keyword, Pageable pageable);

    /** Locks discounts in id order so concurrent reward payments never deadlock (section 6.4 step 5). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT d FROM Discount d WHERE d.discountId IN :ids ORDER BY d.discountId")
    List<Discount> lockAll(@Param("ids") Collection<Long> ids);
}
