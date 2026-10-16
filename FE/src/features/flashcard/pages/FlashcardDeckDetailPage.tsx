import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/ToastHost';
import { Icon } from '@/assets/icons';
import { ROUTES } from '@/app/routes';
import {
  FLASHCARD_COURSES,
  commitDeck,
  courseTitle,
  formatDeckTimestamp,
  getDeck,
  getDeckCards,
  nextCardId,
  type DeckStatus,
  type Flashcard,
  type FlashcardDeck,
} from '../mockFlashcardDecks';

const STATUS_VARIANT: Record<DeckStatus, BadgeVariant> = {
  Published: 'success',
  Draft: 'warning',
  Archived: 'default',
};

const NAME_MAX = 120;
const DESCRIPTION_MAX = 500;
const SIDE_MAX = 500;

const textareaClass =
  'w-full px-3 py-2.5 rounded-[10px] border bg-white text-[14px] text-[#111827] leading-relaxed resize-none placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]';

const sameCards = (a: Flashcard[], b: Flashcard[]) =>
  a.length === b.length && a.every((c, i) => c.id === b[i]!.id && c.front === b[i]!.front && c.back === b[i]!.back);

const sameMeta = (a: FlashcardDeck, b: FlashcardDeck) =>
  a.name === b.name && a.courseId === b.courseId && a.description === b.description;

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
  const [nameError, setNameError] = useState('');

  // Card editor
  const [editingId, setEditingId] = useState<string | null>(null);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [editorErrors, setEditorErrors] = useState<{ front?: string; back?: string }>({});
  const frontRef = useRef<HTMLTextAreaElement>(null);

  const [confirmLeave, setConfirmLeave] = useState(false);

  const dirty = !!committed && !!deck && (!sameMeta(deck, committed.deck) || !sameCards(cards, committed.cards));
  const editorHasInput = front.trim() !== '' || back.trim() !== '';

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
          <Icon.Layers className="w-10 h-10 mx-auto text-[#D1D5DB]" />
          <h2 className="mt-4 text-[18px] font-bold text-[#111827]">Deck not found</h2>
          <p className="mt-1 text-[13px] text-[#6B7280]">This flashcard deck does not exist or has been removed.</p>
          <Button className="mt-6" onClick={() => navigate(ROUTES.managerFlashcards)}>Back to Flashcards</Button>
        </div>
      </div>
    );
  }

  const editingIndex = editingId ? cards.findIndex(c => c.id === editingId) : -1;

  const clearEditor = () => {
    setEditingId(null);
    setFront('');
    setBack('');
    setEditorErrors({});
  };

  const loadCard = (card: Flashcard) => {
    setEditingId(card.id);
    setFront(card.front);
    setBack(card.back);
    setEditorErrors({});
    frontRef.current?.focus({ preventScroll: window.innerWidth >= 1024 });
  };

  const submitCard = () => {
    const f = front.trim();
    const b = back.trim();
    const errors: { front?: string; back?: string } = {};
    if (!f) errors.front = 'Front side is required.';
    else if (f.length > SIDE_MAX) errors.front = `Front side must be ${SIDE_MAX} characters or fewer.`;
    else if (cards.some(c => c.id !== editingId && c.front.trim().toLowerCase() === f.toLowerCase())) {
      errors.front = 'Another card in this deck already has this front text.';
    }
    if (!b) errors.back = 'Back side is required.';
    else if (b.length > SIDE_MAX) errors.back = `Back side must be ${SIDE_MAX} characters or fewer.`;
    setEditorErrors(errors);
    if (errors.front || errors.back) return;

    if (editingId) {
      setCards(prev => prev.map(c => (c.id === editingId ? { ...c, front: f, back: b } : c)));
      toast.success(`Card #${editingIndex + 1} updated.`);
    } else {
      setCards(prev => [...prev, { id: nextCardId(deck.id), front: f, back: b }]);
      toast.success('Card added to the deck.');
    }
    clearEditor();
  };

  const deleteCard = (card: Flashcard, index: number) => {
    setCards(prev => prev.filter(c => c.id !== card.id));
    if (editingId === card.id) clearEditor();
    toast.info(`Card #${index + 1} removed. Save to apply or Cancel to undo.`);
  };

  const updateMeta = (patch: Partial<FlashcardDeck>) => setDeck(prev => (prev ? { ...prev, ...patch } : prev));

  const handleSave = () => {
    const name = deck.name.trim();
    if (!name) { setEditingInfo(true); setNameError('Deck name is required.'); return; }
    if (name.length > NAME_MAX) { setEditingInfo(true); setNameError(`Deck name must be ${NAME_MAX} characters or fewer.`); return; }
    if (deck.description.length > DESCRIPTION_MAX) {
      setEditingInfo(true);
      toast.error(`Description must be ${DESCRIPTION_MAX} characters or fewer.`);
      return;
    }
    if (deck.status === 'Published' && cards.length === 0) {
      toast.error('A published deck must contain at least one card.');
      return;
    }
    if (editorHasInput) {
      toast.warning(editingId ? 'Update or clear the card in the editor before saving.' : 'Add or clear the card in the editor before saving.');
      frontRef.current?.focus();
      return;
    }
    const saved = commitDeck({ ...deck, name, description: deck.description.trim() }, cards);
    setCommitted({ deck: saved, cards });
    setDeck(saved);
    setEditingInfo(false);
    setNameError('');
    toast.success(`"${saved.name}" saved.`);
  };

  const leave = () => navigate(ROUTES.managerFlashcards);
  const handleCancel = () => (dirty || editorHasInput ? setConfirmLeave(true) : leave());

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <div className="space-y-2">
        <Breadcrumb items={[{ label: 'Flashcards', onClick: handleCancel }, { label: committed.deck.name }]} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[22px] font-bold text-[#111827]">Flashcard Detail</h2>
            <p className="text-[13px] text-[#6B7280] mt-0.5">
              {committed.deck.id} · Last updated {formatDeckTimestamp(committed.deck.updatedAt)}
              {dirty && <span className="ml-2 font-medium text-[#D97706]">· Unsaved changes</span>}
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
                  <h3 id="deck-overview-title" className="text-[15px] font-semibold text-[#111827]">Edit Deck Info</h3>
                  <Button size="sm" variant="ghost" onClick={() => { setEditingInfo(false); setNameError(''); }}>Done</Button>
                </div>
                <Input label="Deck name" value={deck.name} maxLength={NAME_MAX} error={nameError}
                  onChange={e => { updateMeta({ name: e.target.value }); if (nameError) setNameError(''); }} />
                <Select label="Course" value={deck.courseId} onChange={v => updateMeta({ courseId: v })}
                  options={FLASHCARD_COURSES.map(c => ({ label: c.title, value: c.id }))} />
                <div>
                  <label htmlFor="deck-description" className="block text-[13px] font-medium text-[#374151] mb-1.5">Description</label>
                  <textarea id="deck-description" rows={3} maxLength={DESCRIPTION_MAX} value={deck.description}
                    onChange={e => updateMeta({ description: e.target.value })}
                    placeholder="What does this deck cover?"
                    className={`${textareaClass} border-[#E5E7EB]`} />
                  <p className="mt-1 text-right text-[11px] text-[#9CA3AF]">{deck.description.length}/{DESCRIPTION_MAX}</p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <h3 id="deck-overview-title" className="text-[20px] font-bold text-[#111827] break-words min-w-0">{deck.name}</h3>
                  <button onClick={() => setEditingInfo(true)} aria-label="Edit deck info" title="Edit deck info"
                    className="flex-shrink-0 p-1.5 rounded-[6px] text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827]">
                    <Icon.Edit className="w-4 h-4" />
                  </button>
                </div>
                <dl className="mt-4 grid grid-cols-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4">
                  <div className="col-span-2 sm:col-span-1 min-w-0">
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-[#9CA3AF]">Course</dt>
                    <dd className="mt-1 text-[14px] font-semibold text-[#111827] truncate" title={courseTitle(deck.courseId)}>{courseTitle(deck.courseId)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-[#9CA3AF]">Status</dt>
                    <dd className="mt-1"><Badge variant={STATUS_VARIANT[deck.status]}>{deck.status}</Badge></dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-[#9CA3AF]">Card Count</dt>
                    <dd className="mt-1 text-[14px] font-semibold text-[#111827]">{cards.length}</dd>
                  </div>
                </dl>
                <div className="mt-4">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-[#9CA3AF]">Description</p>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-[#374151] whitespace-pre-line">
                    {deck.description || <span className="italic text-[#9CA3AF]">No description yet.</span>}
                  </p>
                </div>
              </>
            )}
          </section>

          {/* Card list */}
          <section aria-labelledby="deck-cards-title" className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 id="deck-cards-title" className="text-[16px] font-semibold text-[#111827]">Flashcards in this Deck</h3>
              <span className="text-[13px] text-[#6B7280]">{cards.length} card{cards.length === 1 ? '' : 's'}</span>
            </div>

            {cards.length === 0 ? (
              <div className="card px-4 py-14 text-center">
                <Icon.Layers className="w-10 h-10 mx-auto text-[#D1D5DB]" />
                <p className="mt-3 text-[14px] font-medium text-[#374151]">This deck has no cards yet</p>
                <p className="text-[13px] text-[#9CA3AF]">Use the card editor to add the first one.</p>
              </div>
            ) : (
              <ol className="space-y-3">
                {cards.map((card, i) => {
                  const active = card.id === editingId;
                  return (
                    <li key={card.id}
                      className={`card p-4 transition-colors ${active ? '!border-[#2563EB] ring-2 ring-[#2563EB]/15' : ''}`}>
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-6 min-w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#F3F4F6] px-1.5 text-[11px] font-semibold text-[#6B7280]">{i + 1}</span>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div>
                            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[#2563EB]">Front</p>
                            <p className="mt-0.5 text-[14px] font-semibold text-[#111827] break-words whitespace-pre-line">{card.front}</p>
                          </div>
                          <div>
                            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[#16A34A]">Back</p>
                            <p className="mt-0.5 text-[13.5px] text-[#374151] break-words whitespace-pre-line">{card.back}</p>
                          </div>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-0.5">
                          {active && <Badge variant="info" className="mr-1">Editing</Badge>}
                          <button onClick={() => loadCard(card)} aria-label={`Edit card ${i + 1}`} title="Edit card"
                            className="p-1.5 rounded-[6px] text-[#6B7280] hover:bg-[#EFF6FF] hover:text-[#2563EB]">
                            <Icon.Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => deleteCard(card, i)} aria-label={`Delete card ${i + 1}`} title="Delete card"
                            className="p-1.5 rounded-[6px] text-[#6B7280] hover:bg-[#FEF2F2] hover:text-[#DC2626]">
                            <Icon.Trash className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>

        {/* Card editor */}
        <aside className="card p-5 space-y-4 lg:sticky lg:top-4" aria-labelledby="card-editor-title">
          <div className="flex items-center justify-between gap-2">
            <h3 id="card-editor-title" className="text-[16px] font-semibold text-[#111827]">
              {editingId ? `Edit Card #${editingIndex + 1}` : 'Card Editor'}
            </h3>
            {!editingId && <span className="text-[12px] text-[#9CA3AF]">New card</span>}
          </div>

          <form className="space-y-4" onSubmit={e => { e.preventDefault(); submitCard(); }}>
            <EditorField id="card-front" label="Front Side" hint="Term, question or prompt" ref={frontRef}
              value={front} error={editorErrors.front} placeholder="e.g. What is gradient descent?"
              onChange={v => { setFront(v); if (editorErrors.front) setEditorErrors(p => ({ ...p, front: undefined })); }} />
            <EditorField id="card-back" label="Back Side" hint="Definition, explanation or answer"
              value={back} error={editorErrors.back} placeholder="e.g. An optimisation algorithm that…"
              onChange={v => { setBack(v); if (editorErrors.back) setEditorErrors(p => ({ ...p, back: undefined })); }} />

            <div className="space-y-2 pt-1">
              <Button type="submit" className="w-full" icon={editingId ? <Icon.Check className="w-4 h-4" /> : <Icon.Plus className="w-4 h-4" />}>
                {editingId ? 'Update Card' : 'Add Card'}
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={clearEditor} disabled={!editingId && !editorHasInput}>
                {editingId ? 'Cancel Editing' : 'Clear Editor'}
              </Button>
            </div>
          </form>
          <p className="text-[12px] text-[#9CA3AF]">Cards are added to the list below and saved with <span className="font-medium text-[#6B7280]">Save Changes</span>.</p>
        </aside>
      </div>

      <Modal open={confirmLeave} onClose={() => setConfirmLeave(false)} title="Discard changes?" size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmLeave(false)}>Keep Editing</Button>
            <Button variant="danger" onClick={leave}>Discard</Button>
          </>
        }>
        <p className="text-[14px] text-[#374151]">You have unsaved changes to this deck. Leaving now will discard them.</p>
      </Modal>
    </div>
  );
}

const EditorField = React.forwardRef<HTMLTextAreaElement, {
  id: string;
  label: string;
  hint: string;
  value: string;
  placeholder: string;
  error?: string;
  onChange: (value: string) => void;
}>(function EditorField({ id, label, hint, value, placeholder, error, onChange }, ref) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <label htmlFor={id} className="text-[13px] font-semibold text-[#374151]">{label}</label>
        <span className="text-[11px] text-[#9CA3AF]">{hint}</span>
      </div>
      <textarea ref={ref} id={id} rows={4} value={value} placeholder={placeholder} maxLength={SIDE_MAX}
        aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
        onChange={e => onChange(e.target.value)}
        className={`${textareaClass} ${error ? 'border-[#DC2626] focus:border-[#DC2626] focus:ring-[#DC2626]/20' : 'border-[#E5E7EB]'}`} />
      <div className="mt-1 flex justify-between gap-2 text-[11px]">
        <span id={`${id}-error`} className="text-[#DC2626]">{error}</span>
        <span className="text-[#9CA3AF]">{value.length}/{SIDE_MAX}</span>
      </div>
    </div>
  );
});
