package com.examprep.repositories;

import com.examprep.dto.RecentUser;
import com.examprep.entities.User;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmail(String email);
    boolean existsByEmail(String email);

    @Query("SELECT COUNT(u) FROM User u WHERE u.role.roleCode = :roleCode")
    long countByRoleCode(@Param("roleCode") String roleCode);

    @Query("SELECT new com.examprep.dto.RecentUser(u.userId, u.fullName, u.email, r.roleCode, u.createdAt) " +
            "FROM User u JOIN u.role r ORDER BY u.createdAt DESC")
    List<RecentUser> findRecentUsers(Pageable pageable);
}
