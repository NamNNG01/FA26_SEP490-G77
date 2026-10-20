package com.examprep.repositories;

import com.examprep.entities.Deck;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public interface DeckRepository extends JpaRepository<Deck, Long> {
    @EntityGraph(attributePaths = {"course", "user"})
    @Query("SELECT d FROM Deck d LEFT JOIN d.course c WHERE (:managerId IS NULL " +
            "OR (c IS NULL AND d.user.userId = :managerId) " +
            "OR c.manager.userId = :managerId " +
            "OR EXISTS (SELECT cm.courseManagerId FROM CourseManager cm WHERE cm.course = c AND cm.user.userId = :managerId)) " +
            "AND (:courseId IS NULL OR c.courseId = :courseId) " +
            "AND (:isPublic IS NULL OR d.isPublic = :isPublic) AND LOWER(d.title) LIKE :search ESCAPE '!'")
    Page<Deck> findManagedDecks(@Param("managerId") Long managerId, @Param("courseId") Long courseId,
                               @Param("isPublic") Boolean isPublic, @Param("search") String search, Pageable pageable);

    @EntityGraph(attributePaths = {"course", "user"})
    @Query("SELECT d FROM Deck d WHERE d.deckId = :id")
    Optional<Deck> findDetail(@Param("id") Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT d FROM Deck d WHERE d.deckId = :id")
    Optional<Deck> findForUpdate(@Param("id") Long id);
}

