import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Input } from '@/components/ui/Input';
import { Dropdown } from '@/components/ui/Dropdown';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/Card';
import { Icon } from '@/assets/icons';
import { ROUTES, studentCoursePath, studentModulePath, studentModulePracticePath } from '@/app/routes';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  studentCourseService,
  type StudentCourseDetail,
  type StudentModuleContent,
} from '@/services/studentCourse.service';
import { useCachedQuery } from '@/hooks/useCachedQuery';
import type { CourseProgress } from '@/services/studentProgress.service';
import {
  modulePracticeService,
  type ModulePracticeOverview,
  type PracticeScope,
} from '@/services/modulePractice.service';
import { ResetPracticeButton } from '../components/ResetPracticeButton';
import { CardGridSkeleton, LoadError, STUDENT_PAGE_CLASS } from '../components/studentUi';
import {
  ContentItemCard,
  GENERAL_MODULE,
  contentKey,
  contentTitle,
  countItems,
  sortedModules,
  type ContentItem,
  useOpenContent,
} from '../components/courseContent';
import { ModulePracticeModal } from '../components/ModulePracticeModal';
import { Progress } from '@/components/ui/Progress';
import {
  beModuleProgress,
  courseCacheKey,
  type BeProgressState,
  useBeCourseProgress,
  type LearningProgress,
  type ProgressPart,
  type ProgressPartKey,
} from '../components/courseProgress';

/** Route state from the course page: its CL-02 and LP-01, so the module page need not read them again. */
export interface ModulePageState {
  course: StudentCourseDetail;
  progress?: CourseProgress;
}

type KindFilter = 'all' | 'exam' | 'deck';

const KIND_FILTERS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'exam', label: 'Exams' },
  { value: 'deck', label: 'Flashcards' },
];

const PART_CARD: Record<ProgressPartKey, { title: string; icon: ReactNode; unit: string }> = {
  questions: { title: 'Questions', icon: <Icon.HelpCircle className="w-4 h-4" />, unit: 'correct' },
  exams: { title: 'Exams', icon: <Icon.ClipboardList className="w-4 h-4" />, unit: 'done' },
  decks: { title: 'Flashcards', icon: <Icon.Layers className="w-4 h-4" />, unit: 'decks learned' },
};

/** One card per part the module has: "Questions · 30/40 correct". */
function ProgressCards({ parts }: { parts: ProgressPart[] }) {
  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
      {parts.map(p => {
        const card = PART_CARD[p.key];
        return (
          <div key={p.key} className="rounded-lg border border-line px-4 py-3">
            <p className="inline-flex items-center gap-1.5 text-sm text-content-soft">
              {card.icon} {card.title}
            </p>
            <p className="mt-1 text-content">
              <span className="text-xl font-bold">
                {p.done}/{p.total}
              </span>{' '}
              <span className="text-sm text-content-subtle">{card.unit}</span>
            </p>
          </div>
        );
      })}
    </div>
  );
}

/**
 * One module of a course: its practice overview and Practice button, then its exams (MC-02) and
 * flashcard decks (MC-03) with a search box and a type filter. `moduleId = general` lists the
 * content not filed under any module, practised as the course's General pool. The title is a
 * module switcher, with Prev / Next beside it, so other modules open without the course page.
 */
