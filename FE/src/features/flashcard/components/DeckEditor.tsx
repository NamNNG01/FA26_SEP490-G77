import React, { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/ToastHost';
import { Icon } from '@/assets/icons';
import { courseService, type CourseSummaryItem } from '@/services/course.service';
import { isCardApiMissing, type DeckCard } from '@/services/deck.service';

/**
 * Building blocks shared by the Flashcard Detail page and the New Flashcard
 * Deck modal: deck info inputs, the visibility badge, the card list and the
 * side card editor.
 */

/** Matches DeckRequests.title's @Size(max = 255). */
export const NAME_MAX = 255;
export const DESCRIPTION_MAX = 500;

export const textareaClass =
  'w-full px-3 py-2.5 rounded-[10px] border bg-surface text-base text-content leading-relaxed resize-none placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600';

export function VisibilityBadge({ isPublic }: { isPublic: boolean }) {
  return <Badge variant={isPublic ? 'success' : 'default'}>{isPublic ? 'Public' : 'Private'}</Badge>;
}

/** Select value for "no course" — a personal deck only its owner can see. */
export const NO_COURSE = '';

export const errorMessage = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

/**
 * Courses the signed-in Course Manager manages — GET /manager/courses is
 * already scoped to them, so the course pickers only offer their own courses.
 */
export function useManagedCourses() {
  const [courses, setCourses] = useState<CourseSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    courseService.getCourses({ size: 100, sort: 'title,asc' })
      .then(res => { if (!cancelled) setCourses(res.content); })
      .catch(() => { if (!cancelled) setCourses([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  return { courses, loading };
}

// ── Deck info ────────────────────────────────────────────────────────────────

export interface DeckInfo {
  title: string;
  /** Course id as a select value; NO_COURSE for a personal deck. */
  courseId: string;
  isPublic: boolean;
  description: string;
}

export type DeckInfoErrors = Partial<Record<'title' | 'description', string>>;

export function validateDeckInfo(info: DeckInfo): DeckInfoErrors {
  const errors: DeckInfoErrors = {};
  const title = info.title.trim();
  if (!title) errors.title = 'Deck name is required.';
  else if (title.length > NAME_MAX) errors.title = `Deck name must be ${NAME_MAX} characters or fewer.`;
  if (info.description.length > DESCRIPTION_MAX) errors.description = `Description must be ${DESCRIPTION_MAX} characters or fewer.`;
  return errors;
}

export function DeckInfoFields({ value, onChange, errors = {}, courses, coursesLoading, allowNoCourse, idPrefix }: {
  value: DeckInfo;
  onChange: (patch: Partial<DeckInfo>) => void;
  errors?: DeckInfoErrors;
  courses: { id: string; title: string }[];
  coursesLoading?: boolean;
  /** The API cannot detach a deck from its course, so "No course" is only offered when it is allowed. */
  allowNoCourse: boolean;
  idPrefix: string;
}) {
  const courseOptions = [
    ...(allowNoCourse ? [{ label: 'No course (personal deck)', value: NO_COURSE }] : []),
    ...courses.map(c => ({ label: c.title, value: c.id })),
  ];
  return (
    <div className="space-y-4">
      <Input label="Deck name" placeholder="e.g. Gradient Descent Essentials" value={value.title} maxLength={NAME_MAX}
        error={errors.title} onChange={e => onChange({ title: e.target.value })} />
      <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Select label="Course" value={value.courseId} onChange={v => onChange({ courseId: v })} disabled={coursesLoading}
          options={coursesLoading ? [{ label: 'Loading courses…', value: value.courseId }] : courseOptions} />
        <Select label="Visibility" value={value.isPublic ? 'public' : 'private'} onChange={v => onChange({ isPublic: v === 'public' })}
          options={[{ label: 'Private', value: 'private' }, { label: 'Public', value: 'public' }]} />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-description`} className="block text-sm font-medium text-content-secondary mb-1.5">Description</label>
        <textarea id={`${idPrefix}-description`} rows={3} maxLength={DESCRIPTION_MAX} value={value.description}
          onChange={e => onChange({ description: e.target.value })}
          placeholder="What does this deck cover?"
          className={`${textareaClass} ${errors.description ? 'border-danger-solid' : 'border-line'}`} />
        <div className="mt-1 flex justify-between gap-2 text-2xs">
          <span className="text-danger">{errors.description}</span>
          <span className="text-content-subtle">{value.description.length}/{DESCRIPTION_MAX}</span>
        </div>
      </div>
    </div>
  );
}

// ── Card editor state ────────────────────────────────────────────────────────

const SIDE_MAX = 500;

/** A card as the editor sees it — saved cards use their cardId, drafts a temporary id. */
export interface EditableCard {
  id: string;
  frontText: string;
  backText: string;
}

export const toEditableCard = (c: DeckCard): EditableCard => ({ id: String(c.cardId), frontText: c.frontText, backText: c.backText });

/**
 * Where card edits go: the create modal keeps them in a local draft, the
 * detail page sends them to the card API. Throw to keep the editor's input.
 */
export interface CardActions {
  add: (frontText: string, backText: string) => Promise<void> | void;
  update: (card: EditableCard, frontText: string, backText: string) => Promise<void> | void;
  remove: (card: EditableCard) => Promise<void> | void;
}

/** Message for a failed card call — calls the BE does not have yet get a clear note. */
export const cardErrorMessage = (err: unknown, fallback: string) =>
  isCardApiMissing(err) ? 'The card API is not available on the server yet.' : errorMessage(err, fallback);

export interface CardEditor {
  editingId: string | null;
  editingIndex: number;
  front: string;
  back: string;
  errors: { front?: string; back?: string };
  /** True when either side has text that has not been added to the list. */
  hasInput: boolean;
  /** A card call is in flight. */
  busy: boolean;
  /** Card awaiting a delete confirmation (only with `confirmRemove`). */
  pendingRemoveId: string | null;
  frontRef: React.RefObject<HTMLTextAreaElement | null>;
  setFront: (v: string) => void;
  setBack: (v: string) => void;
  clear: () => void;
  load: (card: EditableCard) => void;
  submit: () => void;
  remove: (card: EditableCard, index: number) => void;
  confirmRemove: (card: EditableCard, index: number) => void;
  cancelRemove: () => void;
}

/** Authoring state for one deck's cards; `actions` decides where edits are written. */
export function useCardEditor(cards: EditableCard[], actions: CardActions, options: { confirmRemove?: boolean } = {}): CardEditor {
  const toast = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [front, setFrontRaw] = useState('');
  const [back, setBackRaw] = useState('');
  const [errors, setErrors] = useState<{ front?: string; back?: string }>({});
  const [busy, setBusy] = useState(false);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const frontRef = useRef<HTMLTextAreaElement>(null);

  const editingIndex = editingId ? cards.findIndex(c => c.id === editingId) : -1;

  const clear = () => {
    setEditingId(null);
    setFrontRaw('');
    setBackRaw('');
    setErrors({});
  };

  const load = (card: EditableCard) => {
    setEditingId(card.id);
    setFrontRaw(card.frontText);
    setBackRaw(card.backText);
    setErrors({});
    frontRef.current?.focus({ preventScroll: window.innerWidth >= 1024 });
  };

  const submit = async () => {
    if (busy) return;
    const f = front.trim();
    const b = back.trim();
    const next: { front?: string; back?: string } = {};
    if (!f) next.front = 'Front side is required.';
    else if (f.length > SIDE_MAX) next.front = `Front side must be ${SIDE_MAX} characters or fewer.`;
    else if (cards.some(c => c.id !== editingId && c.frontText.trim().toLowerCase() === f.toLowerCase())) {
      next.front = 'Another card in this deck already has this front text.';
    }
    if (!b) next.back = 'Back side is required.';
    else if (b.length > SIDE_MAX) next.back = `Back side must be ${SIDE_MAX} characters or fewer.`;
    setErrors(next);
    if (next.front || next.back) return;

    const editing = editingId ? cards.find(c => c.id === editingId) : undefined;
    setBusy(true);
    try {
      if (editing) {
        await actions.update(editing, f, b);
        toast.success(`Card #${editingIndex + 1} updated.`);
      } else {
        await actions.add(f, b);
        toast.success('Card added to the deck.');
      }
      clear();
    } catch (err) {
      toast.error(cardErrorMessage(err, editing ? 'Could not update the card.' : 'Could not add the card.'));
    } finally {
      setBusy(false);
    }
  };

  const doRemove = async (card: EditableCard, index: number) => {
    setBusy(true);
    try {
      await actions.remove(card);
      if (editingId === card.id) clear();
      setPendingRemoveId(null);
      toast.info(`Card #${index + 1} removed.`);
    } catch (err) {
      toast.error(cardErrorMessage(err, 'Could not delete the card.'));
    } finally {
      setBusy(false);
    }
  };

  return {
    editingId,
    editingIndex,
    front,
    back,
    errors,
    hasInput: front.trim() !== '' || back.trim() !== '',
    busy,
    pendingRemoveId,
    frontRef,
    setFront: v => { setFrontRaw(v); if (errors.front) setErrors(p => ({ ...p, front: undefined })); },
    setBack: v => { setBackRaw(v); if (errors.back) setErrors(p => ({ ...p, back: undefined })); },
    clear,
    load,
    submit,
    remove: (card, index) => { if (options.confirmRemove) setPendingRemoveId(card.id); else void doRemove(card, index); },
    confirmRemove: (card, index) => { void doRemove(card, index); },
    cancelRemove: () => setPendingRemoveId(null),
  };
}

// ── Card list ────────────────────────────────────────────────────────────────

export function CardList({ cards, editor, emptyHint = 'Use the card editor to add the first one.' }: {
  cards: EditableCard[];
  editor: CardEditor;
  emptyHint?: string;
}) {
  return (
    <section aria-label="Flashcards in this deck" className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-content">Flashcards in this Deck</h3>
        <span className="text-sm text-content-soft">{cards.length} card{cards.length === 1 ? '' : 's'}</span>
      </div>

      {cards.length === 0 ? (
        <div className="card px-4 py-12 text-center">
          <Icon.Layers className="w-10 h-10 mx-auto text-content-faint" />
          <p className="mt-3 text-base font-medium text-content-secondary">This deck has no cards yet</p>
          <p className="text-sm text-content-subtle">{emptyHint}</p>
        </div>
      ) : (
        <ol className="space-y-3">
          {cards.map((card, i) => {
            const active = card.id === editor.editingId;
            const confirming = card.id === editor.pendingRemoveId;
            return (
              <li key={card.id} className={`card p-4 transition-colors ${active ? '!border-brand-600 ring-2 ring-brand-600/15' : ''}`}>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 min-w-6 flex-shrink-0 items-center justify-center rounded-full bg-surface-muted px-1.5 text-2xs font-semibold text-content-soft">{i + 1}</span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div>
                      <p className="text-2xs font-semibold uppercase tracking-wider text-brand-ink">Front</p>
                      <p className="mt-0.5 text-base font-semibold text-content break-words whitespace-pre-line">{card.frontText}</p>
                    </div>
                    <div>
                      <p className="text-2xs font-semibold uppercase tracking-wider text-success">Back</p>
                      <p className="mt-0.5 text-sm text-content-secondary break-words whitespace-pre-line">{card.backText}</p>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-0.5">
                    {active && <Badge variant="info" className="mr-1">Editing</Badge>}
                    <button type="button" onClick={() => editor.load(card)} disabled={editor.busy} aria-label={`Edit card ${i + 1}`} title="Edit card"
                      className="p-1.5 rounded-[6px] text-content-soft hover:bg-primary-hover-tint hover:text-brand-ink disabled:opacity-50">
                      <Icon.Edit className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => editor.remove(card, i)} disabled={editor.busy} aria-label={`Delete card ${i + 1}`} title="Delete card"
                      className="p-1.5 rounded-[6px] text-content-soft hover:bg-danger-light hover:text-danger disabled:opacity-50">
                      <Icon.Trash className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {confirming && (
                  <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-line-soft pt-3">
                    <span className="mr-auto text-sm text-content-secondary">Delete this card permanently?</span>
                    <Button size="sm" variant="outline" onClick={editor.cancelRemove} disabled={editor.busy}>Keep</Button>
                    <Button size="sm" variant="danger" onClick={() => editor.confirmRemove(card, i)} disabled={editor.busy}>
                      {editor.busy ? 'Deleting…' : 'Delete'}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

// ── Card editor panel ────────────────────────────────────────────────────────

export function CardEditorPanel({ editor, idPrefix, footnote, className = '' }: {
  editor: CardEditor;
  idPrefix: string;
  footnote?: React.ReactNode;
  className?: string;
}) {
  return (
    <aside className={`card p-5 space-y-4 ${className}`} aria-labelledby={`${idPrefix}-editor-title`}>
      <div className="flex items-center justify-between gap-2">
        <h3 id={`${idPrefix}-editor-title`} className="text-lg font-semibold text-content">
          {editor.editingId ? `Edit Card #${editor.editingIndex + 1}` : 'Card Editor'}
        </h3>
        {!editor.editingId && <span className="text-xs text-content-subtle">New card</span>}
      </div>

      {/* A div, not a form: the editor also lives inside the create-deck modal. */}
      <div className="space-y-4" onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); editor.submit(); } }}>
        <EditorField id={`${idPrefix}-front`} label="Front Side" hint="Term, question or prompt" ref={editor.frontRef}
          value={editor.front} error={editor.errors.front} placeholder="e.g. What is gradient descent?" onChange={editor.setFront} />
        <EditorField id={`${idPrefix}-back`} label="Back Side" hint="Definition, explanation or answer"
          value={editor.back} error={editor.errors.back} placeholder="e.g. An optimisation algorithm that…" onChange={editor.setBack} />

        <div className="space-y-2 pt-1">
          <Button type="button" className="w-full" onClick={editor.submit} disabled={editor.busy}
            icon={editor.editingId ? <Icon.Check className="w-4 h-4" /> : <Icon.Plus className="w-4 h-4" />}>
            {editor.busy ? 'Saving…' : editor.editingId ? 'Update Card' : 'Add Card'}
          </Button>
          <Button type="button" variant="outline" className="w-full" onClick={editor.clear}
            disabled={editor.busy || (!editor.editingId && !editor.hasInput)}>
            {editor.editingId ? 'Cancel Editing' : 'Clear Editor'}
          </Button>
        </div>
      </div>
      {footnote && <p className="text-xs text-content-subtle">{footnote}</p>}
    </aside>
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
        <label htmlFor={id} className="text-sm font-semibold text-content-secondary">{label}</label>
        <span className="text-2xs text-content-subtle">{hint}</span>
      </div>
      <textarea ref={ref} id={id} rows={4} value={value} placeholder={placeholder} maxLength={SIDE_MAX}
        aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
        onChange={e => onChange(e.target.value)}
        className={`${textareaClass} ${error ? 'border-danger-solid focus:border-danger-solid focus:ring-danger-solid/20' : 'border-line'}`} />
      <div className="mt-1 flex justify-between gap-2 text-2xs">
        <span id={`${id}-error`} className="text-danger">{error}</span>
        <span className="text-content-subtle">{value.length}/{SIDE_MAX}</span>
      </div>
    </div>
  );
});
