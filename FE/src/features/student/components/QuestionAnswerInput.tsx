import React from 'react';
import { Icon } from '@/assets/icons';
import type { AnswerResponse, AttemptQuestion } from '@/services/studentAttempt.service';

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
}

/** The answer control for one question, by type. Emits the SA-03 `response` payload. */
export function QuestionAnswerInput({ question, value, onChange, roomy }: InputProps) {
  switch (question.questionType) {
    case 'SINGLE_CHOICE':
    case 'TRUE_FALSE':
    case 'MULTIPLE_CHOICE':
      return <ChoiceInput question={question} value={value} onChange={onChange} />;
    case 'FILL_BLANK':
      return <FillBlankInput question={question} value={value} onChange={onChange} />;
    case 'MATCHING':
      return <MatchingInput question={question} value={value} onChange={onChange} />;
    case 'ORDERING':
      return <OrderingInput question={question} value={value} onChange={onChange} />;
    case 'ESSAY':
    case 'CODE':
    case 'DIAGRAM':
      return <TextInput question={question} value={value} onChange={onChange} roomy={roomy} />;
    default:
      return <p className="text-sm text-content-soft">This question type can't be answered here.</p>;
  }
}

function ChoiceInput({ question, value, onChange }: InputProps) {
  const multi = question.questionType === 'MULTIPLE_CHOICE';
  const selected = new Set(value?.selectedOptionIds ?? []);
  const toggle = (id: number) => {
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
        return (
          <button
            key={opt.optionId}
            type="button"
            role={multi ? 'checkbox' : 'radio'}
            aria-checked={isOn}
            onClick={() => toggle(opt.optionId)}
            className={`w-full text-left flex items-start gap-3 p-4 rounded-[10px] border-2 transition-all ${
              isOn ? 'border-brand-600 bg-primary-light' : 'border-line bg-surface hover:border-brand-600 hover:bg-surface-hover'
            }`}
          >
            <span
              className={`w-7 h-7 flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5 ${multi ? 'rounded-[6px]' : 'rounded-full'} ${
                isOn ? 'bg-brand-600 text-white' : 'bg-surface-muted text-content-secondary'
              }`}
            >
              {multi && isOn ? <Icon.Check className="w-4 h-4" /> : optionLetter(i)}
            </span>
            <span className="text-base leading-relaxed text-content-secondary break-words">{opt.optionText}</span>
          </button>
        );
      })}
    </div>
  );
}

function FillBlankInput({ question, value, onChange }: InputProps) {
  const indices = [...new Set([...question.content.matchAll(BLANK)].map(m => m[1]))];
  const blanks = value?.blanks ?? {};
  if (indices.length === 0) {
    return (
      <input
        className={`${FIELD} h-10 w-full`}
        aria-label="Your answer"
        value={blanks['1'] ?? ''}
        onChange={e => onChange({ blanks: { ...blanks, '1': e.target.value } })}
      />
    );
  }
  return (
    <div className="space-y-3">
      {indices.map(n => (
        <label key={n} className="flex items-center gap-3">
          <span className="w-10 text-sm font-semibold text-content-secondary">({n})</span>
          <input
            className={`${FIELD} h-10 flex-1`}
            placeholder={`Blank ${n}`}
            value={blanks[n] ?? ''}
            onChange={e => onChange({ blanks: { ...blanks, [n]: e.target.value } })}
          />
        </label>
      ))}
    </div>
  );
}

function MatchingInput({ question, value, onChange }: InputProps) {
  const lefts = question.matching?.lefts ?? [];
  const rights = question.matching?.rights ?? [];
  const current = new Map((value?.matches ?? []).map(m => [m.left, m.right]));
  const set = (left: string, right: string) => {
    const next = new Map(current);
    if (right) next.set(left, right);
    else next.delete(left);
    onChange({ matches: [...next].map(([l, r]) => ({ left: l, right: r })) });
  };
  return (
    <div className="space-y-2.5">
      {lefts.map(left => (
        <div key={left} className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-[10px] border border-line bg-surface">
          <span className="flex-1 text-sm text-content break-words">{left}</span>
          <Icon.ChevronRight className="hidden sm:block w-4 h-4 text-content-subtle" />
          <select
            className={`${FIELD} h-10 sm:w-1/2`}
            aria-label={`Match for ${left}`}
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
        </div>
      ))}
    </div>
  );
}

function OrderingInput({ question, value, onChange }: InputProps) {
  const options = question.options ?? [];
  const byId = new Map(options.map(o => [o.optionId, o]));
  const order = value?.orderedOptionIds?.length ? value.orderedOptionIds : options.map(o => o.optionId);
  const touched = Boolean(value?.orderedOptionIds?.length);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    [next[from], next[to]] = [next[to], next[from]];
    onChange({ orderedOptionIds: next });
  };
  return (
    <div className="space-y-2.5">
      <p className="text-xs text-content-subtle">Put the items in the right order with the arrows.</p>
      <ol className="space-y-2">
        {order.map((id, i) => (
          <li key={id} className="flex items-center gap-3 p-3 rounded-[10px] border border-line bg-surface">
            <span className="w-7 h-7 rounded-full bg-surface-muted text-sm font-semibold text-content-secondary flex items-center justify-center flex-shrink-0">
              {i + 1}
            </span>
            <span className="flex-1 text-sm text-content break-words">{byId.get(id)?.optionText}</span>
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
              disabled={i === order.length - 1}
              onClick={() => move(i, i + 1)}
              className="p-1.5 rounded-[6px] hover:bg-accent disabled:opacity-30"
            >
              <Icon.ArrowDown className="w-4 h-4" />
            </button>
          </li>
        ))}
      </ol>
      {!touched && order.length > 0 && (
        <button type="button" onClick={() => onChange({ orderedOptionIds: order })} className="text-sm text-brand-ink hover:underline">
          Keep this order as my answer
        </button>
      )}
    </div>
  );
}

function TextInput({ question, value, onChange, roomy }: InputProps) {
  const isDiagram = question.questionType === 'DIAGRAM';
  const field = isDiagram ? 'drawioXml' : 'text';
  const text = (isDiagram ? value?.drawioXml : value?.text) ?? '';
  const limit = isDiagram ? undefined : question.answerSpace?.maxLength ?? DEFAULT_TEXT_LIMIT;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return (
    <div className="space-y-2">
      {isDiagram && (
        <p className="text-xs text-content-subtle">
          Draw your diagram in draw.io, then paste its XML here (Extras → Edit Diagram).
        </p>
      )}
      <textarea
        aria-label="Your answer"
        value={text}
        maxLength={limit}
        onChange={e => onChange({ [field]: e.target.value })}
        placeholder={isDiagram ? '<mxfile>…</mxfile>' : 'Write your answer…'}
        spellCheck={question.questionType === 'ESSAY'}
        className={`${FIELD} py-2.5 w-full resize-y leading-relaxed ${roomy ? 'min-h-[50vh]' : 'min-h-[14rem]'} ${
          question.questionType !== 'ESSAY' ? 'font-mono text-sm' : 'text-base'
        }`}
      />
      {!isDiagram && (
        <p className="text-xs text-content-subtle text-right">
          {words} words · {text.length.toLocaleString()} / {limit?.toLocaleString()} characters
        </p>
      )}
    </div>
  );
}
