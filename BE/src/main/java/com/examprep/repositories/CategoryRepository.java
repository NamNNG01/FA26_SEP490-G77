package com.examprep.repositories;

import com.examprep.entities.Category;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CategoryRepository extends JpaRepository<Category, Long> {
    boolean existsByCode(String code);

    @Query("select c from Category c order by c.sortOrder, c.name, c.categoryId")
    List<Category> findTree();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from Category c order by c.categoryId")
    List<Category> lockTree();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from Category c where c.categoryId = :id")
    Optional<Category> findForUpdate(Long id);

    @Query("select count(c) from Course c where c.categoryId = :categoryId")
    long countCourses(Long categoryId);
}

