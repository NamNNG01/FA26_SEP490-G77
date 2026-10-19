import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@/assets/icons';
import { Container } from '@/features/landing/components/Container';
import { Reveal } from '@/components/common/Reveal';
import { ROUTES } from '@/app/routes';
import { PUBLIC_COURSES } from '../data/publicCourses';
import { CourseCatalogCard } from '../components/CourseCatalogCard';
import { CourseFilterChips } from '../components/CourseFilterChips';
import type { CourseProviderId } from '../types';

/**
 * PopularCoursesSection
 *
 * The course-discovery block — used on the landing page (top 6 courses, with a
 * "View all courses" link) and on /courses (every course, no limit).
 *
 * Provider chips filter the grid only. There are no difficulty/rating/date
 * facets yet.
 */
export function PopularCoursesSection({
  limit,
  showChips = true,
  showViewAll = true,
}: {
  /** Cap the grid to the first N matches (landing page shows 6). */
  limit?: number;
  showChips?: boolean;
  showViewAll?: boolean;
}) {
  const navigate = useNavigate();
  const [category, setCategory] = useState<CourseProviderId | 'all'>('all');

  const matches = PUBLIC_COURSES.filter((course) => category === 'all' || course.providerId === category);
  const visible = limit ? matches.slice(0, limit) : matches;

  return (
    <section id="courses" className="scroll-mt-16 bg-surface">
      <Container className="py-[clamp(3rem,6vw,5rem)]">
        <Reveal className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-[min(38rem,100%)]">
            <h2 className="text-[clamp(1.5rem,1.1rem+1.6vw,1.875rem)] font-bold tracking-tight text-content">
              Popular Courses
            </h2>
            <p className="mt-[clamp(0.5rem,1vw,0.75rem)] text-[clamp(0.9rem,0.85rem+0.25vw,1rem)] text-content-soft">
              Browse exam preparation courses, check what each one covers, and start practising questions and mock
              exams.
            </p>
          </div>

          {showViewAll && (
            <button
              type="button"
              onClick={() => navigate(ROUTES.courses)}
              className="inline-flex h-10 flex-shrink-0 items-center gap-1.5 self-start rounded-[10px] border border-line px-4 text-sm font-semibold text-content-secondary transition-colors hover:border-brand-line hover:text-brand-ink cursor-pointer sm:self-auto"
            >
              View all courses
              <Icon.ChevronRight className="h-4 w-4" />
            </button>
          )}
        </Reveal>

        {showChips && (
          <Reveal delay={60} className="mt-[clamp(1.5rem,3vw,2rem)]">
            <CourseFilterChips value={category} onChange={setCategory} />
          </Reveal>
        )}

        {visible.length > 0 ? (
          <div className="mt-[clamp(1.5rem,3vw,2rem)] grid grid-cols-1 gap-[clamp(1rem,2vw,1.25rem)] sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((course, index) => (
              <Reveal key={course.slug} delay={index * 60}>
                <CourseCatalogCard course={course} />
              </Reveal>
            ))}
          </div>
        ) : (
          <p className="mt-[clamp(1.5rem,3vw,2rem)] rounded-[14px] border border-dashed border-line px-5 py-10 text-center text-base text-content-soft">
            No courses in this category yet.
          </p>
        )}
      </Container>
    </section>
  );
}