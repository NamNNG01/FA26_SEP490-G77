import React from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@/assets/icons';
import { coursePath } from '@/app/routes';
import { featuredCourse } from '../data/publicCourses';
import { ProviderLogo } from './ProviderLogo';

/**
 * FeaturedCourseCard
 *
 * The hero's right-hand column: a single showcase course card. It replaces the
 * old interactive question preview so the landing page opens on course
 * discovery rather than an exam question.
 */
export function FeaturedCourseCard() {
  const navigate = useNavigate();
  const course = featuredCourse;

  const stats = [
    { value: course.questionCount.toLocaleString(), label: 'Questions' },
    { value: String(course.examCount), label: 'Mock Exams' },
    { value: String(course.topicCount), label: 'Topics' },
  ];

  return (
    <div className="w-full max-w-[440px] min-w-0">
      {/* Wrapper carries the glow so the card itself keeps a clean 1px border */}
      <div className="rounded-[20px] bg-gradient-to-br from-brand-600/20 via-brand-600/5 to-transparent p-px dark:from-brand-600/35 dark:via-transparent">
        <div className="card p-6 shadow-xl shadow-gray-900/5">
          <div className="flex items-center gap-2 text-2xs font-semibold tracking-wider text-brand-ink uppercase">
            <Icon.Zap className="h-3.5 w-3.5" />
            Featured Course
          </div>

          <div className="mt-4 flex items-start gap-3.5">
            <ProviderLogo providerId={course.providerId} provider={course.provider} size={48} className="rounded-[12px]" />
            <div className="min-w-0 flex-1">
              <h3 className="text-lg leading-snug font-bold text-content">{course.name}</h3>
              <p className="mt-0.5 text-sm text-content-soft">{course.provider}</p>
            </div>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-content-soft">{course.tagline}</p>

          <div className="mt-5 grid grid-cols-3 gap-2">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-[10px] bg-surface-alt px-2 py-2.5 text-center">
                <p className="text-lg leading-none font-bold text-content">{stat.value}</p>
                <p className="mt-1 text-2xs tracking-wide text-content-subtle uppercase">{stat.label}</p>
              </div>
            ))}
          </div>

          <ul className="mt-5 flex flex-wrap gap-2">
            {course.features.map((feature) => (
              <li
                key={feature}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary-light px-2.5 py-1 text-xs font-medium text-brand-ink"
              >
                <Icon.Check className="h-3 w-3" />
                {feature}
              </li>
            ))}
          </ul>

          <div className="mt-5 flex items-center justify-between gap-3 border-t border-line-soft pt-4">
            <span className="inline-flex items-center gap-1.5 text-xs text-content-subtle">
              <Icon.RefreshCw className="h-3.5 w-3.5" />
              Updated recently
            </span>
            <button
              type="button"
              onClick={() => navigate(coursePath(course.slug))}
              className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-brand-600 px-4 text-base font-semibold text-white shadow-sm shadow-brand-600/25 transition-colors hover:bg-brand-700 cursor-pointer"
            >
              View Course
              <Icon.ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}