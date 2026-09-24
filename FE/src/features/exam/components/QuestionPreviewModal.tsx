import React from 'react';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import type { BankQuestion } from '../mockQuestionBank';
import { difficultyLabel, difficultyVariant } from '../mockQuestionBank';

export function QuestionPreviewModal({ question, onClose }: { question: BankQuestion | null; onClose: () => void }) {
  return (
    <Modal open={!!question} onClose={onClose} title="Question Preview" size="lg">
      {question && (
        <div className="space-y-4">
          <div>
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              <Badge variant={difficultyVariant(question.difficulty)}>{difficultyLabel(question.difficulty)}</Badge>
              <Badge variant="default">{question.type.toUpperCase()}</Badge>
              <Badge variant="purple">{question.topic}</Badge>
              <span className="text-[12px] text-[#9CA3AF]">{question.pts} pts</span>
            </div>
            <p className="text-[14px] font-semibold text-[#111827] leading-snug">{question.text}</p>
          </div>

          {question.options.some(o => o.text) ? (
            <div className="space-y-2">
              {question.options.map(o => {
                const correct = o.label === question.correct;
                return (
                  <div key={o.label}
                    className={`flex items-start gap-2.5 px-3 py-2.5 rounded-[10px] border text-[13px] ${correct ? 'border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]' : 'border-[#E5E7EB] text-[#374151]'}`}>
                    <span className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold ${correct ? 'bg-[#16A34A] text-white' : 'bg-[#F3F4F6] text-[#6B7280]'}`}>{o.label}</span>
                    <span className="leading-snug">{o.text}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div>
              <p className="text-[13px] text-[#6B7280] mb-1">Correct answer</p>
              <Badge variant="success">Option {question.correct}</Badge>
              <p className="text-[12px] text-[#9CA3AF] mt-2">Free-response question — no options to display.</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}