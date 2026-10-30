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
import java.util.List;
import java.util.Optional;

@Repository
public interface DeckRepository extends JpaRepository<Deck, Long> {
    @EntityGraph(attributePaths = {"course", "user", "module"})
    @Query("SELECT d FROM Deck d LEFT JOIN d.course c WHERE (:managerId IS NULL " +
            "OR (c IS NULL AND d.user.userId = :managerId) " +
            "OR c.manager.userId = :managerId " +
            "OR EXISTS (SELECT cm.courseManagerId FROM CourseManager cm WHERE cm.course = c AND cm.user.userId = :managerId)) " +
            "AND (:courseId IS NULL OR c.courseId = :courseId) " +
            "AND (:isPublic IS NULL OR d.isPublic = :isPublic) AND LOWER(d.title) LIKE :search ESCAPE '!'")
    Page<Deck> findManagedDecks(@Param("managerId") Long managerId, @Param("courseId") Long courseId,
                               @Param("isPublic") Boolean isPublic, @Param("search") String search, Pageable pageable);

    /** FC-13 MINE: every deck the caller owns, newest first. mode "" = any. */
    @EntityGraph(attributePaths = {"course", "user"})
    @Query(value = "SELECT d FROM Deck d WHERE d.user.userId = :userId AND (:mode = '' OR d.mode = :mode) " +
            "AND LOWER(d.title) LIKE :search ESCAPE '!' ORDER BY d.createdAt DESC, d.deckId DESC",
            countQuery = "SELECT COUNT(d) FROM Deck d WHERE d.user.userId = :userId AND (:mode = '' OR d.mode = :mode) " +
            "AND LOWER(d.title) LIKE :search ESCAPE '!'")
    Page<Deck> findOwnedDecks(@Param("userId") Long userId, @Param("mode") String mode, @Param("search") String search,
                              Pageable pageable);

    /**
     * FC-13 COURSE: decks of the courses the caller is ACTIVE-enrolled in - manager decks plus other students'
     * PUBLIC decks, never the caller's own. courseId null = every enrolled course; mode "" = any.
     */
    @EntityGraph(attributePaths = {"course", "user"})
    @Query(value = "SELECT d FROM Deck d JOIN d.course c WHERE " + COURSE_DECKS + " ORDER BY c.title, d.title, d.deckId",
            countQuery = "SELECT COUNT(d) FROM Deck d JOIN d.course c WHERE " + COURSE_DECKS)
    Page<Deck> findEnrolledCourseDecks(@Param("userId") Long userId, @Param("courseId") Long courseId, @Param("mode") String mode,
                                       @Param("search") String search, Pageable pageable);

    String COURSE_DECKS = "EXISTS (SELECT e.enrollmentId FROM Enrollment e WHERE e.course = c AND e.user.userId = :userId " +
            "AND e.status = 'ACTIVE') AND d.user.userId <> :userId " +
            "AND (d.user.roleName <> 'STUDENT' OR d.visibility = 'PUBLIC') " +
            "AND (:courseId IS NULL OR c.courseId = :courseId) AND (:mode = '' OR d.mode = :mode) " +
            "AND LOWER(d.title) LIKE :search ESCAPE '!'";

    @EntityGraph(attributePaths = {"course", "user", "module"})
    @Query("SELECT d FROM Deck d WHERE d.deckId = :id")
    Optional<Deck> findDetail(@Param("id") Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT d FROM Deck d WHERE d.deckId = :id")
    Optional<Deck> findForUpdate(@Param("id") Long id);

    @Query("SELECT COUNT(d) FROM Deck d WHERE d.course.courseId = :courseId " +
            "AND LOWER(d.title) = LOWER(:title) AND d.deckId <> :excludeId")
    long countByCourseAndTitle(@Param("courseId") Long courseId, @Param("title") String title,
                               @Param("excludeId") Long excludeId);

    @Query("SELECT COUNT(d) FROM Deck d WHERE d.user.userId = :userId AND d.course IS NULL " +
            "AND LOWER(d.title) = LOWER(:title) AND d.deckId <> :excludeId")
    long countByOwnerWithoutCourseAndTitle(@Param("userId") Long userId, @Param("title") String title,
                                           @Param("excludeId") Long excludeId);

    @Query("SELECT new com.examprep.dto.student.DeckDto(" +
            "d.deckId, d.title, d.description, d.isPublic, " +
            "(SELECT COUNT(f) FROM Flashcard f WHERE f.deck = d), " +
            "(SELECT COUNT(p) FROM UserCardProgress p JOIN p.card f WHERE f.deck = d AND p.user.userId = :userId AND p.status = 'KNOWN'), " +
            "(SELECT COUNT(p) FROM UserCardProgress p JOIN p.card f WHERE f.deck = d AND p.user.userId = :userId AND p.isStarred = true)) " +
            "FROM Deck d WHERE d.course.courseId = :courseId " +
            // Students' own decks attached to the course stay private (FC-01, spec 9.6).
            "AND (d.user.roleName <> 'STUDENT' OR d.user.userId = :userId OR d.visibility = 'PUBLIC')")
    List<com.examprep.dto.student.DeckDto> findCourseDecksWithStats(@Param("courseId") Long courseId, @Param("userId") Long userId);

    /** [moduleId, deck count] of the course decks this user can see (same rule as above) — CL-02 module summary. */
    @Query("SELECT new com.examprep.dto.IdCount(d.module.moduleId, COUNT(d)) " +
            "FROM Deck d WHERE d.course.courseId = :courseId AND d.module IS NOT NULL " +
            "AND (d.user.roleName <> 'STUDENT' OR d.user.userId = :userId OR d.visibility = 'PUBLIC') " +
            "GROUP BY d.module.moduleId")
    List<com.examprep.dto.IdCount> countCourseDecksByModule(@Param("courseId") Long courseId, @Param("userId") Long userId);
}

