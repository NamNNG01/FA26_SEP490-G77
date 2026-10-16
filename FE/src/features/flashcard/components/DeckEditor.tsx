import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/ToastHost';
import { Icon } from '@/assets/icons';
import {
  FLASHCARD_COURSES,
  flashcardModules,
  nextCardId,
  type DeckStatus,
  type Flashcard,
  type FlashcardDeck,
} from '../mockFlashcardDecks';

/**
 * Building blocks shared by the Flashcard Detail page and the New Flashcard
 * modal: deck info inputs, the card list and the side card editor.
 */

export const STATUS_VARIANT: Record<DeckStatus, BadgeVariant> = {
  Published: 'success',
  Draft: 'warning',
  Archived: 'default',
};

export const NAME_MAX = 120;
export const DESCRIPTION_MAX = 500;
const SIDE_MAX = 500;

export const textareaClass =
  'w-full px-3 py-2.5 rounded-[10px] border bg-white text-[14px] text-[#111827] leading-relaxed resize-none placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]';

// ── Deck info ────────────────────────────────────────────────────────────────

export type DeckInfo = Pick<FlashcardDeck, 'name' | 'courseId' | 'moduleId' | 'description' | 'status'>;
export type DeckInfoErrors = Partial<Record<'name' | 'moduleId' | 'description', string>>;

export function validateDeckInfo(info: DeckInfo): DeckInfoErrors {
  const errors: DeckInfoErrors = {};
  const name = info.name.trim();
  if (!name) errors.name = 'Deck name is required.';
  else if (name.length > NAME_MAX) errors.name = `Deck name must be ${NAME_MAX} characters or fewer.`;
  if (!flashcardModules(info.courseId).some(m => m.id === info.moduleId)) errors.moduleId = 'Select a module.';
  if (info.description.length > DESCRIPTION_MAX) errors.description = `Description must be ${DESCRIPTION_MAX} characters or fewer.`;
  return errors;
}

/** Module the deck should fall back to when its course changes. */
export const firstModuleOf = (courseId: string) => flashcardModules(courseId)[0]?.id ?? '';

export function DeckInfoFields({ value, onChange, errors = {}, showStatus, idPrefix }: {
  value: DeckInfo;
  onChange: (patch: Partial<DeckInfo>) => void;
  errors?: DeckInfoErrors;
  /** Status is chosen when creating; afterwards it changes from the list's row menu. */
  showStatus?: boolean;
  idPrefix: string;
}) {
  const modules = flashcardModules(value.courseId);
  return (
    <div className="space-y-4">
      <Input label="Deck name" placeholder="e.g. Gradient Descent Essentials" value={value.name} maxLength={NAME_MAX}
        error={errors.name} onChange={e => onChange({ name: e.target.value })} />
      <div className={`grid gap-4 ${showStatus ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <Select label="Course" value={value.courseId}
          // Changing course re-scopes the module list; keep the two consistent.
          onChange={v => onChange({ courseId: v, moduleId: firstModuleOf(v) })}
          options={FLASHCARD_COURSES.map(c => ({ label: c.title, value: c.id }))} />
        <div>
          <Select label="Module" value={value.moduleId} onChange={v => onChange({ moduleId: v })}
            options={modules.length > 0
              ? modules.map(m => ({ label: m.title, value: m.id }))
              : [{ label: 'No modules in this course', value: '' }]} />
          {errors.moduleId && <p className="mt-1.5 text-[12px] text-[#DC2626]">{errors.moduleId}</p>}
        </div>
        {showStatus && (
          <Select label="Status" value={value.status} onChange={v => onChange({ status: v as DeckStatus })}
            options={(['Draft', 'Published'] as DeckStatus[]).map(s => ({ label: s, value: s }))} />
        )}
      </div>
      <div>
        <label htmlFor={`${idPrefix}-description`} className="block text-[13px] font-medium text-[#374151] mb-1.5">Description</label>
        <textarea id={`${idPrefix}-description`} rows={3} maxLength={DESCRIPTION_MAX} value={value.description}
          onChange={e => onChange({ description: e.target.value })}
          placeholder="What does this deck cover?"
          className={`${textareaClass} ${errors.description ? 'border-[#DC2626]' : 'border-[#E5E7EB]'}`} />
        <div className="mt-1 flex justify-between gap-2 text-[11px]">
          <span className="text-[#DC2626]">{errors.description}</span>
          <span className="text-[#9CA3AF]">{value.description.length}/{DESCRIPTION_MAX}</span>
        </div>
      </div>
    </div>
  );
}

// ── Card editor state ────────────────────────────────────────────────────────

export interface CardEditor {
  editingId: string | null;
  editingIndex: number;
  front: string;
  back: string;
  errors: { front?: string; back?: string };
  /** True when either side has text that has not been added to the list. */
  hasInput: boolean;
  frontRef: React.RefObject<HTMLTextAreaElement | null>;
  setFront: (v: string) => void;
  setBack: (v: string) => void;
  clear: () => void;
  load: (card: Flashcard) => void;
  submit: () => void;
  remove: (card: Flashcard, index: number) => void;
}

/** Authoring state for one deck's cards; `setCards` is the owner's draft setter. */
export function useCardEditor(deckId: string, cards: Flashcard[], setCards: React.Dispatch<React.SetStateAction<Flashcard[]>>): CardEditor {
  const toast = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [front, setFrontRaw] = useState('');
  const [back, setBackRaw] = useState('');
  const [errors, setErrors] = useState<{ front?: string; back?: string }>({});
  const frontRef = useRef<HTMLTextAreaElement>(null);

  const editingIndex = editingId ? cards.findIndex(c => c.id === editingId) : -1;

  const clear = () => {
    setEditingId(null);
    setFrontRaw('');
    setBackRaw('');
    setErrors({});
  };

  const load = (card: Flashcard) => {
    setEditingId(card.id);
    setFrontRaw(card.front);
    setBackRaw(card.back);
    setErrors({});
    frontRef.current?.focus({ preventScroll: window.innerWidth >= 1024 });
  };

  const submit = () => {
    const f = front.trim();
    const b = back.trim();
    const next: { front?: string; back?: string } = {};
    if (!f) next.front = 'Front side is required.';
    else if (f.length > SIDE_MAX) next.front = `Front side must be ${SIDE_MAX} characters or fewer.`;
    else if (cards.some(c => c.id !== editingId && c.front.trim().toLowerCase() === f.toLowerCase())) {
      next.front = 'Another card in this deck already has this front text.';
    }
    if (!b) next.back = 'Back side is required.';
    else if (b.length > SIDE_MAX) next.back = `Back side must be ${SIDE_MAX} characters or fewer.`;
    setErrors(next);
    if (next.front || next.back) return;

    if (editingId) {
      setCards(prev => prev.map(c => (c.id === editingId ? { ...c, front: f, back: b } : c)));
      toast.success(`Card #${editingIndex + 1} updated.`);
    } else {
      setCards(prev => [...prev, { id: nextCardId(deckId), front: f, back: b }]);
      toast.success('Card added to the deck.');
    }
    clear();
  };

  const remove = (card: Flashcard, index: number) => {
    setCards(prev => prev.filter(c => c.id !== card.id));
    if (editingId === card.id) clear();
    toast.info(`Card #${index + 1} removed.`);
  };

  return {
    editingId,
    editingIndex,
    front,
    back,
    errors,
    hasInput: front.trim() !== '' || back.trim() !== '',
    frontRef,
    setFront: v => { setFrontRaw(v); if (errors.front) setErrors(p => ({ ...p, front: undefined })); },
    setBack: v => { setBackRaw(v); if (errors.back) setErrors(p => ({ ...p, back: undefined })); },
    clear,
    load,
    submit,
    remove,
  };
}

