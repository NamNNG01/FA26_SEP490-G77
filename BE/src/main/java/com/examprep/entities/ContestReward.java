package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;

import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "contest_rewards")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ContestReward implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "reward_id")
    private Long rewardId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "contest_id", nullable = false)
    private Contest contest;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "discount_id")
    private Discount discount;

    @Column(name = "rank_position", nullable = false)
    private Integer rankPosition;

    @Column(name = "name", length = 255)
    private String name;

    @Builder.Default
    @Column(name = "reward_type", nullable = false, length = 30)
    private String rewardType = "DISCOUNT";

    @Column(name = "points")
    private Integer points;

    @Builder.Default
    @Column(name = "claimed", nullable = false)
    private Boolean claimed = false;

    @Column(name = "claimed_at")
    private Instant claimedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "claimed_by")
    private User claimedBy;
}
