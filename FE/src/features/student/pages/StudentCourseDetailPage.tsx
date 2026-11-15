import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/Card';
import { Icon } from '@/assets/icons';
import { Progress } from '@/components/ui/Progress';
import { ROUTES, studentModulePath } from '@/app/routes';
import type { StudentCourseDetail } from '@/services/studentCourse.service';
import { modulePracticeService, type ModulePracticeOverview, type PracticeScope } from '@/services/modulePractice.service';
import { CardGridSkeleton, CourseThumb, LoadError, STUDENT_PAGE_CLASS } from '../components/studentUi';
import { GENERAL_MODULE, countItems, sortedModules } from '../components/courseContent';
import { useCourseDetail, type CourseDetailState, type LearningProgress } from '../components/courseProgress';
import { ModulePracticeModal } from '../components/ModulePracticeModal';
import { SmartPracticeModal } from '../components/SmartPracticeModal';
import type { ModulePageState } from './StudentModuleDetailPage';

/**
 * Student course detail — course info (CL-02), then the course content as a grid of module cards.
 * Each card shows the module's exams (MC-02) and decks (MC-03), its progress (LP-01) and a
 * Practice button; clicking it opens the module page. Exams and decks not filed under a module sit
 * on a "General" card, practised as the course's General pool. CL-02, MC-02, MC-03 and LP-01 are
 * read together and the page is shown once all are in (useCourseDetail). MC-02/03 only answer for
 * an ACTIVE enrollment, so other states only list the modules. An enrolled student can create a
 * practice exam for the course from the info card (AI-01 / PQ-01, course fixed).
 */
