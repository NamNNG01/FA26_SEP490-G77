import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import { Select } from '@/components/ui/Select';
import { SearchInput } from '@/components/common/SearchInput';
import { Icon } from '@/assets/icons';
import { ROUTES, studentCoursePath, studentDeckPath } from '@/app/routes';
import { getApiErrorMessage } from '@/utils/apiError';
import { studentCourseService, type MyCourse } from '@/services/studentCourse.service';
import {
  DECK_MODES,
  DECK_MODE_LABEL,
  deckViewFromListItem,
  isEndpointMissing,
  studentDeckService,
  type DeckListItem,
  type DeckMode,
  type StudentDeckView,
} from '@/services/studentDeck.service';
import { CardGridSkeleton, LoadError, PageTitle, STUDENT_PAGE_CLASS } from '../components/studentUi';
import type { DeckStudyState } from '../components/DeckCard';
import { FlashDeckCard } from '../components/flashcards/FlashDeckCard';
import { DeckFormModal } from '../components/flashcards/DeckFormModal';

const TAB_MINE = 'My decks';
const TAB_COURSE = 'Course decks';
const MINE_PAGE_SIZE = 24;
const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-[clamp(1rem,2vw,1.25rem)]';

const toDeckView = deckViewFromListItem;

/**
 * Flashcards — two tabs:
 * - My decks: the student's own decks (FC-13 scope=MINE), create / open to manage.
 * - Course decks: decks of the active courses plus other students' public decks
 *   (FC-13 scope=COURSE), grouped by course. Study only.
 */
