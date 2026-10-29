package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "contest_participants",
        uniqueConstraints = @UniqueConstraint(columnNames = {"contest_id", "user_id"}))
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@EntityListeners(AuditingEntityListener.class)
public class ContestParticipant implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "participant_id")
    private Long participantId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "contest_id", nullable = false)
    private Contest contest;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "score", precision = 5, scale = 2)
    private BigDecimal score;

    @Column(name = "rank")
    private Integer rank;

    @Builder.Default
    @Column(name = "reward_claimed", nullable = false)
    private Boolean rewardClaimed = false;

    @Column(name = "attempt_id")
    private Long attemptId;

    @CreatedDate
    @Column(name = "joined_at", nullable = false, updatable = false)
    private Instant joinedAt;

    @Column(name = "finished_at")
    private Instant finishedAt;

    @Column(name = "certificate_url", length = 512)
    private String certificateUrl;

    @Column(name = "time_taken_sec")
    private Integer timeTakenSec;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reward_user_discount_id")
    private UserDiscount rewardUserDiscount;

    @Column(name = "reward_granted_at")
    private Instant rewardGrantedAt;
}
