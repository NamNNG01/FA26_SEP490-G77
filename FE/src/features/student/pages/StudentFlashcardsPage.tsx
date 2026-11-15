import React, { useEffect, useMemo, useState } from 'react';
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
const courseSection = (courseId: number) => `course:${courseId}`;
/** Which sections are open, kept per browser (a convenience — falls back to "My decks" open). */
const OPEN_KEY = 'student:flashcards:open';

function readOpen(): Set<string> {
  try {
    const raw = window.localStorage.getItem(OPEN_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* storage blocked or bad value */
  }
  return new Set([SECTION_MINE]);
}

function writeOpen(open: Set<string>) {
  try {
    window.localStorage.setItem(OPEN_KEY, JSON.stringify([...open]));
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
  courses: CourseGroup[];
}

async function loadFlashcards(): Promise<FlashcardsData> {
  const [mine, bookmarks, courses] = await Promise.all([
    studentDeckService.listAllDecks({ scope: 'MINE' }).catch(err => {
      if (isEndpointMissing(err)) return null;
      throw err;
    }),
    studentDeckService.listAllDecks({ scope: 'BOOKMARKED' }).catch(() => null),
    studentDeckService
      .listAllDecks({ scope: 'COURSE' })
      .then(groupByCourse)
      .catch(err => {
        if (!isEndpointMissing(err)) throw err;
        return loadCourseGroupsFallback();
      }),
  ]);
  return { mine, bookmarks, courses };
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
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<DeckMode | ''>('');
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [open, setOpen] = useState<Set<string>>(() => {
    const initial = readOpen();
    // Older links (?tab=mine / ?tab=bookmarked) open their section.
    const tab = params.get('tab');
    if (tab === SECTION_MINE || tab === SECTION_BOOKMARKED) initial.add(tab);
    return initial;
  });

  useEffect(() => {
    let cancelled = false;
    setError(null);
    loadFlashcards()
      .then(next => {
        if (!cancelled) setData(next);
      })
      .catch(err => {
        if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load your flashcards.'));
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const toggleSection = (key: string) =>
    setOpen(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      writeOpen(next);
      return next;
    });

  const q = search.trim().toLowerCase();
  const searching = q !== '' || mode !== '';
  const matches = (d: DeckListItem) => (!q || d.title.toLowerCase().includes(q)) && (!mode || d.mode === mode);
  const isOpen = (key: string) => searching || open.has(key);

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
  const courses = (data?.courses ?? [])
    .map(g => ({ ...g, decks: g.decks.filter(matches) }))
    .filter(g => !searching || g.decks.length > 0);
  const nothingFound = searching && data != null && mine.length === 0 && bookmarks.length === 0 && courses.length === 0;

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
        <div className="space-y-3">
          {(!searching || mine.length > 0) && (
            <DeckSection
              sectionKey={SECTION_MINE}
              title="My decks"
              icon={<Icon.Layers className="w-4 h-4" />}
              count={data.mine == null ? null : mine.length}
              open={isOpen(SECTION_MINE)}
              onToggle={() => toggleSection(SECTION_MINE)}
            >
              {data.mine == null ? (
                <p className="text-sm text-content-soft">The server can't list your decks yet. You can still create a deck — it opens right after.</p>
              ) : mine.length === 0 ? (
                <EmptyState
                  icon={<Icon.Layers className="w-7 h-7" />}
                  title="You have no decks yet"
                  message="Create a deck, or save questions from an exam result as flashcards."
                  action={newDeck}
                />
              ) : (
                <div className={GRID}>
                  {mine.map(d => (
                    <FlashDeckCard key={d.deckId} deck={{ ...d, ownerName: null }} onOpen={() => openDeck(d, true)} />
                  ))}
                </div>
              )}
            </DeckSection>
          )}

          {data.bookmarks != null && (!searching || bookmarks.length > 0) && (
            <DeckSection
              sectionKey={SECTION_BOOKMARKED}
              title="Bookmarked"
              icon={<Icon.Bookmark className="w-4 h-4" />}
              count={bookmarks.length}
              open={isOpen(SECTION_BOOKMARKED)}
              onToggle={() => toggleSection(SECTION_BOOKMARKED)}
            >
              {bookmarks.length === 0 ? (
                <p className="text-sm text-content-soft">Bookmark a course deck or another student's public deck to keep it here.</p>
              ) : (
                <div className={GRID}>
                  {bookmarks.map(d => (
                    <FlashDeckCard
                      key={d.deckId}
                      // Review status and "by …" follow the owner: shown for my decks, hidden for others'.
                      deck={isMine(d) ? { ...d, ownerName: null } : { ...d, reviewStatus: null }}
                      onOpen={() => openDeck(d, isMine(d))}
                      bookmarked
                      onToggleBookmark={() => void toggleBookmark(d)}
                    />
                  ))}
                </div>
              )}
            </DeckSection>
          )}

          {courses.map(g => (
            <DeckSection
              key={g.courseId}
              sectionKey={courseSection(g.courseId)}
              title={g.courseTitle}
              onTitleClick={() => navigate(studentCoursePath(g.courseId))}
              titleHint="Open the course"
              icon={<Icon.BookOpen className="w-4 h-4" />}
              count={g.error ? null : g.decks.length}
              open={isOpen(courseSection(g.courseId))}
              onToggle={() => toggleSection(courseSection(g.courseId))}
            >
              {g.error ? (
                <p className="text-sm text-content-soft">{g.error}</p>
              ) : (
                <div className={GRID}>
                  {g.decks.map(d => (
                    <FlashDeckCard
                      key={d.deckId}
                      // Review status is the owner's business — course decks show none.
                      deck={{ ...d, reviewStatus: null }}
                      onOpen={() => openDeck(d, false)}
                      bookmarked={bookmarkedIds?.has(d.deckId)}
                      onToggleBookmark={bookmarkedIds ? () => void toggleBookmark(d) : undefined}
                    />
                  ))}
                </div>
              )}
            </DeckSection>
          ))}

          {!searching && data.courses.length === 0 && (
            <p className="text-sm text-content-soft px-1">None of your active courses has a flashcard deck yet.</p>
          )}
        </div>
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

/** A collapsible group of decks: the header toggles it, the grid drops down below. */
function DeckSection({
  sectionKey,
  title,
  icon,
  count,
  open,
  onToggle,
  onTitleClick,
  titleHint,
  children,
}: {
  sectionKey: string;
  title: string;
  icon: React.ReactNode;
  /** null hides the count (the section couldn't be read). */
  count: number | null;
  open: boolean;
  onToggle: () => void;
  /** Makes the title a link of its own (e.g. a course section opens the course). */
  onTitleClick?: () => void;
  titleHint?: string;
  children: React.ReactNode;
}) {
  const id = `deck-section-${sectionKey.replace(':', '-')}`;
  return (
    <section className="border-b border-line last:border-b-0 pb-3">
      {/* The whole row toggles (a full-size button underneath); with onTitleClick the title sits on top as its own link. */}
      <div className="relative flex items-center gap-3 px-2 py-2.5 rounded-[10px] hover:bg-surface-muted transition-colors">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={id}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`}
          className="absolute inset-0 rounded-[10px] focus-visible:outline-2 focus-visible:outline-primary"
        />
        <Icon.ChevronRight
          className={`pointer-events-none w-4 h-4 text-content-subtle flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <span className="pointer-events-none text-primary flex-shrink-0">{icon}</span>
        <h2 className={`min-w-0 text-base font-semibold text-content ${onTitleClick ? 'relative' : 'pointer-events-none'}`}>
          {onTitleClick ? (
            <button
              type="button"
              onClick={onTitleClick}
              title={titleHint}
              className="max-w-full truncate text-left hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-primary rounded-[4px]"
            >
              {title}
            </button>
          ) : (
            <span className="block truncate">{title}</span>
          )}
        </h2>
        {count != null && <span className="pointer-events-none text-sm text-content-subtle flex-shrink-0">({count})</span>}
      </div>
      {open && (
        <div id={id} className="pt-3 px-2">
          {children}
        </div>
      )}
    </section>
  );
}
