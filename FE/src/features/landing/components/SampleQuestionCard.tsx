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
    <div className="w-full max-w-[480px] rounded-[16px] border border-[#E5E7EB] bg-white shadow-[0_24px_48px_-24px_rgb(15_59_53/0.35)] dark:border-[#1F2937] dark:bg-[#111827]">
      {/* Exam chrome: course, position, topic */}
      <div className="flex items-center justify-between gap-3 border-b border-[#F3F4F6] px-5 py-3 dark:border-[#1F2937]">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-semibold text-[#111827] dark:text-[#F9FAFB]">{q.course}</p>
          <p className="text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">{q.position}</p>
        </div>
        <span className="flex-shrink-0 rounded-[6px] bg-[#ECF7F4] px-2 py-1 text-[11.5px] font-semibold text-[#0B5047] dark:bg-[#082B26] dark:text-[#6FCBB6]">
          {q.topic}
        </span>
      </div>

      <div className="px-5 pt-4 pb-5">
        <p className="text-[15px] font-medium leading-relaxed text-[#111827] dark:text-[#F9FAFB]">{q.prompt}</p>

        <div role="radiogroup" aria-label="Answer options" className="mt-4 flex flex-col gap-2">
          {q.options.map((opt) => {
            const isPicked = picked === opt.id;
            const isAnswer = opt.id === q.correctId;
            let tone =
              'border-[#E5E7EB] hover:border-[#0D7C6C] hover:bg-[#F0FAF7] dark:border-[#1F2937] dark:hover:border-[#6FCBB6] dark:hover:bg-[#082B26]';
            if (answered && isAnswer) tone = 'border-[#16A34A] bg-[#F0FDF4] dark:bg-[#052E16]';
            else if (answered && isPicked) tone = 'border-[#DC2626] bg-[#FEF2F2] dark:bg-[#450A0A]';
            else if (answered) tone = 'border-[#E5E7EB] opacity-60 dark:border-[#1F2937]';

            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={isPicked}
                disabled={answered}
                onClick={() => setPicked(opt.id)}
                className={`flex w-full items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left text-[14px] text-[#111827] transition-colors disabled:cursor-default dark:text-[#F9FAFB] ${tone} ${answered ? '' : 'cursor-pointer'}`}
              >
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-[#D1D5DB] font-mono text-[12px] font-semibold text-[#6B7280] dark:text-[#9CA3AF]">
                  {answered && isAnswer ? (
                    <Icon.Check className="h-3.5 w-3.5 text-[#16A34A]" />
                  ) : answered && isPicked ? (
                    <Icon.X className="h-3.5 w-3.5 text-[#DC2626]" />
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
          <div className="mt-4 rounded-[10px] bg-[#F9FAFB] p-4 dark:bg-[#0B1220]" aria-live="polite">
            <p className={`text-[13px] font-semibold ${correct ? 'text-[#16A34A]' : 'text-[#DC2626]'}`}>
              {correct ? 'Correct.' : `Not quite. The answer is ${q.correctId}.`}
            </p>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#4B5563] dark:text-[#D1D5DB]">{q.explanation}</p>
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="mt-3 text-[13px] font-semibold text-[#0D7C6C] hover:underline"
            >
              Try again
            </button>
          </div>
        ) : (
          <p className="mt-4 text-[12.5px] text-[#6B7280] dark:text-[#9CA3AF]">
            Pick an answer to see the explanation you would get after an attempt.
          </p>
        )}
      </div>
    </div>
  );
}
