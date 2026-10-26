import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Card';
import { SearchInput } from '@/components/common/SearchInput';
import { Icon } from '@/assets/icons';
import { ROUTES, studentCoursePath, studentDeckPath } from '@/app/routes';
import { getApiErrorMessage } from '@/utils/apiError';
import { studentCourseService, type MyCourse, type StudentDeck } from '@/services/studentCourse.service';
import { CardGridSkeleton, LoadError, PageTitle, STUDENT_PAGE_CLASS } from '../components/studentUi';
import { DeckCard, type DeckStudyState } from '../components/DeckCard';

interface CourseDecks {
  course: MyCourse;
  decks: StudentDeck[];
  /** MC-03 failed for this course; the others still render. */
  error: string | null;
}

/** MC-01 has no "all" size, so walk its pages. */
async function loadActiveCourses(): Promise<MyCourse[]> {
  const courses: MyCourse[] = [];
  for (let page = 0; ; page++) {
    const res = await studentCourseService.getMyCourses({ status: 'ACTIVE', page, size: 100 });
    courses.push(...res.content);
    if (res.last || res.content.length === 0) return courses;
  }
}

/**
 * Flashcards — the decks of every course the student is actively enrolled in,
 * grouped by course. There is no "all my decks" endpoint, so this is MC-01
 * (ACTIVE) followed by one MC-03 per course that has decks.
 */
export function StudentFlashcardsPage() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<CourseDecks[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const courses = (await loadActiveCourses()).filter(c => c.deckCount > 0);
        const results = await Promise.allSettled(courses.map(c => studentCourseService.getCourseDecks(c.courseId)));
        if (cancelled) return;
        setGroups(
          courses.map((course, i) => {
            const r = results[i];
            return r.status === 'fulfilled'
              ? { course, decks: r.value, error: null }
              : { course, decks: [], error: getApiErrorMessage(r.reason, 'Failed to load decks.') };
          }),
        );
      } catch (err) {
        if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load your flashcards.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map(g =>
        g.course.title.toLowerCase().includes(q)
          ? g
          : { ...g, decks: g.decks.filter(d => d.title.toLowerCase().includes(q)), error: null },
      )
      .filter(g => g.decks.length > 0 || g.error);
  }, [groups, search]);

  const openDeck = (course: MyCourse, deck: StudentDeck) =>
    navigate(studentDeckPath(deck.deckId), {
      state: { deckTitle: deck.title, courseId: course.courseId, courseTitle: course.title } satisfies DeckStudyState,
    });

  return (
    <div className={`${STUDENT_PAGE_CLASS} space-y-[clamp(1.25rem,2.5vw,1.75rem)]`}>
      <PageTitle title="Flashcards" subtitle="Study the flashcard decks of your active courses." />

      {!loading && !error && groups.length > 0 && (
        <SearchInput
          placeholder="Search decks or courses…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-md"
        />
      )}

      {loading ? (
        <CardGridSkeleton />
      ) : error ? (
        <LoadError message={error} onRetry={() => setReload(r => r + 1)} />
      ) : groups.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Icon.Layers className="w-7 h-7" />}
            title="No flashcards yet"
            message="None of your active courses has a flashcard deck."
            action={<Button onClick={() => navigate(ROUTES.studentCourses)}>Go to My Courses</Button>}
          />
        </div>
      ) : visible.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Icon.Search className="w-7 h-7" />} title="No matching decks" message="Try a different keyword." />
        </div>
      ) : (
        visible.map(({ course, decks, error: groupError }) => (
          <section key={course.courseId} className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-content">{course.title}</h2>
              <button
                type="button"
                onClick={() => navigate(studentCoursePath(course.courseId))}
                className="text-xs font-medium text-primary hover:underline flex-shrink-0"
              >
                View course
              </button>
            </div>
            {groupError ? (
              <p className="card px-4 py-3 text-sm text-content-soft">{groupError}</p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-[clamp(1rem,2vw,1.25rem)]">
                {decks.map(deck => (
                  <DeckCard key={deck.deckId} deck={deck} onOpen={() => openDeck(course, deck)} />
                ))}
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
}
