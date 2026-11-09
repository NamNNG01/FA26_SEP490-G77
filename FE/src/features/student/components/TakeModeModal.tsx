import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/assets/icons';
import type { TakeAs } from '../examModes';

const TAKE_MODES: { value: TakeAs; title: string; description: string; icon: React.ReactNode; tile: string }[] = [
  {
    value: 'EXAM',
    title: 'Exam',
    description: 'Timed and submitted at the end; right / wrong and explanations show on the result.',
    icon: <Icon.Clock className="w-5 h-5" />,
    tile: 'bg-warning-light text-warning',
  },
  {
    value: 'PRACTICE',
    title: 'Practice',
    description: 'No time limit; each answer is checked at once with the correct answer and its explanation.',
    icon: <Icon.CheckCircle className="w-5 h-5" />,
    tile: 'bg-success-light text-success',
  },
];

/** Exam / Practice choice for a self-made exam (see examModes.ts). */
export function TakeModePicker({ value, onChange }: { value: TakeAs; onChange: (value: TakeAs) => void }) {
  return (
    <div role="radiogroup" aria-label="Take as" className="rounded-[12px] border border-line divide-y divide-line overflow-hidden">
      {TAKE_MODES.map(m => {
        const selected = value === m.value;
        return (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(m.value)}
            className={`w-full flex items-center gap-4 px-4 py-3.5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${
              selected ? 'bg-primary-light' : 'hover:bg-surface-hover'
            }`}
          >
            <span className={`w-11 h-11 rounded-[10px] flex items-center justify-center flex-shrink-0 ${m.tile}`}>{m.icon}</span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-content">{m.title}</span>
              <span className="block text-xs text-content-soft mt-0.5">{m.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Start a self-made exam: pick Exam or Practice, then start (a retake keeps the attempt's choice). */
export function TakeModeModal({
  open,
  onClose,
  onStart,
  initial = 'PRACTICE',
  title = 'Start as',
}: {
  open: boolean;
  onClose: () => void;
  onStart: (takeAs: TakeAs) => void;
  initial?: TakeAs;
  title?: string;
}) {
  const [takeAs, setTakeAs] = useState<TakeAs>(initial);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button icon={<Icon.RefreshCw className="w-4 h-4" />} onClick={() => onStart(takeAs)}>
            Start
          </Button>
        </div>
      }
    >
      <TakeModePicker value={takeAs} onChange={setTakeAs} />
    </Modal>
  );
}
