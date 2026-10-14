package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;

import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "contests")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Contest implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "contest_id")
    private Long contestId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "exam_id", nullable = false)
    private Exam exam;

    @Column(name = "title", nullable = false, length = 255)
    private String title;

    @Column(name = "reward_config", columnDefinition = "JSON")
    private String rewardConfig;

    @Column(name = "start_time", nullable = false)
    private Instant startTime;

    @Column(name = "status", nullable = false, length = 20)
    private String status;
}
