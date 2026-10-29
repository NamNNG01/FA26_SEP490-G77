package com.examprep.repositories;

import com.examprep.entities.Discount;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface DiscountRepository extends JpaRepository<Discount, Long> {
    java.util.Optional<Discount> findByCodeIgnoreCaseAndDeletedAtIsNull(String code);

    /** Atomic counter: concurrent payments never lose a usage. */
    @Modifying
    @Query("update Discount d set d.usedCount = d.usedCount + 1 where d.discountId = :discountId")
    int incrementUsedCount(@Param("discountId") Long discountId);
}

