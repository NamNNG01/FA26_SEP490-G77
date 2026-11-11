import React from 'react';
import { Icon } from '@/assets/icons';
import type { AnswerResponse, AttemptQuestion } from '@/services/studentAttempt.service';
import { normalizeBlank, type CorrectAnswer } from '@/services/studentPracticeExam.service';
import { DiagramAnswerInput } from './DiagramAnswerInput';
import { DiagramReview } from './result/DiagramReview';
import { QuestionContent } from '@/components/common/QuestionContent';

/** ESSAY / CODE text limit when the paper sets none (BE AnswerResponseValidator). */
const DEFAULT_TEXT_LIMIT = 10_000;
const BLANK = /\{\{(\d+)\}\}/g;

const FIELD =
  'rounded-[10px] border border-line bg-surface px-3 text-base text-content placeholder:text-content-subtle transition-all focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600';

export const QUESTION_TYPE_LABEL: Record<string, string> = {
  SINGLE_CHOICE: 'Single choice',
  MULTIPLE_CHOICE: 'Multiple choice',
  TRUE_FALSE: 'True / False',
  MATCHING: 'Matching',
  FILL_BLANK: 'Fill in the blank',
  ORDERING: 'Ordering',
  ESSAY: 'Essay',
  CODE: 'Code',
  DIAGRAM: 'Diagram',
  DIAGRAM_ESSAY: 'Diagram + Essay',
};

export function optionLetter(i: number): string {
  return i < 26 ? String.fromCharCode(65 + i) : String(i + 1);
}

/** True when the response holds no real answer (mirrors BE AnswerResponseValidator.isEmpty). */
export function isAnswered(response: AnswerResponse | null | undefined): boolean {
  if (!response) return false;
  return Object.values(response).some(v => {
    if (v == null) return false;
    if (typeof v === 'string') return v.trim() !== '';
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.values(v).some(x => typeof x === 'string' && x.trim() !== '');
    return true;
  });
}

/** Question text — fill-blank `{{n}}` placeholders become "(n) ____". */
export function QuestionText({ content, className = '' }: { content: string; className?: string }) {
  return (
    <p className={`whitespace-pre-line break-words ${className}`}>
      <QuestionContent text={content.replace(BLANK, '($1) ______')} />
    </p>
  );
}

interface InputProps {
  question: AttemptQuestion;
  value: AnswerResponse | null;
  onChange: (next: AnswerResponse) => void;
  /** Essay screen: a taller editor. */
  roomy?: boolean;
  /** Essay screen (md+): the editor fills the height its flex-column parent leaves free. */
  fill?: boolean;
  /** A sent answer: a DIAGRAM shows as a picture instead of the draw.io editor (which a fieldset can't disable). */
  readOnly?: boolean;
  /**
   * Practice "Check answer": the key of the question. When set the answer is read-only —
   * every right part turns green, every wrong part red with the right one beside it.
   */
  reveal?: AnswerReveal | null;
  /** Enter in the last fill-blank field (practice: checks the answer). */
  onEnter?: () => void;
  /** Taken in practice mode (each answer is checked on its own). */
  practice?: boolean;
  /**
   * Module practice: the verdict of the whole answer, without its key. A choice question colours
   * the picked options green / red; any other type gets a green / red frame around the answer.
   */
  verdict?: boolean | null;
}

export interface AnswerReveal {
  correctOptionIds: number[];
  correctAnswer?: CorrectAnswer | null;
}

/** The answer control for one question, by type. Emits the SA-03 `response` payload. */
export function QuestionAnswerInput(props: InputProps) {
  const { question, verdict } = props;
  if (verdict == null || CHOICE_TYPES.has(question.questionType)) return <AnswerControl {...props} />;
  return (
    <div className={`rounded-[12px] border-2 p-3 ${partTone(verdict)}`}>
      <p className={`flex items-center gap-1.5 text-xs font-semibold mb-2 ${verdict ? 'text-success-strong' : 'text-danger-strong'}`}>
        <PartMark ok={verdict} /> {verdict ? 'Correct' : 'Wrong'}
      </p>
      <AnswerControl {...props} />
    </div>
  );
}

