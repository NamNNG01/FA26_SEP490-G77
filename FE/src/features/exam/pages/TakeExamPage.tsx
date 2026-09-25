import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { TimerDisplay } from '@/components/common/TimerDisplay';
import { QuestionPalette, AnswerOption } from '@/components/common/QuestionPalette';
import { AIHintCard } from '@/components/common/AIHintCard';
import { Icon } from '@/assets/icons';

export function TakeExamPage() {
  const [currentQ, setCurrentQ] = useState(3);
  const [selected, setSelected] = useState<string | null>('B');
  const [answered] = useState(new Set([1, 2, 3, 5, 7, 8, 10, 12]));
  const [flagged] = useState(new Set([4, 9]));
  const [hintOpen, setHintOpen] = useState(false);
  const [timeLeft] = useState(3284);

  return (
    <div className="h-[100dvh] flex flex-col bg-[#F9FAFB]">
      {/* Exam Header */}
      <header className="h-14 bg-white border-b border-[#F3F4F6] flex items-center px-6 gap-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#2563EB] rounded-[8px] flex items-center justify-center">
            <Icon.Brain className="w-4 h-4 text-white" />
          </div>
          <span className="text-[14px] font-bold text-[#111827]">ML Fundamentals Final Exam</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#F9FAFB] rounded-[8px] border border-[#E5E7EB]">
            <span className="text-[12px] text-[#6B7280]">Question</span>
            <span className="text-[14px] font-bold text-[#111827]">{currentQ} / 45</span>
          </div>
          <TimerDisplay seconds={timeLeft} warning={timeLeft < 600} />
          <Button variant="danger" size="sm">Submit Exam</Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Main question area */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="info">Multiple Choice</Badge>
              <Badge variant="warning">Medium</Badge>
              <span className="text-[12px] text-[#9CA3AF] ml-auto">Machine Learning · Optimization</span>
            </div>

            <div className="card p-6">
              <p className="text-[12px] font-semibold text-[#9CA3AF] uppercase tracking-wide mb-3">Question {currentQ}</p>
              <p className="text-[16px] text-[#111827] leading-relaxed font-medium">
                In the context of training deep neural networks, which optimization algorithm is most commonly used for its ability to adapt learning rates for each parameter individually and its effectiveness on sparse gradients?
              </p>
            </div>

            <div className="space-y-2.5">
              {[
                { letter: 'A', text: 'Vanilla Stochastic Gradient Descent (SGD) with a fixed learning rate' },
                { letter: 'B', text: 'Adam (Adaptive Moment Estimation) optimizer combining momentum and RMSprop' },
                { letter: 'C', text: 'Gradient Descent with Nesterov momentum only' },
                { letter: 'D', text: 'Adagrad with L1 regularization and weight decay' },
              ].map(opt => (
                <AnswerOption key={opt.letter} {...opt} selected={selected === opt.letter} onChange={() => setSelected(opt.letter)} />
              ))}
            </div>

            <AIHintCard
              hint="Consider which optimizer was specifically designed to address the limitations of both momentum-based methods and adaptive learning rate methods. It maintains two moving averages: one for the gradients and one for the squared gradients."
              expanded={hintOpen} onToggle={() => setHintOpen(o => !o)}
            />

            <div className="flex items-center justify-between">
              <Button variant="outline" icon={<Icon.ChevronLeft className="w-4 h-4" />} onClick={() => setCurrentQ(q => Math.max(1, q - 1))}>Previous</Button>
              <div className="flex gap-2">
                <Button variant="outline" icon={<Icon.Star className="w-4 h-4" />}>Flag</Button>
                <Button icon={<Icon.ChevronRight className="w-4 h-4" />} onClick={() => setCurrentQ(q => Math.min(45, q + 1))}>Next Question</Button>
              </div>
            </div>
          </div>
        </div>

        {/* Question palette sidebar */}
        <div className="w-72 bg-white border-l border-[#F3F4F6] p-5 overflow-y-auto flex-shrink-0">
          <h4 className="text-[14px] font-semibold text-[#111827] mb-4">Question Navigator</h4>
          <QuestionPalette total={45} current={currentQ} answered={answered} flagged={flagged} onSelect={setCurrentQ} />
          <div className="mt-4 space-y-2 pt-4 border-t border-[#F3F4F6]">
            {[
              { color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', label: 'Answered', count: answered.size },
              { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', label: 'Flagged', count: flagged.size },
              { color: '#9CA3AF', bg: '#F9FAFB', border: '#E5E7EB', label: 'Unanswered', count: 45 - answered.size },
            ].map(s => (
              <div key={s.label} className="flex items-center justify-between text-[12px]">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-[4px] border" style={{ background: s.bg, borderColor: s.border }} />
                  <span className="text-[#6B7280]">{s.label}</span>
                </div>
                <span className="font-semibold text-[#374151]">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
