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
              <span className="text-xs text-content-subtle">{question.pts} pts</span>
            </div>
            <p className="text-base font-semibold text-content leading-snug">{question.text}</p>
          </div>

          {question.options.some(o => o.text) ? (
            <div className="space-y-2">
              {question.options.map(o => {
                const correct = o.label === question.correct;
                return (
                  <div key={o.label}
                    className={`flex items-start gap-2.5 px-3 py-2.5 rounded-[10px] border text-sm ${correct ? 'border-success-line bg-success-light text-success-strong' : 'border-line text-content-secondary'}`}>
                    <span className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-2xs font-bold ${correct ? 'bg-success-solid text-white' : 'bg-surface-muted text-content-soft'}`}>{o.label}</span>
                    <span className="leading-snug">{o.text}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div>
              <p className="text-sm text-content-soft mb-1">Correct answer</p>
              <Badge variant="success">Option {question.correct}</Badge>
              <p className="text-xs text-content-subtle mt-2">Free-response question — no options to display.</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}