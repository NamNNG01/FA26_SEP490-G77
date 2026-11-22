package com.examprep.repositories;

import com.examprep.entities.Deck;
import com.examprep.dto.IdCount;
import com.examprep.dto.student.DeckDto;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface DeckRepository extends JpaRepository<Deck, Long> {
    boolean existsByModuleModuleId(Long moduleId);

    boolean existsByCourseCourseIdOrModuleCourseCourseId(Long courseId, Long moduleCourseId);
    @Query("""
        SELECT new com.examprep.dto.IdCount(d.module.moduleId, COUNT(d)) FROM Deck d
        WHERE d.module.moduleId IN :ids
          AND d.user.roleName <> 'STUDENT'
        GROUP BY d.module.moduleId
        """)
    List<IdCount> countManagedByModules(@Param("ids") List<Long> ids);

    @EntityGraph(attributePaths = {"course", "user", "module"})
    @Query("SELECT d FROM Deck d LEFT JOIN d.course c WHERE (:managerId IS NULL " +
            "OR (c IS NULL AND d.user.userId = :managerId) " +
            "OR c.manager.userId = :managerId " +
            "OR EXISTS (SELECT cm.courseManagerId FROM CourseManager cm WHERE cm.course = c AND cm.user.userId = :managerId)) " +
            "AND (:courseId IS NULL OR c.courseId = :courseId) " +
            "AND (:moduleId IS NULL OR d.module.moduleId = :moduleId) " +
            "AND (:isPublic IS NULL OR d.isPublic = :isPublic) AND LOWER(d.title) LIKE :search ESCAPE '!'")
    Page<Deck> findManagedDecks(@Param("managerId") Long managerId, @Param("courseId") Long courseId,
                               @Param("moduleId") Long moduleId, @Param("isPublic") Boolean isPublic,
                               @Param("search") String search, Pageable pageable);

    @EntityGraph(attributePaths = {"course", "user", "module"})
    @Query(value = "SELECT d FROM Deck d JOIN d.course c WHERE d.course IS NOT NULL AND d.submittedAt IS NOT NULL AND d.user.roleName = 'STUDENT' " +
            "AND (:filterCourses = false OR c.courseId IN :myCourseIds) " +
            "AND (:moduleId IS NULL OR d.module.moduleId = :moduleId) " +
            "AND (:status IS NULL OR d.reviewStatus = :status) " +
            "AND (:contributorId IS NULL OR d.user.userId = :contributorId) " +
            "AND (:keyword IS NULL OR LOWER(d.title) LIKE :keyword ESCAPE '!' OR LOWER(d.description) LIKE :keyword ESCAPE '!') " +
            "AND (cast(:submittedFrom as timestamp) IS NULL OR d.submittedAt >= :submittedFrom) " +
            "AND (cast(:submittedTo as timestamp) IS NULL OR d.submittedAt < :submittedTo)",
           countQuery = "SELECT COUNT(d) FROM Deck d JOIN d.course c WHERE d.course IS NOT NULL AND d.submittedAt IS NOT NULL AND d.user.roleName = 'STUDENT' " +
            "AND (:filterCourses = false OR c.courseId IN :myCourseIds) " +
            "AND (:moduleId IS NULL OR d.module.moduleId = :moduleId) " +
            "AND (:status IS NULL OR d.reviewStatus = :status) " +
            "AND (:contributorId IS NULL OR d.user.userId = :contributorId) " +
            "AND (:keyword IS NULL OR LOWER(d.title) LIKE :keyword ESCAPE '!' OR LOWER(d.description) LIKE :keyword ESCAPE '!') " +
            "AND (cast(:submittedFrom as timestamp) IS NULL OR d.submittedAt >= :submittedFrom) " +
            "AND (cast(:submittedTo as timestamp) IS NULL OR d.submittedAt < :submittedTo)")
    Page<Deck> findManagedReviewDecks(
            @Param("filterCourses") boolean filterCourses,
            @Param("myCourseIds") List<Long> myCourseIds,
            @Param("moduleId") Long moduleId,
            @Param("status") String status,
            @Param("contributorId") Long contributorId,
            @Param("keyword") String keyword,
            @Param("submittedFrom") Instant submittedFrom,
            @Param("submittedTo") Instant submittedTo,
            Pageable pageable
    );

    default Page<Deck> findManagedReviewDecks(
            List<Long> myCourseIds,
            Long moduleId,
            String status,
            Long contributorId,
            String keyword,
            Instant submittedFrom,
            Instant submittedTo,
            Pageable pageable
    ) {
        boolean filterCourses = myCourseIds != null;
        List<Long> safeCourseIds = (myCourseIds == null || myCourseIds.isEmpty()) ? List.of(-1L) : myCourseIds;
        return findManagedReviewDecks(filterCourses, safeCourseIds, moduleId, status, contributorId, keyword, submittedFrom, submittedTo, pageable);
    }

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
            "AND d.user.roleName <> 'STUDENT' " +
            "AND (:courseId IS NULL OR c.courseId = :courseId) AND (:mode = '' OR d.mode = :mode) " +
            "AND LOWER(d.title) LIKE :search ESCAPE '!'";

    @EntityGraph(attributePaths = {"course", "user"})
    @Query(value = "SELECT d FROM Deck d LEFT JOIN d.course c WHERE d.user.roleName = 'STUDENT' " +
            "AND d.visibility = 'PUBLIC' AND d.reviewStatus = 'APPROVED' " +
            "AND (:mode = '' OR d.mode = :mode) " +
            "AND LOWER(d.title) LIKE :search ESCAPE '!' " +
            "ORDER BY d.submittedAt DESC, d.deckId DESC",
            countQuery = "SELECT COUNT(d) FROM Deck d WHERE d.user.roleName = 'STUDENT' " +
            "AND d.visibility = 'PUBLIC' AND d.reviewStatus = 'APPROVED' " +
            "AND (:mode = '' OR d.mode = :mode) " +
            "AND LOWER(d.title) LIKE :search ESCAPE '!'")
    Page<Deck> findCommunityDecks(@Param("mode") String mode, @Param("search") String search, Pageable pageable);

    @EntityGraph(attributePaths = {"course", "user"})
    @Query(value = "SELECT d FROM Deck d LEFT JOIN d.course c WHERE d.user.roleName = 'STUDENT' " +
            "AND (:visibility = '' OR d.visibility = :visibility) " +
            "AND (:reviewStatus = '' OR d.reviewStatus = :reviewStatus) " +
            "AND LOWER(d.title) LIKE :search ESCAPE '!' " +
            "ORDER BY d.submittedAt DESC, d.deckId DESC",
            countQuery = "SELECT COUNT(d) FROM Deck d WHERE d.user.roleName = 'STUDENT' " +
            "AND (:visibility = '' OR d.visibility = :visibility) " +
            "AND (:reviewStatus = '' OR d.reviewStatus = :reviewStatus) " +
            "AND LOWER(d.title) LIKE :search ESCAPE '!'")
    Page<Deck> findAdminCommunityDecks(@Param("visibility") String visibility,
                                       @Param("reviewStatus") String reviewStatus,
                                       @Param("search") String search, Pageable pageable);

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
            "(SELECT COUNT(p) FROM UserCardProgress p JOIN p.card f WHERE f.deck = d AND p.user.userId = :userId AND p.isStarred = true), " +
            "d.module.moduleId) " +
            "FROM Deck d LEFT JOIN d.module m WHERE d.course.courseId = :courseId " +
            "AND (m IS NULL OR m.status <> 'HIDDEN') " +
            // Official course decks (managers) and the viewer's own personal decks attached to the course.
            "AND (d.user.roleName <> 'STUDENT' OR d.user.userId = :userId)")
    List<com.examprep.dto.student.DeckDto> findCourseDecksWithStats(@Param("courseId") Long courseId, @Param("userId") Long userId);

    @Query("SELECT new com.examprep.dto.student.DeckDto(" +
            "d.deckId, d.title, d.description, d.isPublic, " +
            "(SELECT COUNT(f) FROM Flashcard f WHERE f.deck = d), " +
            "(SELECT COUNT(p) FROM UserCardProgress p JOIN p.card f WHERE f.deck = d AND p.user.userId = :userId AND p.status = 'KNOWN'), " +
            "(SELECT COUNT(p) FROM UserCardProgress p JOIN p.card f WHERE f.deck = d AND p.user.userId = :userId AND p.isStarred = true), " +
            "d.module.moduleId) " +
            "FROM Deck d LEFT JOIN d.module m " +
            "WHERE d.course.courseId = :courseId " +
            "AND ((:moduleId IS NULL AND d.module IS NULL) OR (m.moduleId = :moduleId)) " +
            // Official course decks (managers) and the viewer's own decks attached to the module/course.
            "AND (d.user.roleName <> 'STUDENT' OR d.user.userId = :userId) " +
            "ORDER BY d.title ASC, d.deckId ASC")
    List<DeckDto> findDecksByModuleOrGeneral(
            @Param("courseId") Long courseId,
            @Param("moduleId") Long moduleId,
            @Param("userId") Long userId
    );

    /** [moduleId, deck count] of the course decks this user can see (same rule as above) — CL-02 module summary. */
    @Query("SELECT new com.examprep.dto.IdCount(d.module.moduleId, COUNT(d)) " +
            "FROM Deck d WHERE d.course.courseId = :courseId AND d.module IS NOT NULL " +
            "AND (d.user.roleName <> 'STUDENT' OR d.user.userId = :userId OR d.visibility = 'PUBLIC') " +
            "GROUP BY d.module.moduleId")
    List<com.examprep.dto.IdCount> countCourseDecksByModule(@Param("courseId") Long courseId, @Param("userId") Long userId);

    @Query("""
    SELECT d.deckId, m.moduleId,
           (SELECT COUNT(f) FROM Flashcard f WHERE f.deck = d),
           (SELECT COUNT(p) FROM UserCardProgress p JOIN p.card f WHERE f.deck = d AND p.user.userId = :userId AND p.status = 'KNOWN')
    FROM Deck d LEFT JOIN d.module m
    WHERE d.course.courseId = :courseId
      AND (d.user.roleName <> 'STUDENT' OR d.user.userId = :userId OR d.visibility = 'PUBLIC')
    """)
    List<Object[]> findCourseDeckStatsWithModule(@Param("courseId") Long courseId, @Param("userId") Long userId);

    /** FC-13 BOOKMARKED: decks bookmarked by the caller, only APPROVED student decks or their own decks */
    @EntityGraph(attributePaths = {"course", "user"})
    @Query(value = "SELECT d FROM Deck d JOIN d.bookmarks db WHERE db.user.userId = :userId " +
            "AND (d.user.userId = :userId OR ((d.reviewStatus = 'APPROVED' OR d.user.roleName <> 'STUDENT') " +
            "AND (d.course IS NULL OR EXISTS (SELECT e.enrollmentId FROM Enrollment e WHERE e.course = d.course AND e.user.userId = :userId AND e.status IN ('ACTIVE', 'COMPLETED'))))) " +
            "AND (:mode = '' OR d.mode = :mode) AND LOWER(d.title) LIKE :search ESCAPE '!' " +
            "ORDER BY db.createdAt DESC, d.deckId DESC",
            countQuery = "SELECT COUNT(d) FROM Deck d JOIN d.bookmarks db WHERE db.user.userId = :userId " +
            "AND (d.user.userId = :userId OR ((d.reviewStatus = 'APPROVED' OR d.user.roleName <> 'STUDENT') " +
            "AND (d.course IS NULL OR EXISTS (SELECT e.enrollmentId FROM Enrollment e WHERE e.course = d.course AND e.user.userId = :userId AND e.status IN ('ACTIVE', 'COMPLETED'))))) " +
            "AND (:mode = '' OR d.mode = :mode) AND LOWER(d.title) LIKE :search ESCAPE '!'")
    Page<Deck> findBookmarkedDecks(@Param("userId") Long userId, @Param("mode") String mode, @Param("search") String search,
                                   Pageable pageable);
}
