import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { ROUTES } from '@/app/routes';
import { studentDeckService, type DeckListItem, type PublishRequestView } from '@/services/studentDeck.service';
import { getApiErrorMessage } from '@/utils/apiError';
import { ContributionCourseModuleFields } from '../ContributionCourseModuleFields';
import { useActiveCourses } from './flashcardUi';

export function DeckContributionModal({
  open,
  onClose,
  onSubmitted,
  initialDeckId,
}: {
  open: boolean;
  onClose: () => void;
  onSubmitted: (deckId: number, result: PublishRequestView) => void;
  initialDeckId?: number;
}) {
  const navigate = useNavigate();
  const { courses, error: coursesError } = useActiveCourses();
  const [decks, setDecks] = useState<DeckListItem[]>([]);
  const [loadingDecks, setLoadingDecks] = useState(false);
  const [deckId, setDeckId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [courseError, setCourseError] = useState('');
  const [moduleError, setModuleError] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setDecks([]);
    setDeckId('');
    setCourseId('');
    setModuleId('');
    setError(null);
    setCourseError('');
    setModuleError('');
    setLoadingDecks(true);
    studentDeckService.listAllDecks({ scope: 'MINE' })
      .then(items => {
        if (cancelled) return;
        setDecks(items);
        const requested = items.find(item => item.deckId === initialDeckId && canContribute(item));
        if (requested) {
          setDeckId(String(requested.deckId));
          setCourseId(requested.courseId == null ? '' : String(requested.courseId));
          setModuleId(requested.moduleId == null ? '' : String(requested.moduleId));
        }
      })
      .catch(err => { if (!cancelled) setError(getApiErrorMessage(err, 'Could not load your decks.')); })
      .finally(() => { if (!cancelled) setLoadingDecks(false); });
    return () => { cancelled = true; };
  }, [open, initialDeckId]);

  const eligibleDecks = useMemo(() => decks.filter(canContribute), [decks]);
  const selectedDeck = eligibleDecks.find(deck => String(deck.deckId) === deckId);
  const deckOptions = [
    { label: 'Choose one of your decks', value: '' },
    ...eligibleDecks.map(deck => ({
      label: `${deck.title} · ${deck.cardCount} ${deck.cardCount === 1 ? 'card' : 'cards'}`,
      value: String(deck.deckId),
    })),
  ];

  const chooseDeck = (value: string) => {
    setDeckId(value);
    const deck = eligibleDecks.find(item => String(item.deckId) === value);
    setCourseId(deck?.courseId == null ? '' : String(deck.courseId));
    setModuleId(deck?.moduleId == null ? '' : String(deck.moduleId));
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setCourseError(courseId ? '' : 'Choose an enrolled course.');
    setModuleError(moduleId ? '' : 'Choose a module.');
    if (!selectedDeck || !courseId || !moduleId) {
      setError('Choose a deck, an enrolled course, and a module before submitting.');
      return;
    }

    setBusy(true);
    try {
      if (selectedDeck.courseId !== Number(courseId) || selectedDeck.moduleId !== Number(moduleId)) {
        await studentDeckService.updateDeck(selectedDeck.deckId, {
          courseId: Number(courseId),
          moduleId: Number(moduleId),
        });
      }
      const result = await studentDeckService.requestPublish(selectedDeck.deckId);
      onSubmitted(selectedDeck.deckId, result);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not send the deck for review.'));
    } finally {
      setBusy(false);
    }
  };

  const goToDecks = () => {
    onClose();
    navigate(`${ROUTES.studentFlashcards}?tab=mine`);
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Contribute a flashcard deck"
      description="Choose a deck you’ve created, then assign it to one of your enrolled courses. A content manager will review it before it becomes public."
      error={error && <Alert type="error" message={error} />}
      size="lg"
      footer={(
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button form="deck-contribution-form" type="submit" loading={busy} disabled={busy || loadingDecks || !eligibleDecks.length || !courses?.length}>
            Send for review
          </Button>
        </>
      )}
    >
      <form id="deck-contribution-form" onSubmit={submit} className="space-y-5">
        <div>
          <SearchableSelect
            label="Your deck *"
            options={deckOptions}
            value={deckId}
            onChange={chooseDeck}
            placeholder={loadingDecks ? 'Loading your decks…' : 'Choose a deck'}
            searchPlaceholder="Search your decks…"
            emptyText="No decks available to contribute"
            disabled={busy || loadingDecks || !eligibleDecks.length}
          />
          {selectedDeck && <p className="mt-1.5 text-xs text-content-subtle">{selectedDeck.description || 'No description'} · {selectedDeck.mode === 'FLASHCARD' ? 'Flashcard deck' : selectedDeck.mode === 'CODE_SNIPPET' ? 'Code snippet deck' : 'Code output deck'}</p>}
          <p className="mt-2 text-sm text-content-secondary">Need a new deck? Go to My Flashcards, create a deck, and add at least one card. Then return here to submit it for review.</p>
          <Button type="button" variant="outline" size="sm" onClick={goToDecks} disabled={busy}>Go to My Flashcards</Button>
          {!loadingDecks && decks.length > 0 && !eligibleDecks.length && <p className="mt-2 text-sm text-content-secondary">Your current decks are already public, under review, or need at least one card before they can be submitted.</p>}
          {decks.some(deck => deck.cardCount === 0 && deck.reviewStatus === 'NONE') && <p className="mt-2 text-xs text-content-subtle">A deck needs at least one card before it can be submitted.</p>}
        </div>
        <ContributionCourseModuleFields
          courses={courses ?? []}
          courseId={courseId}
          moduleId={moduleId}
          onCourseChange={value => { setCourseId(value); setCourseError(''); setError(null); }}
          onModuleChange={value => { setModuleId(value); setModuleError(''); setError(null); }}
          courseError={courseError || coursesError || undefined}
          moduleError={moduleError || undefined}
          disabled={busy || !selectedDeck}
        />
        {!courses?.length && !coursesError && <p className="text-sm text-warning">An active course enrollment is needed to contribute a deck.</p>}
      </form>
    </Modal>
  );
}

function canContribute(deck: DeckListItem) {
  return deck.mode === 'FLASHCARD' && deck.cardCount > 0 && (deck.reviewStatus === 'NONE' || deck.reviewStatus === 'REJECTED');
}
