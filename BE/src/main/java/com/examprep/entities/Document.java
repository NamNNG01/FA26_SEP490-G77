package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.BatchSize;

import java.io.Serializable;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.Set;

@Entity
@Table(name = "documents")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Document implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "doc_id")
    private Long docId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    /** Courses this material is attached to; one file can be used by several courses. */
    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(name = "document_courses",
            joinColumns = @JoinColumn(name = "doc_id"),
            inverseJoinColumns = @JoinColumn(name = "course_id"))
    @OrderBy("courseId ASC")
    @BatchSize(size = 100)
    @Builder.Default
    private Set<Course> courses = new LinkedHashSet<>();

    @Column(name = "generation_type", nullable = false, length = 50)
    private String generationType;

    @Column(name = "extracted_content", nullable = false)
    private String extractedContent;

    @Column(name = "status", nullable = false, length = 20)
    private String status;

    @Column(name = "title", length = 255)
    private String title;

    @Column(name = "file_name", length = 255)
    private String fileName;

    @Column(name = "file_url", length = 512)
    private String fileUrl;

    @Column(name = "file_size_kb")
    private Integer fileSizeKb;

    @Column(name = "page_count")
    private Integer pageCount;

    /** Hex SHA-256 of the file content; unique per owner so a re-upload reuses the material. */
    @Column(name = "sha256", length = 64)
    private String sha256;

    /** Provider key of the stored file, used to remove it when the material is deleted. */
    @Column(name = "storage_key", length = 512)
    private String storageKey;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
