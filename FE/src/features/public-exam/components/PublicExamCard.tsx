import React from 'react';
import { Link } from 'react-router';
import { Icon } from '@/assets/icons';
import { Badge } from '@/components/ui/Badge';
import { publicExamPathFor } from '@/app/routes';
import { useAuth } from '@/auth/authContext';
import {
  DIFFICULTY_ACCENT,
  EXAM_TYPE_META,
  STATUS_META,
  courseMeta,
  examSubtitle,
  type PublicExam,
} from '../mockPublicExams';

/** Icon + label pair used in the three-up information strip. */
function InfoCell({ icon, label, value, accent }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  /** Overrides the value colour — used for the difficulty dot. */
  accent?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 px-2 py-2.5">
      <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
        <span className="h-3.5 w-3.5">{icon}</span>
        {label}
      </span>
      <span className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
        {accent && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />}
        {value}
      </span>
    </div>
  );
}

/**
 * PublicExamCard
 *
 * A single exam tile: course monogram tile + status and question-type badges,
 * title, category subtitle and a three-up information strip (duration /
 * questions / difficulty).
 *
 * The WHOLE card is one link to the exam detail page — there are no action
 * buttons and no overflow menu, so every action lives on the detail page. It is
 * a real <a> (react-router <Link>) rather than an onClick div, so middle-click,
 * "open in new tab" and keyboard activation all work without extra handling.
 *
 * Hover lifts the card, tints the border with the brand blue and deepens the
 * shadow; :active settles it back and scales it a hair for a press feel;
 * :focus-visible draws a ring for keyboard users only.
 *
 * `mt-auto` on the strip keeps it bottom-anchored now that the action row is
 * gone, so the grid stays visually aligned whether or not a card has a score.
 */export function PublicExamCard({ exam }: { exam: PublicExam }) {
  const { user } = useAuth();
  const course = courseMeta(exam.course);
  const status = STATUS_META[exam.status];
  const type = EXAM_TYPE_META[exam.examType];
  const difficulty = DIFFICULTY_ACCENT[exam.difficulty];
  // Stay inside whichever role area the card was rendered from.
  const detailPath = publicExamPathFor(user?.role?.code, exam.id);

  return (
    <Link
      to={detailPath}
      className="group flex cursor-pointer flex-col gap-4 rounded-[14px] border border-line bg-surface p-5 shadow-sm outline-none transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-primary/40 active:translate-y-0 active:scale-[0.99]"
    >
      {/* Top row — course logo tile + status and exam-type badges */}
      <div className="flex items-start justify-between gap-3">
        <span
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[12px] text-[12px] font-bold tracking-tight transition-transform duration-200 group-hover:scale-105"
          style={{ background: `${course.accent}1A`, color: course.accent }}
          title={course.name}
        >
          {course.monogram}
        </span>
        <div className="flex items-center gap-2">
          <Badge variant={status.badge}>{status.label}</Badge>
          <Badge variant={type.badge}>{type.label}</Badge>
        </div>
      </div>

      {/* Title + subtitle */}
      <div>
        <h3 className="text-[15px] font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
          {exam.title}
        </h3>
        <p className="mt-1 text-[12.5px] text-muted-foreground">{examSubtitle(exam)}</p>
        {exam.score !== undefined && (
          <p className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium text-[#15803D] dark:text-[#4ADE80]">
            <Icon.CheckCircle className="h-3.5 w-3.5" />
            Scored {exam.score}%
          </p>
        )}
      </div>

      {/* Information row — mt-auto keeps the strip bottom-aligned across the grid */}
      <div className="mt-auto grid grid-cols-3 divide-x divide-line overflow-hidden rounded-[12px] border border-line bg-surface-alt">
        <InfoCell icon={<Icon.Clock />} label="Duration" value={`${exam.duration} min`} />
        <InfoCell icon={<Icon.ClipboardList />} label="Questions" value={String(exam.questions)} />
        <InfoCell icon={<Icon.Activity />} label="Difficulty" value={exam.difficulty} accent={difficulty} />
      </div>
    </Link>
  );
}
