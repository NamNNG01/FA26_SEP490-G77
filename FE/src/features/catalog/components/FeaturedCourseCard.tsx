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
      <div className="rounded-[20px] bg-gradient-to-br from-[#0D7C6C]/20 via-[#0D7C6C]/5 to-transparent p-px dark:from-[#0D7C6C]/35 dark:via-transparent">
        <div className="card p-6 shadow-xl shadow-[#111827]/5">
          <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wider text-[#0D7C6C] uppercase dark:text-[#6FCBB6]">
            <Icon.Zap className="h-3.5 w-3.5" />
            Featured Course
          </div>

          <div className="mt-4 flex items-start gap-3.5">
            <ProviderLogo providerId={course.providerId} provider={course.provider} size={48} className="rounded-[12px]" />
            <div className="min-w-0 flex-1">
              <h3 className="text-[17px] leading-snug font-bold text-[#111827] dark:text-[#F9FAFB]">{course.name}</h3>
              <p className="mt-0.5 text-[13px] text-[#6B7280] dark:text-[#D1D5DB]">{course.provider}</p>
            </div>
          </div>

          <p className="mt-4 text-[13.5px] leading-relaxed text-[#6B7280] dark:text-[#D1D5DB]">{course.tagline}</p>

          <div className="mt-5 grid grid-cols-3 gap-2">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-[10px] bg-[#F9FAFB] px-2 py-2.5 text-center dark:bg-[#0B1220]">
                <p className="text-[15px] leading-none font-bold text-[#111827] dark:text-[#F9FAFB]">{stat.value}</p>
                <p className="mt-1 text-[10.5px] tracking-wide text-[#9CA3AF] uppercase">{stat.label}</p>
              </div>
            ))}
          </div>

          <ul className="mt-5 flex flex-wrap gap-2">
            {course.features.map((feature) => (
              <li
                key={feature}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#ECF7F4] px-2.5 py-1 text-[12px] font-medium text-[#0D7C6C] dark:bg-[#0D7C6C]/15 dark:text-[#6FCBB6]"
              >
                <Icon.Check className="h-3 w-3" />
                {feature}
              </li>
            ))}
          </ul>

          <div className="mt-5 flex items-center justify-between gap-3 border-t border-[#F3F4F6] pt-4 dark:border-[#1F2937]">
            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-[#9CA3AF]">
              <Icon.RefreshCw className="h-3.5 w-3.5" />
              Updated recently
            </span>
            <button
              type="button"
              onClick={() => navigate(coursePath(course.slug))}
              className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-[#0D7C6C] px-4 text-[14px] font-semibold text-white shadow-sm shadow-[#0D7C6C]/25 transition-colors hover:bg-[#0A6458] cursor-pointer"
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