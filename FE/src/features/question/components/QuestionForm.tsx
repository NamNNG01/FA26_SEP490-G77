import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/assets/icons';
import {
  DIFFICULTY_OPTIONS,
  QUESTION_TYPE_OPTIONS,
  blankIndexes,
  changeType,
  newKey,
  nextBlankIndex,
  optionLabel,
  validateDraft,
  type EditableQuestionType,
  type QuestionDraft,
} from '../model';
import type { QuestionDifficulty } from '@/services/question.service';

const MAX_OPTIONS = 10;

const inputCls = (invalid: boolean) =>
  `w-full h-10 px-3 rounded-[10px] border text-base text-content bg-surface focus:outline-none focus:ring-2 transition-all ${
    invalid ? 'border-danger-solid focus:ring-danger-solid/20 focus:border-danger-solid' : 'border-line focus:ring-brand-600/20 focus:border-brand-600'
  }`;

const iconBtn = 'p-1.5 rounded-[6px] text-content-subtle hover:bg-accent hover:text-content-secondary disabled:opacity-30 disabled:cursor-not-allowed';

/** One question block: header, text, difficulty/type, and the answer section for the selected type. */
export function QuestionForm({ q, index, onChange, showErrors, removable, onRemove, canMoveUp, canMoveDown, onMoveUp, onMoveDown }: {
  q: QuestionDraft;
  index: number;
  onChange: (q: QuestionDraft) => void;
  /** Show field errors and the Needs Attention badge (after the user edits or tries to save). */
  showErrors: boolean;
  removable?: boolean;
  onRemove?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const errors = validateDraft(q);
  const invalid = Object.keys(errors).length > 0;
  const contentError = showErrors ? errors.content : undefined;
  const answersError = showErrors ? errors.answers : undefined;
  const typeError = showErrors ? errors.type : undefined;
  const titleId = `${q.key}-title`;

  const set = (patch: Partial<QuestionDraft>) => onChange({ ...q, ...patch });

  const insertBlank = () => {
    const marker = `{{${nextBlankIndex(q.content)}}}`;
    const el = textRef.current;
    const start = el?.selectionStart ?? q.content.length;
    const end = el?.selectionEnd ?? q.content.length;
    set({ content: q.content.slice(0, start) + marker + q.content.slice(end) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + marker.length, start + marker.length);
    });
  };

  return (
    <section aria-labelledby={titleId} className={`card px-4 py-3.5 space-y-3 ${showErrors && invalid ? '!border-warning-line' : ''}`}>
      {/* Header: index, title, attention badge, reorder controls */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="min-w-6 h-6 px-1 rounded-[6px] bg-brand-600/10 text-brand-ink flex items-center justify-center text-xs font-bold">#{index + 1}</span>
          <h3 id={titleId} className="text-lg font-semibold text-content truncate">Question {index + 1}</h3>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {showErrors && (
            <Badge variant={invalid ? 'warning' : 'success'} className="mr-1">
              {invalid ? <Icon.AlertCircle className="w-3.5 h-3.5" /> : <Icon.CheckCircle className="w-3.5 h-3.5" />}
              {invalid ? 'Needs Attention' : 'Complete'}
            </Badge>
          )}
          {onMoveUp && (
            <button type="button" onClick={onMoveUp} disabled={!canMoveUp} className={iconBtn} aria-label={`Move question ${index + 1} up`} title="Move up">
              <Icon.ArrowUp className="w-4 h-4" />
            </button>
          )}
          {onMoveDown && (
            <button type="button" onClick={onMoveDown} disabled={!canMoveDown} className={iconBtn} aria-label={`Move question ${index + 1} down`} title="Move down">
              <Icon.ArrowDown className="w-4 h-4" />
            </button>
          )}
          {removable && (
            <button type="button" onClick={onRemove} className={`${iconBtn} hover:!text-danger hover:!bg-danger-light`} aria-label={`Remove question ${index + 1}`} title="Remove question">
              <Icon.Trash className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Question text */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label htmlFor={`${q.key}-content`} className="text-sm font-medium text-content-secondary">Question Text *</label>
          {q.type === 'FILL_BLANK' && (
            <button type="button" onClick={insertBlank} className="text-xs font-medium text-brand-ink hover:underline">
              + Insert blank
            </button>
          )}
        </div>
        <textarea
          id={`${q.key}-content`}
          ref={textRef}
          value={q.content}
          onChange={e => set({ content: e.target.value })}
          aria-invalid={Boolean(contentError)}
          className={`w-full h-[96px] px-3 py-2 rounded-[10px] border text-base text-content bg-surface resize-y focus:outline-none focus:ring-2 transition-all ${
            contentError ? 'border-danger-solid focus:ring-danger-solid/20 focus:border-danger-solid' : 'border-line focus:ring-brand-600/20 focus:border-brand-600'
          }`}
          placeholder={q.type === 'FILL_BLANK' ? 'e.g. The capital of France is {{1}}.' : 'Enter the question…'}
        />
        {contentError && <p className="text-xs text-danger mt-1">{contentError}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select label="Difficulty" value={q.difficulty} onChange={v => set({ difficulty: v as QuestionDifficulty })} options={DIFFICULTY_OPTIONS} />
        <Select label="Type" value={q.type} onChange={v => onChange(changeType(q, v as EditableQuestionType))} options={QUESTION_TYPE_OPTIONS} />
      </div>

      {typeError && <p className="text-xs text-danger -mt-1.5">{typeError}</p>}

      <AnswerSection q={q} set={set} error={answersError} />
    </section>
  );
}

export function AnswerSection({ q, set, error }: { q: QuestionDraft; set: (patch: Partial<QuestionDraft>) => void; error?: string }) {
  switch (q.type) {
    case 'SINGLE_CHOICE':
    case 'MULTIPLE_CHOICE':
    case 'TRUE_FALSE':
      return <ChoiceAnswers q={q} set={set} error={error} />;
    case 'MATCHING':
      return <MatchingAnswers q={q} set={set} error={error} />;
    case 'FILL_BLANK':
      return <BlankAnswers q={q} set={set} error={error} />;
    case 'ORDERING':
      return <OrderingAnswers q={q} set={set} error={error} />;
    case 'ESSAY':
      return (
        <p className="flex items-start gap-2 rounded-[10px] bg-surface-alt px-3 py-2.5 text-sm text-content-soft">
          <Icon.Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
          Essay answers are graded manually, so no answer options are needed.
        </p>
      );
  }
}

function SectionHeader({ label, action }: { label: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-1.5">
      <span className="text-sm font-medium text-content-secondary">{label}</span>
      {action}
    </div>
  );
}

function ChoiceAnswers({ q, set, error }: { q: QuestionDraft; set: (patch: Partial<QuestionDraft>) => void; error?: string }) {
  const multi = q.type === 'MULTIPLE_CHOICE';
  const fixed = q.type === 'TRUE_FALSE';

  const setText = (i: number, text: string) => set({ options: q.options.map((o, oi) => (oi === i ? { ...o, text } : o)) });
  const toggleCorrect = (i: number) =>
    set({
      options: q.options.map((o, oi) => (multi ? (oi === i ? { ...o, isCorrect: !o.isCorrect } : o) : { ...o, isCorrect: oi === i })),
    });
  const remove = (i: number) => {
    const options = q.options.filter((_, oi) => oi !== i);
    // Single choice must keep one key: fall back to the first option.
    if (!multi && !options.some(o => o.isCorrect) && options[0]) options[0] = { ...options[0], isCorrect: true };
    set({ options });
  };
  const add = () => set({ options: [...q.options, { key: newKey('opt'), text: '', isCorrect: false }] });

  const correct = q.options.map((o, i) => (o.isCorrect ? (fixed ? o.text : optionLabel(i)) : null)).filter(Boolean);

  return (
    <div>
      <SectionHeader
        label={multi ? 'Answer Options (select all correct answers)' : 'Answer Options'}
        action={!fixed && (
          <Button type="button" variant="outline" size="sm" icon={<Icon.Plus className="w-3.5 h-3.5" />} onClick={add} disabled={q.options.length >= MAX_OPTIONS}>
            Add Option
          </Button>
        )}
      />
      <div className="space-y-1.5" role={multi ? 'group' : 'radiogroup'} aria-label="Correct answer">
        {q.options.map((o, i) => (
          <div key={o.key} className="flex items-center gap-2">
            <span className="w-7 h-7 bg-surface-muted rounded-[6px] flex items-center justify-center text-xs font-bold text-content-soft flex-shrink-0">{optionLabel(i)}</span>
            <input
              value={o.text}
              readOnly={fixed}
              onChange={e => setText(i, e.target.value)}
              aria-label={`Option ${optionLabel(i)}`}
              className={`${inputCls(Boolean(error) && !fixed && o.text.trim() === '')} ${fixed ? 'bg-surface-alt cursor-default' : ''}`}
              placeholder={`Option ${optionLabel(i)}`}
            />
            <input
              type={multi ? 'checkbox' : 'radio'}
              name={`correct-${q.key}`}
              checked={o.isCorrect}
              onChange={() => toggleCorrect(i)}
              aria-label={`Mark option ${optionLabel(i)} as correct`}
              title="Mark as correct"
              className="accent-success-solid w-4 h-4 flex-shrink-0 cursor-pointer"
            />
            {!fixed && (
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={q.options.length <= 2}
                aria-label={`Delete option ${optionLabel(i)}`}
                title="Delete option"
                className="p-1 flex-shrink-0 text-content-subtle hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Icon.Trash className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      {error && <p className="text-xs text-danger mt-1.5">{error}</p>}
      <p className="text-xs font-medium text-success mt-2">
        Correct answer: {correct.length ? correct.join(', ') : <span className="text-content-subtle">none selected</span>}
      </p>
    </div>
  );
}

function MatchingAnswers({ q, set, error }: { q: QuestionDraft; set: (patch: Partial<QuestionDraft>) => void; error?: string }) {
  const setPair = (i: number, patch: { left?: string; right?: string }) =>
    set({ pairs: q.pairs.map((p, pi) => (pi === i ? { ...p, ...patch } : p)) });
  const add = () => set({ pairs: [...q.pairs, { key: newKey('pair'), left: '', right: '' }] });
  const remove = (i: number) => set({ pairs: q.pairs.filter((_, pi) => pi !== i) });

  return (
    <div>
      <SectionHeader
        label="Matching Pairs"
        action={
          <Button type="button" variant="outline" size="sm" icon={<Icon.Plus className="w-3.5 h-3.5" />} onClick={add} disabled={q.pairs.length >= MAX_OPTIONS}>
            Add Pair
          </Button>
        }
      />
      <div className="space-y-1.5">
        {q.pairs.map((p, i) => (
          <div key={p.key} className="flex items-center gap-2">
            <span className="w-7 h-7 bg-surface-muted rounded-[6px] flex items-center justify-center text-xs font-bold text-content-soft flex-shrink-0">{i + 1}</span>
            <input
              value={p.left}
              onChange={e => setPair(i, { left: e.target.value })}
              aria-label={`Pair ${i + 1} left item`}
              placeholder="Item"
              className={inputCls(Boolean(error) && !p.left.trim())}
            />
            <Icon.ChevronRight className="w-4 h-4 text-content-subtle flex-shrink-0" aria-hidden="true" />
            <input
              value={p.right}
              onChange={e => setPair(i, { right: e.target.value })}
              aria-label={`Pair ${i + 1} matching item`}
              placeholder="Matches with"
              className={inputCls(Boolean(error) && !p.right.trim())}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              disabled={q.pairs.length <= 2}
              aria-label={`Delete pair ${i + 1}`}
              title="Delete pair"
              className="p-1 flex-shrink-0 text-content-subtle hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Icon.Trash className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      {error && <p className="text-xs text-danger mt-1.5">{error}</p>}
      <p className="text-xs text-content-subtle mt-2">Students see the right-hand items shuffled and match each one to its item.</p>
    </div>
  );
}

function BlankAnswers({ q, set, error }: { q: QuestionDraft; set: (patch: Partial<QuestionDraft>) => void; error?: string }) {
  const indexes = blankIndexes(q.content);
  const setBlank = (n: number, patch: Partial<{ accepted: string; caseSensitive: boolean }>) =>
    set({ blanks: { ...q.blanks, [n]: { ...(q.blanks[n] ?? { accepted: '', caseSensitive: false }), ...patch } } });

  return (
    <div>
      <SectionHeader label="Accepted Answers" />
      {indexes.length === 0 ? (
        <p className="text-sm text-content-soft">
          Type <code className="px-1 rounded bg-surface-muted">{'{{1}}'}</code>, <code className="px-1 rounded bg-surface-muted">{'{{2}}'}</code>… in the question text (or use “Insert blank”) to add blanks.
        </p>
      ) : (
        <div className="space-y-1.5">
          {indexes.map(n => (
            <div key={n} className="flex items-center gap-2">
              <span className="h-7 px-1.5 bg-surface-muted rounded-[6px] flex items-center justify-center text-xs font-bold text-content-soft flex-shrink-0">{`{{${n}}}`}</span>
              <input
                value={q.blanks[n]?.accepted ?? ''}
                onChange={e => setBlank(n, { accepted: e.target.value })}
                aria-label={`Accepted answers for blank ${n}`}
                placeholder="Accepted answers, separated by ;"
                className={inputCls(Boolean(error) && !(q.blanks[n]?.accepted ?? '').trim())}
              />
              <label className="flex items-center gap-1.5 text-xs text-content-soft whitespace-nowrap cursor-pointer">
                <input
                  type="checkbox"
                  checked={q.blanks[n]?.caseSensitive ?? false}
                  onChange={e => setBlank(n, { caseSensitive: e.target.checked })}
                  className="w-3.5 h-3.5 accent-brand-600"
                />
                Case sensitive
              </label>
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-danger mt-1.5">{error}</p>}
    </div>
  );
}

function OrderingAnswers({ q, set, error }: { q: QuestionDraft; set: (patch: Partial<QuestionDraft>) => void; error?: string }) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const setText = (i: number, text: string) => set({ ordering: q.ordering.map((o, oi) => (oi === i ? { ...o, text } : o)) });
  const add = () => set({ ordering: [...q.ordering, { key: newKey('ord'), text: '' }] });
  const remove = (i: number) => set({ ordering: q.ordering.filter((_, oi) => oi !== i) });
  const moveTo = (from: number, to: number) => {
    if (from === to || to < 0 || to >= q.ordering.length) return;
    const next = [...q.ordering];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    set({ ordering: next });
  };
  const endDrag = () => { setDragIndex(null); setOverIndex(null); };

  return (
    <div>
      <SectionHeader
        label="Correct Order (drag to rearrange)"
        action={
          <Button type="button" variant="outline" size="sm" icon={<Icon.Plus className="w-3.5 h-3.5" />} onClick={add} disabled={q.ordering.length >= MAX_OPTIONS}>
            Add Item
          </Button>
        }
      />
      <ol className="space-y-1.5">
        {q.ordering.map((o, i) => (
          <li
            key={o.key}
            draggable
            onDragStart={e => { setDragIndex(i); e.dataTransfer.effectAllowed = 'move'; }}
            onDragOver={e => { e.preventDefault(); setOverIndex(i); }}
            onDrop={e => { e.preventDefault(); if (dragIndex != null) moveTo(dragIndex, i); endDrag(); }}
            onDragEnd={endDrag}
            className={`flex items-center gap-2 rounded-[10px] transition-all ${dragIndex === i ? 'opacity-40' : ''} ${overIndex === i && dragIndex !== i ? 'ring-2 ring-brand-600/30' : ''}`}
          >
            <span className="cursor-grab active:cursor-grabbing text-content-subtle flex-shrink-0" aria-hidden="true" title="Drag to reorder">
              <Icon.GripVertical className="w-4 h-4" />
            </span>
            <span className="w-7 h-7 bg-surface-muted rounded-[6px] flex items-center justify-center text-xs font-bold text-content-soft flex-shrink-0">{i + 1}</span>
            <input
              value={o.text}
              onChange={e => setText(i, e.target.value)}
              aria-label={`Item ${i + 1}`}
              placeholder={`Item ${i + 1}`}
              className={inputCls(Boolean(error) && !o.text.trim())}
            />
            <button type="button" onClick={() => moveTo(i, i - 1)} disabled={i === 0} className={iconBtn} aria-label={`Move item ${i + 1} up`} title="Move up">
              <Icon.ArrowUp className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => moveTo(i, i + 1)} disabled={i === q.ordering.length - 1} className={iconBtn} aria-label={`Move item ${i + 1} down`} title="Move down">
              <Icon.ArrowDown className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => remove(i)}
              disabled={q.ordering.length <= 2}
              aria-label={`Delete item ${i + 1}`}
              title="Delete item"
              className="p-1 flex-shrink-0 text-content-subtle hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Icon.Trash className="w-4 h-4" />
            </button>
          </li>
        ))}
      </ol>
      {error && <p className="text-xs text-danger mt-1.5">{error}</p>}
      <p className="flex items-start gap-1.5 text-xs text-warning mt-2">
        <Icon.AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        Ordering questions are not supported by the server yet, so they can't be saved. Students will see these items shuffled.
      </p>
    </div>
  );
}
