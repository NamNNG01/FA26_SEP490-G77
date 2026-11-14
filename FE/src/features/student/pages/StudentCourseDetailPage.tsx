import { useEffect, useState } from 'react';
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
import { getApiErrorMessage } from '@/utils/apiError';
import {
  studentCourseService,
  type StudentCourseDetail,
} from '@/services/studentCourse.service';
import type { PracticeScope } from '@/services/modulePractice.service';
import { CardGridSkeleton, CourseThumb, LoadError, STUDENT_PAGE_CLASS } from '../components/studentUi';
import { GENERAL_MODULE, countItems, sortedModules } from '../components/courseContent';
import { useCourseProgress, type LearningProgress, type OverviewState } from '../components/courseProgress';
import { ModulePracticeModal } from '../components/ModulePracticeModal';
import { SmartPracticeModal } from '../components/SmartPracticeModal';
import type { ModulePageState } from './StudentModuleDetailPage';

/**
 * Student course detail — course info (CL-02), then the course content as a grid of module cards.
 * Each card shows the module's exams (MC-02) and decks (MC-03), its practice progress and a
 * Practice button; clicking it opens the module page. Exams and decks not filed under a module sit
 * on a "General" card, practised as the course's General pool. MC-02/03 only answer for an ACTIVE
 * enrollment, so other states only list the modules. An enrolled student can create a practice exam for the course from the info card
 * (AI-01 / PQ-01, course fixed).
 */
export function StudentCourseDetailPage() {
  const { courseId = '' } = useParams<{ courseId: string }>();
  const navigate = useNavigate();

  const [course, setCourse] = useState<StudentCourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [personalQuiz, setPersonalQuiz] = useState(false);
  // MC-02/03 and MP-01 only answer for an ACTIVE enrollment.
  const activeCourse = course?.enrollment?.isEnrolled && course.enrollment.status === 'ACTIVE' ? course : null;
  const content = useCourseProgress(activeCourse);

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
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className={`${STUDENT_PAGE_CLASS} space-y-6`}>
        {breadcrumb}
        <LoadError message={error ?? 'Course not found.'} onRetry={() => setReload(r => r + 1)} />
      </div>
    );
  }

  const enrollment = course.enrollment;
  const isActive = Boolean(enrollment?.isEnrolled && enrollment.status === 'ACTIVE');
  // General counts once it holds anything; until the content is in, only the course's own modules.
  const moduleCount = isActive ? content.moduleCount : course.modules.length;

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
        <ModuleGrid course={course} content={content} />
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

/** The course's progress from LP-01 (the average of its modules); undefined while it loads. */
function CourseProgressPanel({ progress }: { progress?: LearningProgress | 'error' }) {
  if (!progress) return <Skeleton className="h-20 w-full" />;
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
 * it shows the course's progress from LP-01 (useCourseProgress); each module's own progress is
 * shown on its detail page.
 */
function ModuleGrid({ course, content }: { course: StudentCourseDetail; content: ReturnType<typeof useCourseProgress> }) {
  const navigate = useNavigate();
  const { byModule, general, loading, error, retry, modules, overviews, hasGeneral, course: overall } = content;
  const [practicing, setPracticing] = useState<{ key: string; scope: PracticeScope; title: string } | null>(null);

  if (loading) return <CardGridSkeleton count={Math.min(Math.max(modules.length, 3), 6)} />;
  if (error) return <LoadError message={error} onRetry={retry} />;

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

  const practicingOverview = practicing ? overviews[practicing.key] : undefined;

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
            overview={overviews[m.moduleId]}
            onOpen={() => navigate(studentModulePath(course.courseId, m.moduleId), { state: { course } satisfies ModulePageState })}
            onPractice={() => setPracticing({ key: String(m.moduleId), scope: { moduleId: m.moduleId }, title: m.title })}
          />
        ))}
        {hasGeneral && (
          <ModuleCard
            title="General"
            description="Practice questions, exams and flashcard decks not filed under a module."
            counts={countItems(general)}
            overview={overviews[GENERAL_MODULE]}
            onOpen={() => navigate(studentModulePath(course.courseId, GENERAL_MODULE), { state: { course } satisfies ModulePageState })}
            onPractice={() => setPracticing({ key: GENERAL_MODULE, scope: { courseId: course.courseId }, title: 'General' })}
          />
        )}
      </div>

      {practicing && (
        <ModulePracticeModal
          open
          onClose={() => setPracticing(null)}
          scope={practicing.scope}
          moduleTitle={practicing.title}
          overview={practicingOverview === 'error' ? null : practicingOverview}
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
  overview,
  onOpen,
  onPractice,
}: {
  index?: number;
  title: string;
  description?: string | null;
  counts: { exams: number; decks: number };
  overview?: OverviewState;
  onOpen: () => void;
  onPractice?: () => void;
}) {
  const inProgress = overview != null && overview !== 'error' && overview.activeSession?.status === 'IN_PROGRESS';
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
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-content-soft">
          <span className="inline-flex items-center gap-1">
            <Icon.ClipboardList className="w-3.5 h-3.5" /> {counts.exams} exam{counts.exams === 1 ? '' : 's'}
          </span>
          <span className="inline-flex items-center gap-1">
            <Icon.Layers className="w-3.5 h-3.5" /> {counts.decks} deck{counts.decks === 1 ? '' : 's'}
          </span>
        </div>
      </button>
      {onPractice && (
        <button
          type="button"
          onClick={onPractice}
          className="flex items-center gap-1.5 border-t border-line px-4 py-2.5 text-sm font-medium text-primary hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
        >
          <Icon.Play className="w-4 h-4" />
          {inProgress ? 'Continue practice' : 'Practice'}
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
