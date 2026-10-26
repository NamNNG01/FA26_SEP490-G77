import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@/assets/icons';
import { Container } from '@/features/landing/components/Container';
import { studentCourseService, type StudentCourseItem, type StudentCoursePage } from '@/services/studentCourse.service';
import { useDebounce } from '@/hooks';

const PAGE_SIZE = 9;

export function StudentCourseCatalog() {
  const navigate = useNavigate();
  const [page, setPage] = useState<StudentCoursePage | null>(null);
  const [keyword, setKeyword] = useState('');
  const debouncedKeyword = useDebounce(keyword, 250);
  const [sort, setSort] = useState<'newest' | 'title'>('newest');
  const [pageIndex, setPageIndex] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    studentCourseService.getCourses({
      page: pageIndex,
      size: PAGE_SIZE,
      keyword: debouncedKeyword,
      sort,
    }).then((result) => {
      if (active) setPage(result);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'We couldn’t load courses right now.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [pageIndex, debouncedKeyword, sort, refresh]);

  function resetFilters() {
    setKeyword('');
    setSort('newest');
    setPageIndex(0);
  }

  return (
    <>
      <section className="overflow-hidden border-b border-line-soft bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-primary-light via-surface-alt to-surface-alt">
        <Container className="py-8 sm:py-10">
          <p className="text-sm font-semibold text-brand-ink">Find your next learning path</p>
          <h1 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight text-content sm:text-4xl">Learn at your own pace</h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-content-soft">Explore courses, build your knowledge, and get ready for the exams that matter to you.</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative block w-full sm:max-w-md">
              <Icon.Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-content-subtle" />
              <input value={keyword} onChange={(event) => { setKeyword(event.target.value.slice(0, 100)); setPageIndex(0); }} placeholder="Search courses" aria-label="Search courses" className="h-12 w-full rounded-xl border border-line bg-surface pl-10 pr-4 text-sm text-content outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100" />
            </label>
            <label className="sr-only" htmlFor="course-sort">Sort courses</label>
            <select id="course-sort" value={sort} onChange={(event) => { setSort(event.target.value as 'newest' | 'title'); setPageIndex(0); }} className="h-12 rounded-xl border border-line bg-surface px-4 text-sm text-content outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100">
              <option value="newest">Recently added</option>
              <option value="title">Course name</option>
            </select>
          </div>
        </Container>
      </section>

      <Container className="py-5 sm:py-7">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-content">Explore courses</h2>
            {!loading && page && <p className="mt-1 text-sm text-content-subtle">{page.totalElements} courses to explore</p>}
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="card h-64 animate-pulse bg-surface-alt" />)}</div>
        ) : error ? (
          <div className="card mx-auto max-w-lg p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-danger-light text-danger"><Icon.AlertCircle className="h-6 w-6" /></div>
            <h2 className="mt-4 text-lg font-semibold text-content">Courses didn’t load</h2>
            <p className="mt-2 text-sm text-content-soft">{error}</p>
            <button type="button" onClick={() => setRefresh((value) => value + 1)} className="mt-5 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">Try again</button>
          </div>
        ) : page?.content.length ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {page.content.map((course) => <CatalogCourseCard key={course.courseId} course={course} onOpen={() => navigate(`/courses/${course.courseId}`)} />)}
            </div>
            {page.totalPages > 1 && <div className="mt-8 flex items-center justify-center gap-3">
              <button type="button" disabled={page.first} onClick={() => setPageIndex((value) => Math.max(0, value - 1))} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-content-secondary disabled:opacity-40">Previous</button>
              <span className="text-sm text-content-subtle">Page {page.page + 1} of {page.totalPages}</span>
              <button type="button" disabled={page.last} onClick={() => setPageIndex((value) => value + 1)} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-content-secondary disabled:opacity-40">Next</button>
            </div>}
          </>
        ) : (
          <div className="card px-6 py-14 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-light text-brand-ink"><Icon.Book className="h-7 w-7" /></div>
            <h2 className="mt-4 text-lg font-semibold text-content">No courses found</h2>
            <p className="mt-2 text-sm text-content-soft">Try another search, or clear your filters to see all courses.</p>
            <button type="button" onClick={resetFilters} className="mt-5 rounded-lg px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-primary-light">Clear filters</button>
          </div>
        )}
      </Container>
    </>
  );
}

function CatalogCourseCard({ course, onOpen }: { course: StudentCourseItem; onOpen: () => void }) {
  const price = course.price === null ? 'Price unavailable' : course.price === 0 ? 'Free' : new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(course.price);
  return (
    <article className="group flex min-h-64 flex-col overflow-hidden rounded-2xl border border-line-soft bg-surface shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative h-36 overflow-hidden bg-gradient-to-br from-brand-100 via-primary-light to-surface-alt">
        {course.thumbnailUrl ? <img src={course.thumbnailUrl} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" /> : <div className="flex h-full items-center justify-center"><span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface/80 text-brand-ink shadow-sm"><Icon.Book className="h-8 w-8" /></span></div>}
        {course.isEnrolled && <span className="absolute left-3 top-3 rounded-full bg-surface px-3 py-1 text-xs font-semibold text-success shadow-sm">You’re learning this</span>}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-2 text-xs text-content-subtle"><span>{course.category?.name ?? 'Course'}</span><span aria-hidden="true">·</span><span>{course.publishedExamCount} {course.publishedExamCount === 1 ? 'exam' : 'exams'}</span></div>
        <h3 className="mt-2 text-lg font-semibold leading-snug text-content">{course.title}</h3>
        <p className="mt-1 text-sm text-content-soft">{course.manager?.fullName ? `Created by ${course.manager.fullName}` : 'Build a little more knowledge every day.'}</p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-5">
          <span className={`text-sm font-semibold ${course.price === 0 ? 'text-success' : 'text-content'}`}>{price}</span>
          <button type="button" onClick={onOpen} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700">Explore course<Icon.ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
    </article>
  );
}
