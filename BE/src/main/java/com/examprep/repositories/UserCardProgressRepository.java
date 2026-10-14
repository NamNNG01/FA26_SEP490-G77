package com.examprep.repositories;

import com.examprep.entities.UserCardProgress;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface UserCardProgressRepository extends JpaRepository<UserCardProgress, Long> {
}

