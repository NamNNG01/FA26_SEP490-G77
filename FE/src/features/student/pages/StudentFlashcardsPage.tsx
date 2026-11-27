import React, { useEffect, useMemo, useState } from 'react';
import { useQuietRefresh } from '@/hooks/useAutoRefresh';
import { useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { SearchInput } from '@/components/common/SearchInput';
import { Icon } from '@/assets/icons';
import { studentCoursePath, studentDeckPath } from '@/app/routes';
import { useToast } from '@/components/ui/ToastHost';
import { useAuth } from '@/auth/authContext';
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
import { LoadError, PageTitle, STUDENT_PAGE_CLASS } from '../components/studentUi';
import type { DeckStudyState } from '../components/DeckCard';
import { FLASH_DECK_GRID as GRID, FlashDeckCard, FlashDeckGridSkeleton } from '../components/flashcards/FlashDeckCard';
import { DeckFormModal } from '../components/flashcards/DeckFormModal';
import { AiFlashcardGenerateModal } from '../components/flashcards/AiFlashcardGenerateModal';

const toDeckView = deckViewFromListItem;

const SECTION_MINE = 'mine';
const SECTION_BOOKMARKED = 'bookmarked';
const SECTION_COURSES = 'courses';
const SECTION_COMMUNITY = 'community';
/** Which tab is active, kept per browser (falls back to "My decks"). */
const ACTIVE_TAB_KEY = 'student:flashcards:tab';

function parseStoredTab(raw: string | null): { tab: string; courseId?: string } {
  if (!raw) return { tab: SECTION_MINE };
  if (raw.startsWith('course:')) {
    return { tab: SECTION_COURSES, courseId: raw.slice('course:'.length) };
  }
  return { tab: raw };
}

function readActiveTab(): { tab: string; courseId?: string } {
  try {
    return parseStoredTab(window.localStorage.getItem(ACTIVE_TAB_KEY));
  } catch {
    return { tab: SECTION_MINE };
  }
}

function writeActiveTab(tab: string) {
  try {
    window.localStorage.setItem(ACTIVE_TAB_KEY, tab);
  } catch {
    /* storage blocked */
  }
}

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

/** Everything the page shows, read once: null = that part couldn't be read (its section says so or hides). */
interface FlashcardsData {
  mine: DeckListItem[] | null;
  bookmarks: DeckListItem[] | null;
  community: DeckListItem[] | null;
  courses: CourseGroup[];
}

async function loadFlashcards(): Promise<FlashcardsData> {
  const [mine, bookmarks, community, courses] = await Promise.all([
    studentDeckService.listAllDecks({ scope: 'MINE' }).catch(err => {
      if (isEndpointMissing(err)) return null;
      throw err;
    }),
    studentDeckService.listAllDecks({ scope: 'BOOKMARKED' }).catch(() => null),
    studentDeckService.listAllDecks({ scope: 'COMMUNITY' }).catch(() => null),
    studentDeckService
      .listAllDecks({ scope: 'COURSE' })
      .then(groupByCourse)
      .catch(err => {
        if (!isEndpointMissing(err)) throw err;
        return loadCourseGroupsFallback();
      }),
  ]);
  return { mine, bookmarks, community, courses };
}

/**
 * Flashcards — one page of collapsible sections:
 * - My decks (FC-13 scope=MINE): create / open to manage.
 * - Bookmarked (FC-13 scope=BOOKMARKED).
 * - One section per active course (FC-13 scope=COURSE): course decks plus other students' public decks.
 * Search and the card type filter apply to every section; while searching, matching sections open.
 */
export function StudentFlashcardsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [params] = useSearchParams();

  const [data, setData] = useState<FlashcardsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const takeQuiet = useQuietRefresh(() => setReload(r => r + 1));
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<DeckMode | ''>('');
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [{ tab: activeTab, courseId: initialCourseId }, setTabState] = useState<{ tab: string; courseId?: string }>(() => {
    const tab = params.get('tab');
    if (tab === SECTION_MINE || tab === SECTION_BOOKMARKED || tab === SECTION_COURSES || tab === SECTION_COMMUNITY) {
      return { tab };
    }
    if (tab?.startsWith('course:')) {
      return parseStoredTab(tab);
    }
    return readActiveTab();
  });
  const [selectedCourseId, setSelectedCourseId] = useState<string>(() => initialCourseId || 'all');

  useEffect(() => {
    let cancelled = false;
    // A shared auto-refresh read keeps any error as it is.
    const quiet = takeQuiet();
    if (!quiet) setError(null);
    loadFlashcards()
      .then(next => {
        if (!cancelled) setData(next);
      })
      .catch(err => {
        if (!cancelled && !quiet) setError(getApiErrorMessage(err, 'Failed to load your flashcards.'));
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const selectTab = (key: string) => {
    setTabState(prev => ({ ...prev, tab: key }));
    writeActiveTab(key);
  };

  const q = search.trim().toLowerCase();
  const searching = q !== '' || mode !== '';
  const matches = (d: DeckListItem) => (!q || d.title.toLowerCase().includes(q)) && (!mode || d.mode === mode);

  const bookmarkedIds = useMemo(() => (data?.bookmarks ? new Set(data.bookmarks.map(d => d.deckId)) : null), [data?.bookmarks]);
  const isMine = (d: DeckListItem) => user != null && d.ownerId === user.userId;

  const openDeck = (d: DeckListItem | StudentDeckView, owner: boolean) =>
    navigate(studentDeckPath(d.deckId), {
      state: {
        deckTitle: d.title,
        courseId: d.courseId ?? undefined,
        courseTitle: d.courseTitle ?? undefined,
        deck: 'ownerId' in d ? { ...toDeckView(d, owner), isBookmarked: bookmarkedIds?.has(d.deckId) } : d,
        tab: owner ? 'mine' : 'course',
      } satisfies DeckStudyState,
    });

  /** Flips the bookmark at once (the deck joins or leaves the Bookmarked section); a failure puts it back. */
  const toggleBookmark = async (d: DeckListItem) => {
    const was = bookmarkedIds?.has(d.deckId) ?? false;
    const apply = (on: boolean) =>
      setData(cur => {
        if (!cur?.bookmarks) return cur;
        const rest = cur.bookmarks.filter(x => x.deckId !== d.deckId);
        return { ...cur, bookmarks: on ? [d, ...rest] : rest };
      });
    apply(!was);
    try {
      const res = await studentDeckService.toggleBookmark(d.deckId);
      apply(res.isBookmarked);
      toast.success(res.isBookmarked ? 'Deck bookmarked.' : 'Bookmark removed.');
    } catch (err) {
      apply(was);
      toast.error(getApiErrorMessage(err, 'Could not update the bookmark.'));
    }
  };

  const newDeck = (
    <Button icon={<Icon.Plus className="w-4 h-4" />} onClick={() => setCreating(true)}>
      New deck
    </Button>
  );

  const mine = data?.mine?.filter(matches) ?? [];
  const bookmarks = data?.bookmarks?.filter(matches) ?? [];
  const community = data?.community?.filter(matches) ?? [];
  const courses = (data?.courses ?? [])
    .map(g => ({ ...g, decks: g.decks.filter(matches) }))
    .filter(g => !searching || g.decks.length > 0);
  const nothingFound = searching && data != null && mine.length === 0 && bookmarks.length === 0 && community.length === 0 && courses.length === 0;

  return (
    <div className={`${STUDENT_PAGE_CLASS} space-y-[clamp(1.25rem,2.5vw,1.75rem)]`}>
      <PageTitle title="Flashcards" subtitle="Your own decks, your bookmarks and the decks of the courses you study." />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          <SearchInput placeholder="Search all decks…" value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm w-full" />
          <Select
            aria-label="Card type"
            className="w-44"
            options={[{ value: '', label: 'All card types' }, ...DECK_MODES.map(m => ({ value: m, label: DECK_MODE_LABEL[m] }))]}
            value={mode}
            onChange={v => setMode(v as DeckMode | '')}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" icon={<Icon.Zap className="w-4 h-4" />} onClick={() => setGenerating(true)}>
            Generate with AI
          </Button>
          {newDeck}
        </div>
      </div>

      {error ? (
        <LoadError message={error} onRetry={() => setReload(r => r + 1)} />
      ) : data == null ? (
        <FlashDeckGridSkeleton />
      ) : nothingFound ? (
        <div className="card">
          <EmptyState icon={<Icon.Search className="w-7 h-7" />} title="No matching decks" message="Try a different keyword or card type." />
        </div>
      ) : (
        (() => {
          const courseDeckTotal = courses.reduce((sum, g) => sum + (g.error ? 0 : g.decks.length), 0);
          const tabs: { key: string; label: string; icon: React.ReactNode; count: number | null }[] = [
            { key: SECTION_MINE, label: 'My decks', icon: <Icon.Layers className="w-4 h-4" />, count: data.mine == null ? null : mine.length },
            ...(data.bookmarks != null
              ? [{ key: SECTION_BOOKMARKED, label: 'Bookmarked', icon: <Icon.Bookmark className="w-4 h-4" />, count: bookmarks.length }]
              : []),
            ...(courses.length > 0
              ? [{ key: SECTION_COURSES, label: 'Courses', icon: <Icon.BookOpen className="w-4 h-4" />, count: courseDeckTotal }]
              : []),
            ...(data.community != null
              ? [{ key: SECTION_COMMUNITY, label: 'Community Decks', icon: <Icon.Users className="w-4 h-4" />, count: community.length }]
              : []),
          ];
          const currentTab = tabs.some(t => t.key === activeTab) ? activeTab : (tabs[0]?.key ?? SECTION_MINE);
          const effectiveCourseId =
            selectedCourseId !== 'all' && courses.some(g => String(g.courseId) === selectedCourseId) ? selectedCourseId : 'all';
          const visibleCourses =
            effectiveCourseId === 'all' ? courses : courses.filter(g => String(g.courseId) === effectiveCourseId);

          return (
            <div className="space-y-4">
              {/* Horizontal tab bar */}
              <div
                role="tablist"
                aria-label="Flashcard deck collections"
                className="flex items-center gap-1 overflow-x-auto border-b border-line pb-px"
              >
                {tabs.map(t => {
                  const selected = currentTab === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => selectTab(t.key)}
                      className={`inline-flex items-center gap-2 whitespace-nowrap px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex-shrink-0 ${
                        selected
                          ? 'border-brand-600 text-brand-ink'
                          : 'border-transparent text-content-soft hover:text-content hover:border-line'
                      }`}
                    >
                      <span className={selected ? 'text-brand-ink' : 'text-content-subtle'}>{t.icon}</span>
                      <span>{t.label}</span>
                      {t.count != null && (
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-2xs font-semibold ${
                            selected ? 'bg-brand-600/15 text-brand-ink' : 'bg-surface-muted text-content-subtle'
                          }`}
                        >
                          {t.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Active tab panel */}
              <div role="tabpanel" className="pt-1">
                {currentTab === SECTION_MINE && (
                  data.mine == null ? (
                    <p className="text-sm text-content-soft">The server can't list your decks yet. You can still create a deck — it opens right after.</p>
                  ) : mine.length === 0 ? (
                    <div className="card">
                      <EmptyState
                        icon={<Icon.Layers className="w-7 h-7" />}
                        title="You have no decks yet"
                        message="Create a deck, or save questions from an exam result as flashcards."
                        action={newDeck}
                      />
                    </div>
                  ) : (
                    <div className={GRID}>
                      {mine.map(d => (
                        <FlashDeckCard key={d.deckId} deck={{ ...d, ownerName: null }} onOpen={() => openDeck(d, true)} />
                      ))}
                    </div>
                  )
                )}

                {currentTab === SECTION_BOOKMARKED && (
                  bookmarks.length === 0 ? (
                    <div className="card p-8 text-center text-sm text-content-soft">
                      Bookmark a course deck or another student's public deck to keep it here.
                    </div>
                  ) : (
                    <div className={GRID}>
                      {bookmarks.map(d => (
                        <FlashDeckCard
                          key={d.deckId}
                          deck={isMine(d) ? { ...d, ownerName: null } : { ...d, reviewStatus: null }}
                          onOpen={() => openDeck(d, isMine(d))}
                          bookmarked
                          onToggleBookmark={() => void toggleBookmark(d)}
                        />
                      ))}
                    </div>
                  )
                )}

                {currentTab === SECTION_COURSES && (
                  <div className="space-y-5">
                    {courses.length > 1 && (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="text-sm text-content-soft">
                          {visibleCourses.length} of {courses.length} courses
                        </span>
                        <Select
                          aria-label="Filter by course"
                          className="sm:w-72"
                          value={effectiveCourseId}
                          onChange={setSelectedCourseId}
                          options={[
                            { value: 'all', label: `All courses (${courses.length})` },
                            ...courses.map(g => ({
                              value: String(g.courseId),
                              label: `${g.courseTitle}${g.error ? '' : ` (${g.decks.length})`}`,
                            })),
                          ]}
                        />
                      </div>
                    )}
                    {visibleCourses.map(courseGroup => (
                      <div key={courseGroup.courseId} className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-content-soft">{courseGroup.courseTitle}</span>
                          <button
                            type="button"
                            onClick={() => navigate(studentCoursePath(courseGroup.courseId))}
                            className="text-xs font-medium text-brand-ink hover:underline"
                          >
                            Open course →
                          </button>
                        </div>
                        {courseGroup.error ? (
                          <p className="text-sm text-content-soft">{courseGroup.error}</p>
                        ) : (
                          <div className={GRID}>
                            {courseGroup.decks.map(d => (
                              <FlashDeckCard
                                key={d.deckId}
                                deck={{ ...d, reviewStatus: null }}
                                onOpen={() => openDeck(d, false)}
                                bookmarked={bookmarkedIds?.has(d.deckId)}
                                onToggleBookmark={bookmarkedIds ? () => void toggleBookmark(d) : undefined}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {currentTab === SECTION_COMMUNITY && (
                  community.length === 0 ? (
                    <div className="card p-8 text-center text-sm text-content-soft">
                      No community flashcard decks published yet.
                    </div>
                  ) : (
                    <div className={GRID}>
                      {community.map(d => (
                        <FlashDeckCard
                          key={d.deckId}
                          deck={{ ...d, reviewStatus: null, ownerName: d.ownerName ? `Community · ${d.ownerName}` : 'Community' }}
                          onOpen={() => openDeck(d, isMine(d))}
                          bookmarked={bookmarkedIds?.has(d.deckId)}
                          onToggleBookmark={bookmarkedIds ? () => void toggleBookmark(d) : undefined}
                        />
                      ))}
                    </div>
                  )
                )}
              </div>
            </div>
          );
        })()
      )}

      {creating && (
        <DeckFormModal
          onClose={() => setCreating(false)}
          onSaved={deck => {
            setCreating(false);
            openDeck({ ...deck, isOwner: true }, true);
          }}
        />
      )}

      {generating && <AiFlashcardGenerateModal onClose={() => setGenerating(false)} onSaved={() => setReload(r => r + 1)} />}
    </div>
  );
}
