package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;

import java.io.Serializable;
import java.time.Instant;

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

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "course_id")
    private Course course;

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

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