const CHOICE_TYPES: ReadonlySet<string> = new Set(['SINGLE_CHOICE', 'TRUE_FALSE', 'MULTIPLE_CHOICE']);

function AnswerControl({ question, value, onChange, roomy, fill, readOnly, reveal, onEnter, verdict }: InputProps) {
  switch (question.questionType) {
    case 'SINGLE_CHOICE':
    case 'TRUE_FALSE':
    case 'MULTIPLE_CHOICE':
      return <ChoiceInput question={question} value={value} onChange={onChange} reveal={reveal} verdict={verdict} />;
    case 'FILL_BLANK':
      return <FillBlankInput question={question} value={value} onChange={onChange} reveal={reveal} onEnter={onEnter} />;
    case 'MATCHING':
      return <MatchingInput question={question} value={value} onChange={onChange} reveal={reveal} />;
    case 'ORDERING':
      return <OrderingInput question={question} value={value} onChange={onChange} reveal={reveal} />;
    case 'ESSAY':
    case 'CODE':
      return <TextInput question={question} value={value} onChange={onChange} roomy={roomy} fill={fill} />;
    case 'DIAGRAM':
      if (readOnly) return <DiagramReview xml={value?.drawioXml ?? ''} />;
      return <DiagramAnswerInput value={value} onChange={onChange} roomy={roomy} />;
    case 'DIAGRAM_ESSAY':
      return <DiagramEssayInput question={question} value={value} onChange={onChange} roomy={roomy} readOnly={readOnly} />;
    default:
      return <p className="text-sm text-content-soft">This question type can't be answered here.</p>;
  }
}

