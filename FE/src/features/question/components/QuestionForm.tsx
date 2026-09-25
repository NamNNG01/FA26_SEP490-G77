import React from 'react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/assets/icons';
import { getQuestionErrors, isQuestionComplete } from '../validation';

export interface QuestionForm {
  id: string;
  text: string;
  moduleId: string;
  difficulty: string;
  type: string;
  options: { label: string; text: string }[];
  correct: string;
}

export function emptyQuestion(index: number, moduleId: string): QuestionForm {
  return {
    id: `q-${Date.now()}-${index}`,
    text: '',
    moduleId,
    difficulty: 'medium',
    type: 'mcq',
    options: [
      { label: 'A', text: '' },
      { label: 'B', text: '' },
      { label: 'C', text: '' },
      { label: 'D', text: '' },
    ],
    correct: 'A',
  };
}

const labelAt = (i: number) => String.fromCharCode(65 + i);

export function QuestionForm({ q, index, onChange, removable, onRemove, canMoveUp, canMoveDown, onMoveUp, onMoveDown, showValidation = true }: {
  q: QuestionForm; index: number; onChange: (q: QuestionForm) => void; removable?: boolean; onRemove?: () => void;
  canMoveUp?: boolean; canMoveDown?: boolean; onMoveUp?: () => void; onMoveDown?: () => void;
  showValidation?: boolean;
}) {
  const setOptText = (oi: number, text: string) => {
    const options = q.options.map((o, i) => i === oi ? { ...o, text } : o);
    onChange({ ...q, options });
  };

  const errors = getQuestionErrors(q);
  const invalid = showValidation && !isQuestionComplete(q);
  const textError = showValidation ? errors.text : undefined;
  const optionsError = showValidation ? errors.options : undefined;

  return (
    <div className={`card px-4 py-3.5 space-y-3 ${invalid ? '!border-[#FDE68A]' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-[6px] bg-[#2563EB]/10 text-[#2563EB] flex items-center justify-center text-[12px] font-bold">#{index + 1}</span>
          <h4 className="text-[15px] font-semibold text-[#111827]">Question {index + 1}</h4>
        </div>
        <div className="flex items-center gap-1">
          <Badge variant={invalid ? 'warning' : 'success'} className="mr-1">
            {invalid ? <Icon.AlertCircle className="w-3.5 h-3.5" /> : <Icon.CheckCircle className="w-3.5 h-3.5" />}
            {invalid ? 'Needs Attention' : 'Complete'}
          </Badge>
          {onMoveUp && (
            <button onClick={onMoveUp} disabled={!canMoveUp} className="p-1.5 rounded-[6px] text-[#9CA3AF] hover:bg-[#F3F4F6] hover:text-[#374151] disabled:opacity-30 disabled:cursor-not-allowed" title="Move up">
              <Icon.ArrowUp className="w-4 h-4" />
            </button>
          )}
          {onMoveDown && (
            <button onClick={onMoveDown} disabled={!canMoveDown} className="p-1.5 rounded-[6px] text-[#9CA3AF] hover:bg-[#F3F4F6] hover:text-[#374151] disabled:opacity-30 disabled:cursor-not-allowed" title="Move down">
              <Icon.ArrowDown className="w-4 h-4" />
            </button>
          )}
          {removable && (
            <button onClick={onRemove} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] text-[#DC2626] hover:bg-[#FEF2F2] text-[13px] font-medium transition-colors">
              <Icon.Trash className="w-3.5 h-3.5" /> Remove
            </button>
          )}
        </div>
      </div>

      <div>
        <label className="text-[13px] font-medium text-[#374151] block mb-1">Question Text *</label>
        <textarea
          value={q.text}
          onChange={e => onChange({ ...q, text: e.target.value })}
          className={`w-full h-[90px] px-3 py-2 rounded-[10px] border text-[14px] text-[#111827] resize-none focus:outline-none focus:ring-2 transition-all
            ${textError ? 'border-[#DC2626] focus:ring-[#DC2626]/20 focus:border-[#DC2626]' : 'border-[#E5E7EB] focus:ring-[#2563EB]/20 focus:border-[#2563EB]'}`}
          placeholder="Enter the question..."
        />
        {textError && <p className="text-[12px] text-[#DC2626] mt-1">{textError}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Select label="Difficulty" value={q.difficulty} onChange={v => onChange({ ...q, difficulty: v })} options={[{ label: 'Easy', value: 'easy' }, { label: 'Medium', value: 'medium' }, { label: 'Hard', value: 'hard' }]} />
        <Select label="Type" value={q.type} onChange={v => onChange({ ...q, type: v })} options={[{ label: 'Multiple Choice', value: 'mcq' }, { label: 'True/False', value: 'tf' }, { label: 'Essay', value: 'essay' }]} />
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <label className="text-[13px] font-medium text-[#374151]">Answer Options</label>
          <Button variant="outline" size="sm" icon={<Icon.Plus className="w-3.5 h-3.5" />} onClick={() => onChange({ ...q, options: [...q.options, { label: labelAt(q.options.length), text: '' }] })}>Add Option</Button>
        </div>
        <div className="space-y-1.5">
          {q.options.map((o, oi) => (
            <div key={o.label} className="flex items-center gap-2">
              <div className="w-7 h-7 bg-[#F3F4F6] rounded-[6px] flex items-center justify-center text-[12px] font-bold text-[#6B7280] flex-shrink-0">{o.label}</div>
              <input
                value={o.text}
                onChange={e => setOptText(oi, e.target.value)}
                className={`flex-1 h-10 px-3 rounded-[10px] border text-[14px] focus:outline-none focus:ring-2 transition-all
                  ${optionsError && o.text.trim() === '' ? 'border-[#DC2626] focus:ring-[#DC2626]/20 focus:border-[#DC2626]' : 'border-[#E5E7EB] focus:ring-[#2563EB]/20 focus:border-[#2563EB]'}`}
                placeholder={`Option ${o.label}`}
              />
              <input
                type="radio"
                name={`correct-${q.id}`}
                className="accent-[#16A34A] w-4 h-4 flex-shrink-0"
                checked={q.correct === o.label}
                onChange={() => onChange({ ...q, correct: o.label })}
                title="Mark as correct"
              />
              {q.options.length > 2 && (
                <button
                  className="text-[#9CA3AF] hover:text-[#DC2626] p-1 flex-shrink-0"
                  onClick={() => onChange({ ...q, options: q.options.filter((_, i) => i !== oi), correct: q.correct === o.label ? q.options[0].label : q.correct })}
                >
                  <Icon.Trash className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        {optionsError && <p className="text-[12px] text-[#DC2626] mt-1.5">{optionsError}</p>}
        <p className="text-[12.5px] font-medium text-[#16A34A] mt-2">Correct answer: <span>{q.correct}</span></p>
      </div>
    </div>
  );
}