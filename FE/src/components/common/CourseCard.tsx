import React from 'react';
import { Icon } from '@/assets/icons';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';

export function CourseCard({ title, subject, progress, examCount, difficulty, onClick }: {
  title: string; subject: string; progress: number; examCount: number; difficulty: 'Easy' | 'Medium' | 'Hard'; onClick?: () => void;
}) {
  const diffColor = { Easy: 'success', Medium: 'warning', Hard: 'danger' } as const;
  return (
    <div className="card p-5 flex flex-col gap-4 cursor-pointer hover:shadow-md transition-all" onClick={onClick}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <Badge variant={diffColor[difficulty]} className="mb-2">{difficulty}</Badge>
          <h3 className="text-[15px] font-semibold text-[#111827] leading-snug">{title}</h3>
          <p className="text-[13px] text-[#6B7280] mt-1">{subject}</p>
        </div>
      </div>
      <Progress value={progress} label="Progress" size="sm" />
      <div className="flex items-center justify-between text-[12px] text-[#9CA3AF]">
        <span>{examCount} exams</span>
        <span>{progress}% complete</span>
      </div>
    </div>
  );
}

export function ExamCard({ title, duration, questions, passMark, status, score, onClick }: {
  title: string; duration: number; questions: number; passMark: number; status: 'upcoming' | 'completed' | 'ongoing' | 'locked'; score?: number; onClick?: () => void;
}) {
  const statusMap = { upcoming: { label: 'Upcoming', variant: 'info' as const }, completed: { label: 'Completed', variant: 'success' as const }, ongoing: { label: 'In Progress', variant: 'warning' as const }, locked: { label: 'Locked', variant: 'default' as const } };
  const s = statusMap[status];
  return (
    <div className="card p-5 cursor-pointer hover:shadow-md transition-all" onClick={onClick}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="w-10 h-10 rounded-[10px] bg-[#EFF6FF] flex items-center justify-center flex-shrink-0">
          <Icon.ClipboardList className="w-5 h-5 text-[#2563EB]" />
        </div>
        <Badge variant={s.variant}>{s.label}</Badge>
      </div>
      <h3 className="text-[15px] font-semibold text-[#111827] mb-3">{title}</h3>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-[#F9FAFB] rounded-[8px] px-2 py-2">
          <p className="text-[12px] text-[#9CA3AF]">Duration</p>
          <p className="text-[13px] font-semibold text-[#374151]">{duration}m</p>
        </div>
        <div className="bg-[#F9FAFB] rounded-[8px] px-2 py-2">
          <p className="text-[12px] text-[#9CA3AF]">Questions</p>
          <p className="text-[13px] font-semibold text-[#374151]">{questions}</p>
        </div>
        <div className="bg-[#F9FAFB] rounded-[8px] px-2 py-2">
          <p className="text-[12px] text-[#9CA3AF]">{score !== undefined ? 'Score' : 'Pass'}</p>
          <p className={`text-[13px] font-semibold ${score !== undefined && score >= passMark ? 'text-[#16A34A]' : score !== undefined ? 'text-[#DC2626]' : 'text-[#374151]'}`}>{score !== undefined ? `${score}%` : `${passMark}%`}</p>
        </div>
      </div>
    </div>
  );
}
