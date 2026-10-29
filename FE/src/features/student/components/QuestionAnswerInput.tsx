import React from 'react';
import { Icon } from '@/assets/icons';
import type { AnswerResponse, AttemptQuestion } from '@/services/studentAttempt.service';
import { normalizeBlank, type CorrectAnswer } from '@/services/studentPracticeExam.service';
import { DiagramAnswerInput } from './DiagramAnswerInput';

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
  return <p className={`whitespace-pre-line break-words ${className}`}>{content.replace(BLANK, '($1) ______')}</p>;
}

interface InputProps {
  question: AttemptQuestion;
  value: AnswerResponse | null;
  onChange: (next: AnswerResponse) => void;
  /** Essay screen: a taller editor. */
  roomy?: boolean;
  /**
   * Practice "Check answer": the key of the question. When set the answer is read-only —
   * every right part turns green, every wrong part red with the right one beside it.
   */
  reveal?: AnswerReveal | null;
  /** Enter in the last fill-blank field (practice: checks the answer). */
  onEnter?: () => void;
  /** Practice: an ordering is confirmed with the check button, so no "Keep this order" link. */
  practice?: boolean;
}

export interface AnswerReveal {
  correctOptionIds: number[];
  correctAnswer?: CorrectAnswer | null;
}

/** The answer control for one question, by type. Emits the SA-03 `response` payload. */
export function QuestionAnswerInput({ question, value, onChange, roomy, reveal, onEnter, practice }: InputProps) {
  switch (question.questionType) {
    case 'SINGLE_CHOICE':
    case 'TRUE_FALSE':
    case 'MULTIPLE_CHOICE':
      return <ChoiceInput question={question} value={value} onChange={onChange} reveal={reveal} />;
    case 'FILL_BLANK':
      return <FillBlankInput question={question} value={value} onChange={onChange} reveal={reveal} onEnter={onEnter} />;
    case 'MATCHING':
      return <MatchingInput question={question} value={value} onChange={onChange} reveal={reveal} />;
    case 'ORDERING':
      return <OrderingInput question={question} value={value} onChange={onChange} reveal={reveal} practice={practice} />;
    case 'ESSAY':
    case 'CODE':
      return <TextInput question={question} value={value} onChange={onChange} roomy={roomy} />;
    case 'DIAGRAM':
      return <DiagramAnswerInput value={value} onChange={onChange} roomy={roomy} />;
    default:
      return <p className="text-sm text-content-soft">This question type can't be answered here.</p>;
  }
}

