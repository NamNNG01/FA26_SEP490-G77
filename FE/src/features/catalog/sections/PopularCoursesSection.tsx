import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@/assets/icons';
import { Container } from '@/features/landing/components/Container';
import { Reveal } from '@/components/common/Reveal';
import { ROUTES } from '@/app/routes';
import { CourseCatalogCard, CourseCatalogCardSkeleton } from '../components/CourseCatalogCard';
import { CourseFilterChips, type CategoryFilter } from '../components/CourseFilterChips';
import { useCatalogCourses, usePublicCategories } from '../hooks/usePublicCatalog';

/**
 * PopularCoursesSection
 *
 * The course-discovery block on the landing page — the newest published
 * courses (CL-01) with category chips and a "View all courses" link to /courses.
 */
export function PopularCoursesSection({
  limit = 6,
  showChips = true,
  showViewAll = true,
}: {
  /** How many courses the grid shows (landing page shows 6). */
  limit?: number;
  showChips?: boolean;
  showViewAll?: boolean;
}) {
  const navigate = useNavigate();
  const [category, setCategory] = useState<CategoryFilter>('all');
  const { categories } = usePublicCategories();
  const { data, loading, error, reload } = useCatalogCourses({
    categoryId: category === 'all' ? undefined : category,
    sort: 'newest',
    size: limit,
  });

  const courses = data?.content ?? [];

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
            <CourseFilterChips categories={categories} value={category} onChange={setCategory} />
          </Reveal>
        )}

        {loading ? (
          <div className="mt-[clamp(1.5rem,3vw,2rem)] grid grid-cols-1 gap-[clamp(1rem,2vw,1.25rem)] sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: Math.min(limit, 6) }, (_, i) => (
              <CourseCatalogCardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="mt-[clamp(1.5rem,3vw,2rem)] rounded-[14px] border border-dashed border-line px-5 py-10 text-center">
            <p className="text-base text-content-soft">{error}</p>
            <button
              type="button"
              onClick={reload}
              className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-line px-3.5 text-sm font-semibold text-content-secondary hover:border-brand-line hover:text-brand-ink cursor-pointer"
            >
              <Icon.RefreshCw className="h-4 w-4" /> Retry
            </button>
          </div>
        ) : courses.length > 0 ? (
          <div className="mt-[clamp(1.5rem,3vw,2rem)] grid grid-cols-1 gap-[clamp(1rem,2vw,1.25rem)] sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course, index) => (
              <Reveal key={course.courseId} delay={index * 60}>
                <CourseCatalogCard course={course} />
              </Reveal>
            ))}
          </div>
        ) : (
          <p className="mt-[clamp(1.5rem,3vw,2rem)] rounded-[14px] border border-dashed border-line px-5 py-10 text-center text-base text-content-soft">
            {category === 'all' ? 'No courses published yet.' : 'No courses in this category yet.'}
          </p>
        )}
      </Container>
    </section>
  );
}