export function StudentFlashcardsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'mine' ? TAB_MINE : TAB_COURSE;

  return (
    <div className={`${STUDENT_PAGE_CLASS} space-y-[clamp(1.25rem,2.5vw,1.75rem)]`}>
      <PageTitle title="Flashcards" subtitle="Your own decks and the decks of the courses you study." />
      <Tabs
        variant="underline"
        tabs={[TAB_MINE, TAB_COURSE]}
        active={tab}
        onChange={t => setParams(t === TAB_MINE ? { tab: 'mine' } : { tab: 'course' }, { replace: true })}
      />
      {tab === TAB_MINE ? <MyDecksTab /> : <CourseDecksTab />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────── My decks

function MyDecksTab() {
  const navigate = useNavigate();
  const [decks, setDecks] = useState<DeckListItem[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [reload, setReload] = useState(0);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<DeckMode | ''>('');
  const [creating, setCreating] = useState(false);

  // Debounce the search box before asking the server.
  useEffect(() => {
    const t = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    studentDeckService
      .listDecks({ scope: 'MINE', search: query || undefined, mode: mode || undefined, page: 0, size: MINE_PAGE_SIZE })
      .then(res => {
        if (cancelled) return;
        setDecks(res.content);
        setPage(0);
        setHasMore(!res.last);
        setMissing(false);
      })
      .catch(err => {
        if (cancelled) return;
        if (isEndpointMissing(err)) setMissing(true);
        else setError(getApiErrorMessage(err, 'Failed to load your decks.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, mode, reload]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await studentDeckService.listDecks({
        scope: 'MINE',
        search: query || undefined,
        mode: mode || undefined,
        page: page + 1,
        size: MINE_PAGE_SIZE,
      });
      setDecks(d => [...d, ...res.content.filter(x => !d.some(y => y.deckId === x.deckId))]);
      setPage(p => p + 1);
      setHasMore(!res.last);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to load more decks.'));
    } finally {
      setLoadingMore(false);
    }
  };

  const open = (deck: StudentDeckView) =>
    navigate(studentDeckPath(deck.deckId), {
      state: { deckTitle: deck.title, courseId: deck.courseId ?? undefined, courseTitle: deck.courseTitle ?? undefined, deck, tab: 'mine' } satisfies DeckStudyState,
    });

  const filtered = query !== '' || mode !== '';
  const newDeck = (
    <Button icon={<Icon.Plus className="w-4 h-4" />} onClick={() => setCreating(true)}>
      New deck
    </Button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          <SearchInput placeholder="Search my decks…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm w-full" />
          <Select
            aria-label="Card type"
            className="w-44"
            options={[{ value: '', label: 'All card types' }, ...DECK_MODES.map(m => ({ value: m, label: DECK_MODE_LABEL[m] }))]}
            value={mode}
            onChange={v => setMode(v as DeckMode | '')}
          />
        </div>
        {newDeck}
      </div>

      {loading ? (
        <CardGridSkeleton />
      ) : missing ? (
        <div className="card">
          <EmptyState
            icon={<Icon.Info className="w-7 h-7" />}
            title="Your deck list isn't available yet"
            message="The server can't list your decks yet. You can still create a deck — it opens right after."
            action={newDeck}
          />
        </div>
      ) : error ? (
        <LoadError message={error} onRetry={() => setReload(r => r + 1)} />
      ) : decks.length === 0 ? (
        <div className="card">
          {filtered ? (
            <EmptyState icon={<Icon.Search className="w-7 h-7" />} title="No matching decks" message="Try a different keyword or card type." />
          ) : (
            <EmptyState
              icon={<Icon.Layers className="w-7 h-7" />}
              title="You have no decks yet"
              message="Create a deck, or save questions from an exam result as flashcards."
              action={newDeck}
            />
          )}
        </div>
      ) : (
        <>
          <div className={GRID}>
            {decks.map(d => (
              <FlashDeckCard
                key={d.deckId}
                deck={{ ...d, subtitle: d.courseTitle }}
                onOpen={() => open(toDeckView(d, true))}
              />
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={loadMore} loading={loadingMore} disabled={loadingMore}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}

      {creating && (
        <DeckFormModal
          onClose={() => setCreating(false)}
          onSaved={deck => {
            setCreating(false);
            open({ ...deck, isOwner: true });
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────── Course decks

interface CourseGroup {
  courseId: number;
  courseTitle: string;
  decks: DeckListItem[];
  /** Fallback only: MC-03 failed for this course; the others still render. */
  error?: string | null;
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

/** Until FC-13 exists: MC-01 (ACTIVE) then MC-03 per course (no mode, no other students' public decks). */
async function loadCourseGroupsFallback(): Promise<CourseGroup[]> {
  const courses = (await loadActiveCourses()).filter(c => c.deckCount > 0);
  const results = await Promise.allSettled(courses.map(c => studentCourseService.getCourseDecks(c.courseId)));
  return courses.map((c, i) => {
    const r = results[i];
    const decks: DeckListItem[] =
      r.status === 'fulfilled'
        ? r.value.map(d => ({
            deckId: d.deckId,
            title: d.title,
            description: d.description,
            mode: 'FLASHCARD',
            courseId: c.courseId,
            courseTitle: c.title,
            ownerId: null,
            ownerName: null,
            cardCount: d.cardCount,
            learnedCount: d.learnedCount,
            starredCount: d.starredCount,
            visibility: d.isPublic ? 'PUBLIC' : 'PRIVATE',
            reviewStatus: 'NONE',
            createdAt: null,
          }))
        : [];
    return {
      courseId: c.courseId,
      courseTitle: c.title,
      decks,
      error: r.status === 'rejected' ? getApiErrorMessage(r.reason, 'Failed to load decks.') : null,
    };
  });
}

function groupByCourse(decks: DeckListItem[]): CourseGroup[] {
  const groups = new Map<number, CourseGroup>();
  decks.forEach(d => {
    if (d.courseId == null) return;
    const g = groups.get(d.courseId) ?? { courseId: d.courseId, courseTitle: d.courseTitle ?? `Course #${d.courseId}`, decks: [] };
    g.decks.push(d);
    groups.set(d.courseId, g);
  });
  return [...groups.values()].sort((a, b) => a.courseTitle.localeCompare(b.courseTitle));
}

function CourseDecksTab() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<CourseGroup[]>([]);
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
        let next: CourseGroup[];
        try {
          next = groupByCourse(await studentDeckService.listAllDecks({ scope: 'COURSE' }));
        } catch (err) {
          if (!isEndpointMissing(err)) throw err;
          next = await loadCourseGroupsFallback();
        }
        if (!cancelled) setGroups(next);
      } catch (err) {
        if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load the course decks.'));
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
        g.courseTitle.toLowerCase().includes(q) ? g : { ...g, decks: g.decks.filter(d => d.title.toLowerCase().includes(q)), error: null },
      )
      .filter(g => g.decks.length > 0 || g.error);
  }, [groups, search]);

  const open = (d: DeckListItem) =>
    navigate(studentDeckPath(d.deckId), {
      state: {
        deckTitle: d.title,
        courseId: d.courseId ?? undefined,
        courseTitle: d.courseTitle ?? undefined,
        deck: toDeckView(d, false),
        tab: 'course',
      } satisfies DeckStudyState,
    });

  return (
    <div className="space-y-[clamp(1.25rem,2.5vw,1.75rem)]">
      {!loading && !error && groups.length > 0 && (
        <SearchInput placeholder="Search decks or courses…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-md" />
      )}

      {loading ? (
        <CardGridSkeleton />
      ) : error ? (
        <LoadError message={error} onRetry={() => setReload(r => r + 1)} />
      ) : groups.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Icon.Layers className="w-7 h-7" />}
            title="No course decks yet"
            message="None of your active courses has a flashcard deck."
            action={<Button onClick={() => navigate(ROUTES.studentCourses)}>Go to My Courses</Button>}
          />
        </div>
      ) : visible.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Icon.Search className="w-7 h-7" />} title="No matching decks" message="Try a different keyword." />
        </div>
      ) : (
        visible.map(g => (
          <section key={g.courseId} className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-content">{g.courseTitle}</h2>
              <button
                type="button"
                onClick={() => navigate(studentCoursePath(g.courseId))}
                className="text-xs font-medium text-primary hover:underline flex-shrink-0"
              >
                View course
              </button>
            </div>
            {g.error ? (
              <p className="card px-4 py-3 text-sm text-content-soft">{g.error}</p>
            ) : (
              <div className={GRID}>
                {g.decks.map(d => (
                  <FlashDeckCard
                    key={d.deckId}
                    // Review status is the owner's business — course decks show none.
                    deck={{ ...d, reviewStatus: null, subtitle: d.ownerName ? `by ${d.ownerName}` : null }}
                    onOpen={() => open(d)}
                  />
                ))}
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
}
