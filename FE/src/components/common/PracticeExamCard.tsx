import React from 'react';
import { Icon } from '@/assets/icons';
import { Badge } from '@/components/ui/Badge';

/**
 * PracticeExamCard
 *
 * Represents a RECOMMENDED PRACTICE EXAM generated from the learner's
 * enrolled courses (AI Certificate Exam Platform) — NOT a scheduled
 * calendar exam. Data-driven: render from an array so the cards can later
 * come from the backend without UI changes.
 */
export interface PracticeExam {
  id: string;
  title: string;
  courseName: string;
  /** Duration in minutes. */
  duration: number;
  questionCount: number;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  /** Why this practice exam is recommended for the learner. */
  recommendedReason: string;
}

const diffVariant = { Easy: 'success', Medium: 'warning', Hard: 'danger' } as const;

export function PracticeExamCard({ exam }: { exam: PracticeExam }) {
  return (
    <div className="card p-5 flex flex-col gap-3 cursor-pointer hover:shadow-md transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="w-10 h-10 rounded-[10px] bg-primary-light flex items-center justify-center flex-shrink-0">
          <Icon.ClipboardList className="w-5 h-5 text-primary" />
        </div>
        <Badge variant="info">Recommended</Badge>
      </div>

      <div>
        <h3 className="text-[15px] font-semibold text-foreground leading-snug">
          {exam.title}
        </h3>
        <p className="text-[12px] text-muted-foreground mt-0.5">
          {exam.courseName}
        </p>
        <p className="text-[12px] text-content-subtle mt-1.5 italic">
          {exam.recommendedReason}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center mt-auto">
        <div className="bg-surface-alt rounded-[8px] px-2 py-2">
          <p className="text-[12px] text-muted-foreground">Duration</p>
          <p className="text-[13px] font-semibold text-foreground">
            {exam.duration}m
          </p>
        </div>
        <div className="bg-surface-alt rounded-[8px] px-2 py-2">
          <p className="text-[12px] text-muted-foreground">Questions</p>
          <p className="text-[13px] font-semibold text-foreground">
            {exam.questionCount}
          </p>
        </div>
        <div className="bg-surface-alt rounded-[8px] px-2 py-2 flex flex-col items-center justify-center gap-1">
          <p className="text-[12px] text-muted-foreground">Level</p>
          <Badge variant={diffVariant[exam.difficulty]}>{exam.difficulty}</Badge>
        </div>
      </div>
    </div>
  );
}
