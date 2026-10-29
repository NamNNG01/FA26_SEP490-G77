package com.examprep.services.student;

import com.examprep.dto.ResponseCode;
import com.examprep.dto.student.StudentDeckDtos.*;
import com.examprep.entities.*;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.BaseException;
import com.examprep.exceptions.ForbiddenException;
import com.examprep.exceptions.ResourceConflictException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Personal decks and cards (FC-01..06, FC-10). A personal deck is one whose owner is the student;
 * course decks (owned by a manager) are read-only for students.
 */
@Service
@RequiredArgsConstructor
@Transactional
public class StudentDeckService {
    public static final Set<String> CODE_LANGUAGES = Set.of("JAVA", "PYTHON", "C", "CPP");

    private final DeckRepository decks;
    private final FlashcardRepository cards;
    private final UserCardProgressRepository progress;
    private final CourseRepository courses;
    private final EnrollmentRepository enrollments;
    private final UserRepository users;

    // ------------------------------------------------------------------ FC-01..03

    public DeckView create(Long userId, DeckCreate request) {
        Course course = request.courseId() == null ? null : enrolledCourse(userId, request.courseId());
        Deck deck = decks.saveAndFlush(Deck.builder().user(users.getReferenceById(userId)).course(course)
                .title(request.title().strip()).description(optionalText(request.description())).mode(request.mode())
                .isPublic(false).build());
        return view(deck, 0);
    }

    public DeckView update(Long userId, Long deckId, DeckUpdate request) {
        Deck deck = ownedDeck(userId, deckId);
        long count = cards.countByDeckDeckId(deckId);
        if (request.mode() != null && !request.mode().equals(deck.getMode()) && count > 0) {
            throw new ResourceConflictException("A deck with cards cannot change its mode.");
        }
        if (request.courseId() != null) deck.setCourse(enrolledCourse(userId, request.courseId()));
        if (request.title() != null) deck.setTitle(request.title().strip());
        if (request.description() != null) deck.setDescription(optionalText(request.description()));
        if (request.mode() != null) deck.setMode(request.mode());
        decks.flush();
        return view(deck, count);
    }

    public void delete(Long userId, Long deckId) {
        Deck deck = ownedDeck(userId, deckId);
        progress.deleteByDeck(deckId);
        cards.deleteByDeck(deckId);
        decks.delete(deck);
        decks.flush();
    }

    // ------------------------------------------------------------------ FC-04..06

    public CardView addCard(Long userId, Long deckId, CardWrite request) {
        Deck deck = ownedDeck(userId, deckId);
        Flashcard card = Flashcard.builder().deck(deck).position(cards.maxPosition(deckId) + 1).build();
        apply(card, deck.getMode(), request);
        return cardView(cards.saveAndFlush(card));
    }

    public CardView updateCard(Long userId, Long cardId, CardWrite request) {
        Flashcard card = ownedCard(userId, cardId);
        apply(card, card.getDeck().getMode(), merged(card, request));
        cards.flush();
        return cardView(card);
    }

    public void deleteCard(Long userId, Long cardId) {
        Flashcard card = ownedCard(userId, cardId);
        progress.deleteByCard(cardId);
        cards.delete(card);
        cards.flush();
    }

    // ------------------------------------------------------------------ FC-10

    public PublishRequestView requestPublish(Long userId, Long deckId) {
        Deck deck = ownedDeck(userId, deckId);
        switch (deck.getReviewStatus()) {
            case "PENDING_REVIEW" -> throw coded(ResponseCode.CONFLICT, "ALREADY_PENDING_REVIEW", "The deck is already waiting for review.");
            case "APPROVED" -> throw coded(ResponseCode.CONFLICT, "ALREADY_PUBLIC", "The deck is already public.");
            default -> { }
        }
        if (cards.countByDeckDeckId(deckId) == 0) {
            throw new BaseException(ResponseCode.UNPROCESSABLE_VALIDATION_ERROR, "Add at least one card before asking for review.");
        }
        deck.setReviewStatus("PENDING_REVIEW");
        deck.setSubmittedAt(Instant.now());
        decks.flush();
        return new PublishRequestView(deck.getDeckId(), deck.getVisibility(), deck.getReviewStatus(), deck.getSubmittedAt());
    }

    // ------------------------------------------------------------------ access, shared with study/import/FC-12

