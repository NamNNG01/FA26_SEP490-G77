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

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface PaymentRepository extends JpaRepository<Payment, Long> {
    Optional<Payment> findByOrderCodeAndUserUserId(String orderCode, Long userId);
    Optional<Payment> findByOrderCode(String orderCode);
    Optional<Payment> findFirstByUserUserIdAndTypeAndRefIdOrderByPaymentIdDesc(Long userId, String type, Long refId);
    interface StatusRow {
        Long getPayosOrderCode();
        String getStatus();
        Instant getPaidAt();
        Instant getExpiresAt();
    }

    @Query("""
            select p.payosOrderCode as payosOrderCode, p.status as status,
                   p.paidAt as paidAt, p.expiresAt as expiresAt
            from Payment p where p.orderCode = :orderCode and p.user.userId = :userId
            """)
    Optional<StatusRow> findStatus(@Param("orderCode") String orderCode, @Param("userId") Long userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Payment p where p.payosOrderCode = :payosOrderCode")
    Optional<Payment> lockByPayosOrderCode(@Param("payosOrderCode") Long payosOrderCode);

    /** Live checkouts of one target, newest first; the discount is read for the reuse check. */
    @EntityGraph(attributePaths = "discount")
    List<Payment> findByUserUserIdAndTypeAndRefIdAndStatusOrderByPaymentIdDesc(
            Long userId, String type, Long refId, String status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Payment p where p.orderCode = :orderCode")
    Optional<Payment> lockByOrderCode(@Param("orderCode") String orderCode);

    boolean existsByUserUserIdAndDiscountDiscountIdAndStatus(Long userId, Long discountId, String status);

    long countByUserUserIdAndDiscountDiscountIdAndStatus(Long userId, Long discountId, String status);

    @Query("SELECT p.discount.discountId, COUNT(p) FROM Payment p "
            + "WHERE p.discount.discountId IN :ids AND p.status = 'PENDING' AND p.discountReserved = true "
            + "GROUP BY p.discount.discountId")
    List<Object[]> countReservedPendingByDiscountIds(@Param("ids") java.util.Collection<Long> ids);

    /** Unpaid checkouts past their deadline, whether or not they reserved a discount. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Payment p where p.status = :status and p.expiresAt <= :now order by p.paymentId")
    List<Payment> lockExpired(@Param("status") String status, @Param("now") Instant now);

    Page<Payment> findByUserUserIdOrderByCreatedAtDesc(Long userId, Pageable pageable);

    /**
     * DASH-04: every successful payment paid inside the window, as
     * {@code (paidAt, type, refId, amount, title)}. The report buckets these rows by calendar day
     * itself, which keeps the query portable across PostgreSQL and the H2 test profile; {@code title}
     * is the target's name at checkout and backs the plan/course labels up.
     */
    @Query("SELECT p.paidAt, p.type, p.refId, p.amount, p.title FROM Payment p "
            + "WHERE p.status = 'SUCCEEDED' AND p.paidAt IS NOT NULL "
            + "AND p.paidAt >= :from AND p.paidAt < :to")
    List<Object[]> findPaidBetween(@Param("from") Instant from, @Param("to") Instant to);

    /** DASH-04: lifetime course revenue per course, as {@code (courseId, SUM(amount))}. */
    @Query("SELECT p.refId, SUM(p.amount) FROM Payment p "
            + "WHERE p.type = 'COURSE' AND p.status = 'SUCCEEDED' AND p.refId IS NOT NULL "
            + "GROUP BY p.refId")
    List<Object[]> sumCourseRevenueByCourse();
}
