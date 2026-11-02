package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;

@Entity
@Table(name = "review_logs")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ReviewLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "log_id")
    private Long logId;

    @Column(name = "target_type", nullable = false, length = 30)
    private String targetType; // QUESTION_CONTRIBUTION | DECK

    @Column(name = "target_id", nullable = false)
    private Long targetId;

    @Column(name = "reviewer_id", nullable = false)
    private Long reviewerId;

    @Column(name = "decision", nullable = false, length = 20)
    private String decision; // APPROVED | REJECTED

    @Column(name = "note", columnDefinition = "TEXT")
    private String note;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
