package com.examprep.repositories;

import com.examprep.entities.CategoryAuditEvent;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CategoryAuditEventRepository extends JpaRepository<CategoryAuditEvent, Long> {}
