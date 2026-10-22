import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Alert } from '@/components/ui/Alert';
import { useToast } from '@/components/ui/ToastHost';
import { Icon } from '@/assets/icons';
import { deckService, type Deck } from '@/services/deck.service';
import {
  CardEditorPanel,
  CardList,
  DUPLICATE_TITLE_MESSAGE,
  DeckInfoFields,
  NO_COURSE,
  cardErrorMessage,
  errorMessage,
  hasDuplicateTitle,
  useCardEditor,
  useManagedCourses,
  validateDeckInfo,
  type DeckInfo,
  type DeckInfoErrors,
  type EditableCard,
} from './DeckEditor';

const BLANK: DeckInfo = { title: '', courseId: NO_COURSE, isPublic: false, description: '' };

/** Outcome of creating the deck's cards after the deck itself was created. */
export interface CreatedDeck {
  deck: Deck;
  cardsCreated: number;
  /** Set when some cards could not be created — the deck exists regardless. */
  cardError?: string;
}

/**
 * New Flashcard Deck — deck info plus a draft card list built with the card
 * editor. Create Deck creates the deck (F-02), then each card through the
 * card API. Mount it only while open so each opening starts from a blank draft.
 */
export function CreateDeckModal({ onClose, onCreated, defaultCourseId }: {
  onClose: () => void;
  onCreated: (result: CreatedDeck) => void;
  /** Pre-selects the course the list is currently filtered by. */
  defaultCourseId?: string;
}) {
  const toast = useToast();
  const { courses, loading: coursesLoading } = useManagedCourses();
  const [info, setInfo] = useState<DeckInfo>(() => ({ ...BLANK, courseId: defaultCourseId ?? NO_COURSE }));
  const [errors, setErrors] = useState<DeckInfoErrors>({});
  const [cards, setCards] = useState<EditableCard[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // Draft cards live here until the deck is created.
  const editor = useCardEditor(cards, {
    add: (frontText, backText) => setCards(prev => [...prev, { id: `draft-${Date.now()}-${prev.length}`, frontText, backText }]),
    update: (card, frontText, backText) => setCards(prev => prev.map(c => (c.id === card.id ? { ...c, frontText, backText } : c))),
    remove: card => setCards(prev => prev.filter(c => c.id !== card.id)),
  });

  const touched = info.title.trim() !== '' || info.description.trim() !== '' || info.isPublic
    || info.courseId !== (defaultCourseId ?? NO_COURSE) || cards.length > 0 || editor.hasInput;

  const update = (patch: Partial<DeckInfo>) => {
    setInfo(prev => ({ ...prev, ...patch }));
    setErrors(prev => {
      const next = { ...prev };
      (Object.keys(patch) as (keyof DeckInfoErrors)[]).forEach(k => delete next[k]);
      return next;
    });
  };

  const requestClose = () => {
    if (saving) return;
    if (touched) setConfirmDiscard(true);
    else onClose();
  };

  const submit = async () => {
    const found = validateDeckInfo(info, { requireCourse: true });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (editor.hasInput) {
      toast.warning(editor.editingId ? 'Update or clear the card in the editor first.' : 'Add or clear the card in the editor first.');
      editor.frontRef.current?.focus();
      return;
    }
    setSaving(true);
    setSaveError(null);
    if (await hasDuplicateTitle(info.title, info.courseId)) {
      setErrors({ title: DUPLICATE_TITLE_MESSAGE });
      setSaving(false);
      return;
    }
    let deck: Deck;
    try {
      deck = await deckService.createDeck({
        title: info.title.trim(),
        courseId: Number(info.courseId),
        isPublic: info.isPublic,
        description: info.description.trim() || undefined,
      });
    } catch (err) {
      setSaveError(errorMessage(err, 'Could not create the deck. Please try again.'));
      setSaving(false);
      return;
    }
    // Sequential so cards keep the order they were written in.
    let cardsCreated = 0;
    let cardError: string | undefined;
    for (const card of cards) {
      try {
        await deckService.createCard(deck.deckId, { frontText: card.frontText, backText: card.backText });
        cardsCreated++;
      } catch (err) {
        cardError = cardErrorMessage(err, 'Some cards could not be created.');
        break;
      }
    }
    setSaving(false);
    onCreated({ deck, cardsCreated, cardError });
  };

  return (
    <>
    <Modal open onClose={requestClose} title="New Flashcard Deck" size="2xl"
      footer={
        <>
          <Button variant="outline" onClick={requestClose} disabled={saving}>Cancel</Button>
          <Button icon={<Icon.Check className="w-4 h-4" />} onClick={submit} disabled={saving || coursesLoading}>
            {saving ? 'Creating…' : 'Create Deck'}
          </Button>
        </>
      }>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
        <div className="space-y-5 min-w-0">
          <section className="card p-5 space-y-4" aria-label="Deck information">
            <h3 className="text-lg font-semibold text-content">Deck Information</h3>
            {saveError && <Alert type="error" message={saveError} />}
            <DeckInfoFields idPrefix="new-deck" value={info} errors={errors} onChange={update} allowNoCourse={false}
              courses={courses.map(c => ({ id: String(c.courseId), title: c.title }))} coursesLoading={coursesLoading} />
          </section>
          <CardList cards={cards} editor={editor} emptyHint="Add cards with the card editor — or create the deck now and add them later." />
        </div>
        <CardEditorPanel editor={editor} idPrefix="new-card" className="lg:sticky lg:top-0"
          footnote={<>Cards are added to the list and created with the deck on <span className="font-medium text-content-soft">Create Deck</span>.</>} />
      </div>
    </Modal>

    {/* Its own dialog over the form, so the form's buttons never change under the cursor. */}
    <Modal open={confirmDiscard} onClose={() => setConfirmDiscard(false)} title="Discard this new deck?" size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => setConfirmDiscard(false)}>Keep Editing</Button>
          <Button variant="danger" onClick={onClose}>Discard</Button>
        </>
      }>
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-full bg-warning-light flex items-center justify-center flex-shrink-0">
          <Icon.AlertCircle className="w-5 h-5 text-warning" />
        </span>
        <p className="text-sm text-content-secondary">
          The deck hasn’t been created yet. Everything you entered{cards.length > 0 ? ` — including ${cards.length} card${cards.length === 1 ? '' : 's'} —` : ''} will be lost.
        </p>
      </div>
    </Modal>
    </>
  );
}