    /** The caller's own deck, locked for writing. 404 missing, 403 someone else's (a course deck included). */
    public Deck ownedDeck(Long userId, Long deckId) {
        Deck deck = decks.findForUpdate(deckId).orElseThrow(() -> new ResourceNotFoundException("Deck not found."));
        if (!deck.getUser().getUserId().equals(userId)) throw new ForbiddenException("Only the owner can change this deck.");
        return deck;
    }

    /** Owner, a public deck, or a manager's course deck the caller is actively enrolled in. */
    public Deck readableDeck(Long userId, Long deckId) {
        Deck deck = decks.findDetail(deckId).orElseThrow(() -> new ResourceNotFoundException("Deck not found."));
        if (deck.getUser().getUserId().equals(userId) || Deck.VISIBILITY_PUBLIC.equals(deck.getVisibility())) return deck;
        boolean courseDeck = deck.getCourse() != null && !User.ROLE_STUDENT.equals(deck.getUser().getRoleName());
        if (courseDeck && enrollments.existsByCourse_CourseIdAndUser_UserIdAndStatus(
                deck.getCourse().getCourseId(), userId, Enrollment.STATUS_ACTIVE)) return deck;
        throw new ForbiddenException("You cannot study this deck.");
    }

    private Flashcard ownedCard(Long userId, Long cardId) {
        Flashcard card = cards.findDetail(cardId).orElseThrow(() -> new ResourceNotFoundException("Card not found."));
        ownedDeck(userId, card.getDeck().getDeckId());
        return card;
    }

    private Course enrolledCourse(Long userId, Long courseId) {
        Course course = courses.findById(courseId).orElseThrow(() -> new ResourceNotFoundException("Course not found."));
        if (!enrollments.existsByCourse_CourseIdAndUser_UserIdAndStatus(courseId, userId, Enrollment.STATUS_ACTIVE)) {
            throw new ForbiddenException("You are not enrolled in this course.");
        }
        return course;
    }

    // ------------------------------------------------------------------ card rules by deck mode

    /** Validates the card against its deck mode and writes it; unused faces are stored as "" (columns are NOT NULL). */
    static void apply(Flashcard card, String mode, CardWrite request) {
        String front = optionalText(request.frontText());
        String back = optionalText(request.backText());
        String code = request.codeBody() == null || request.codeBody().isBlank() ? null : request.codeBody();
        String language = optionalText(request.codeLanguage());
        if (language != null) language = language.toUpperCase(Locale.ROOT);
        switch (mode) {
            case "CODE_SNIPPET" -> {
                require(front, "frontText");
                require(code, "codeBody");
                require(language, "codeLanguage");
            }
            case "CODE_OUTPUT" -> {
                require(code, "codeBody");
                require(back, "backText");
            }
            default -> {
                require(front, "frontText");
                require(back, "backText");
            }
        }
        if (language != null && !CODE_LANGUAGES.contains(language)) {
            throw new BadRequestException("codeLanguage must be one of JAVA, PYTHON, C, CPP.");
        }
        card.setFrontText(front == null ? "" : front);
        card.setBackText(back == null ? "" : back);
        card.setCodeBody(code);
        card.setCodeLanguage(language);
    }

    /** FC-05: fields not sent keep their stored value; a sent blank value clears it (and may then fail validation). */
    private static CardWrite merged(Flashcard card, CardWrite request) {
        return new CardWrite(
                request.frontText() != null ? request.frontText() : card.getFrontText(),
                request.backText() != null ? request.backText() : card.getBackText(),
                request.codeLanguage() != null ? request.codeLanguage() : card.getCodeLanguage(),
                request.codeBody() != null ? request.codeBody() : card.getCodeBody());
    }

    private static void require(String value, String field) {
        if (value == null) throw new BadRequestException(field + " is required for this deck mode.");
    }

    static BaseException coded(ResponseCode status, String code, String message) {
        return new BaseException(status, message, Map.of("code", code));
    }

    static String optionalText(String value) { return value == null || value.isBlank() ? null : value.strip(); }

    DeckView view(Deck deck, long cardCount) {
        return new DeckView(deck.getDeckId(), deck.getTitle(), deck.getDescription(), deck.getMode(),
                deck.getCourse() == null ? null : deck.getCourse().getCourseId(), cardCount, deck.getVisibility(),
                deck.getReviewStatus(), deck.getReviewNote(), deck.getCreatedAt());
    }

    static CardView cardView(Flashcard card) {
        return new CardView(card.getCardId(), card.getDeck().getDeckId(), card.getFrontText(), card.getBackText(),
                card.getCodeLanguage(), card.getCodeBody(), card.getPosition());
    }
}
