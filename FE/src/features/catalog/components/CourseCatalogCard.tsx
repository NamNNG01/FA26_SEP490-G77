import React from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@/assets/icons';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { coursePath } from '@/app/routes';
import { ProviderLogo } from './ProviderLogo';
import type { CourseDifficulty, PublicCourse } from '../types';

/**
 * CourseCatalogCard
 *
 * One course in the Popular Courses grid and on /courses. Deliberately terse —
 * logo, name, provider, difficulty, a two-line hook and four scannable stats,
 * then the price/updated line and a single View Course action.
 */
export function CourseCatalogCard({ course }: { course: PublicCourse }) {
  const navigate = useNavigate();
  const href = coursePath(course.slug);

  const stats = [
    { value: course.questionCount.toLocaleString(), label: 'Questions' },
    { value: String(course.examCount), label: course.examCount === 1 ? 'Exam' : 'Exams' },
    { value: String(course.topicCount), label: course.topicCount === 1 ? 'Topic' : 'Topics' },
    { value: course.features[0] ?? 'Practice', label: 'Included' },
  ];

  return (
    <article className="card group flex h-full flex-col p-5 transition-all hover:-translate-y-0.5 hover:border-brand-line hover:shadow-lg">
      <div className="flex items-start gap-3">
        <ProviderLogo providerId={course.providerId} provider={course.provider} size={40} />
        <div className="min-w-0 flex-1">
          <h3 className="text-lg leading-snug font-semibold text-content">
            <button type="button" onClick={() => navigate(href)} className="text-left cursor-pointer">
              {course.name}
            </button>
          </h3>
          <p className="mt-0.5 truncate text-xs text-content-subtle">{course.provider}</p>
        </div>
        <Badge variant={difficultyVariant(course.difficulty)}>{course.difficulty}</Badge>
      </div>

      <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-content-soft">{course.tagline}</p>

      {/* Stats — 2×2 so each row stays readable at every card width */}
      <dl className="mt-4 grid grid-cols-2 gap-2">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-[10px] bg-surface-alt px-3 py-2">
            <dt className="text-2xs tracking-wide text-content-subtle uppercase">{stat.label}</dt>
            <dd className="mt-0.5 text-sm font-semibold text-content">{stat.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-auto pt-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-subtle">
          <span className="inline-flex items-center gap-1 font-medium text-content-secondary">
            <Icon.Star className="h-3.5 w-3.5 text-rating" />
            {course.rating.toFixed(1)}
            <span className="text-content-subtle">({course.ratingCount.toLocaleString()})</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Icon.Clock className="h-3.5 w-3.5" />
            Updated {course.updatedAt}
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-line-soft pt-3">
          <span
            className={`text-xs font-semibold ${
              course.priceLabel === 'Free' ? 'text-success' : 'text-brand-ink'
            }`}
          >
            {course.priceLabel}
          </span>
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

function difficultyVariant(difficulty: CourseDifficulty): BadgeVariant {
  switch (difficulty) {
    case 'Beginner':
      return 'success';
    case 'Intermediate':
      return 'warning';
    default:
      return 'danger';
  }
}