package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "card_imports")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
/** FC-07 bulk import job; FC-11 polls it. */
public class CardImport implements Serializable {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "import_id")
    private Long importId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "deck_id", nullable = false)
    private Long deckId;

    /** PROCESSING, COMPLETED or FAILED. */
    @Builder.Default
    @Column(name = "status", nullable = false, length = 20)
    private String status = "PROCESSING";

    @Builder.Default
    @Column(name = "total_rows", nullable = false)
    private Integer totalRows = 0;

    @Builder.Default
    @Column(name = "success_count", nullable = false)
    private Integer successCount = 0;

    @Builder.Default
    @Column(name = "progress", nullable = false)
    private Integer progress = 0;

    /** [{row, reason}] */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "error_rows_json", columnDefinition = "jsonb")
    private String errorRowsJson;

    @Column(name = "file_name", length = 255)
    private String fileName;

    @org.hibernate.annotations.CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "completed_at")
    private Instant completedAt;
}
