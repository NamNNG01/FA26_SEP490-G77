package com.examprep.repositories;

import com.examprep.entities.UserDiscount;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface UserDiscountRepository extends JpaRepository<UserDiscount, Long> {
    boolean existsByUserUserIdAndDiscountDiscountIdAndIsUsedTrue(Long userId, Long discountId);

    Optional<UserDiscount> findFirstByUserUserIdAndDiscountDiscountIdAndIsUsedFalse(Long userId, Long discountId);

    /** [discountId, assigned-but-unused count]: the "held" part of remaining (section 6.2). */
    @Query("SELECT ud.discount.discountId, COUNT(ud) FROM UserDiscount ud WHERE ud.isUsed = false AND ud.discount.discountId IN :ids " +
            "GROUP BY ud.discount.discountId")
    List<Object[]> countUnused(@Param("ids") Collection<Long> ids);
}