function ChoiceInput({ question, value, onChange, reveal }: InputProps) {
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
        const tone = !correct
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
        const badge = !correct
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
              {correct && correct.has(opt.optionId) ? (
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

function OrderingInput({ question, value, onChange, reveal, practice }: InputProps) {
  const options = question.options ?? [];
  const byId = new Map(options.map(o => [o.optionId, o]));
  const order = value?.orderedOptionIds?.length ? value.orderedOptionIds : options.map(o => o.optionId);
  const touched = Boolean(value?.orderedOptionIds?.length);
  const key = reveal?.correctAnswer?.orderedOptionIds ?? null;
  const [showKey, setShowKey] = React.useState(false);
  /** Item just moved with an arrow: briefly highlighted so the swap is easy to follow. */
  const [moved, setMoved] = React.useState<number | null>(null);
  const movedTimer = React.useRef<number | undefined>(undefined);
  React.useEffect(() => () => window.clearTimeout(movedTimer.current), []);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    [next[from], next[to]] = [next[to], next[from]];
    onChange({ orderedOptionIds: next });
    setMoved(order[from]);
    window.clearTimeout(movedTimer.current);
    movedTimer.current = window.setTimeout(() => setMoved(null), 700);
  };

  /* Drag and drop (pointer events: mouse, touch and pen). The list reorders live while
     dragging; the new order is stored on release. The arrows stay for keyboard users. */
  const listRef = React.useRef<HTMLOListElement>(null);
  const [drag, setDrag] = React.useState<{ id: number; order: number[] } | null>(null);
  const dragRef = React.useRef(drag);
  dragRef.current = drag;
  const shown = drag?.order ?? order;
  const locked = Boolean(key);

  // FLIP: when the order changes, each item slides from its old place to the new one
  // (the dragged item follows the pointer, so it jumps). Skipped for reduced motion.
  const tops = React.useRef(new Map<number, number>());
  const shownKey = shown.join(',');
  React.useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const next = new Map<number, number>();
    list.querySelectorAll<HTMLElement>('[data-order-id]').forEach(el => {
      const id = Number(el.dataset.orderId);
      const top = el.offsetTop;
      next.set(id, top);
      const prev = tops.current.get(id);
      if (reduce || prev == null || prev === top || id === dragRef.current?.id) return;
      el.animate([{ transform: `translateY(${prev - top}px)` }, { transform: 'translateY(0)' }], {
        duration: 240,
        easing: 'cubic-bezier(0.2, 0, 0, 1)',
      });
    });
    tops.current = next;
  }, [shownKey]);

  const startDrag = (e: React.PointerEvent<HTMLLIElement>, id: number) => {
    if (locked || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    // Touch drags only from the grip, so a swipe on the text still scrolls the page.
    if (e.pointerType !== 'mouse' && !target.closest('[data-grip]')) return;
    e.preventDefault();
    const startOrder = order;
    setDrag({ id, order: startOrder });

    const onMove = (ev: PointerEvent) => {
      const current = dragRef.current;
      if (!current || !listRef.current) return;
      // New slot = how many other items sit above the pointer.
      const others = [...listRef.current.querySelectorAll<HTMLElement>('[data-order-id]')].filter(
        el => Number(el.dataset.orderId) !== current.id,
      );
      const slot = others.filter(el => {
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2 < ev.clientY;
      }).length;
      const rest = current.order.filter(x => x !== current.id);
      const next = [...rest.slice(0, slot), current.id, ...rest.slice(slot)];
      if (next.some((x, i) => x !== current.order[i])) setDrag({ id: current.id, order: next });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      const done = dragRef.current;
      setDrag(null);
      if (done && done.order.some((x, i) => x !== startOrder[i])) onChange({ orderedOptionIds: done.order });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  return (
    <div className="space-y-2.5">
      {!key && <p className="text-xs text-content-subtle">Drag the items into the right order (or use the arrows).</p>}
      <ol ref={listRef} className={`space-y-2 ${drag ? 'select-none cursor-grabbing' : ''}`}>
        {shown.map((id, i) => {
          const ok = key ? key[i] === id : null;
          const rightPlace = key ? key.indexOf(id) + 1 : 0;
          const dragging = drag?.id === id;
          return (
            <li
              key={id}
              data-order-id={id}
              onPointerDown={e => startDrag(e, id)}
              className={`flex items-center gap-3 p-3 rounded-[10px] border transition-[box-shadow,background-color,border-color] duration-300 ${partTone(ok)} ${
                locked ? '' : drag ? '' : 'cursor-grab hover:border-brand-600'
              } ${moved === id && !drag ? 'relative z-10 !border-brand-600 !bg-primary-light shadow-md' : ''} ${dragging ? 'relative z-10 !border-brand-600 !bg-primary-light shadow-lg ring-2 ring-brand-600/20' : ''}`}
            >
              {!locked && (
                <span
                  data-grip
                  aria-hidden="true"
                  className="-ml-1 p-1 rounded-[6px] text-content-subtle touch-none cursor-grab flex-shrink-0"
                >
                  <Icon.GripVertical className="w-4 h-4" />
                </span>
              )}
              <span className="w-7 h-7 rounded-full bg-surface-muted text-sm font-semibold text-content-secondary flex items-center justify-center flex-shrink-0">
                {i + 1}
              </span>
              <span className="flex-1 text-sm text-content break-words">{byId.get(id)?.optionText}</span>
              {ok == null ? (
                <>
                  <button
                    type="button"
                    aria-label="Move up"
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                    className="p-1.5 rounded-[6px] hover:bg-accent disabled:opacity-30"
                  >
                    <Icon.ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    disabled={i === shown.length - 1}
                    onClick={() => move(i, i + 1)}
                    className="p-1.5 rounded-[6px] hover:bg-accent disabled:opacity-30"
                  >
                    <Icon.ArrowDown className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  {!ok && rightPlace > 0 && (
                    <span className="text-xs font-semibold text-danger-strong whitespace-nowrap">Belongs at #{rightPlace}</span>
                  )}
                  <PartMark ok={ok} />
                </>
              )}
            </li>
          );
        })}
      </ol>
      {!practice && !touched && order.length > 0 && (
        <button type="button" onClick={() => onChange({ orderedOptionIds: order })} className="text-sm text-brand-ink hover:underline">
          Keep this order as my answer
        </button>
      )}
      {key && (
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
              {key.map((id, i) => (
                <li key={id} className="flex items-start gap-2 text-sm text-success-strong">
                  <span className="font-semibold w-5 flex-shrink-0">{i + 1}.</span>
                  <span className="break-words">{byId.get(id)?.optionText}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

function TextInput({ question, value, onChange, roomy }: InputProps) {
  const text = value?.text ?? '';
  const limit = question.answerSpace?.maxLength ?? DEFAULT_TEXT_LIMIT;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return (
    <div className="space-y-2">
      <textarea
        aria-label="Your answer"
        value={text}
        maxLength={limit}
        onChange={e => onChange({ text: e.target.value })}
        placeholder="Write your answer…"
        spellCheck={question.questionType === 'ESSAY'}
        className={`${FIELD} py-2.5 w-full resize-y leading-relaxed ${roomy ? 'min-h-[50vh]' : 'min-h-[14rem]'} ${
          question.questionType !== 'ESSAY' ? 'font-mono text-sm' : 'text-base'
        }`}
      />
      <p className="text-xs text-content-subtle text-right">
        {words} words · {text.length.toLocaleString()} / {limit.toLocaleString()} characters
      </p>
    </div>
  );
}
