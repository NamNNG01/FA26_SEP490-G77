package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;

import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "manager_explanation_jobs")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ManagerExplanationJob implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "job_id")
    private Long jobId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Builder.Default
    @Column(name = "overwrite", nullable = false)
    private boolean overwrite = false;

    @Builder.Default
    @Column(name = "status", nullable = false, length = 20)
    private String status = "PENDING";

    @Builder.Default
    @Column(name = "total_count", nullable = false)
    private Integer totalCount = 0;

    @Builder.Default
    @Column(name = "succeeded_count", nullable = false)
    private Integer succeededCount = 0;

    @Builder.Default
    @Column(name = "failed_count", nullable = false)
    private Integer failedCount = 0;

    @Column(name = "error_message")
    private String errorMessage;

    @Column(name = "ai_usage_log_id")
    private Long aiUsageLogId;

    @Builder.Default
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Builder.Default
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Column(name = "completed_at")
    private Instant completedAt;
}
