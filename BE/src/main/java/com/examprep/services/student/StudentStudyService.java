package com.examprep.services.student;

import com.examprep.dto.student.StudentDeckDtos.*;
import com.examprep.entities.Deck;
import com.examprep.entities.Flashcard;
import com.examprep.entities.StudySession;
import com.examprep.entities.UserCardProgress;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.ResourceConflictException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Flashcard progress and study: FC-08, FC-09, FP-01..03, FV-01. Only the caller's own progress rows are written. */
@Service
@RequiredArgsConstructor
@Transactional
public class StudentStudyService {
    private static final String SESSION_PREFIX = "ps-";
    private static final List<String> GROUP_ORDER = List.of("NEW", "LEARNING", "KNOWN");

    private final StudentDeckService decks;
    private final FlashcardRepository cards;
    private final UserCardProgressRepository progress;
    private final StudySessionRepository sessions;
    private final UserRepository users;

    // ------------------------------------------------------------------ FC-08

    public ProgressView writeProgress(Long userId, Long cardId, ProgressWrite request) {
        if (request.status() == null && request.isStarred() == null) throw new BadRequestException("Send status or isStarred.");
        Flashcard card = cards.findDetail(cardId).orElseThrow(() -> new ResourceNotFoundException("Card not found."));
        Long deckId = card.getDeck().getDeckId();
        decks.readableDeck(userId, deckId);
        // Serialises this student's progress writes so two first writes of one card cannot both insert.
        users.findForUpdate(userId);
        UserCardProgress row = progress.findByUserUserIdAndCardCardId(userId, cardId).orElseGet(() -> UserCardProgress.builder()
                .user(users.getReferenceById(userId)).card(card).isStarred(false).status("LEARNING").build());
        Instant now = Instant.now();
        if (request.status() != null) {
            switch (request.status()) {
                case "WRONG" -> {
                    row.setWrongCount(row.getWrongCount() + 1);
                    row.setStatus("LEARNING");
                }
                case "KNOWN" -> row.setStatus("KNOWN");
                default -> { } // LEARNING: a new row is LEARNING, an existing group is kept
            }
            row.setLastReviewedAt(now);
        }
        if (request.isStarred() != null) row.setIsStarred(request.isStarred());
        progress.saveAndFlush(row);
        long learned = progress.countKnown(userId, deckId);
        long total = cards.countByDeckDeckId(deckId);
        return new ProgressView(cardId, row.getStatus(), row.getWrongCount(), row.getIsStarred(), total > 0 && learned == total, learned, total);
    }

    // ------------------------------------------------------------------ FC-09

    public DeckLearnedView learnAll(Long userId, Long deckId) {
        decks.readableDeck(userId, deckId);
        users.findForUpdate(userId);
        Set<Long> tracked = progress.findByUserUserIdAndCardDeckDeckId(userId, deckId).stream()
                .map(p -> p.getCard().getCardId()).collect(Collectors.toSet());
        List<Flashcard> content = cards.findByDeckDeckIdOrderByPositionAscCardIdAsc(deckId);
        Instant now = Instant.now();
        progress.saveAll(content.stream().filter(c -> !tracked.contains(c.getCardId()))
                .map(c -> UserCardProgress.builder().user(users.getReferenceById(userId)).card(c).isStarred(false)
                        .status("KNOWN").lastReviewedAt(now).build()).toList());
        progress.flush();
        long learned = progress.countKnown(userId, deckId);
        return new DeckLearnedView(deckId, learned, content.size(), !content.isEmpty() && learned == content.size());
    }

    // ------------------------------------------------------------------ FP-01 / FP-02

    public StudySessionView startSession(Long userId, Long deckId, SessionStart request) {
        Deck deck = decks.readableDeck(userId, deckId);
        List<StudyCard> ordered = studyOrder(userId, deckId);
        int limit = request.cardLimit() == null ? 0 : request.cardLimit();
        if (limit > 0 && ordered.size() > limit) ordered = ordered.subList(0, limit);
        StudySession session = sessions.save(StudySession.builder().userId(userId).deckId(deckId).mode(request.mode())
                .cardsStudied(ordered.size()).startedAt(Instant.now()).build());
        return new StudySessionView(SESSION_PREFIX + session.getSessionId(), deckId, deck.getTitle(), deck.getMode(), ordered.size(), ordered);
    }

