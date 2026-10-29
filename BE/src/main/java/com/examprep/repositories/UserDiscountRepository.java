package com.examprep.repositories;

import com.examprep.entities.UserDiscount;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserDiscountRepository extends JpaRepository<UserDiscount, Long> {
    boolean existsByUserUserIdAndDiscountDiscountIdAndIsUsedTrue(Long userId, Long discountId);

    Optional<UserDiscount> findFirstByUserUserIdAndDiscountDiscountIdAndIsUsedFalse(Long userId, Long discountId);
}