function ChoiceInput({ question, value, onChange, reveal, verdict }: InputProps) {
  const multi = question.questionType === 'MULTIPLE_CHOICE';
  const selected = new Set(value?.selectedOptionIds ?? []);
  const correct = reveal ? new Set(reveal.correctOptionIds) : null;
  const toggle = (id: number) => {
    if (correct) return;
    if (!multi) return onChange({ selectedOptionIds: [id] });
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ selectedOptionIds: [...next] });
  };
  return (
    <div role={multi ? 'group' : 'radiogroup'} aria-label="Answer options" className="space-y-2.5">
      {multi && <p className="text-xs text-content-subtle">Select every correct answer.</p>}
      {(question.options ?? []).map((opt, i) => {
        const isOn = selected.has(opt.optionId);
        // Multiple choice: a correct option the student left out is "missed" (dashed).
        const missed = Boolean(correct && multi && correct.has(opt.optionId) && !isOn);
        // Module practice: only the picks are judged, as one verdict; the key stays hidden.
        const judged = !correct && verdict != null;
        const tone = judged
          ? isOn
            ? verdict
              ? 'border-success-solid bg-success-light'
              : 'border-danger-solid bg-danger-light'
            : 'border-line bg-surface opacity-70'
          : !correct
          ? isOn
            ? 'border-brand-600 bg-primary-light'
            : 'border-line bg-surface hover:border-brand-600 hover:bg-surface-hover'
          : missed
            ? 'border-dashed border-success-solid bg-surface'
            : correct.has(opt.optionId)
            ? 'border-success-solid bg-success-light'
            : isOn
              ? 'border-danger-solid bg-danger-light'
              : 'border-line bg-surface opacity-70';
        const badge = judged
          ? isOn
            ? verdict
              ? 'bg-success-solid text-white'
              : 'bg-danger-solid text-white'
            : 'bg-surface-muted text-content-secondary'
          : !correct
          ? isOn
            ? 'bg-brand-600 text-white'
            : 'bg-surface-muted text-content-secondary'
          : correct.has(opt.optionId)
            ? 'bg-success-solid text-white'
            : isOn
              ? 'bg-danger-solid text-white'
              : 'bg-surface-muted text-content-secondary';
        return (
          <button
            key={opt.optionId}
            type="button"
            role={multi ? 'checkbox' : 'radio'}
            aria-checked={isOn}
            aria-disabled={correct ? true : undefined}
            onClick={() => toggle(opt.optionId)}
            className={`w-full text-left flex items-start gap-3 p-4 rounded-[10px] border-2 transition-all ${correct ? 'cursor-default' : ''} ${tone}`}
          >
            <span
              className={`w-7 h-7 flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5 ${multi ? 'rounded-[6px]' : 'rounded-full'} ${badge}`}
            >
              {judged && isOn ? (
                verdict ? <Icon.Check className="w-4 h-4" /> : <Icon.X className="w-4 h-4" />
              ) : correct && correct.has(opt.optionId) ? (
                <Icon.Check className="w-4 h-4" />
              ) : correct && isOn ? (
                <Icon.X className="w-4 h-4" />
              ) : multi && isOn ? (
                <Icon.Check className="w-4 h-4" />
              ) : (
                optionLetter(i)
              )}
            </span>
            <span className="flex-1 text-base leading-relaxed text-content-secondary break-words">{opt.optionText}</span>
            {judged && isOn && (
              <span className={`flex-shrink-0 self-center text-xs font-semibold ${verdict ? 'text-success-strong' : 'text-danger-strong'}`}>
                {verdict ? 'Correct' : 'Wrong'}
              </span>
            )}
            {correct?.has(opt.optionId) && (
              <span className="flex-shrink-0 self-center text-xs font-semibold text-success-strong">
                {missed ? 'Missed' : 'Correct answer'}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Tone of one answer part after a practice check: right, wrong, or not checked yet. */
function partTone(verdict: boolean | null): string {
  if (verdict === true) return 'border-success-solid bg-success-light';
  if (verdict === false) return 'border-danger-solid bg-danger-light';
  return 'border-line bg-surface';
}

/** "✓" / "✗" mark of a checked part. */
function PartMark({ ok }: { ok: boolean }) {
  return ok ? (
    <Icon.CheckCircle className="w-4 h-4 flex-shrink-0 text-success-strong" aria-label="Correct" />
  ) : (
    <Icon.XCircle className="w-4 h-4 flex-shrink-0 text-danger-strong" aria-label="Wrong" />
  );
}

function FillBlankInput({ question, value, onChange, reveal, onEnter }: InputProps) {
  const found = [...new Set([...question.content.matchAll(BLANK)].map(m => m[1]))];
  const indices = found.length > 0 ? found : ['1'];
  const blanks = value?.blanks ?? {};
  const key = reveal?.correctAnswer?.blanks ?? null;
  const verdict = (n: string) =>
    key ? (key[n] ?? []).some(a => normalizeBlank(a) === normalizeBlank(blanks[n])) : null;
  return (
    <div className="space-y-3" data-blanks>
      {indices.map((n, i) => {
        const ok = verdict(n);
        return (
          <div key={n} className="space-y-1">
            <label className="flex items-center gap-3">
              {found.length > 0 && <span className="w-10 text-sm font-semibold text-content-secondary">({n})</span>}
              <input
                className={`${FIELD} h-10 flex-1 ${ok === true ? '!border-success-solid !bg-success-light' : ok === false ? '!border-danger-solid !bg-danger-light' : ''}`}
                placeholder={found.length > 0 ? `Blank ${n}` : 'Your answer'}
                aria-label={found.length > 0 ? `Blank ${n}` : 'Your answer'}
                aria-invalid={ok === false || undefined}
                readOnly={Boolean(key)}
                value={blanks[n] ?? ''}
                onChange={e => onChange({ blanks: { ...blanks, [n]: e.target.value } })}
                onKeyDown={e => {
                  if (e.key !== 'Enter' || !onEnter) return;
                  e.preventDefault();
                  // Enter moves to the next blank; on the last one it checks the answer.
                  const next = e.currentTarget.closest('[data-blanks]')?.querySelectorAll('input')[i + 1];
                  if (next) next.focus();
                  else onEnter();
                }}
              />
              {ok != null && <PartMark ok={ok} />}
            </label>
            {ok === false && (
              <p className={`text-sm text-success-strong ${found.length > 0 ? 'pl-[3.25rem]' : ''}`}>
                Correct answer: <span className="font-semibold">{(key?.[n] ?? []).join(' / ') || '—'}</span>
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MatchingInput({ question, value, onChange, reveal }: InputProps) {
  const lefts = question.matching?.lefts ?? [];
  const rights = question.matching?.rights ?? [];
  const current = new Map((value?.matches ?? []).map(m => [m.left, m.right]));
  const key = reveal?.correctAnswer?.pairs ? new Map(reveal.correctAnswer.pairs.map(p => [p.left, p.right])) : null;
  const set = (left: string, right: string) => {
    const next = new Map(current);
    if (right) next.set(left, right);
    else next.delete(left);
    onChange({ matches: [...next].map(([l, r]) => ({ left: l, right: r })) });
  };
  return (
    <div className="space-y-2.5">
      {!key && <p className="text-xs text-content-subtle">Match every item on the left with one on the right.</p>}
      {lefts.map(left => {
        const ok = key ? key.get(left) === current.get(left) : null;
        return (
          <div key={left} className={`p-3 rounded-[10px] border ${ok == null ? 'border-line bg-surface' : partTone(ok)}`}>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <span className="flex-1 text-sm text-content break-words">{left}</span>
              <Icon.ChevronRight className="hidden sm:block w-4 h-4 text-content-subtle" />
              <select
                className={`${FIELD} h-10 sm:w-1/2`}
                aria-label={`Match for ${left}`}
                disabled={Boolean(key)}
                value={current.get(left) ?? ''}
                onChange={e => set(left, e.target.value)}
              >
                <option value="">Choose…</option>
                {rights.map(r => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              {ok != null && <PartMark ok={ok} />}
            </div>
            {ok === false && (
              <p className="mt-2 text-sm text-success-strong sm:text-right">
                Correct match: <span className="font-semibold">{key?.get(left) ?? '—'}</span>
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Ordering: the items start in a pool; the student drags them into numbered slots (1, 2, 3 …).
 * A click on a pool item drops it into the next free slot; × (or dragging it back) returns it to the pool.
 * The slots fill from the top with no gap, so the answer is just the placed items in order.
 * Drag works with mouse, touch and pen (pointer events); the arrows reorder for keyboard users.
 */
function OrderingInput({ question, value, onChange, reveal }: InputProps) {
  const options = question.options ?? [];
  const byId = new Map(options.map(o => [o.optionId, o]));
  const key = reveal?.correctAnswer?.orderedOptionIds ?? null;
  const placed = (value?.orderedOptionIds ?? []).filter(id => byId.has(id));
  if (key) return <OrderingReveal byId={byId} placed={placed} keyOrder={key} />;

  const pool = options.filter(o => !placed.includes(o.optionId));
  return <OrderingBoard byId={byId} placed={placed} pool={pool.map(o => o.optionId)} onChange={ids => onChange({ orderedOptionIds: ids })} />;
}

/** Where a dragged item would land: a slot (0-based) or back in the pool. */
type OrderingTarget = number | 'pool' | null;

interface OrderingDrag {
  id: number;
  x: number;
  y: number;
  width: number;
  over: OrderingTarget;
}

/** Pixels the pointer has to travel before a press becomes a drag (a shorter press is a click). */
const DRAG_THRESHOLD = 4;

function OrderingBoard({
  byId,
  placed,
  pool,
  onChange,
}: {
  byId: Map<number, { optionId: number; optionText: string }>;
  placed: number[];
  pool: number[];
  onChange: (ids: number[]) => void;
}) {
  const [drag, setDrag] = React.useState<OrderingDrag | null>(null);
  const dragRef = React.useRef(drag);
  dragRef.current = drag;
  /** Set once a press turned into a drag, so the click that follows does not also place the item. */
  const draggedRef = React.useRef(false);
  const total = placed.length + pool.length;

  /** Put `id` at slot `slot` (or at the end), taking it out of wherever it was. */
  const place = (id: number, slot?: number) => {
    const rest = placed.filter(x => x !== id);
    const at = slot == null ? rest.length : Math.min(slot, rest.length);
    onChange([...rest.slice(0, at), id, ...rest.slice(at)]);
  };
  const unplace = (id: number) => onChange(placed.filter(x => x !== id));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= placed.length) return;
    const next = [...placed];
    [next[from], next[to]] = [next[to], next[from]];
    onChange(next);
  };

  const targetAt = (x: number, y: number): OrderingTarget => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const slot = el?.closest<HTMLElement>('[data-order-slot]');
    if (slot) return Number(slot.dataset.orderSlot);
    return el?.closest('[data-order-pool]') ? 'pool' : null;
  };

  const startPress = (e: React.PointerEvent<HTMLElement>, id: number) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button[data-order-action]')) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const width = e.currentTarget.getBoundingClientRect().width;
    draggedRef.current = false;

    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current && Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return;
      draggedRef.current = true;
      ev.preventDefault();
      const next = { id, x: ev.clientX, y: ev.clientY, width, over: targetAt(ev.clientX, ev.clientY) };
      dragRef.current = next;
      setDrag(next);
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      const done = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      // The click that follows this release (same task) is still skipped; later clicks and keys work again.
      window.setTimeout(() => {
        draggedRef.current = false;
      }, 0);
      if (!done) return;
      // Where the pointer is let go, not the last move: a fast drag may send few moves. A cancel drops nothing.
      const over = ev.type === 'pointerup' ? targetAt(ev.clientX, ev.clientY) : null;
      if (over === 'pool') unplace(done.id);
      else if (typeof over === 'number') place(done.id, over);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const textOf = (id: number) => byId.get(id)?.optionText ?? `#${id}`;
  /** Slot the dragged item would fill: a drop past the last filled slot lands right after it. */
  const overSlot = typeof drag?.over === 'number' ? Math.min(drag.over, placed.filter(x => x !== drag.id).length) : null;

  return (
    <div className={`space-y-4 ${drag ? 'select-none cursor-grabbing' : ''}`}>
      <div>
        <p className="text-xs font-semibold text-content-subtle uppercase tracking-wide mb-2">Items</p>
        <div
          data-order-pool
          className={`min-h-[3.25rem] flex flex-wrap gap-2 rounded-[10px] border-2 border-dashed p-2.5 transition-colors ${
            drag?.over === 'pool' ? 'border-brand-600 bg-primary-light' : 'border-line bg-surface-alt'
          }`}
        >
          {pool.length === 0 ? (
            <p className="self-center px-1 text-xs text-content-subtle">Every item is placed. Drag one back here to take it out.</p>
          ) : (
            pool.map(id => (
              <button
                key={id}
                type="button"
                onPointerDown={e => startPress(e, id)}
                onDragStart={e => e.preventDefault()}
                onClick={() => {
                  if (draggedRef.current) return;
                  place(id);
                }}
                aria-label={`Place "${textOf(id)}" in slot ${placed.length + 1}`}
                className={`touch-none select-none max-w-full inline-flex items-center gap-2 rounded-[8px] border border-line bg-surface px-3 py-2 text-left text-sm text-content shadow-sm cursor-grab hover:border-brand-600 transition-opacity ${
                  drag?.id === id ? 'opacity-40' : ''
                }`}
              >
                <Icon.GripVertical className="w-4 h-4 flex-shrink-0 text-content-subtle" aria-hidden="true" />
                <span className="break-words">{textOf(id)}</span>
              </button>
            ))
          )}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-content-subtle uppercase tracking-wide mb-2">
          Order ({placed.length}/{total})
        </p>
        <ol className="space-y-2">
          {Array.from({ length: total }, (_, i) => {
            const id = placed[i];
            const highlight = overSlot === i;
            return (
              <li key={i} data-order-slot={i} className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-surface-muted text-sm font-semibold text-content-secondary flex items-center justify-center flex-shrink-0">
                  {i + 1}
                </span>
                {id != null ? (
                  <div
                    onPointerDown={e => startPress(e, id)}
                    onDragStart={e => e.preventDefault()}
                    className={`touch-none select-none flex-1 min-w-0 flex items-center gap-2 rounded-[10px] border px-3 py-2.5 cursor-grab transition-colors ${
                      highlight ? 'border-brand-600 bg-primary-light' : 'border-line bg-surface hover:border-brand-600'
                    } ${drag?.id === id ? 'opacity-40' : ''}`}
                  >
                    <Icon.GripVertical className="w-4 h-4 flex-shrink-0 text-content-subtle" aria-hidden="true" />
                    <span className="flex-1 min-w-0 text-sm text-content break-words">{textOf(id)}</span>
                    <button
                      type="button"
                      data-order-action
                      aria-label="Move up"
                      disabled={i === 0}
                      onClick={() => move(i, i - 1)}
                      className="p-1.5 rounded-[6px] hover:bg-accent disabled:opacity-30"
                    >
                      <Icon.ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      data-order-action
                      aria-label="Move down"
                      disabled={i === placed.length - 1}
                      onClick={() => move(i, i + 1)}
                      className="p-1.5 rounded-[6px] hover:bg-accent disabled:opacity-30"
                    >
                      <Icon.ArrowDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      data-order-action
                      aria-label={`Return "${textOf(id)}" to the items`}
                      onClick={() => unplace(id)}
                      className="p-1.5 rounded-[6px] text-content-subtle hover:bg-accent hover:text-danger"
                    >
                      <Icon.X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div
                    className={`flex-1 min-w-0 rounded-[10px] border-2 border-dashed px-3 py-2.5 text-sm transition-colors ${
                      highlight ? 'border-brand-600 bg-primary-light text-brand-ink' : 'border-line text-content-subtle'
                    }`}
                  >
                    Drop an item here
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {drag && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 flex items-center gap-2 rounded-[10px] border border-brand-600 bg-surface px-3 py-2.5 text-sm text-content shadow-lg ring-2 ring-brand-600/20"
          style={{ left: drag.x, top: drag.y, width: Math.min(drag.width, 420), transform: 'translate(-24px, -50%)' }}
        >
          <Icon.GripVertical className="w-4 h-4 flex-shrink-0 text-content-subtle" />
          <span className="truncate">{textOf(drag.id)}</span>
        </div>
      )}
    </div>
  );
}

/** A checked practice ordering: each slot marked right / wrong, with the correct order on demand. */
function OrderingReveal({
  byId,
  placed,
  keyOrder,
}: {
  byId: Map<number, { optionId: number; optionText: string }>;
  placed: number[];
  keyOrder: number[];
}) {
  const [showKey, setShowKey] = React.useState(false);
  const rows = Math.max(placed.length, keyOrder.length);
  return (
    <div className="space-y-2.5">
      <ol className="space-y-2">
        {Array.from({ length: rows }, (_, i) => {
          const id = placed[i];
          const ok = id != null && keyOrder[i] === id;
          const rightPlace = id != null ? keyOrder.indexOf(id) + 1 : 0;
          return (
            <li key={i} className={`flex items-center gap-3 p-3 rounded-[10px] border ${partTone(ok)}`}>
              <span className="w-7 h-7 rounded-full bg-surface-muted text-sm font-semibold text-content-secondary flex items-center justify-center flex-shrink-0">
                {i + 1}
              </span>
              <span className="flex-1 text-sm text-content break-words">
                {id != null ? byId.get(id)?.optionText : <span className="italic text-content-subtle">Empty</span>}
              </span>
              {!ok && rightPlace > 0 && (
                <span className="text-xs font-semibold text-danger-strong whitespace-nowrap">Belongs at #{rightPlace}</span>
              )}
              <PartMark ok={ok} />
            </li>
          );
        })}
      </ol>
      <div>
        <button
          type="button"
          aria-expanded={showKey}
          onClick={() => setShowKey(s => !s)}
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-ink hover:underline"
        >
          <Icon.ChevronDown className={`w-4 h-4 transition-transform ${showKey ? 'rotate-180' : ''}`} />
          {showKey ? 'Hide the correct order' : 'Show the correct order'}
        </button>
        {showKey && (
          <ol className="mt-2 space-y-1.5 rounded-[10px] border border-success-line bg-success-light p-3">
            {keyOrder.map((id, i) => (
              <li key={id} className="flex items-start gap-2 text-sm text-success-strong">
                <span className="font-semibold w-5 flex-shrink-0">{i + 1}.</span>
                <span className="break-words">{byId.get(id)?.optionText}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

/**
 * DIAGRAM_ESSAY: the diagram on top, the written explanation below. Both fields are always sent
 * (AnswerResponseValidator wants each one a string), so an edit of one keeps the other.
 */
function DiagramEssayInput({ question, value, onChange, roomy, readOnly }: InputProps) {
  // The draw.io editor reports through a callback it keeps, so read the latest answer from a ref.
  const valueRef = React.useRef(value);
  valueRef.current = value;
  const merge = (patch: AnswerResponse) => {
    const prev = valueRef.current;
    onChange({ drawioXml: prev?.drawioXml ?? '', text: prev?.text ?? '', ...patch });
  };
  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-content-soft uppercase tracking-wide">Diagram</h3>
        {readOnly ? (
          <DiagramReview xml={value?.drawioXml ?? ''} />
        ) : (
          <DiagramAnswerInput value={value} onChange={next => merge({ drawioXml: next.drawioXml ?? '' })} roomy={roomy} />
        )}
      </section>
      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-content-soft uppercase tracking-wide">Written explanation</h3>
        <TextInput question={question} value={value} onChange={next => merge({ text: next.text ?? '' })} />
      </section>
    </div>
  );
}

function TextInput({ question, value, onChange, roomy, fill }: InputProps) {
  const text = value?.text ?? '';
  const limit = question.answerSpace?.maxLength ?? DEFAULT_TEXT_LIMIT;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  // fill: on md+ the box takes the free height (never under 12rem); stacked on a phone it keeps a fixed size.
  const size = fill
    ? 'min-h-[40vh] resize-y md:min-h-[12rem] md:flex-1 md:resize-none'
    : `resize-y ${roomy ? 'min-h-[50vh]' : 'min-h-[14rem]'}`;
  return (
    <div className={fill ? 'flex flex-col gap-2 md:flex-1 md:min-h-0' : 'space-y-2'}>
      <textarea
        aria-label="Your answer"
        value={text}
        maxLength={limit}
        onChange={e => onChange({ text: e.target.value })}
        placeholder="Write your answer…"
        spellCheck={question.questionType !== 'CODE'}
        className={`${FIELD} py-2.5 w-full leading-relaxed ${size} ${
          question.questionType === 'CODE' ? 'font-mono text-sm' : 'text-base'
        }`}
      />
      <p className="text-xs text-content-subtle text-right">
        {words} words · {text.length.toLocaleString()} / {limit.toLocaleString()} characters
      </p>
    </div>
  );
}
