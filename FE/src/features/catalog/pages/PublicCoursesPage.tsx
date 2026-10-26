import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Icon } from '@/assets/icons';
import { Container } from '@/features/landing/components/Container';
import { SearchInput } from '@/components/common/SearchInput';
import { EmptyState } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Pagination } from '@/components/ui/Pagination';
import { useDebounce } from '@/hooks';
import type { StudentSort } from '@/services/studentCourse.service';
import { CourseCatalogCard, CourseCatalogCardSkeleton } from '../components/CourseCatalogCard';
import { CourseFilterChips, type CategoryFilter } from '../components/CourseFilterChips';
import { useCatalogCourses, usePublicCategories } from '../hooks/usePublicCatalog';

const PAGE_SIZE = 12;

const SORT_OPTIONS: { label: string; value: StudentSort }[] = [
  { label: 'Newest', value: 'newest' },
  { label: 'Title (A–Z)', value: 'title' },
];

/**
 * PublicCoursesPage  (/courses)
 *
 * The full course catalog (CL-01), open to guests and signed-in users alike.
 * Every course search in the app lands here — the header search bar, the
 * landing page "Browse / View all courses" buttons and the student's My
 * Courses search — with `?q=…`, so the query lives in the URL and the page
 * stays shareable.
 */
export function PublicCoursesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get('q') ?? '';

  const [query, setQuery] = useState(urlQuery);
  const debouncedQuery = useDebounce(query, 300).trim();
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [sort, setSort] = useState<StudentSort>('newest');
  const [page, setPage] = useState(1);

  // Any new filter starts again from the first page — adjusted during render
  // so the stale page is never requested.
  const filterKey = `${debouncedQuery}|${category}|${sort}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const { categories } = usePublicCategories();
  const { data, loading, error, reload } = useCatalogCourses({
    keyword: debouncedQuery,
    categoryId: category === 'all' ? undefined : category,
    sort,
    page: page - 1,
    size: PAGE_SIZE,
  });

  // ?q= this page wrote itself — anything else (e.g. the header search bar
  // navigating here while the page is open) replaces the box's text.
  const ownQuery = useRef(urlQuery);
  useEffect(() => {
    if (urlQuery === ownQuery.current) return;
    ownQuery.current = urlQuery;
    setQuery(urlQuery);
  }, [urlQuery]);

  // Mirror the settled query back into ?q= so the URL stays in sync.
  useEffect(() => {
    if (debouncedQuery === urlQuery.trim()) return;
    ownQuery.current = debouncedQuery;
    const params = new URLSearchParams(searchParams);
    if (debouncedQuery) params.set('q', debouncedQuery);
    else params.delete('q');
    setSearchParams(params, { replace: true });
  }, [debouncedQuery]);

  const courses = data?.content ?? [];
  const total = data?.totalElements ?? 0;
  const searching = debouncedQuery.length > 0;

  return (
    <>
      <div className="border-b border-line-soft bg-surface-alt">
        <Container className="py-[clamp(2rem,4vw,3rem)]">
          <h1 className="text-[clamp(1.5rem,1.1rem+1.6vw,2rem)] font-bold tracking-tight text-content">
            Exam Preparation Courses
          </h1>
          <p className="mt-1.5 text-[clamp(0.9rem,0.85rem+0.2vw,1rem)] text-content-soft">
            Browse every published course — no account needed.
          </p>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <SearchInput
              className="w-full sm:w-80"
              placeholder="Search courses..."
              aria-label="Search courses"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Select
              aria-label="Sort courses"
              options={SORT_OPTIONS}
              value={sort}
              onChange={(v) => setSort(v as StudentSort)}
              className="w-full sm:w-44"
            />
            {!loading && !error && (
              <span className="text-sm text-content-subtle">
                {total} {total === 1 ? 'course' : 'courses'}
                {searching ? ` matching “${debouncedQuery}”` : ''}
              </span>
            )}
          </div>

          <div className="mt-5">
            <CourseFilterChips categories={categories} value={category} onChange={setCategory} />
          </div>
        </Container>
      </div>

      <Container className="py-[clamp(2rem,4vw,3rem)]">
        {loading ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-[clamp(1rem,2vw,1.25rem)]">
            {Array.from({ length: 6 }, (_, i) => (
              <CourseCatalogCardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            icon={<Icon.AlertCircle className="h-7 w-7" />}
            title="Could not load courses"
            message={error}
            action={
              <button
                type="button"
                onClick={reload}
                className="h-10 inline-flex items-center gap-1.5 rounded-[10px] border border-line px-4 text-sm font-semibold text-content-secondary hover:border-brand-line hover:text-brand-ink cursor-pointer"
              >
                <Icon.RefreshCw className="h-4 w-4" /> Retry
              </button>
            }
          />
        ) : courses.length > 0 ? (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-[clamp(1rem,2vw,1.25rem)]">
              {courses.map((course) => (
                <CourseCatalogCard key={course.courseId} course={course} />
              ))}
            </div>
            {total > PAGE_SIZE && (
              <div className="mt-6">
                <Pagination page={page} total={total} perPage={PAGE_SIZE} onChange={setPage} unit="courses" />
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon={<Icon.Search className="h-7 w-7" />}
            title="No courses found"
            message={searching ? `Nothing matches “${debouncedQuery}”. Try a different keyword.` : 'No courses in this category yet.'}
            action={
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setCategory('all');
                }}
                className="h-10 inline-flex items-center rounded-[10px] bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 cursor-pointer"
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