export function StudentModuleDetailPage() {
  const { courseId = '', moduleId: moduleParam = '' } = useParams<{ courseId: string; moduleId: string }>();
  const navigate = useNavigate();
  const isGeneral = moduleParam === GENERAL_MODULE;
  const moduleId = isGeneral ? null : Number(moduleParam);

  // The course page hands over its CL-02 and LP-01, so opening a module from it reads neither again.
  const routeState = useLocation().state as ModulePageState | null;
  const passed = routeState?.course;
  const handed = passed != null && String(passed.courseId) === courseId ? passed : null;
  const handedProgress = handed ? routeState?.progress : undefined;
  // Opened directly (URL, reload), CL-02 comes from the cache when the course was seen in this tab.
  const courseQuery = useCachedQuery<StudentCourseDetail>(
    courseCacheKey.course(courseId),
    () => studentCourseService.getCourseDetail(courseId),
    { initialData: handed ?? undefined },
  );
  const course = courseQuery.data ?? null;
  const { loading } = courseQuery;
  const error = courseQuery.error ? getApiErrorMessage(courseQuery.error, 'Failed to load the course.') : null;

  const module = moduleId != null ? course?.modules.find(m => m.moduleId === moduleId) : undefined;
  const title = isGeneral ? 'General' : module?.title ?? 'Module';

  const breadcrumb = (
    <Breadcrumb
      items={[
        { label: 'My Courses', onClick: () => navigate(ROUTES.studentCourses) },
        { label: course?.title ?? 'Course', onClick: () => navigate(studentCoursePath(courseId)) },
        { label: title },
      ]}
    />
  );

  if (loading) {
    return (
      <div className={`${STUDENT_PAGE_CLASS} space-y-6`}>
        {breadcrumb}
        <div className="card p-5 space-y-3">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-2 w-full" />
        </div>
        <CardGridSkeleton count={6} />
      </div>
    );
  }

  const notFound = !course || (!isGeneral && !module);
  if (error || notFound) {
    return (
      <div className={`${STUDENT_PAGE_CLASS} space-y-6`}>
        {breadcrumb}
        <LoadError message={error ?? 'Module not found.'} onRetry={courseQuery.reload} />
      </div>
    );
  }

  const enrollment = course.enrollment;
  const isActive = Boolean(enrollment?.isEnrolled && enrollment.status === 'ACTIVE');

  return (
    <div className={`${STUDENT_PAGE_CLASS} space-y-[clamp(1.25rem,2.5vw,1.75rem)]`}>
      {breadcrumb}
      {isActive ? (
        // Keyed by module: moving to another one starts its search, filter and practice state afresh.
        <ModuleContent
          key={moduleParam}
          course={course}
          moduleId={moduleId}
          title={title}
          description={module?.description}
          initialProgress={handedProgress}
        />
      ) : (
        <LockedModule course={course} moduleKey={moduleParam} title={title} description={module?.description} />
      )}
    </div>
  );
}

function LockedModule({
  course,
  moduleKey,
  title,
  description,
}: {
  course: StudentCourseDetail;
  moduleKey: string;
  title: string;
  description?: string | null;
}) {
  const nav = useModuleNav(course, moduleKey);
  return (
    <>
      <ModuleHeader title={title} description={description} nav={nav} />
      <Alert
        type="warning"
        title="Not available"
        message="Exams, flashcards and practice are only available while your enrollment in this course is active."
      />
    </>
  );
}

interface ModuleEntry {
  key: string;
  title: string;
  /** Position in the course; none for General. */
  index?: number;
}

/**
 * The course's modules in order, for moving between them without going back to the course page:
 * its own modules, then General when LP-01 lists it (it does once General holds anything) or it is
 * the one open. Moving replaces the history entry, so Back still returns to the course page.
 */
function useModuleNav(course: StudentCourseDetail, currentKey: string, be?: BeProgressState) {
  const navigate = useNavigate();
  const progress = be && be !== 'error' ? be : undefined;
  const entries: ModuleEntry[] = sortedModules(course).map((m, i) => ({ key: String(m.moduleId), title: m.title, index: i + 1 }));
  if (currentKey === GENERAL_MODULE || progress?.modules.some(m => m.moduleId == null)) {
    entries.push({ key: GENERAL_MODULE, title: 'General' });
  }
  const at = entries.findIndex(e => e.key === currentKey);
  return {
    entries,
    currentKey,
    prev: at > 0 ? entries[at - 1] : null,
    next: at >= 0 && at < entries.length - 1 ? entries[at + 1] : null,
    /** LP-01 percent of a module; undefined while LP-01 is missing. */
    percentOf: (key: string) => (progress ? beModuleProgress(progress, key)?.percent ?? 0 : undefined),
    go: (key: string) =>
      navigate(studentModulePath(course.courseId, key), { replace: true, state: { course, progress } satisfies ModulePageState }),
  };
}

type ModuleNav = ReturnType<typeof useModuleNav>;