    public SessionSummary finishSession(Long userId, String sessionId, SessionFinish request) {
        StudySession session = parseSession(sessionId).flatMap(sessions::findById)
                .filter(s -> s.getUserId().equals(userId))
                .orElseThrow(() -> new ResourceNotFoundException("Study session not found."));
        if (session.getEndedAt() != null) throw new ResourceConflictException("This study session is already finished.");
        int known, wrong;
        if (request != null && (request.knownCardIds() != null || request.wrongCardIds() != null)) {
            Set<Long> deckCards = cards.findByDeckDeckIdOrderByPositionAscCardIdAsc(session.getDeckId()).stream()
                    .map(Flashcard::getCardId).collect(Collectors.toSet());
            known = countIn(request.knownCardIds(), deckCards);
            wrong = countIn(request.wrongCardIds(), deckCards);
        } else {
            // Session kept on the server: count what FC-08 recorded since the session started.
            List<UserCardProgress> touched = progress.findByUserUserIdAndCardDeckDeckId(userId, session.getDeckId()).stream()
                    .filter(p -> p.getLastReviewedAt() != null && !p.getLastReviewedAt().isBefore(session.getStartedAt())).toList();
            known = (int) touched.stream().filter(p -> "KNOWN".equals(p.getStatus())).count();
            wrong = (int) touched.stream().filter(p -> "LEARNING".equals(p.getStatus()) && p.getWrongCount() > 0).count();
        }
        session.setEndedAt(Instant.now());
        session.setCardsCorrect(known);
        return new SessionSummary(session.getCardsStudied(), known, wrong);
    }

    // ------------------------------------------------------------------ FP-03 / FV-01

    @Transactional(readOnly = true)
    public List<StudyCard> reviewCards(Long userId, Long deckId, int limit) {
        if (limit < 1 || limit > 50) throw new BadRequestException("limit must be 1-50.");
        decks.readableDeck(userId, deckId);
        return studyOrder(userId, deckId).stream().filter(c -> "LEARNING".equals(c.status()))
                .sorted(Comparator.comparingInt(StudyCard::wrongCount).reversed()).limit(limit).toList();
    }

    @Transactional(readOnly = true)
    public ViewerView viewer(Long userId, Long deckId, int cardLimit) {
        if (cardLimit < 0 || cardLimit > 500) throw new BadRequestException("cardLimit must be 0-500.");
        Deck deck = decks.readableDeck(userId, deckId);
        List<Flashcard> content = cards.findByDeckDeckIdOrderByPositionAscCardIdAsc(deckId);
        if (cardLimit > 0 && content.size() > cardLimit) content = content.subList(0, cardLimit);
        return new ViewerView(deckId, deck.getTitle(), deck.getMode(), content.stream()
                .map(c -> new ViewerCard(c.getCardId(), c.getFrontText(), c.getBackText(), c.getCodeLanguage(), c.getCodeBody())).toList());
    }

    /** Spec 9.3: NEW, LEARNING, KNOWN; then wrong_count DESC, last_reviewed_at ASC (never reviewed first), position. */
    private List<StudyCard> studyOrder(Long userId, Long deckId) {
        Map<Long, UserCardProgress> states = progress.findByUserUserIdAndCardDeckDeckId(userId, deckId).stream()
                .collect(Collectors.toMap(p -> p.getCard().getCardId(), Function.identity()));
        Comparator<Flashcard> order = Comparator
                .comparingInt((Flashcard c) -> GROUP_ORDER.indexOf(statusOf(states.get(c.getCardId()))))
                .thenComparing(c -> wrongOf(states.get(c.getCardId())), Comparator.reverseOrder())
                .thenComparing(c -> reviewedOf(states.get(c.getCardId())), Comparator.nullsFirst(Comparator.naturalOrder()))
                .thenComparing(Flashcard::getPosition).thenComparing(Flashcard::getCardId);
        return cards.findByDeckDeckIdOrderByPositionAscCardIdAsc(deckId).stream().sorted(order).map(c -> {
            UserCardProgress p = states.get(c.getCardId());
            return new StudyCard(c.getCardId(), c.getFrontText(), c.getBackText(), c.getCodeLanguage(), c.getCodeBody(),
                    statusOf(p), wrongOf(p), p != null && Boolean.TRUE.equals(p.getIsStarred()));
        }).toList();
    }

    private static String statusOf(UserCardProgress p) { return p == null ? "NEW" : p.getStatus(); }
    private static int wrongOf(UserCardProgress p) { return p == null ? 0 : p.getWrongCount(); }
    private static Instant reviewedOf(UserCardProgress p) { return p == null ? null : p.getLastReviewedAt(); }

    private static int countIn(List<Long> ids, Set<Long> deckCards) {
        return ids == null ? 0 : (int) ids.stream().filter(deckCards::contains).distinct().count();
    }

    private static Optional<Long> parseSession(String sessionId) {
        if (sessionId == null || !sessionId.matches(SESSION_PREFIX + "\\d{1,18}")) return Optional.empty();
        return Optional.of(Long.parseLong(sessionId.substring(SESSION_PREFIX.length())));
    }
}
