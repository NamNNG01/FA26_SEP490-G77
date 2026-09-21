import React from 'react';

export function QuestionPalette({ total, current, answered, flagged, onSelect }: {
  total: number; current: number; answered: Set<number>; flagged: Set<number>; onSelect: (n: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: total }, (_, i) => i + 1).map(n => (
        <button key={n} onClick={() => onSelect(n)}
          className={`w-9 h-9 rounded-[8px] text-[13px] font-semibold transition-all border
            ${n === current ? 'bg-[#2563EB] text-white border-[#2563EB] shadow-sm' :
              flagged.has(n) ? 'bg-[#FFFBEB] text-[#D97706] border-[#FDE68A]' :
              answered.has(n) ? 'bg-[#F0FDF4] text-[#16A34A] border-[#BBF7D0]' :
              'bg-white text-[#374151] border-[#E5E7EB] hover:bg-[#F3F4F6]'}`}>
          {n}
        </button>
      ))}
    </div>
  );
}

export function AnswerOption({ letter, text, selected, correct, incorrect, onChange }: {
  letter: string; text: string; selected?: boolean; correct?: boolean; incorrect?: boolean; onChange?: () => void;
}) {
  let cls = 'border-[#E5E7EB] bg-white hover:border-[#2563EB] hover:bg-[#F9FAFB]';
  if (selected && !correct && !incorrect) cls = 'border-[#2563EB] bg-[#EFF6FF]';
  if (correct) cls = 'border-[#16A34A] bg-[#F0FDF4]';
  if (incorrect) cls = 'border-[#DC2626] bg-[#FEF2F2]';
  return (
    <div onClick={onChange} className={`flex items-start gap-3 p-4 rounded-[10px] border-2 cursor-pointer transition-all ${cls}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-bold flex-shrink-0 mt-0.5
        ${correct ? 'bg-[#16A34A] text-white' : incorrect ? 'bg-[#DC2626] text-white' : selected ? 'bg-[#2563EB] text-white' : 'bg-[#F3F4F6] text-[#374151]'}`}>
        {letter}
      </div>
      <p className={`text-[14px] leading-relaxed ${correct ? 'text-[#15803D] font-medium' : incorrect ? 'text-[#B91C1C] font-medium' : 'text-[#374151]'}`}>{text}</p>
    </div>
  );
}
