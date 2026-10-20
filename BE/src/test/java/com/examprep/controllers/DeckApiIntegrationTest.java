package com.examprep.controllers;

import com.examprep.entities.*;
import com.examprep.security.UserPrincipal;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class DeckApiIntegrationTest {
    private static final String BASE = "/api/v1/manager/decks";
    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper json;
    @Autowired private EntityManager em;

    private User manager, collaborator, stranger, admin, student;
    private Course course, foreignCourse;
    private Deck deck;

    @BeforeEach
    void fixtures() {
        manager = account(User.ROLE_COURSE_MANAGER);
        collaborator = account(User.ROLE_COURSE_MANAGER);
        stranger = account(User.ROLE_COURSE_MANAGER);
        admin = account(User.ROLE_ADMIN);
        student = account(User.ROLE_STUDENT);
        course = course(manager, "Managed course");
        foreignCourse = course(stranger, "Foreign course");
        em.persist(CourseManager.builder().course(course).user(collaborator).build());
        deck = deck(manager, course, "OOP deck", false);
        em.flush();
    }

    @Test
    void requiresAuthenticationAndManagerRoleForEveryOperation() throws Exception {
        mvc.perform(get(BASE)).andExpect(status().isUnauthorized());
        for (MockHttpServletRequestBuilder request : List.of(get(BASE), get(path(deck)),
                post(BASE).contentType(MediaType.APPLICATION_JSON).content(createBody(null)),
                put(path(deck)).contentType(MediaType.APPLICATION_JSON).content("{}"), delete(path(deck)))) {
            call(student, request).andExpect(status().isForbidden());
        }
    }

    @Test
    void listScopesCourseAndUnassignedOwnershipAndAdminSeesAll() throws Exception {
        deck(stranger, foreignCourse, "Foreign", true);
        deck(manager, null, "Personal", false);
        deck(stranger, null, "Private", false);
        // Creator alone must not retain access after the deck belongs to a foreign course.
        deck(manager, foreignCourse, "Transferred", false);
        call(manager, get(BASE)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(2));
        call(collaborator, get(BASE)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].deckId").value(deck.getDeckId()));
        call(admin, get(BASE)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(5));
    }

    @Test
    void listFiltersAndCountsCardsWithoutDuplicatingDecks() throws Exception {
        card(deck, "First");
        card(deck, "Second");
        deck(manager, course, "Other", true);
        call(collaborator, get(BASE).param("search", "OOP").param("courseId", course.getCourseId().toString())
                .param("isPublic", "false").param("size", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].cardCount").value(2))
                .andExpect(jsonPath("$.data.content[0].courseName").value("Managed course"))
                .andExpect(jsonPath("$.data.content[0].ownerId").value(manager.getUserId()))
                .andExpect(jsonPath("$.data.content[0].cards").doesNotExist())
                .andExpect(jsonPath("$.data.first").value(true)).andExpect(jsonPath("$.data.last").value(true));
        call(manager, get(BASE).param("search", "_")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(0));
        call(manager, get(BASE).param("page", "20")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").isEmpty());
    }

    @Test
    void createsOwnedDeckWithOptionalManagedCourseAndEmptyCards() throws Exception {
        call(collaborator, post(BASE).contentType(MediaType.APPLICATION_JSON).content(createBody(course.getCourseId())))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.data.ownerId").value(collaborator.getUserId()))
                .andExpect(jsonPath("$.data.title").value("New deck"))
                .andExpect(jsonPath("$.data.description").value("Description"))
                .andExpect(jsonPath("$.data.cardCount").value(0)).andExpect(jsonPath("$.data.cards").isEmpty());
        call(manager, post(BASE).contentType(MediaType.APPLICATION_JSON).content(createBody(null)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.data.courseId").doesNotExist());
        call(admin, post(BASE).contentType(MediaType.APPLICATION_JSON).content(createBody(foreignCourse.getCourseId())))
                .andExpect(status().isCreated());
    }

    @Test
    void createRejectsForeignMissingAndMalformedInputsWithoutWriting() throws Exception {
        long before = count("Deck");
        call(manager, post(BASE).contentType(MediaType.APPLICATION_JSON).content(createBody(foreignCourse.getCourseId())))
                .andExpect(status().isForbidden());
        call(manager, post(BASE).contentType(MediaType.APPLICATION_JSON).content(createBody(Long.MAX_VALUE)))
                .andExpect(status().isNotFound());
        for (String payload : List.of("{}", "{\"title\":\"A\"}", "{\"title\":\" \",\"isPublic\":false}",
                "{\"title\":\"\\u2003\",\"isPublic\":false}",
                json.writeValueAsString(Map.of("title", "x".repeat(256), "isPublic", false)),
                "{\"title\":\"A\",\"isPublic\":false,\"courseId\":1.5}",
                "{\"title\":\"A\",\"isPublic\":false,\"courseId\":0}")) {
            call(manager, post(BASE).contentType(MediaType.APPLICATION_JSON).content(payload))
                    .andExpect(status().isBadRequest());
        }
        assertEquals(before, count("Deck"));
    }

    @Test
    void detailsUseDeckOwnersProgressAndDefaultForUnstudiedCards() throws Exception {
        Flashcard first = card(deck, "First"), second = card(deck, "Second");
        progress(manager, first, "MASTERED", true);
        progress(collaborator, first, "LEARNING", false);
        progress(student, second, "MASTERED", true);
        call(collaborator, get(path(deck))).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.cardCount").value(2))
                .andExpect(jsonPath("$.data.cards[0].cardId").value(first.getCardId()))
                .andExpect(jsonPath("$.data.cards[0].frontText").value("First"))
                .andExpect(jsonPath("$.data.cards[0].backText").value("Answer"))
                .andExpect(jsonPath("$.data.cards[0].status").value("MASTERED"))
                .andExpect(jsonPath("$.data.cards[0].isStarred").value(true))
                .andExpect(jsonPath("$.data.cards[1].status").value("NEW"))
                .andExpect(jsonPath("$.data.cards[1].isStarred").value(false))
                .andExpect(jsonPath("$.data.user").doesNotExist());
    }

    @Test
    void deniesForeignDeckReadsAndMutationsAndReturns404ForMissingDecks() throws Exception {
        for (MockHttpServletRequestBuilder request : List.of(get(path(deck)),
                put(path(deck)).contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"Stolen\"}"), delete(path(deck)))) {
            call(stranger, request).andExpect(status().isForbidden());
        }
        for (MockHttpServletRequestBuilder request : List.of(get(BASE + "/" + Long.MAX_VALUE),
                put(BASE + "/" + Long.MAX_VALUE).contentType(MediaType.APPLICATION_JSON).content("{}"),
                delete(BASE + "/" + Long.MAX_VALUE))) {
            call(manager, request).andExpect(status().isNotFound());
        }
        assertEquals("OOP deck", deck.getTitle());
        assertNotNull(em.find(Deck.class, deck.getDeckId()));
    }

    @Test
    void updateIsPartialValidatesDestinationAndDoesNotChangeOwnerOrCards() throws Exception {
        Flashcard card = card(deck, "Retain");
        call(collaborator, put(path(deck)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Updated\",\"isPublic\":true,\"description\":\"New description\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.title").value("Updated"))
                .andExpect(jsonPath("$.data.isPublic").value(true)).andExpect(jsonPath("$.data.cardCount").value(1))
                .andExpect(jsonPath("$.data.ownerId").value(manager.getUserId()));
        call(manager, put(path(deck)).contentType(MediaType.APPLICATION_JSON).content("{\"title\":null}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.title").value("Updated"));
        call(manager, put(path(deck)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"courseId\":" + foreignCourse.getCourseId() + "}"))
                .andExpect(status().isForbidden());
        call(manager, put(path(deck)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"courseId\":" + Long.MAX_VALUE + "}"))
                .andExpect(status().isNotFound());
        for (String payload : List.of("{\"title\":\" \"}", "{\"title\":\"\\u2003\"}",
                json.writeValueAsString(Map.of("title", "x".repeat(256))))) {
            call(manager, put(path(deck)).contentType(MediaType.APPLICATION_JSON).content(payload))
                    .andExpect(status().isBadRequest());
        }
        assertEquals(course.getCourseId(), deck.getCourse().getCourseId());
        assertNotNull(em.find(Flashcard.class, card.getCardId()));
    }

    @Test
    void creatorManagesUnassignedDeckAndCanAttachItToManagedCourse() throws Exception {
        Deck personal = deck(manager, null, "Personal", false);
        call(collaborator, get(path(personal))).andExpect(status().isForbidden());
        call(manager, put(path(personal)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"courseId\":" + course.getCourseId() + "}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.courseId").value(course.getCourseId()));
        call(collaborator, get(path(personal))).andExpect(status().isOk());
        call(admin, put(path(personal)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"courseId\":" + foreignCourse.getCourseId() + "}"))
                .andExpect(status().isOk());
        call(manager, get(path(personal))).andExpect(status().isForbidden());
    }

    @Test
    void deleteRemovesOnlyTargetDeckCardsAndAllRelatedProgress() throws Exception {
        Flashcard target = card(deck, "Delete me");
        progress(manager, target, "MASTERED", true);
        progress(student, target, "LEARNING", false);
        Deck other = deck(stranger, foreignCourse, "Keep", true);
        Flashcard retained = card(other, "Retained");
        progress(student, retained, "MASTERED", true);
        call(collaborator, delete(path(deck))).andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Deck deleted successfully."))
                .andExpect(jsonPath("$.data").doesNotExist());
        em.flush();
        em.clear();
        assertNull(em.find(Deck.class, deck.getDeckId()));
        assertNull(em.find(Flashcard.class, target.getCardId()));
        assertNotNull(em.find(Deck.class, other.getDeckId()));
        assertNotNull(em.find(Flashcard.class, retained.getCardId()));
        assertEquals(1, count("UserCardProgress"));
        call(admin, delete(path(other))).andExpect(status().isOk());
    }

    @Test
    void invalidPaginationAndIdsAreBadRequests() throws Exception {
        for (String[] parameter : List.of(new String[]{"page", "-1"}, new String[]{"size", "0"},
                new String[]{"size", "101"}, new String[]{"page", "2147483647"}, new String[]{"courseId", "0"})) {
            call(manager, get(BASE).param(parameter[0], parameter[1])).andExpect(status().isBadRequest());
        }
        call(manager, get(BASE + "/0")).andExpect(status().isBadRequest());
    }

    @Test
    void addCardAppendsToDeckAndFollowsDeckPermissions() throws Exception {
        Flashcard existing = card(deck, "Existing front");

        // 201 with the documented payload shape, card appended after the existing one
        call(manager, post(path(deck) + "/cards").contentType(MediaType.APPLICATION_JSON)
                        .content(cardBody("Polymorphism la gi?", "Da hinh.")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.message").value("Resource created successfully"))
                .andExpect(jsonPath("$.data.cardId").isNumber())
                .andExpect(jsonPath("$.data.deckId").value(deck.getDeckId()))
                .andExpect(jsonPath("$.data.frontText").value("Polymorphism la gi?"))
                .andExpect(jsonPath("$.data.backText").value("Da hinh."));

        call(manager, get(path(deck)))
                .andExpect(jsonPath("$.data.cardCount").value(2))
                .andExpect(jsonPath("$.data.cards.length()").value(2))
                .andExpect(jsonPath("$.data.cards[0].cardId").value(existing.getCardId()))
                .andExpect(jsonPath("$.data.cards[1].frontText").value("Polymorphism la gi?"));

        // both faces are required
        call(manager, post(path(deck) + "/cards").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"frontText\":\"\",\"backText\":\"x\"}"))
                .andExpect(status().isBadRequest());
        call(manager, post(path(deck) + "/cards").contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());

        // unknown deck -> 404, deck of another manager -> 403, student -> 403, anonymous -> 401
        call(manager, post(BASE + "/999999/cards").contentType(MediaType.APPLICATION_JSON)
                        .content(cardBody("Q", "A")))
                .andExpect(status().isNotFound());

        Deck foreignDeck = deck(stranger, foreignCourse, "Foreign deck", false);
        call(manager, post(path(foreignDeck) + "/cards").contentType(MediaType.APPLICATION_JSON)
                        .content(cardBody("Q", "A")))
                .andExpect(status().isForbidden());

        call(student, post(path(deck) + "/cards").contentType(MediaType.APPLICATION_JSON)
                        .content(cardBody("Q", "A")))
                .andExpect(status().isForbidden());
        mvc.perform(post(path(deck) + "/cards").contentType(MediaType.APPLICATION_JSON)
                        .content(cardBody("Q", "A")))
                .andExpect(status().isUnauthorized());

        // admin may append to any deck
        call(admin, post(path(foreignDeck) + "/cards").contentType(MediaType.APPLICATION_JSON)
                        .content(cardBody("Admin card", "Yes")))
                .andExpect(status().isCreated());
    }

    private ResultActions call(User actor, MockHttpServletRequestBuilder request) throws Exception {
        em.flush();
        return mvc.perform(request.with(user(UserPrincipal.create(actor))));
    }

    private String createBody(Long courseId) throws Exception {
        java.util.Map<String, Object> body = new java.util.HashMap<>(Map.of("title", " New deck ",
                "isPublic", false, "description", "Description"));
        if (courseId != null) body.put("courseId", courseId);
        return json.writeValueAsString(body);
    }

    private String cardBody(String front, String back) throws Exception {
        return json.writeValueAsString(Map.of("frontText", front, "backText", back));
    }

    private String path(Deck value) { return BASE + "/" + value.getDeckId(); }
    private long count(String entity) { return em.createQuery("select count(e) from " + entity + " e", Long.class).getSingleResult(); }

    private User account(String role) {
        User value = User.builder().email(UUID.randomUUID() + "@example.com").fullName(role)
                .passwordHash("test-hash").roleName(role).build();
        em.persist(value);
        return value;
    }

    private Course course(User owner, String title) {
        Category category = Category.builder().name("Category").slug(UUID.randomUUID().toString()).build();
        em.persist(category);
        Course value = Course.builder().categoryId(category.getCategoryId()).category(category).manager(owner)
                .title(title).slug(UUID.randomUUID().toString()).isPublished(false).build();
        em.persist(value);
        return value;
    }

    private Deck deck(User owner, Course course, String title, boolean published) {
        Deck value = Deck.builder().user(owner).course(course).title(title).isPublic(published).build();
        em.persist(value);
        return value;
    }

    private Flashcard card(Deck parent, String front) {
        Flashcard value = Flashcard.builder().deck(parent).frontText(front).backText("Answer").build();
        em.persist(value);
        return value;
    }

    private void progress(User actor, Flashcard card, String status, boolean starred) {
        em.persist(UserCardProgress.builder().user(actor).card(card).status(status).isStarred(starred).build());
    }
}
