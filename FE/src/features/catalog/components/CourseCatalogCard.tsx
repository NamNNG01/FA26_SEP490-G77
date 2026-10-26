import React from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@/assets/icons';
import { Badge } from '@/components/ui/Badge';
import { coursePath } from '@/app/routes';
import type { StudentCourseCard } from '@/services/studentCourse.service';
import { CourseLogo, formatPrice } from './CourseLogo';

/**
 * CourseCatalogCard
 *
 * One course in the Popular Courses grid and on /courses (CL-01 row). Terse —
 * logo, title, category, manager, two scannable stats, then the price and a
 * single View Course action. Signed-in learners see an Enrolled badge.
 */
export function CourseCatalogCard({ course }: { course: StudentCourseCard }) {
  const navigate = useNavigate();
  const href = coursePath(course.courseId);
  const price = formatPrice(course.price);

  const stats = [
    { value: String(course.publishedExamCount ?? 0), label: course.publishedExamCount === 1 ? 'Exam' : 'Exams' },
    { value: String(course.deckCount ?? 0), label: course.deckCount === 1 ? 'Flashcard deck' : 'Flashcard decks' },
  ];

  return (
    <article className="card group flex h-full flex-col p-5 transition-all hover:-translate-y-0.5 hover:border-brand-line hover:shadow-lg">
      <div className="flex items-start gap-3">
        <CourseLogo title={course.title} thumbnailUrl={course.thumbnailUrl} size={40} />
        <div className="min-w-0 flex-1">
          <h3 className="text-lg leading-snug font-semibold text-content">
            <button type="button" onClick={() => navigate(href)} className="text-left cursor-pointer">
              {course.title}
            </button>
          </h3>
          <p className="mt-0.5 truncate text-xs text-content-subtle">{course.category?.name ?? 'Uncategorized'}</p>
        </div>
        {course.isEnrolled && <Badge variant="success">Enrolled</Badge>}
      </div>

      {course.manager && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-content-soft">
          <Icon.User className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="truncate">{course.manager.fullName}</span>
        </p>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-2">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-[10px] bg-surface-alt px-3 py-2">
            <dt className="text-2xs tracking-wide text-content-subtle uppercase">{stat.label}</dt>
            <dd className="mt-0.5 text-sm font-semibold text-content">{stat.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-auto pt-4">
        <div className="flex items-center justify-between gap-3 border-t border-line-soft pt-3">
          <span className={`text-sm font-semibold ${price === 'Free' ? 'text-success' : 'text-brand-ink'}`}>{price}</span>
          <button
            type="button"
            onClick={() => navigate(href)}
            className="inline-flex h-9 items-center gap-1 rounded-[10px] bg-brand-600 px-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 cursor-pointer"
          >
            View Course
            <Icon.ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </article>
  );
}

/** Card-shaped placeholder while CL-01 loads. */
export function CourseCatalogCardSkeleton() {
  return (
    <div className="card flex h-full flex-col gap-4 p-5" aria-hidden>
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 animate-pulse rounded-[10px] bg-surface-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-3/4 animate-pulse rounded bg-surface-muted" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-surface-muted" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="h-12 animate-pulse rounded-[10px] bg-surface-muted" />
        <div className="h-12 animate-pulse rounded-[10px] bg-surface-muted" />
      </div>
      <div className="h-9 animate-pulse rounded-[10px] bg-surface-muted" />
    </div>
  );
}