const entryLabel = (e: ModuleEntry) => (e.index != null ? `${e.index}. ${e.title}` : e.title);

function ModuleHeader({
  title,
  description,
  nav,
  children,
}: {
  title: string;
  description?: string | null;
  nav: ModuleNav;
  children?: ReactNode;
}) {
  const { entries, currentKey, prev, next, percentOf, go } = nav;
  const titleClass = 'text-[clamp(1.25rem,1.1rem+0.6vw,1.5rem)] font-bold text-content';
  return (
    <section className="card p-[clamp(1rem,2vw,1.25rem)] space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[min(100%,14rem)]">
          {entries.length > 1 ? (
            // The title doubles as the module switcher.
            <div role="heading" aria-level={1}>
              <Dropdown
                className="inline-block max-w-full"
                value={currentKey}
                onSelect={key => key !== currentKey && go(String(key))}
                search={entries.length > 8}
                searchPlaceholder="Find a module…"
                items={entries.map(e => {
                  const percent = percentOf(e.key);
                  return { value: e.key, label: percent != null ? `${entryLabel(e)} · ${percent}%` : entryLabel(e) };
                })}
                trigger={
                  <button
                    type="button"
                    aria-haspopup="menu"
                    aria-label={`${title} — switch module`}
                    className={`${titleClass} inline-flex max-w-full items-center gap-1.5 text-left rounded-md hover:text-primary focus-visible:outline-2 focus-visible:outline-primary`}
                  >
                    <span className="min-w-0 break-words">{title}</span>
                    <Icon.ChevronDown className="w-5 h-5 flex-shrink-0 text-content-subtle" />
                  </button>
                }
              />
            </div>
          ) : (
            <h1 className={titleClass}>{title}</h1>
          )}
          {description && <p className="text-sm text-content-soft mt-1 whitespace-pre-line">{description}</p>}
        </div>
        {entries.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              icon={<Icon.ChevronLeft className="w-4 h-4" />}
              disabled={!prev}
              onClick={() => prev && go(prev.key)}
              title={prev ? entryLabel(prev) : undefined}
            >
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              iconRight={<Icon.ChevronRight className="w-4 h-4" />}
              disabled={!next}
              onClick={() => next && go(next.key)}
              title={next ? entryLabel(next) : undefined}
            >
              Next
            </Button>
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

function ModuleContent({
  course,
  moduleId,
  title,
  description,
  initialProgress,
}: {
  course: StudentCourseDetail;
  /** null = the General pseudo-module. */
  moduleId: number | null;
  title: string;
  description?: string | null;
  /** LP-01 handed over by the course page; read again only when missing or after a practice reset. */
  initialProgress?: CourseProgress;
}) {
  const navigate = useNavigate();
  const openItem = useOpenContent(course);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [practicing, setPracticing] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const scope: PracticeScope = moduleId == null ? { courseId: course.courseId } : { moduleId };
  const moduleKey = moduleId ?? GENERAL_MODULE;

  // Both cached (useCachedQuery): shown at once when seen before in this tab, then read again.
  const contentQuery = useCachedQuery<StudentModuleContent>(courseCacheKey.moduleContent(course.courseId, moduleKey), () =>
    studentCourseService.getModuleContent(course.courseId, moduleKey),
  );
  const items = useMemo<ContentItem[]>(
    () =>
      contentQuery.data
        ? [
            ...contentQuery.data.exams.map(exam => ({ kind: 'exam' as const, exam })),
            ...contentQuery.data.decks.map(deck => ({ kind: 'deck' as const, deck })),
          ]
        : [],
    [contentQuery.data],
  );
  const contentLoading = contentQuery.loading;
  const contentError = contentQuery.error ? getApiErrorMessage(contentQuery.error, 'Failed to load module content.') : null;

  const overviewQuery = useCachedQuery<ModulePracticeOverview>(courseCacheKey.moduleOverview(course.courseId, moduleKey), () =>
    modulePracticeService.getOverview(scope),
  );
  const overview: ModulePracticeOverview | 'error' | undefined = overviewQuery.error ? 'error' : overviewQuery.data;
  // A practice reset reads MP-01 again (LP-01 too, through `refresh` below).
  const reloadOverview = overviewQuery.reload;
  useEffect(() => {
    if (refresh > 0) reloadOverview();
  }, [refresh, reloadOverview]);

  const counts = countItems(items);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(item => (kind === 'all' || item.kind === kind) && (!q || contentTitle(item).toLowerCase().includes(q)));
  }, [items, kind, search]);

  // LP-01 (from the course page when opened from it), reread after a practice reset; the same
  // numbers as this module's card on the course page.
  const be = useBeCourseProgress(course.courseId, refresh, initialProgress);
  const practice = overview != null && overview !== 'error' ? overview : null;
  const progress: LearningProgress | null =
    be && be !== 'error' ? beModuleProgress(be, moduleId == null ? GENERAL_MODULE : String(moduleId)) ?? { percent: null, parts: [] } : null;
  const progressLoading = be === undefined;
  const active = practice?.activeSession?.status === 'IN_PROGRESS' ? practice.activeSession : null;
  const nav = useModuleNav(course, String(moduleKey), be);

  return (
    <>
      <ModuleHeader title={title} description={description} nav={nav}>
        <div className="space-y-4">
          {progressLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : progress ? (
            progress.parts.length > 0 ? (
              <>
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-content-secondary">Module progress</span>
                    <span className="text-lg font-bold text-primary">{progress.percent ?? 0}%</span>
                  </div>
                  <Progress value={progress.percent ?? 0} size="sm" />
                </div>
                <ProgressCards parts={progress.parts} />
              </>
            ) : (
              <p className="text-sm text-content-subtle">Nothing to track yet.</p>
            )
          ) : (
            <p className="text-sm text-content-subtle">Module progress could not be loaded.</p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              icon={<Icon.Play className="w-4 h-4" />}
              onClick={() => (active ? navigate(studentModulePracticePath(active.sessionId)) : setPracticing(true))}
            >
              {active ? 'Continue practice' : 'Practice'}
            </Button>
            {active && (
              <Button variant="outline" onClick={() => setPracticing(true)}>
                Change mode
              </Button>
            )}
            {practice && practice.totalAttempts > 0 && (
              <span className="ml-auto">
                <ResetPracticeButton scope={scope} moduleTitle={title} onReset={() => setRefresh(r => r + 1)} />
              </span>
            )}
          </div>
        </div>
      </ModuleHeader>

      <section className="space-y-4" aria-label="Module content">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            className="flex-1 min-w-[min(100%,16rem)]"
            placeholder="Search exams and decks…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            icon={<Icon.Search className="w-4 h-4" />}
            aria-label="Search exams and decks"
          />
          <div role="radiogroup" aria-label="Content type" className="flex gap-1 rounded-[10px] bg-accent p-1">
            {KIND_FILTERS.map(f => {
              const selected = kind === f.value;
              const n = f.value === 'all' ? items.length : f.value === 'exam' ? counts.exams : counts.decks;
              return (
                <button
                  key={f.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setKind(f.value)}
                  className={`px-3 py-1.5 rounded-[8px] text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                    selected ? 'bg-surface text-content shadow-sm' : 'text-content-soft hover:text-content'
                  }`}
                >
                  {f.label} <span className="text-content-subtle">{n}</span>
                </button>
              );
            })}
          </div>
        </div>

        {contentLoading ? (
          <CardGridSkeleton count={6} />
        ) : contentError ? (
          <LoadError message={contentError} onRetry={contentQuery.reload} />
        ) : visible.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<Icon.Search className="w-7 h-7" />}
              title={items.length === 0 ? 'No content yet' : 'Nothing matches'}
              message={items.length === 0 ? 'This module has no exam or flashcard deck yet.' : 'Try another search or filter.'}
            />
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-[clamp(1rem,2vw,1.25rem)]">
            {visible.map(item => (
              <ContentItemCard key={contentKey(item)} item={item} onOpen={() => openItem(item)} />
            ))}
          </div>
        )}
      </section>

      <ModulePracticeModal
        open={practicing}
        onClose={() => setPracticing(false)}
        scope={scope}
        moduleTitle={title}
        overview={practice}
      />
    </>
  );
}
