import React, { useState } from 'react';
import { Icon } from '@/assets/icons';
import { sampleQuestion } from '../data/landingData';

/**
 * SampleQuestionCard
 *
 * The hero's right column: one real exam-style question the visitor can
 * answer on the spot. Picking an option locks the question, marks the right
 * and wrong answers, and reveals the explanation — the same loop the product
 * runs on, shown instead of described. "Try again" resets it.
 *
 * Purely front-end; nothing is recorded.
 */
export function SampleQuestionCard() {
  const q = sampleQuestion;
  const [picked, setPicked] = useState<string | null>(null);
  const answered = picked !== null;
  const correct = picked === q.correctId;

  return (
    <div className="w-full max-w-[480px] rounded-[16px] border border-line bg-surface shadow-[0_24px_48px_-24px_rgb(15_59_53/0.35)]">
      {/* Exam chrome: course, position, topic */}
      <div className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-content">{q.course}</p>
          <p className="text-xs text-content-soft">{q.position}</p>
        </div>
        <span className="flex-shrink-0 rounded-[6px] bg-primary-light px-2 py-1 text-2xs font-semibold text-brand-ink-strong">
          {q.topic}
        </span>
      </div>

      <div className="px-5 pt-4 pb-5">
        <p className="text-lg font-medium leading-relaxed text-content">{q.prompt}</p>

        <div role="radiogroup" aria-label="Answer options" className="mt-4 flex flex-col gap-2">
          {q.options.map((opt) => {
            const isPicked = picked === opt.id;
            const isAnswer = opt.id === q.correctId;
            let tone =
              'border-line hover:border-brand-ink hover:bg-primary-light';
            if (answered && isAnswer) tone = 'border-success-solid bg-success-light';
            else if (answered && isPicked) tone = 'border-danger-solid bg-danger-light';
            else if (answered) tone = 'border-line opacity-60';

            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={isPicked}
                disabled={answered}
                onClick={() => setPicked(opt.id)}
                className={`flex w-full items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left text-base text-content transition-colors disabled:cursor-default ${tone} ${answered ? '' : 'cursor-pointer'}`}
              >
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-line-strong font-mono text-xs font-semibold text-content-soft">
                  {answered && isAnswer ? (
                    <Icon.Check className="h-3.5 w-3.5 text-success" />
                  ) : answered && isPicked ? (
                    <Icon.X className="h-3.5 w-3.5 text-danger" />
                  ) : (
                    opt.id
                  )}
                </span>
                {opt.text}
              </button>
            );
          })}
        </div>

        {answered ? (
          <div className="mt-4 rounded-[10px] bg-surface-alt p-4" aria-live="polite">
            <p className={`text-sm font-semibold ${correct ? 'text-success' : 'text-danger'}`}>
              {correct ? 'Correct.' : `Not quite. The answer is ${q.correctId}.`}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-content-muted">{q.explanation}</p>
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="mt-3 text-sm font-semibold text-brand-ink hover:underline"
            >
              Try again
            </button>
          </div>
        ) : (
          <p className="mt-4 text-xs text-content-soft">
            Pick an answer to see the explanation you would get after an attempt.
          </p>
        )}
      </div>
    </div>
  );
}
