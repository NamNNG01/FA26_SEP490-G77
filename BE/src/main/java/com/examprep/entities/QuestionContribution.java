package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "question_contributions")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class QuestionContribution implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "contribution_id")
    private Long contributionId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "course_id", nullable = false)
    private Long courseId;

    @Builder.Default
    @Column(name = "type", nullable = false, length = 30)
    private String type = "QUESTION"; // QUESTION, DOCUMENT, TIP

    @Column(name = "title", length = 500)
    private String title;

    @Column(name = "content", nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(name = "module_id")
    private Long moduleId;

    @Column(name = "group_id")
    private Long groupId;

    @Column(name = "question_type", length = 50)
    private String questionType;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "options_json", columnDefinition = "jsonb")
    private String optionsJson;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "answer_key_json", columnDefinition = "jsonb")
    private String answerKeyJson;

    @Column(name = "explanation", columnDefinition = "TEXT")
    private String explanation;

    @Column(name = "difficulty", length = 20)
    private String difficulty;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "category_ids", columnDefinition = "jsonb")
    private String categoryIds;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "essay_grading_rubric_json", columnDefinition = "jsonb")
    private String essayGradingRubricJson;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "question_metadata_json", columnDefinition = "jsonb")
    private String questionMetadataJson;

    @Column(name = "file_url", length = 512)
    private String fileUrl;

    @Column(name = "file_name", length = 255)
    private String fileName;

    @Column(name = "file_size_kb")
    private Integer fileSizeKb;

    @Column(name = "source_reference", length = 500)
    private String sourceReference;

    @Builder.Default
    @Column(name = "status", nullable = false, length = 20)
    private String status = "PENDING"; // PENDING, ACCEPTED, REJECTED

    @Column(name = "review_note", columnDefinition = "TEXT")
    private String reviewNote;

    @Column(name = "reviewed_by")
    private Long reviewedBy;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @Column(name = "accepted_question_id")
    private Long acceptedQuestionId;

    @Builder.Default
    @Column(name = "resubmission_count", nullable = false)
    private Integer resubmissionCount = 0;

    @CreationTimestamp
    @Column(name = "submitted_at", nullable = false, updatable = false)
    private Instant submittedAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
