package com.examprep.services;

import com.examprep.dto.*;
import com.examprep.entities.*;
import com.examprep.exceptions.BadRequestException;
import com.examprep.exceptions.BaseException;
import com.examprep.exceptions.ResourceConflictException;
import com.examprep.exceptions.ResourceNotFoundException;
import com.examprep.repositories.*;
import com.examprep.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
@PreAuthorize("hasAnyRole('COURSE_MANAGER', 'ADMIN')")
public class DeckServiceImpl implements DeckService {
    private final DeckRepository decks;
    private final FlashcardRepository cards;
    private final UserCardProgressRepository progress;
    private final CourseRepository courses;
    private final CourseManagerRepository assignments;
    private final UserRepository users;

    @Override
    public PageResponse<DeckResponse> list(UserPrincipal user, String search, Long courseId, Boolean isPublic, int page, int size) {
        if (courseId != null) positiveId(courseId);
        if (page < 0 || size < 1 || size > 100 || (long) page * size > Integer.MAX_VALUE)
            throw new BadRequestException("Page must be nonnegative, size must be 1-100, and offset must fit a 32-bit integer.");
        String text = search == null ? "" : search.strip().toLowerCase(Locale.ROOT);
        String pattern = "%" + text.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
        Page<Deck> result = decks.findManagedDecks(admin(user) ? null : user.getId(), courseId, isPublic, pattern,
                PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "deckId")));
        List<Long> ids = result.getContent().stream().map(Deck::getDeckId).toList();
        if (ids.isEmpty()) return PageResponse.of(result, List.of());
        Map<Long, Long> counts = cards.countByDecks(ids).stream().collect(Collectors.toMap(IdCount::id, IdCount::total));
        return PageResponse.of(result, result.getContent().stream()
                .map(d -> response(d, counts.getOrDefault(d.getDeckId(), 0L), null)).toList());
    }

    @Override
    public DeckResponse detail(UserPrincipal user, Long id) {
        positiveId(id);
        Deck deck = decks.findDetail(id).orElseThrow(() -> new ResourceNotFoundException("Deck not found."));
        checkAccess(user, deck);
        return detailResponse(deck);
    }

    @Override
    @Transactional
    public DeckResponse create(UserPrincipal user, DeckRequests.Create request) {
        Course course = request.courseId() == null ? null : managedCourse(user, request.courseId());
        User owner = users.findById(user.getId()).orElseThrow(() -> new ResourceNotFoundException("User not found."));
        String title = request.title().strip();
        assertTitleAvailable(course, owner.getUserId(), title, -1L);
        Deck deck = decks.saveAndFlush(Deck.builder().user(owner).course(course).title(title)
                .description(optionalText(request.description())).isPublic(request.isPublic()).build());
        return response(deck, 0, List.of());
    }

    @Override
    @Transactional
    public DeckResponse update(UserPrincipal user, Long id, DeckRequests.Update request) {
        Deck deck = writeDeck(user, id);
        Course destination = request.courseId() == null ? null : managedCourse(user, request.courseId());
        Course effectiveCourse = destination != null ? destination : deck.getCourse();
        String title = request.title() != null ? request.title().strip() : deck.getTitle();
        boolean titleChanged = request.title() != null && !title.equals(deck.getTitle());
        boolean courseChanged = destination != null && (deck.getCourse() == null
                || !destination.getCourseId().equals(deck.getCourse().getCourseId()));
        if (titleChanged || courseChanged) {
            assertTitleAvailable(effectiveCourse, deck.getUser().getUserId(), title, deck.getDeckId());
        }
        if (request.title() != null) deck.setTitle(title);
        if (request.description() != null) deck.setDescription(optionalText(request.description()));
        if (request.isPublic() != null) deck.setIsPublic(request.isPublic());
        if (destination != null) deck.setCourse(destination);
        decks.flush();
        return detailResponse(deck);
    }

    @Override
    @Transactional
    public void delete(UserPrincipal user, Long id) {
        Deck deck = writeDeck(user, id);
        progress.deleteByDeck(id);
        cards.deleteByDeck(id);
        decks.delete(deck);
        decks.flush();
    }

    @Override
    @Transactional
    public CardResponse addCard(UserPrincipal user, Long id, DeckRequests.CardCreate request) {
        Deck deck = writeDeck(user, id);
        Flashcard card = cards.save(Flashcard.builder().deck(deck)
                .frontText(request.frontText().strip()).backText(request.backText().strip()).build());
        return CardResponse.from(card);
    }

    @Override
    @Transactional
    public CardResponse updateCard(UserPrincipal user, Long id, DeckRequests.CardUpdate request) {
        Flashcard card = writeCard(user, id);
        if (request.frontText() != null && !request.frontText().isBlank())
            card.setFrontText(request.frontText().strip());
        if (request.backText() != null && !request.backText().isBlank())
            card.setBackText(request.backText().strip());
        return CardResponse.from(card);
    }

    @Override
    @Transactional
    public void deleteCard(UserPrincipal user, Long id) {
        Flashcard card = writeCard(user, id);
        progress.deleteByCard(card.getCardId());
        cards.delete(card);
        cards.flush();
    }

    private Flashcard writeCard(UserPrincipal user, Long id) {
        positiveId(id);
        Flashcard card = cards.findDetail(id).orElseThrow(() -> new ResourceNotFoundException("Card not found."));
        checkAccess(user, card.getDeck());
        return card;
    }

    private void assertTitleAvailable(Course course, Long ownerId, String title, Long excludeDeckId) {
        long duplicates = course != null
                ? decks.countByCourseAndTitle(course.getCourseId(), title, excludeDeckId)
                : decks.countByOwnerWithoutCourseAndTitle(ownerId, title, excludeDeckId);
        if (duplicates > 0) {
            throw new ResourceConflictException(course != null
                    ? "A deck with this title already exists in this course."
                    : "A deck with this title already exists.");
        }
    }

    private Deck writeDeck(UserPrincipal user, Long id) {
        positiveId(id);
        Deck deck = decks.findForUpdate(id).orElseThrow(() -> new ResourceNotFoundException("Deck not found."));
        checkAccess(user, deck);
        return deck;
    }

    private Course managedCourse(UserPrincipal user, Long id) {
        positiveId(id);
        Course course = courses.findForUpdate(id).orElseThrow(() -> new ResourceNotFoundException("Course not found."));
        checkCourseAccess(user, course);
        return course;
    }

    private void checkAccess(UserPrincipal user, Deck deck) {
        if (admin(user)) return;
        if (deck.getCourse() != null) checkCourseAccess(user, deck.getCourse());
        else if (!deck.getUser().getUserId().equals(user.getId())) throw new BaseException(ResponseCode.FORBIDDEN);
    }

    private void checkCourseAccess(UserPrincipal user, Course course) {
        if (!admin(user) && !course.getManager().getUserId().equals(user.getId())
                && !assignments.existsByCourseCourseIdAndUserUserId(course.getCourseId(), user.getId()))
            throw new BaseException(ResponseCode.FORBIDDEN);
    }

    private DeckResponse detailResponse(Deck deck) {
        List<Flashcard> content = cards.findByDeckDeckIdOrderByCardIdAsc(deck.getDeckId());
        Map<Long, UserCardProgress> states = progress.findByUserUserIdAndCardDeckDeckId(deck.getUser().getUserId(), deck.getDeckId())
                .stream().collect(Collectors.toMap(p -> p.getCard().getCardId(), Function.identity()));
        List<DeckResponse.Card> values = content.stream().map(card -> {
            UserCardProgress state = states.get(card.getCardId());
            return new DeckResponse.Card(card.getCardId(), card.getFrontText(), card.getBackText(),
                    state != null && Boolean.TRUE.equals(state.getIsStarred()), state == null ? "NEW" : state.getStatus());
        }).toList();
        return response(deck, content.size(), values);
    }

    private DeckResponse response(Deck deck, long count, List<DeckResponse.Card> content) {
        Course course = deck.getCourse();
        return new DeckResponse(deck.getDeckId(), deck.getTitle(), course == null ? null : course.getCourseId(),
                course == null ? null : course.getTitle(), deck.getUser().getUserId(), deck.getUser().getFullName(),
                deck.getIsPublic(), count, content == null ? null : deck.getDescription(), content);
    }

    private boolean admin(UserPrincipal user) { return User.ROLE_ADMIN.equals(user.getRole()); }
    private String optionalText(String value) { return value == null || value.isBlank() ? null : value.strip(); }
    private void positiveId(Long id) {
        if (id == null || id <= 0) throw new BadRequestException("ID must be a positive integer.");
    }
}
