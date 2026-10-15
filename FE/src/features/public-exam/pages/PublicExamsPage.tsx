import React, { useMemo, useState } from 'react';
import { Icon } from '@/assets/icons';
import { Select } from '@/components/ui/Select';
import { Tabs } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Pagination, usePagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/common/SearchInput';
import { PublicExamCard } from '../components/PublicExamCard';
import { PublicStatCard } from '../components/PublicStatCard';
import {
  PER_PAGE,
  PUBLIC_EXAM_CATEGORIES,
  PUBLIC_EXAM_COURSES,
  PUBLIC_EXAMS,
  SCORE_TREND,
} from '../mockPublicExams';

/**
 * PublicExamsPage
 *
 * The student's public exam catalogue: headline statistics, one search box, three
 * filters, category tabs and a 3-column exam grid.
 *
 * Filtering is entirely client-side over PUBLIC_EXAMS, and every facet is a
 * plain equality test against one field — no branching per filter. Paging is
 * delegated to the shared `usePagination`, which resets to page 1 whenever the
 * joined filter state (`resetKey`) changes and clamps the page when a filtered
 * result set shrinks.
 */

/** Sentinel tab/category meaning "do not filter by category". */
const ALL_CATEGORY = 'All Exams';
const ALL = 'all';

const CATEGORY_TABS = [ALL_CATEGORY, ...PUBLIC_EXAM_CATEGORIES];

const COURSE_OPTIONS = [
  { label: 'All Courses', value: ALL },
  // Some course names are long certifications — show the short label, match on the full name.
  ...PUBLIC_EXAM_COURSES.map(c => ({ label: c.shortName ?? c.name, value: c.name })),
];

const DIFFICULTY_OPTIONS = [
  { label: 'All', value: ALL },
  { label: 'Easy', value: 'Easy' },
  { label: 'Medium', value: 'Medium' },
  { label: 'Hard', value: 'Hard' },
];

const STATUS_OPTIONS = [
  { label: 'All', value: ALL },
  { label: 'Not Started', value: 'available' },
  { label: 'In Progress', value: 'in-progress' },
  { label: 'Completed', value: 'completed' },
];

/**
 * Headline metrics, derived from the fixture rather than hard-coded.
 * "Available Exams" counts everything not yet completed — untouched plus
 * in-progress, i.e. everything still ready to start.
 */
function usePublicExamStats() {
  return useMemo(() => {
    const completed = PUBLIC_EXAMS.filter(exam => exam.status === 'completed');
    const averageScore = completed.length
      ? Math.round(completed.reduce((sum, exam) => sum + (exam.score ?? 0), 0) / completed.length)
      : 0;

    return [
      {
        title: 'Total Exams',
        value: String(PUBLIC_EXAMS.length),
        description: 'Available practice exams',
        icon: <Icon.Layers className="h-5 w-5" />,
        accent: '#2563EB',
      },
      {
        title: 'Completed Exams',
        value: String(completed.length),
        description: 'Completed by you',
        icon: <Icon.CheckCircle className="h-5 w-5" />,
        accent: '#16A34A',
      },
      {
        title: 'Average Score',
        value: `${averageScore}%`,
        description: 'compared to last month',
        icon: <Icon.Award className="h-5 w-5" />,
        accent: '#D97706',
        trend: SCORE_TREND,
      },
      {
        title: 'Available Exams',
        value: String(PUBLIC_EXAMS.length - completed.length),
        description: 'Ready to start',
        icon: <Icon.Zap className="h-5 w-5" />,
        accent: '#7C3AED',
      },
    ];
  }, []);
}

export function PublicExamsPage() {
  const [query, setQuery] = useState('');
  const [course, setCourse] = useState(ALL);
  const [difficulty, setDifficulty] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [category, setCategory] = useState(ALL_CATEGORY);

  const stats = usePublicExamStats();

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return PUBLIC_EXAMS.filter(
      exam =>
        (category === ALL_CATEGORY || exam.category === category) &&
        (course === ALL || exam.course === course) &&
        (difficulty === ALL || exam.difficulty === difficulty) &&
        (status === ALL || exam.status === status) &&
        (needle === '' || exam.title.toLowerCase().includes(needle)),
    );
  }, [query, course, difficulty, status, category]);

  const { page, total, pageItems, setPage } = usePagination(filtered, {
    perPage: PER_PAGE,
    resetKey: [query, course, difficulty, status, category].join('|'),
  });

  const filtersActive =
    query !== '' || course !== ALL || difficulty !== ALL || status !== ALL || category !== ALL_CATEGORY;

  const resetFilters = () => {
    setQuery('');
    setCourse(ALL);
    setDifficulty(ALL);
    setStatus(ALL);
    setCategory(ALL_CATEGORY);
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-8">
      {/* Page header */}
      <header>
        <h1 className="text-[26px] font-bold tracking-tight text-foreground">Public Exam</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
          Practice with real exam-style questions to improve your skills and track your learning progress.
        </p>
      </header>

      {/* Statistics — auto-fit so the row reflows instead of squashing */}
      <section aria-label="Public exam statistics" className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(stat => (
          <PublicStatCard key={stat.title} {...stat} />
        ))}
      </section>

      {/* Search + filters */}
      <section
        aria-label="Search and filter exams"
        className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface p-4 shadow-sm lg:flex-row lg:items-center"
      >
        <SearchInput
          className="w-full lg:max-w-sm"
          type="search"
          aria-label="Search exams by title"
          placeholder="Search exams by title..."
          value={query}
          onChange={event => setQuery(event.target.value)}
        />

        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
          <Select aria-label="Filter by course" value={course} onChange={setCourse} options={COURSE_OPTIONS} />
          <Select
            aria-label="Filter by difficulty"
            value={difficulty}
            onChange={setDifficulty}
            options={DIFFICULTY_OPTIONS}
          />
          <Select aria-label="Filter by status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        </div>

        {filtersActive && (
          <Button variant="ghost" icon={<Icon.X className="h-4 w-4" />} onClick={resetFilters}>
            Reset
          </Button>
        )}
      </section>

      {/* Category tabs + result count */}
      <section className="flex flex-wrap items-center justify-between gap-4">
        <Tabs tabs={CATEGORY_TABS} active={category} onChange={setCategory} variant="solid" />
        <p className="text-[13px] text-muted-foreground">
          Showing <span className="font-semibold text-foreground">{filtered.length}</span> of{' '}
          {PUBLIC_EXAMS.length} exams
        </p>
      </section>

      {/* Exam grid */}
      {total === 0 ? (
        <div className="rounded-[14px] border border-line bg-surface shadow-sm">
          <EmptyState
            icon={<Icon.Search className="h-7 w-7" />}
            title="No exams match your filters"
            message="Try a different search term, or widen the course, difficulty and status filters."
            action={
              <Button variant="outline" icon={<Icon.RefreshCw className="h-4 w-4" />} onClick={resetFilters}>
                Clear all filters
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <section aria-label="Public exams" className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {pageItems.map(exam => (
              <PublicExamCard key={exam.id} exam={exam} />
            ))}
          </section>

          {/* Pagination */}
          <section className="rounded-[14px] border border-line bg-surface shadow-sm">
            <Pagination page={page} total={total} perPage={PER_PAGE} onChange={setPage} unit="exams" />
          </section>
        </>
      )}
    </div>
  );
}
