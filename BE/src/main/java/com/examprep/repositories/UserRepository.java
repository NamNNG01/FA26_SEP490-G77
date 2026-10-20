package com.examprep.repositories;

import com.examprep.dto.RecentUser;
import com.examprep.entities.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmail(String email);
    boolean existsByEmail(String email);

    @Query("SELECT COUNT(u) FROM User u WHERE u.roleName = :roleName")
    long countByRoleName(@Param("roleName") String roleName);

    @Query("SELECT new com.examprep.dto.RecentUser(u.userId, u.fullName, u.email, u.roleName, u.createdAt) " +
            "FROM User u ORDER BY u.createdAt DESC")
    List<RecentUser> findRecentUsers(Pageable pageable);

    // UM-01: admin user list with optional search (already lower-cased and LIKE-escaped by the caller),
    // role and status filters. Ordering comes from the Pageable.
    @Query("SELECT u FROM User u WHERE " +
            "(:search IS NULL OR LOWER(u.fullName) LIKE :search ESCAPE '!' OR LOWER(u.email) LIKE :search ESCAPE '!') " +
            "AND (:roleName IS NULL OR u.roleName = :roleName) " +
            "AND (:status IS NULL OR u.status = :status)")
    Page<User> findUsers(@Param("search") String search, @Param("roleName") String roleName,
                         @Param("status") String status, Pageable pageable);

    // UM-01 overview statistics
    long countByStatus(String status);

    long countByCreatedAtAfter(Instant from);
}
