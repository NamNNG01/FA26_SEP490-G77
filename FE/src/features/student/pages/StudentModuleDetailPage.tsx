import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/Card';
import { Icon } from '@/assets/icons';
import { ROUTES, studentCoursePath, studentModulePracticePath } from '@/app/routes';
import { getApiErrorMessage } from '@/utils/apiError';
import { studentCourseService, type StudentCourseDetail } from '@/services/studentCourse.service';
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
  useCourseContent,
  useOpenContent,
} from '../components/courseContent';
import { ModulePracticeModal } from '../components/ModulePracticeModal';
import { moduleProgress, type ProgressPart, type ProgressPartKey } from '../components/courseProgress';

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
 * content not filed under any module, practised as the course's General pool.
 */
export function StudentModuleDetailPage() {
  const { courseId = '', moduleId: moduleParam = '' } = useParams<{ courseId: string; moduleId: string }>();
  const navigate = useNavigate();
  const isGeneral = moduleParam === GENERAL_MODULE;
  const moduleId = isGeneral ? null : Number(moduleParam);

  const [course, setCourse] = useState<StudentCourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    studentCourseService
      .getCourseDetail(courseId)
      .then(res => {
        if (!cancelled) setCourse(res);
      })
      .catch(err => {
        if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load the course.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId, reload]);

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
        <LoadError message={error ?? 'Module not found.'} onRetry={() => setReload(r => r + 1)} />
      </div>
    );
  }

  const enrollment = course.enrollment;
  const isActive = Boolean(enrollment?.isEnrolled && enrollment.status === 'ACTIVE');

  return (
    <div className={`${STUDENT_PAGE_CLASS} space-y-[clamp(1.25rem,2.5vw,1.75rem)]`}>
      {breadcrumb}
      {isActive ? (
        <ModuleContent course={course} moduleId={moduleId} title={title} description={module?.description} />
      ) : (
        <>
          <ModuleHeader title={title} description={module?.description} />
          <Alert
            type="warning"
            title="Not available"
            message="Exams, flashcards and practice are only available while your enrollment in this course is active."
          />
        </>
      )}
    </div>
  );
}

function ModuleHeader({ title, description, children }: { title: string; description?: string | null; children?: ReactNode }) {
  return (
    <section className="card p-[clamp(1rem,2vw,1.25rem)] space-y-4">
      <div>
        <h1 className="text-[clamp(1.25rem,1.1rem+0.6vw,1.5rem)] font-bold text-content">{title}</h1>
        {description && <p className="text-sm text-content-soft mt-1 whitespace-pre-line">{description}</p>}
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
}: {
  course: StudentCourseDetail;
  /** null = the General pseudo-module. */
  moduleId: number | null;
  title: string;
  description?: string | null;
}) {
  const navigate = useNavigate();
  const { byModule, general, loading, error, retry } = useCourseContent(course);
  const openItem = useOpenContent(course);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [overview, setOverview] = useState<ModulePracticeOverview | 'error' | undefined>(undefined);
  const [practicing, setPracticing] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const scope: PracticeScope = moduleId == null ? { courseId: course.courseId } : { moduleId };

  useEffect(() => {
    let cancelled = false;
    setOverview(undefined);
    modulePracticeService
      .getOverview(moduleId == null ? { courseId: course.courseId } : { moduleId })
      .then(o => {
        if (!cancelled) setOverview(o);
      })
      .catch(() => {
        if (!cancelled) setOverview('error');
      });
    return () => {
      cancelled = true;
    };
  }, [course.courseId, moduleId, refresh]);

  const items = useMemo(() => (moduleId == null ? general : byModule.get(moduleId) ?? []), [moduleId, general, byModule]);
  const counts = countItems(items);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(item => (kind === 'all' || item.kind === kind) && (!q || contentTitle(item).toLowerCase().includes(q)));
  }, [items, kind, search]);

  const practice = overview != null && overview !== 'error' ? overview : null;
  // Same numbers as this module's card on the course page; the items must be in first.
  const progress = practice && !loading && !error ? moduleProgress(practice, items) : null;
  const active = practice?.activeSession?.status === 'IN_PROGRESS' ? practice.activeSession : null;

  return (
    <>
      <ModuleHeader title={title} description={description}>
        <div className="space-y-4">
          {overview === undefined || (practice && loading) ? (
            <Skeleton className="h-16 w-full" />
          ) : practice ? (
            <>
              {progress &&
                (progress.parts.length > 0 ? (
                  <ProgressCards parts={progress.parts} />
                ) : (
                  <p className="text-sm text-content-subtle">Nothing to track yet.</p>
                ))}
            </>
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

        {loading ? (
          <CardGridSkeleton count={6} />
        ) : error ? (
          <LoadError message={error} onRetry={retry} />
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
