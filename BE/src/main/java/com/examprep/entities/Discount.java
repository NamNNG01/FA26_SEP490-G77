package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "discounts")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@EntityListeners(AuditingEntityListener.class)
public class Discount implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "discount_id")
    private Long discountId;

    @Column(name = "code", nullable = false, length = 50)
    private String code;

    @Column(name = "name", length = 255)
    private String name;

    @Column(name = "discount_type", nullable = false, length = 20)
    private String discountType;

    // Quoted because VALUE is a reserved keyword in H2/PostgreSQL; maps to column value.
    @Column(name = "\"value\"", precision = 10, scale = 2)
    private BigDecimal value;

    @Column(name = "percent", precision = 5, scale = 2)
    private BigDecimal percent;

    @Builder.Default
    @Column(name = "usage_limit", nullable = false)
    private Integer usageLimit = 1;

    @Builder.Default
    @Column(name = "used_count", nullable = false)
    private Integer usedCount = 0;

    @Builder.Default
    @Column(name = "is_active", nullable = false)
    private Boolean isActive = true;

    @Column(name = "expires_at")
    private Instant expiresAt;

    @Column(name = "start_at")
    private Instant startAt;

    @Builder.Default
    @Column(name = "applies_to", nullable = false, length = 20)
    private String appliesTo = "ALL";

    @Column(name = "min_order_amount", precision = 12, scale = 2)
    private BigDecimal minOrderAmount;

    @Column(name = "max_discount_amount", precision = 12, scale = 2)
    private BigDecimal maxDiscountAmount;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;
}
