package com.examprep.repositories;

import com.examprep.entities.Payment;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PaymentRepository extends JpaRepository<Payment, Long> {
    Optional<Payment> findByOrderCodeAndUserUserId(String orderCode, Long userId);
    Optional<Payment> findByOrderCode(String orderCode);
    Optional<Payment> findByPayosOrderCode(Long payosOrderCode);

    /** Live checkouts of one target, newest first; the discount is read for the reuse check. */
    @EntityGraph(attributePaths = "discount")
    List<Payment> findByUserUserIdAndTypeAndRefIdAndStatusOrderByPaymentIdDesc(
            Long userId, String type, Long refId, String status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Payment p where p.orderCode = :orderCode")
    Optional<Payment> lockByOrderCode(@Param("orderCode") String orderCode);

    Page<Payment> findByUserUserIdOrderByCreatedAtDesc(Long userId, Pageable pageable);
}
