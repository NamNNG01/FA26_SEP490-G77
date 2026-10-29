package com.examprep.repositories;

import com.examprep.entities.CardImport;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface CardImportRepository extends JpaRepository<CardImport, Long> {
}
