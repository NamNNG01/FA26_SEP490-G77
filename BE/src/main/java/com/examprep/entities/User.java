package com.examprep.entities;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "users")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@EntityListeners(AuditingEntityListener.class)
public class User implements Serializable {

    public static final String STATUS_ACTIVE = "ACTIVE";
    public static final String STATUS_INACTIVE = "INACTIVE";

    public static final String ROLE_ADMIN = "ADMIN";
    public static final String ROLE_COURSE_MANAGER = "COURSE_MANAGER";
    public static final String ROLE_STUDENT = "STUDENT";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "user_id")
    private Long userId;

    @Builder.Default
    @Column(name = "role_name", nullable = false, length = 255)
    private String roleName = ROLE_STUDENT;

    @Column(name = "email", nullable = false, unique = true, length = 255)
    private String email;

    /**
     * NULL for an account that only ever signed in with AUTH-09 (Google).
     * Such an account cannot pass AUTH-02: BCrypt matches against an empty
     * encoded password return false.
     */
    @Column(name = "password_hash")
    private String passwordHash;

    /**
     * AUTH-09: Google's stable subject identifier ("sub"). Set on the first
     * Google sign-in and used to recognise the account afterwards.
     */
    @Column(name = "google_id", length = 255)
    private String googleId;

    @Column(name = "full_name", nullable = false, length = 100)
    private String fullName;

    @Column(name = "avatar_url", length = 512)
    private String avatarUrl;

    @Builder.Default
    @Column(name = "status", nullable = false, length = 20)
    private String status = STATUS_ACTIVE;

    @Column(name = "password_changed_at")
    private Instant passwordChangedAt;

    @Column(name = "last_login_at")
    private Instant lastLoginAt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @LastModifiedDate
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
