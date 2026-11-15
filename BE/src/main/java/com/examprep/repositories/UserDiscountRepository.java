package com.examprep.repositories;

import com.examprep.entities.UserDiscount;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import java.time.Instant;
import java.util.*;

@Repository
public interface UserDiscountRepository extends JpaRepository<UserDiscount, Long> {
    boolean existsByUserUserIdAndDiscountDiscountIdAndIsUsedTrue(Long userId, Long discountId);

    Optional<UserDiscount> findFirstByUserUserIdAndDiscountDiscountIdAndIsUsedFalse(Long userId, Long discountId);

    /** [discountId, assigned-but-unused count]: the "held" part of remaining (section 6.2). */
    @Query("SELECT ud.discount.discountId, COUNT(ud) FROM UserDiscount ud WHERE ud.isUsed = false AND ud.discount.discountId IN :ids " +
            "GROUP BY ud.discount.discountId")
    List<Object[]> countUnused(@Param("ids") Collection<Long> ids);

    Page<UserDiscount> findByUser_UserId(Long userId, Pageable pageable);

    @Query("SELECT ud FROM UserDiscount ud JOIN ud.discount d WHERE ud.user.userId = :userId " +
           "AND (:sourceType IS NULL OR ud.sourceType = :sourceType) " +
           "AND (:status IS NULL OR (" +
           "  (:status = 'USED' AND ud.isUsed = true) OR " +
           "  (:status = 'REVOKED' AND (d.deletedAt IS NOT NULL OR d.isActive = false)) OR " +
           "  (:status = 'EXPIRED' AND ud.isUsed = false AND d.expiresAt IS NOT NULL AND d.expiresAt <= :now) OR " +
           "  (:status = 'AVAILABLE' AND ud.isUsed = false AND (d.expiresAt IS NULL OR d.expiresAt > :now) AND d.deletedAt IS NULL AND d.isActive = true)" +
           "))")
    Page<UserDiscount> findByUserAndFilters(@Param("userId") Long userId,
                                            @Param("sourceType") String sourceType,
                                            @Param("status") String status,
                                            @Param("now") Instant now,
                                            Pageable pageable);

    /**
     * API 19: Find assignments for a specific discount with filtering and pagination
     * Moved filter logic to query for better performance
     */
    @Query("SELECT ud FROM UserDiscount ud JOIN ud.user u " +
           "WHERE ud.discount.discountId = :discountId " +
           "AND (:isUsed IS NULL OR ud.isUsed = :isUsed) " +
           "AND (:keyword IS NULL OR LOWER(u.fullName) LIKE CONCAT('%', LOWER(:keyword), '%') " +
           "OR LOWER(u.email) LIKE CONCAT('%', LOWER(:keyword), '%')) " +
           "ORDER BY ud.assignedAt DESC")
    Page<UserDiscount> findByDiscountIdWithFilters(@Param("discountId") Long discountId,
                                                    @Param("isUsed") Boolean isUsed,
                                                    @Param("keyword") String keyword,
                                                    Pageable pageable);
}
