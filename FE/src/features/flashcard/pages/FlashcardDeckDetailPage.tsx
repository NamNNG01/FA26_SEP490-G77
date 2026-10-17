import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/ToastHost';
import { Icon } from '@/assets/icons';
import { ROUTES } from '@/app/routes';
import {
  commitDeck,
  courseTitle,
  formatDeckTimestamp,
  getDeck,
  getDeckCards,
  moduleTitle,
  type Flashcard,
  type FlashcardDeck,
} from '../mockFlashcardDecks';
import {
  CardEditorPanel,
  CardList,
  DeckInfoFields,
  STATUS_VARIANT,
  useCardEditor,
  validateDeckInfo,
  type DeckInfoErrors,
} from '../components/DeckEditor';

const sameCards = (a: Flashcard[], b: Flashcard[]) =>
  a.length === b.length && a.every((c, i) => c.id === b[i]!.id && c.front === b[i]!.front && c.back === b[i]!.back);

const sameMeta = (a: FlashcardDeck, b: FlashcardDeck) =>
  a.name === b.name && a.courseId === b.courseId && a.moduleId === b.moduleId && a.description === b.description;

/**
 * Flashcard Detail — Course Manager only (guarded in AppContent).
 *
 * Every edit (deck info, added / edited / removed cards) lives in a local draft
 * until Save Changes commits it to the mock store; Cancel throws the draft away
 * and returns to the list. Runs on mock data until the flashcard API exists.
 */
export function FlashcardDeckDetailPage() {
  const { deckId = '' } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [committed, setCommitted] = useState(() => {
    const deck = getDeck(deckId);
    return deck ? { deck, cards: getDeckCards(deckId) } : undefined;
  });
  const [deck, setDeck] = useState<FlashcardDeck | undefined>(committed?.deck);
  const [cards, setCards] = useState<Flashcard[]>(committed?.cards ?? []);
  const [editingInfo, setEditingInfo] = useState(false);
  const [infoErrors, setInfoErrors] = useState<DeckInfoErrors>({});
  const [confirmLeave, setConfirmLeave] = useState(false);

  const editor = useCardEditor(deckId, cards, setCards);

  const dirty = !!committed && !!deck && (!sameMeta(deck, committed.deck) || !sameCards(cards, committed.cards));

  // Closing the tab with unsaved edits asks the browser to confirm.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  if (!committed || !deck) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="card mx-auto max-w-md px-6 py-14 text-center">
          <Icon.Layers className="w-10 h-10 mx-auto text-content-faint" />
          <h2 className="mt-4 text-xl font-bold text-content">Deck not found</h2>
          <p className="mt-1 text-sm text-content-soft">This flashcard deck does not exist or has been removed.</p>
          <Button className="mt-6" onClick={() => navigate(ROUTES.managerFlashcards)}>Back to Flashcards</Button>
        </div>
      </div>
    );
  }

  const updateMeta = (patch: Partial<FlashcardDeck>) => {
    setDeck(prev => (prev ? { ...prev, ...patch } : prev));
    setInfoErrors(prev => {
      const next = { ...prev };
      (Object.keys(patch) as (keyof DeckInfoErrors)[]).forEach(k => delete next[k]);
      return next;
    });
  };

  const handleSave = () => {
    const errors = validateDeckInfo(deck);
    if (Object.keys(errors).length > 0) {
      setInfoErrors(errors);
      setEditingInfo(true);
      return;
    }
    if (deck.status === 'Published' && cards.length === 0) {
      toast.error('A published deck must contain at least one card.');
      return;
    }
    if (editor.hasInput) {
      toast.warning(editor.editingId ? 'Update or clear the card in the editor before saving.' : 'Add or clear the card in the editor before saving.');
      editor.frontRef.current?.focus();
      return;
    }
    const saved = commitDeck({ ...deck, name: deck.name.trim(), description: deck.description.trim() }, cards);
    setCommitted({ deck: saved, cards });
    setDeck(saved);
    setEditingInfo(false);
    setInfoErrors({});
    toast.success(`"${saved.name}" saved.`);
  };

  const leave = () => navigate(ROUTES.managerFlashcards);
  const handleCancel = () => (dirty || editor.hasInput ? setConfirmLeave(true) : leave());

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <div className="space-y-2">
        <Breadcrumb items={[{ label: 'Flashcards', onClick: handleCancel }, { label: committed.deck.name }]} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-content">Flashcard Detail</h2>
            <p className="text-sm text-content-soft mt-0.5">
              {committed.deck.id} · Last updated {formatDeckTimestamp(committed.deck.updatedAt)}
              {dirty && <span className="ml-2 font-medium text-warning">· Unsaved changes</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleCancel}>Cancel</Button>
            <Button icon={<Icon.Check className="w-4 h-4" />} onClick={handleSave} disabled={!dirty}>Save Changes</Button>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px] items-start">
        <div className="space-y-5 min-w-0">
          {/* Deck overview */}
          <section className="card p-5" aria-labelledby="deck-overview-title">
            {editingInfo ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 id="deck-overview-title" className="text-lg font-semibold text-content">Edit Deck Info</h3>
                  <Button size="sm" variant="ghost" onClick={() => setEditingInfo(false)}>Done</Button>
                </div>
                <DeckInfoFields idPrefix="deck" value={deck} errors={infoErrors} onChange={updateMeta} />
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <h3 id="deck-overview-title" className="text-xl font-bold text-content break-words min-w-0">{deck.name}</h3>
                  <button onClick={() => setEditingInfo(true)} aria-label="Edit deck info" title="Edit deck info"
                    className="flex-shrink-0 p-1.5 rounded-[6px] text-content-soft hover:bg-accent hover:text-content">
                    <Icon.Edit className="w-4 h-4" />
                  </button>
                </div>
                <dl className="mt-4 grid grid-cols-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4">
                  <OverviewItem label="Course"><span className="truncate block" title={courseTitle(deck.courseId)}>{courseTitle(deck.courseId)}</span></OverviewItem>
                  <OverviewItem label="Module"><span className="truncate block" title={moduleTitle(deck.moduleId)}>{moduleTitle(deck.moduleId)}</span></OverviewItem>
                  <OverviewItem label="Status"><Badge variant={STATUS_VARIANT[deck.status]}>{deck.status}</Badge></OverviewItem>
                  <OverviewItem label="Card Count">{cards.length}</OverviewItem>
                </dl>
                <div className="mt-4">
                  <p className="text-2xs font-medium uppercase tracking-wide text-content-subtle">Description</p>
                  <p className="mt-1 text-sm leading-relaxed text-content-secondary whitespace-pre-line">
                    {deck.description || <span className="italic text-content-subtle">No description yet.</span>}
                  </p>
                </div>
              </>
            )}
          </section>

          <CardList cards={cards} editor={editor} />
        </div>

        <CardEditorPanel editor={editor} idPrefix="card" className="lg:sticky lg:top-4"
          footnote={<>Cards are added to the list and saved with <span className="font-medium text-content-soft">Save Changes</span>.</>} />
      </div>

      <Modal open={confirmLeave} onClose={() => setConfirmLeave(false)} title="Discard changes?" size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmLeave(false)}>Keep Editing</Button>
            <Button variant="danger" onClick={leave}>Discard</Button>
          </>
        }>
        <p className="text-base text-content-secondary">You have unsaved changes to this deck. Leaving now will discard them.</p>
      </Modal>
    </div>
  );
}

function OverviewItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs font-medium uppercase tracking-wide text-content-subtle">{label}</dt>
      <dd className="mt-1 text-base font-semibold text-content">{children}</dd>
    </div>
  );
}
