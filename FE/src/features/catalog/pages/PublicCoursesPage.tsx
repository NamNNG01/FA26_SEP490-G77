import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Icon } from '@/assets/icons';
import { Container } from '@/features/landing/components/Container';
import { SearchInput } from '@/components/common/SearchInput';
import { EmptyState } from '@/components/ui/Card';
import { useCourseSearch } from '../hooks/useCourseSearch';
import { PUBLIC_COURSES } from '../data/publicCourses';
import { CourseCatalogCard } from '../components/CourseCatalogCard';
import { CourseFilterChips } from '../components/CourseFilterChips';
import type { CourseProviderId } from '../types';

/**
 * PublicCoursesPage  (/courses)
 *
 * Guest-accessible catalog. The header search bar falls through here with
 * `?q=…`, which is why the query lives in the URL — it keeps the page
 * shareable and makes the header's Enter key useful.
 *
 * Course-only search (name / provider / description) plus a provider chip
 * filter. No auth required.
 */
export function PublicCoursesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [category, setCategory] = useState<CourseProviderId | 'all'>('all');

  const { query, setQuery, debouncedQuery, results } = useCourseSearch(searchParams.get('q') ?? '');

  // Mirror the debounced query back into ?q= so the URL stays in sync.
  useEffect(() => {
    const next = debouncedQuery.trim();
    if (next === (searchParams.get('q') ?? '')) return;
    const params = new URLSearchParams(searchParams);
    if (next) params.set('q', next);
    else params.delete('q');
    setSearchParams(params, { replace: true });
  }, [debouncedQuery, searchParams, setSearchParams]);

  const searching = debouncedQuery.trim().length > 0;
  const searched = searching ? results : PUBLIC_COURSES;
  const matches = searched.filter((course) => category === 'all' || course.providerId === category);

  return (
    <>
      <div className="border-b border-[#F3F4F6] bg-[#F9FAFB] dark:border-[#1F2937] dark:bg-[#0B1220]">
        <Container className="py-[clamp(2rem,4vw,3rem)]">
          <h1 className="text-[clamp(1.5rem,1.1rem+1.6vw,2rem)] font-bold tracking-tight text-[#111827] dark:text-[#F9FAFB]">
            Exam Preparation Courses
          </h1>
          <p className="mt-1.5 text-[clamp(0.9rem,0.85rem+0.2vw,1rem)] text-[#6B7280] dark:text-[#D1D5DB]">
            {PUBLIC_COURSES.length} courses across AWS, Microsoft, Google Cloud, CompTIA and Cisco. Browse freely — no
            account needed.
          </p>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <SearchInput
              className="w-full sm:w-80"
              placeholder="Search courses..."
              aria-label="Search courses"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <span className="text-[13px] text-[#9CA3AF]">
              {matches.length} {matches.length === 1 ? 'course' : 'courses'}
              {searching ? ` matching “${debouncedQuery.trim()}”` : ''}
            </span>
          </div>

          <div className="mt-5">
            <CourseFilterChips value={category} onChange={setCategory} />
          </div>
        </Container>
      </div>

      <Container className="py-[clamp(2rem,4vw,3rem)]">
        {matches.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-[clamp(1rem,2vw,1.25rem)]">
            {matches.map((course) => (
              <CourseCatalogCard key={course.slug} course={course} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Icon.Search className="h-7 w-7" />}
            title="No courses found"
            message={
              searching
                ? `Nothing matches “${debouncedQuery.trim()}”. Try a provider like AWS, Microsoft or CompTIA.`
                : 'No courses in this category yet.'
            }
            action={
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setCategory('all');
                }}
                className="h-10 inline-flex items-center rounded-[10px] bg-[#2563EB] px-4 text-[13.5px] font-semibold text-white shadow-sm transition-colors hover:bg-[#1D4ED8] cursor-pointer"
              >
                Clear filters
              </button>
            }
          />
        )}
      </Container>
    </>
  );
}