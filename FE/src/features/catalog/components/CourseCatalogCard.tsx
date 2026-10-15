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
    <article className="card group flex h-full flex-col p-5 transition-all hover:-translate-y-0.5 hover:border-[#BFDBFE] hover:shadow-lg dark:hover:border-[#1E3A5F]">
      <div className="flex items-start gap-3">
        <ProviderLogo providerId={course.providerId} provider={course.provider} size={40} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] leading-snug font-semibold text-[#111827] dark:text-[#F9FAFB]">
            <button type="button" onClick={() => navigate(href)} className="text-left cursor-pointer">
              {course.name}
            </button>
          </h3>
          <p className="mt-0.5 truncate text-[12.5px] text-[#9CA3AF]">{course.provider}</p>
        </div>
        <Badge variant={difficultyVariant(course.difficulty)}>{course.difficulty}</Badge>
      </div>

      <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-[#6B7280] dark:text-[#D1D5DB]">{course.tagline}</p>

      {/* Stats — 2×2 so each row stays readable at every card width */}
      <dl className="mt-4 grid grid-cols-2 gap-2">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-[10px] bg-[#F9FAFB] px-3 py-2 dark:bg-[#0B1220]">
            <dt className="text-[10.5px] tracking-wide text-[#9CA3AF] uppercase">{stat.label}</dt>
            <dd className="mt-0.5 text-[13.5px] font-semibold text-[#111827] dark:text-[#F9FAFB]">{stat.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-auto pt-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#9CA3AF]">
          <span className="inline-flex items-center gap-1 font-medium text-[#374151] dark:text-[#D1D5DB]">
            <Icon.Star className="h-3.5 w-3.5 text-[#F59E0B]" />
            {course.rating.toFixed(1)}
            <span className="text-[#9CA3AF]">({course.ratingCount.toLocaleString()})</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Icon.Clock className="h-3.5 w-3.5" />
            Updated {course.updatedAt}
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#F3F4F6] pt-3 dark:border-[#1F2937]">
          <span
            className={`text-[12.5px] font-semibold ${
              course.priceLabel === 'Free' ? 'text-[#16A34A]' : 'text-[#2563EB]'
            }`}
          >
            {course.priceLabel}
          </span>
          <button
            type="button"
            onClick={() => navigate(href)}
            className="inline-flex h-9 items-center gap-1 rounded-[10px] bg-[#2563EB] px-3.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-[#1D4ED8] cursor-pointer"
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