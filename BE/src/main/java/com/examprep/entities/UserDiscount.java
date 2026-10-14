package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;

import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "user_discounts",
        uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "discount_id"}))
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserDiscount implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "user_discount_id")
    private Long userDiscountId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "discount_id", nullable = false)
    private Discount discount;

    @Column(name = "is_used", nullable = false)
    private Boolean isUsed;

    @Column(name = "assigned_at", nullable = false, updatable = false)
    private Instant assignedAt;
}
