import React, { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { TimerDisplay } from '@/components/common/TimerDisplay';
import { QuestionPalette, AnswerOption } from '@/components/common/QuestionPalette';
import { AIHintCard } from '@/components/common/AIHintCard';
import { Icon } from '@/assets/icons';

const TOTAL_QUESTIONS = 45;

/**
 * TakeExamPage
 *
 * Two modes, picked with `?mode=practice` (default: exam):
 *  - exam     — mirrors test-day conditions: no AI hint.
 *  - practice — same screen, with the AI hint available under the options.
 *
 * Submitting always goes through a confirmation that shows how many
 * questions are still unanswered or flagged.
 */
export function TakeExamPage() {
  const [searchParams] = useSearchParams();
  const isPractice = searchParams.get('mode') === 'practice';

  const [currentQ, setCurrentQ] = useState(3);
  const [selected, setSelected] = useState<string | null>('B');
  const [answered, setAnswered] = useState(() => new Set([1, 2, 3, 5, 7, 8, 10, 12]));
  const [flagged, setFlagged] = useState(() => new Set([4, 9]));
  const [hintOpen, setHintOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [timeLeft] = useState(3284);

  const isFlagged = flagged.has(currentQ);
  const unanswered = TOTAL_QUESTIONS - answered.size;

  const selectAnswer = (letter: string) => {
    setSelected(letter);
    setAnswered((prev) => new Set(prev).add(currentQ));
  };

  const toggleFlag = () => {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(currentQ)) next.delete(currentQ);
      else next.add(currentQ);
      return next;
    });
  };

  return (
    <div className="h-[100dvh] flex flex-col bg-surface-alt">
      {/* Exam Header */}
      <header className="h-14 bg-surface border-b border-line-soft flex items-center px-6 gap-4 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon.Logo className="w-7 h-7 flex-shrink-0 text-brand-ink" aria-hidden="true" />
          <span className="text-base font-bold text-content truncate">ML Fundamentals Final Exam</span>
          <span className="hidden sm:inline-flex flex-shrink-0 rounded-[6px] border border-line px-2 py-0.5 text-2xs font-medium text-content-soft">
            {isPractice ? 'Practice mode' : 'Exam mode'}
          </span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-alt rounded-[8px] border border-line">
            <span className="text-xs text-content-soft">Question</span>
            <span className="text-base font-bold text-content">{currentQ} / {TOTAL_QUESTIONS}</span>
          </div>
          <TimerDisplay seconds={timeLeft} warning={timeLeft < 600} />
          {/* Primary, not red: submitting is the expected finish, not a destructive action. */}
          <Button size="sm" onClick={() => setConfirmOpen(true)}>Submit exam</Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Main question area */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto space-y-5">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="info">Multiple Choice</Badge>
              <Badge variant="warning">Medium</Badge>
              <span className="text-xs text-content-subtle ml-auto">Machine Learning · Optimization</span>
            </div>

            <div className="card p-6">
              <p className="text-xs font-semibold text-content-subtle uppercase tracking-wide mb-3">Question {currentQ}</p>
              <p className="text-lg text-content leading-relaxed font-medium">
                In the context of training deep neural networks, which optimization algorithm is most commonly used for its ability to adapt learning rates for each parameter individually and its effectiveness on sparse gradients?
              </p>
            </div>

            <div role="radiogroup" aria-label={`Answer options for question ${currentQ}`} className="space-y-2.5">
              {[
                { letter: 'A', text: 'Vanilla Stochastic Gradient Descent (SGD) with a fixed learning rate' },
                { letter: 'B', text: 'Adam (Adaptive Moment Estimation) optimizer combining momentum and RMSprop' },
                { letter: 'C', text: 'Gradient Descent with Nesterov momentum only' },
                { letter: 'D', text: 'Adagrad with L1 regularization and weight decay' },
              ].map(opt => (
                <AnswerOption key={opt.letter} {...opt} selected={selected === opt.letter} onChange={() => selectAnswer(opt.letter)} />
              ))}
            </div>

            {isPractice && (
              <AIHintCard
                hint="Consider which optimizer was specifically designed to address the limitations of both momentum-based methods and adaptive learning rate methods. It maintains two moving averages: one for the gradients and one for the squared gradients."
                expanded={hintOpen} onToggle={() => setHintOpen(o => !o)}
              />
            )}

            <div className="flex items-center justify-between">
              <Button variant="outline" icon={<Icon.ChevronLeft className="w-4 h-4" />} onClick={() => setCurrentQ(q => Math.max(1, q - 1))}>Previous</Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  aria-pressed={isFlagged}
                  onClick={toggleFlag}
                  icon={<Icon.Flag className={`w-4 h-4 ${isFlagged ? 'text-warning' : ''}`} />}
                  className={isFlagged ? '!border-warning-line !bg-warning-light' : ''}
                >
                  {isFlagged ? 'Flagged' : 'Flag for review'}
                </Button>
                <Button iconRight={<Icon.ChevronRight className="w-4 h-4" />} onClick={() => setCurrentQ(q => Math.min(TOTAL_QUESTIONS, q + 1))}>Next question</Button>
              </div>
            </div>
          </div>
        </div>

        {/* Question palette sidebar */}
        <div className="w-72 bg-surface border-l border-line-soft p-5 overflow-y-auto flex-shrink-0">
          <h2 className="text-base font-semibold text-content mb-4">Question navigator</h2>
          <QuestionPalette total={TOTAL_QUESTIONS} current={currentQ} answered={answered} flagged={flagged} onSelect={setCurrentQ} />
          <div className="mt-4 space-y-2 pt-4 border-t border-line-soft">
            {[
              // Classes (not inline hexes) so the dark-mode remaps apply.
              { swatch: 'bg-success-light border-success-line', label: 'Answered', count: answered.size },
              { swatch: 'bg-warning-light border-warning-line', label: 'Flagged', count: flagged.size },
              { swatch: 'bg-surface-alt border-line', label: 'Unanswered', count: unanswered },
            ].map(s => (
              <div key={s.label} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded-[4px] border ${s.swatch}`} />
                  <span className="text-content-soft">{s.label}</span>
                </div>
                <span className="font-semibold text-content-secondary">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Submit this exam?"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Keep working</Button>
            <Button onClick={() => setConfirmOpen(false)}>Submit exam</Button>
          </>
        }
      >
        <p className="text-base text-content-secondary leading-relaxed">
          You can't change your answers after submitting.
        </p>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            { label: 'Answered', value: answered.size },
            { label: 'Unanswered', value: unanswered },
            { label: 'Flagged', value: flagged.size },
          ].map((s) => (
            <div key={s.label} className="flex flex-col-reverse rounded-[10px] border border-line py-3">
              <dt className="text-xs text-content-soft">{s.label}</dt>
              <dd className="text-xl font-semibold text-content">{s.value}</dd>
            </div>
          ))}
        </dl>
        {unanswered > 0 && (
          <p className="mt-3 text-sm text-warning">
            {unanswered} question{unanswered === 1 ? ' is' : 's are'} still unanswered.
          </p>
        )}
      </Modal>
    </div>
  );
}
