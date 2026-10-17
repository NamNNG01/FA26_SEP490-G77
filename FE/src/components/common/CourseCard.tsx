import React from 'react';
import { Icon } from '@/assets/icons';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';

export interface CourseMetricItem {
  label: string;
  value?: number | string;
  color?: string;
}

export function CourseCard({
  title,
  description,
  subject,
  difficulty,
  progress,
  modules,
  lessons,
  questions,
  examCount,
  customMetrics,
  managerName,
  status,
  updated,
  onClick,
}: {
  title: string;
  description?: string;
  subject: string;
  difficulty?: 'Easy' | 'Medium' | 'Hard';
  progress?: number;
  modules?: number;
  lessons?: number;
  questions?: number;
  examCount?: number;
  customMetrics?: CourseMetricItem[];
  managerName?: string;
  status?: string;
  updated?: string;
  onClick?: () => void;
}) {
  const diffColor = { Easy: 'success', Medium: 'warning', Hard: 'danger' } as const;
  const statusVariant =
    status === 'Published'
      ? ('success' as const)
      : status === 'Draft'
        ? ('warning' as const)
        : ('default' as const);

  const displayMetrics: CourseMetricItem[] = customMetrics ?? [
    { label: 'Modules', value: modules, color: '#2563EB' },
    { label: 'Lessons', value: lessons, color: '#7C3AED' },
    { label: 'Questions', value: questions, color: '#D97706' },
    { label: 'Exams', value: examCount, color: '#059669' },
  ];

  return (
    <div className="card p-5 flex flex-col gap-3 cursor-pointer hover:shadow-md transition-all" onClick={onClick}>
      <div className="flex items-center justify-between gap-2">
        {difficulty ? (
          <Badge variant={diffColor[difficulty]}>{difficulty}</Badge>
        ) : (
          <span className="text-[11.5px] font-medium text-[#6B7280]">{subject}</span>
        )}
        {status && <Badge variant={statusVariant}>{status}</Badge>}
      </div>
      <div>
        <h3 className="text-[15px] font-semibold text-[#111827] leading-snug">{title}</h3>
        {difficulty && <p className="text-[12px] text-[#9CA3AF] mt-0.5">{subject}</p>}
      </div>
      {description && <p className="text-[12.5px] text-[#6B7280] leading-relaxed line-clamp-2">{description}</p>}
      <div className={`grid gap-2 ${displayMetrics.length === 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
        {displayMetrics.map(m => (
          <div key={m.label} className="bg-[#F9FAFB] rounded-[8px] px-2 py-2 text-center">
            <span className="inline-block w-1.5 h-1.5 rounded-full mb-1" style={{ background: m.color ?? '#2563EB' }} />
            <p className="text-[14px] font-semibold text-[#111827] leading-none">{m.value !== undefined ? (typeof m.value === 'number' ? m.value.toLocaleString() : m.value) : '—'}</p>
            <p className="text-[10.5px] text-[#9CA3AF] mt-0.5">{m.label}</p>
          </div>
        ))}
      </div>
      {progress !== undefined && <Progress value={progress} label="Progress" size="sm" />}
      <div className="flex items-center justify-between text-[11.5px] text-[#9CA3AF] border-t border-[#F9FAFB] pt-2.5">
        <span>{managerName ? `Manager: ${managerName}` : progress !== undefined ? `${progress}% complete` : 'Course'}</span>
        <span className="flex items-center gap-1"><Icon.Clock className="w-3 h-3" />{updated ?? '—'}</span>
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