import React from 'react';

/** Practice: tone of a checked question in the palette (also used by its legend swatches). */
export const PALETTE_RESULT_TONE = {
  correct: 'bg-success-solid text-white border-success-solid',
  partial: 'bg-warning-light text-warning-strong border-warning-strong border-dashed',
  wrong: 'bg-danger-light text-danger-strong border-danger-solid',
} as const;

const RESULT_LABEL = { correct: 'correct', partial: 'partly correct', wrong: 'wrong' } as const;

export function QuestionPalette({ total, current, answered, flagged, results, onSelect }: {
  total: number; current: number; answered: Set<number>; flagged: Set<number>;
  /** Practice: how each checked question went (question number → outcome). */
  results?: Map<number, keyof typeof PALETTE_RESULT_TONE>;
  onSelect: (n: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: total }, (_, i) => i + 1).map(n => {
        const result = results?.get(n);
        return (
        <button key={n} type="button" onClick={() => onSelect(n)}
          aria-current={n === current ? 'step' : undefined}
          aria-label={`Question ${n}${result ? `, ${RESULT_LABEL[result]}` : ''}${flagged.has(n) ? ', flagged' : !result && answered.has(n) ? ', answered' : ''}`}
          className={`w-9 h-9 rounded-[8px] text-sm font-semibold transition-all border
            ${n === current ? 'bg-brand-600 text-white border-brand-600 shadow-sm' :
              result ? PALETTE_RESULT_TONE[result] :
              flagged.has(n) ? 'bg-warning-light text-warning border-warning-line' :
              answered.has(n) ? 'bg-success-light text-success border-success-line' :
              'bg-surface text-content-secondary border-line hover:bg-accent'}`}>
          {n}
        </button>
        );
      })}
    </div>
  );
}

export function AnswerOption({ letter, text, selected, correct, incorrect, onChange }: {
  letter: string; text: string; selected?: boolean; correct?: boolean; incorrect?: boolean; onChange?: () => void;
}) {
  let cls = 'border-line bg-surface hover:border-brand-600 hover:bg-surface-hover';
  if (selected && !correct && !incorrect) cls = 'border-brand-600 bg-primary-light';
  if (correct) cls = 'border-success-solid bg-success-light';
  if (incorrect) cls = 'border-danger-solid bg-danger-light';
  return (
    <button
      type="button"
      role="radio"
      aria-checked={Boolean(selected)}
      onClick={onChange}
      className={`w-full text-left flex items-start gap-3 p-4 rounded-[10px] border-2 cursor-pointer transition-all ${cls}`}
    >
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5
        ${correct ? 'bg-success-solid text-white' : incorrect ? 'bg-danger-solid text-white' : selected ? 'bg-brand-600 text-white' : 'bg-surface-muted text-content-secondary'}`}>
        {letter}
      </div>
      <p className={`text-base leading-relaxed ${correct ? 'text-success-strong font-medium' : incorrect ? 'text-danger-strong font-medium' : 'text-content-secondary'}`}>{text}</p>
    </button>
  );
}