export function StudentCourseDetailPage() {
  const { courseId = '' } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { data, loading, error, retry } = useCourseDetail(courseId);
  const [personalQuiz, setPersonalQuiz] = useState(false);
  const course = loading ? null : data?.course;

  const breadcrumb = (
    <Breadcrumb
      items={[{ label: 'My Courses', onClick: () => navigate(ROUTES.studentCourses) }, { label: course?.title ?? 'Course' }]}
    />
  );

  if (loading) {
    return (
      <div className={`${STUDENT_PAGE_CLASS} space-y-6`}>
        {breadcrumb}
        <div className="card p-5 flex flex-col sm:flex-row gap-5">
          <Skeleton className="w-full sm:w-64 aspect-video" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
        <Skeleton className="h-20 w-full" />
        <CardGridSkeleton count={3} />
      </div>
    );
  }

  if (error || !data || !course) {
    return (
      <div className={`${STUDENT_PAGE_CLASS} space-y-6`}>
        {breadcrumb}
        <LoadError message={error ?? 'Course not found.'} onRetry={retry} />
      </div>
    );
  }

  const enrollment = course.enrollment;
  const { isActive } = data;
  const moduleCount = isActive ? data.moduleCount : course.modules.length;

  return (
    <div className={`${STUDENT_PAGE_CLASS} space-y-[clamp(1.25rem,2.5vw,1.75rem)]`}>
      {breadcrumb}

      <div className="card p-[clamp(1rem,2vw,1.25rem)] flex flex-col sm:flex-row gap-5">
        <CourseThumb url={course.thumbnailUrl} title={course.title} className="sm:w-64 rounded-[10px] flex-shrink-0" />
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {course.category && <Badge>{course.category.name}</Badge>}
            {enrollment?.isEnrolled && (
              <Badge variant={enrollment.status === 'COMPLETED' ? 'success' : 'info'}>
                {enrollment.status === 'COMPLETED' ? 'Completed' : 'In progress'}
              </Badge>
            )}
            {isActive && (
              <Button variant="outline" size="sm" className="ml-auto" icon={<Icon.Zap className="w-4 h-4" />} onClick={() => setPersonalQuiz(true)}>
                Create practice exam
              </Button>
            )}
          </div>
          <div>
            <h1 className="text-[clamp(1.25rem,1.1rem+0.6vw,1.5rem)] font-bold text-content">{course.title}</h1>
            {course.manager && <p className="text-sm text-content-subtle mt-0.5">by {course.manager.fullName}</p>}
          </div>
          {course.description && <p className="text-sm text-content-soft whitespace-pre-line">{course.description}</p>}
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-content-soft">
            <span className="inline-flex items-center gap-1.5">
              <Icon.ClipboardList className="w-4 h-4" /> {course.stats.publishedExamCount} exams
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Icon.Layers className="w-4 h-4" /> {course.stats.deckCount} decks
            </span>
            {moduleCount > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Icon.Folder className="w-4 h-4" /> {moduleCount} module{moduleCount === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>
      </div>

      {!isActive && (
        <Alert
          type={enrollment?.status === 'COMPLETED' ? 'info' : 'warning'}
          title={enrollment?.status === 'COMPLETED' ? 'Course completed' : 'Not enrolled'}
          message={
            enrollment?.status === 'COMPLETED'
              ? 'Exams and flashcards are only available while your enrollment is active.'
              : 'Enroll in this course to take its exams and study its flashcards.'
          }
        />
      )}

      {isActive ? (
        <ModuleGrid content={data} onRetry={retry} />
      ) : (
        <LockedModules course={course} />
      )}

      {isActive && (
        <SmartPracticeModal
          open={personalQuiz}
          onClose={() => setPersonalQuiz(false)}
          courses={[{ courseId: course.courseId, title: course.title }]}
          initialCourseId={course.courseId}
          lockCourse
        />
      )}
    </div>
  );
}

/** The course's progress from LP-01 (the average of its modules). */
function CourseProgressPanel({ progress }: { progress: LearningProgress | 'error' }) {
  if (progress === 'error') {
    return (
      <section className="card p-4 sm:p-5" aria-label="Course progress">
        <h2 className="font-semibold text-content">Your progress</h2>
        <p className="mt-1 text-sm text-content-subtle">Progress could not be loaded.</p>
      </section>
    );
  }

  return (
    <section className="card p-4 sm:p-5 space-y-4" aria-label="Course progress">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="font-semibold text-content">Your progress</h2>
        <p className="text-xl font-bold text-primary">{progress.percent ?? 0}%</p>
      </div>
      <Progress value={progress.percent ?? 0} />
    </section>
  );
}

/**
 * The course content as a grid of module cards — counts and a Practice button each — plus a
 * "General" card, built the same way, for the content not filed under any module. The panel above
 * it and each card show progress from LP-01. MP-01 is read only for the module whose Practice
 * button is pressed, to open its practice modal (with the session in progress, if any).
 */
function ModuleGrid({ content, onRetry }: { content: CourseDetailState; onRetry: () => void }) {
  const navigate = useNavigate();
  const { course, byModule, general, contentError, modules, hasGeneral, progress: overall, be, moduleProgress } = content;
  const [practicing, setPracticing] = useState<{ scope: PracticeScope; title: string; overview: ModulePracticeOverview | null } | null>(null);
  // The card whose MP-01 is being read before its practice modal opens.
  const [opening, setOpening] = useState<string | null>(null);
  // LP-01 rides along to the module page so it need not read it again.
  const pageState: ModulePageState = { course, progress: be !== 'error' ? be : undefined };

  const openPractice = (key: string, scope: PracticeScope, title: string) => {
    if (opening) return;
    setOpening(key);
    modulePracticeService
      .getOverview(scope)
      .then(overview => setPracticing({ scope, title, overview }))
      // Without MP-01 the modal still opens; it just cannot show the session in progress.
      .catch(() => setPracticing({ scope, title, overview: null }))
      .finally(() => setOpening(null));
  };

  if (contentError) return <LoadError message={contentError} onRetry={onRetry} />;

  if (modules.length === 0 && !hasGeneral) {
    return (
      <div className="card">
        <EmptyState
          icon={<Icon.Folder className="w-7 h-7" />}
          title="No content yet"
          message="This course has no module, exam or flashcard deck yet."
        />
      </div>
    );
  }

  return (
    <>
    <CourseProgressPanel progress={overall} />
    <section className="space-y-3" aria-label="Course content">
      <h2 className="text-base font-semibold text-content">Modules</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-[clamp(1rem,2vw,1.25rem)]">
        {modules.map((m, i) => (
          <ModuleCard
            key={m.moduleId}
            index={i + 1}
            title={m.title}
            description={m.description}
            counts={countItems(byModule.get(m.moduleId) ?? [])}
            progress={moduleProgress(String(m.moduleId))}
            practiceLoading={opening === String(m.moduleId)}
            onOpen={() => navigate(studentModulePath(course.courseId, m.moduleId), { state: pageState })}
            onPractice={() => openPractice(String(m.moduleId), { moduleId: m.moduleId }, m.title)}
          />
        ))}
        {hasGeneral && (
          <ModuleCard
            title="General"
            description="Practice questions, exams and flashcard decks not filed under a module."
            counts={countItems(general)}
            progress={moduleProgress(GENERAL_MODULE)}
            practiceLoading={opening === GENERAL_MODULE}
            onOpen={() => navigate(studentModulePath(course.courseId, GENERAL_MODULE), { state: pageState })}
            onPractice={() => openPractice(GENERAL_MODULE, { courseId: course.courseId }, 'General')}
          />
        )}
      </div>

      {practicing && (
        <ModulePracticeModal
          open
          onClose={() => setPracticing(null)}
          scope={practicing.scope}
          moduleTitle={practicing.title}
          overview={practicing.overview}
        />
      )}
    </section>
    </>
  );
}

/**
 * The card body opens the module; the Practice button sits outside it (a button can't nest in a
 * button). No `index` = the General card, shown with a folder icon.
 */
function ModuleCard({
  index,
  title,
  description,
  counts,
  progress,
  practiceLoading,
  onOpen,
  onPractice,
}: {
  index?: number;
  title: string;
  description?: string | null;
  counts: { exams: number; decks: number };
  /** LP-01's entry for the module; null = nothing to count, undefined = LP-01 failed. */
  progress?: LearningProgress | null;
  /** MP-01 is being read before the practice modal opens. */
  practiceLoading?: boolean;
  onOpen: () => void;
  onPractice?: () => void;
}) {
  return (
    <div className="card overflow-hidden flex flex-col hover:shadow-md transition-shadow">
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 p-4 flex flex-col gap-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
      >
        <div className="w-full flex items-start gap-3">
          <span className="w-10 h-10 rounded-[10px] bg-primary-light text-primary flex items-center justify-center flex-shrink-0 text-sm font-bold">
            {index ?? <Icon.Folder className="w-5 h-5" />}
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-content leading-snug line-clamp-2">{title}</h3>
            {description && <p className="text-xs text-content-soft mt-0.5 line-clamp-2">{description}</p>}
          </div>
          <Icon.ChevronRight className="w-4 h-4 text-content-subtle flex-shrink-0 mt-1" />
        </div>
        {/* Pinned to the bottom so counts and bars line up across cards whatever the description's length. */}
        <div className="mt-auto w-full space-y-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-content-soft">
            <span className="inline-flex items-center gap-1">
              <Icon.ClipboardList className="w-3.5 h-3.5" /> {counts.exams} exam{counts.exams === 1 ? '' : 's'}
            </span>
            <span className="inline-flex items-center gap-1">
              <Icon.Layers className="w-3.5 h-3.5" /> {counts.decks} deck{counts.decks === 1 ? '' : 's'}
            </span>
          </div>
          {/* Same height with or without a bar. */}
          <div className="w-full h-8 flex flex-col justify-end">
            {progress ? (
              <div className="w-full space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-content-soft">Progress</span>
                  <span className="font-semibold text-primary">{progress.percent ?? 0}%</span>
                </div>
                <Progress value={progress.percent ?? 0} size="sm" />
              </div>
            ) : progress === null ? (
              <p className="text-xs text-content-subtle">Nothing to track yet.</p>
            ) : null}
          </div>
        </div>
      </button>
      {onPractice && (
        <button
          type="button"
          onClick={onPractice}
          disabled={practiceLoading}
          aria-busy={practiceLoading || undefined}
          className="flex items-center gap-1.5 border-t border-line px-4 py-2.5 text-sm font-medium text-primary hover:bg-surface-hover disabled:opacity-60 disabled:cursor-wait focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
        >
          {practiceLoading ? (
            <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full spinner" />
          ) : (
            <Icon.Play className="w-4 h-4" />
          )}
          Practice
          <Icon.ChevronRight className="w-4 h-4 ml-auto" />
        </button>
      )}
    </div>
  );
}


/** Not enrolled / completed: MC-02/03 refuse, so only the module names are shown. */
function LockedModules({ course }: { course: StudentCourseDetail }) {
  const modules = sortedModules(course);
  if (modules.length === 0) {
    return (
      <div className="card">
        <EmptyState icon={<Icon.Folder className="w-7 h-7" />} title="No modules yet" />
      </div>
    );
  }
  return (
    <section className="space-y-3" aria-label="Course content">
      <h2 className="text-base font-semibold text-content">Modules</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-[clamp(1rem,2vw,1.25rem)]">
        {modules.map((m, i) => (
          <div key={m.moduleId} className="card p-4 flex items-start gap-3">
            <span className="w-10 h-10 rounded-[10px] bg-accent text-content-subtle flex items-center justify-center flex-shrink-0 text-sm font-bold">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-content-soft leading-snug line-clamp-2">{m.title}</h3>
              {m.description && <p className="text-xs text-content-subtle mt-0.5 line-clamp-2">{m.description}</p>}
            </div>
            <Icon.Lock className="w-4 h-4 text-content-subtle flex-shrink-0 mt-1" />
          </div>
        ))}
      </div>
    </section>
  );
}
