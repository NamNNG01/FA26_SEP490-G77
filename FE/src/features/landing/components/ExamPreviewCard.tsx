import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import { Icon } from '@/assets/icons';
import { Reveal } from './Reveal';
import { previewExam } from '../data/landingData';

/**
 * ExamPreviewCard
 *
 * Interactive, UNSCORED sample-exam widget. Guests may click one option and
 * see it highlighted (only one selected at a time) — a marketing preview of
 * the real exam experience, not an actual exam. Countdown starts on mount.
 *
 * Fluid width — never overflows, never overlaps the hero (it is a grid
 * item, not absolutely positioned):
 *  - Desktop (≥1280): width 100% of its column, max 460px, right-aligned
 *  - Tablet (<1280) : width 100%, max 560px, centered
 *  - Mobile         : width 100%
 */
export function ExamPreviewCard() {
  const [remaining, setRemaining] = useState(previewExam.durationSeconds);
  const [selected, setSelected] = useState<string | null>(null);

  // Countdown timer — ticks once per second, stops at 00:00.
  useEffect(() => {
    const id = window.setInterval(() => {
      setRemaining((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const timeLabel = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return (
    <Reveal delay={200} direction="left" className="min-w-0 w-full">
      <Card className="w-full max-w-[560px] xl:max-w-[460px] mx-auto xl:mx-0 xl:ml-auto p-5 sm:p-6 shadow-xl shadow-[#111827]/8 border-[#E5E7EB]">
        {/* Header: exam title (wraps) ... timer — flex, space-between, centered.
            min-w-0 lets the title shrink instead of pushing the timer out. */}
        <div className="flex items-center justify-between gap-4 min-w-0">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-wider text-[#2563EB] uppercase">
              Live Preview
            </p>
            <h3 className="text-[15px] sm:text-[16px] font-bold text-[#111827] mt-0.5 leading-snug break-words">
              {previewExam.examTitle}
            </h3>
          </div>
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-[10px] font-mono text-[13px] sm:text-[14px] font-bold flex-shrink-0 ${
              remaining <= 30
                ? 'bg-[#FEF2F2] text-[#DC2626]'
                : 'bg-[#EFF6FF] text-[#2563EB]'
            }`}
          >
            <Icon.Clock className="w-4 h-4" />
            <span className="tabular-nums">{timeLabel}</span>
          </div>
        </div>

        {/* Question progress */}
        <div className="mt-5">
          <Progress
            value={previewExam.questionNumber}
            max={previewExam.totalQuestions}
            size="sm"
            label={`Question ${previewExam.questionNumber} of ${previewExam.totalQuestions}`}
          />
        </div>

        {/* Question content — readable, wraps long words, never one word per line */}
        <p className="text-[16px] text-[#374151] mt-5" style={{ lineHeight: 1.6, maxWidth: '100%', overflowWrap: 'break-word' }}>
          {previewExam.question}
        </p>

        {/* Answer options — full width, single selection, no scoring */}
        <div className="flex flex-col gap-2.5 mt-5">
          {previewExam.options.map((option) => {
            const isSelected = selected === option.label;
            return (
              <button
                key={option.label}
                type="button"
                onClick={() => setSelected(option.label)}
                aria-pressed={isSelected}
                className={`w-full flex items-center gap-3 px-4 py-4 rounded-[12px] border text-left transition-all duration-200 cursor-pointer hover:-translate-y-0.5 hover:shadow-sm
                  ${
                    isSelected
                      ? 'border-[#2563EB] bg-[#EFF6FF] shadow-sm'
                      : 'border-[#E5E7EB] bg-white hover:border-[#BFDBFE] hover:bg-[#F9FAFB]'
                  }`}
              >
                <span
                  className={`w-7 h-7 rounded-[8px] flex items-center justify-center text-[12px] font-bold flex-shrink-0 transition-colors ${
                    isSelected
                      ? 'bg-[#2563EB] text-white'
                      : 'bg-[#F3F4F6] text-[#374151]'
                  }`}
                >
                  {option.label}
                </span>
                <span
                  className={`text-[14px] font-medium min-w-0 ${isSelected ? 'text-[#1D4ED8]' : 'text-[#374151]'}`}
                  style={{ overflowWrap: 'break-word' }}
                >
                  {option.text}
                </span>
                {isSelected && (
                  <Icon.CheckCircle className="w-4.5 h-4.5 text-[#2563EB] ml-auto flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        <p className="text-[12px] text-[#9CA3AF] text-center mt-4">
          Try it — pick an answer. No scoring in this preview.
        </p>
      </Card>
    </Reveal>
  );
}