// ── Card list ────────────────────────────────────────────────────────────────

export function CardList({ cards, editor, emptyHint = 'Use the card editor to add the first one.' }: {
  cards: Flashcard[];
  editor: CardEditor;
  emptyHint?: string;
}) {
  return (
    <section aria-label="Flashcards in this deck" className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[16px] font-semibold text-[#111827]">Flashcards in this Deck</h3>
        <span className="text-[13px] text-[#6B7280]">{cards.length} card{cards.length === 1 ? '' : 's'}</span>
      </div>

      {cards.length === 0 ? (
        <div className="card px-4 py-12 text-center">
          <Icon.Layers className="w-10 h-10 mx-auto text-[#D1D5DB]" />
          <p className="mt-3 text-[14px] font-medium text-[#374151]">This deck has no cards yet</p>
          <p className="text-[13px] text-[#9CA3AF]">{emptyHint}</p>
        </div>
      ) : (
        <ol className="space-y-3">
          {cards.map((card, i) => {
            const active = card.id === editor.editingId;
            return (
              <li key={card.id} className={`card p-4 transition-colors ${active ? '!border-[#2563EB] ring-2 ring-[#2563EB]/15' : ''}`}>
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
                    <button type="button" onClick={() => editor.load(card)} aria-label={`Edit card ${i + 1}`} title="Edit card"
                      className="p-1.5 rounded-[6px] text-[#6B7280] hover:bg-[#EFF6FF] hover:text-[#2563EB]">
                      <Icon.Edit className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => editor.remove(card, i)} aria-label={`Delete card ${i + 1}`} title="Delete card"
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
  );
}

// ── Card editor panel ────────────────────────────────────────────────────────

export function CardEditorPanel({ editor, idPrefix, footnote, className = '' }: {
  editor: CardEditor;
  idPrefix: string;
  footnote: React.ReactNode;
  className?: string;
}) {
  return (
    <aside className={`card p-5 space-y-4 ${className}`} aria-labelledby={`${idPrefix}-editor-title`}>
      <div className="flex items-center justify-between gap-2">
        <h3 id={`${idPrefix}-editor-title`} className="text-[16px] font-semibold text-[#111827]">
          {editor.editingId ? `Edit Card #${editor.editingIndex + 1}` : 'Card Editor'}
        </h3>
        {!editor.editingId && <span className="text-[12px] text-[#9CA3AF]">New card</span>}
      </div>

      {/* A div, not a form: the editor also lives inside the create-deck modal. */}
      <div className="space-y-4" onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); editor.submit(); } }}>
        <EditorField id={`${idPrefix}-front`} label="Front Side" hint="Term, question or prompt" ref={editor.frontRef}
          value={editor.front} error={editor.errors.front} placeholder="e.g. What is gradient descent?" onChange={editor.setFront} />
        <EditorField id={`${idPrefix}-back`} label="Back Side" hint="Definition, explanation or answer"
          value={editor.back} error={editor.errors.back} placeholder="e.g. An optimisation algorithm that…" onChange={editor.setBack} />

        <div className="space-y-2 pt-1">
          <Button type="button" className="w-full" onClick={editor.submit}
            icon={editor.editingId ? <Icon.Check className="w-4 h-4" /> : <Icon.Plus className="w-4 h-4" />}>
            {editor.editingId ? 'Update Card' : 'Add Card'}
          </Button>
          <Button type="button" variant="outline" className="w-full" onClick={editor.clear} disabled={!editor.editingId && !editor.hasInput}>
            {editor.editingId ? 'Cancel Editing' : 'Clear Editor'}
          </Button>
        </div>
      </div>
      <p className="text-[12px] text-[#9CA3AF]">{footnote}</p>
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
