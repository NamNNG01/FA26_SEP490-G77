import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/ToastHost';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/Card';
import { Icon } from '@/assets/icons';
import { Progress } from '@/components/ui/Progress';
import { ROUTES, studentExamPath, studentModulePath } from '@/app/routes';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  studentCourseService,
  type CourseExam,
  type CourseModuleSummary,
  type StudentCourseDetail,
} from '@/services/studentCourse.service';
import { modulePracticeService, practicePercent, type ModulePracticeOverview } from '@/services/modulePractice.service';
import { CardGridSkeleton, CourseThumb, LoadError, STUDENT_PAGE_CLASS } from '../components/studentUi';
import { GENERAL_MODULE, countItems, sortedModules, useCourseContent } from '../components/courseContent';
import { ModulePracticeModal } from '../components/ModulePracticeModal';
import { studentProgressService, type CourseProgress } from '@/services/studentProgress.service';

/**
 * Student course detail — course info (CL-02), then the course content as a grid of module cards.
 * Each card shows the module's exams (MC-02) and decks (MC-03), its practice progress and a
 * Practice button; clicking it opens the module page. Exams and decks not filed under a module sit
 * on a "General" card. MC-02/03 only answer for an ACTIVE enrollment, so other states only list the
 * modules. An enrolled student can leave the course from the info card (EN-04) after a warning: no
 * refund, access ends. An exam in progress must be finished first.
 */
export function StudentCourseDetailPage() {
  const { courseId = '' } = useParams<{ courseId: string }>();
  const navigate = useNavigate();

  const [course, setCourse] = useState<StudentCourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const toast = useToast();

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
  const moduleCount = course.modules.length;

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
              <Button
                variant="outline"
                size="sm"
                className="ml-auto text-danger hover:text-danger"
                icon={<Icon.LogOut className="w-4 h-4" />}
                onClick={() => setLeaving(true)}
              >
                Leave course
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
        <>
          <CourseProgressPanel courseId={course.courseId} />
          <ModuleGrid course={course} />
        </>
      ) : (
        <LockedModules course={course} />
      )}

      <LeaveCourseModal
        open={leaving}
        course={course}
        onClose={() => setLeaving(false)}
        onLeft={() => {
          toast.success(`You left ${course.title}`);
          navigate(ROUTES.studentCourses);
        }}
      />
    </div>
  );
}

/**
 * EN-04 — warns that a paid course is not refunded and that every exam and deck locks. An exam
 * still in progress (MC-02 `hasActiveAttempt`) blocks leaving: the modal links to it instead.
 */
function LeaveCourseModal({
  open,
  course,
  onClose,
  onLeft,
}: {
  open: boolean;
  course: StudentCourseDetail;
  onClose: () => void;
  onLeft: () => void;
}) {
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Exams with an attempt in progress; null while MC-02 is being read. */
  const [inProgress, setInProgress] = useState<CourseExam[] | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [recheck, setRecheck] = useState(0);
  const isPaid = Number(course.price ?? 0) > 0;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setCheckError(null);
    setInProgress(null);
    studentCourseService
      .getAllCourseExams(course.courseId)
      .then(exams => {
        if (!cancelled) setInProgress(exams.filter(e => e.hasActiveAttempt));
      })
      .catch(err => {
        if (!cancelled) setCheckError(getApiErrorMessage(err, 'Could not check your exams in progress.'));
      });
    return () => {
      cancelled = true;
    };
  }, [open, course.courseId, recheck]);

  const blocked = inProgress != null && inProgress.length > 0;
  const canLeave = inProgress != null && !blocked;

  async function confirmLeave() {
    setLeaving(true);
    setError(null);
    try {
      await studentCourseService.cancelEnrollment(course.courseId);
      onLeft();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not leave the course.'));
    } finally {
      setLeaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !leaving && onClose()}
      title={blocked ? 'Finish your exams first' : 'Leave this course?'}
      size="sm"
      footer={
        blocked ? (
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="outline" disabled={leaving} onClick={onClose}>
              Stay enrolled
            </Button>
            <Button
              variant="danger"
              loading={leaving}
              disabled={leaving || !canLeave}
              icon={<Icon.LogOut className="w-4 h-4" />}
              onClick={confirmLeave}
            >
              Leave course
            </Button>
          </>
        )
      }
    >
      {inProgress == null && !checkError ? (
        <p className="text-sm text-content-subtle">Checking your exams in progress…</p>
      ) : checkError ? (
        <div className="space-y-2">
          <p className="text-sm text-danger">{checkError}</p>
          <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => setRecheck(v => v + 1)}>
            Try again
          </button>
        </div>
      ) : blocked ? (
        <div className="space-y-3">
          <p className="text-base text-content-secondary leading-relaxed">
            You still have {inProgress.length === 1 ? 'an exam' : `${inProgress.length} exams`} in progress in{' '}
            <span className="font-semibold text-content">{course.title}</span>. Submit or cancel{' '}
            {inProgress.length === 1 ? 'it' : 'them'} before leaving the course.
          </p>
          <ul className="space-y-1.5">
            {inProgress.map(exam => (
              <li key={exam.examId}>
                <button
                  type="button"
                  onClick={() => navigate(studentExamPath(exam.examId))}
                  className="w-full flex items-center gap-2 rounded-[8px] border border-line px-3 py-2 text-left text-sm hover:bg-primary-light transition-colors"
                >
                  <Icon.ClipboardList className="w-4 h-4 flex-shrink-0 text-primary" />
                  <span className="truncate font-medium text-content">{exam.title}</span>
                  <Badge variant="warning" size="sm" className="ml-auto flex-shrink-0">
                    In progress
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
      <div className="flex gap-3">
        <Icon.AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-danger" />
        <div className="space-y-2 text-base text-content-secondary leading-relaxed">
          <p>
            You will lose access to every exam and flashcard deck in{' '}
            <span className="font-semibold text-content">{course.title}</span>.
          </p>
          {isPaid && <p className="font-medium text-danger">This course was paid for and will not be refunded.</p>}
          <p className="text-sm text-content-subtle">
            {isPaid
              ? 'To come back later you will have to buy the course again.'
              : 'You can enroll again later for free.'}{' '}
            Your past attempts and progress are kept.
          </p>
        </div>
      </div>
      )}
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </Modal>
  );
}

function CourseProgressPanel({ courseId }: { courseId: number }) {
  const [progress, setProgress] = useState<CourseProgress | null>(null);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    studentProgressService.getCourseProgress(courseId)
      .then(data => { if (!cancelled) { setProgress(data); setError(false); } })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [courseId, reload]);

  if (error) return <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
    <p className="text-sm text-content-soft">Course progress could not be loaded.</p>
    <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => setReload(v => v + 1)}>Try again</button>
  </div>;
  if (!progress) return <div className="card p-4 text-sm text-content-subtle">Loading course progress…</div>;

  return <section className="card p-4 sm:p-5 space-y-4" aria-label="Course progress">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-semibold text-content">Your progress</h2>
        <p className="mt-1 text-xs text-content-subtle">{progress.completedExams} of {progress.totalExams} exams completed · {progress.learnedDecks} of {progress.totalDecks} decks learned</p>
      </div>
      <div className="text-right"><p className="text-xl font-bold text-primary">{progress.progress}%</p><p className="text-xs text-content-subtle">overall</p></div>
    </div>
    <Progress value={progress.progress} />
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
      <p className="text-sm text-content-secondary">Average score <span className="font-semibold text-content">{progress.averageScore == null ? '—' : progress.averageScore.toFixed(2)}</span></p>
      {progress.recentAttempts.length > 0 && <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-content-subtle">
        {progress.recentAttempts.slice(0, 3).map(attempt => <li key={attempt.attemptId}>{attempt.examTitle}: <span className="font-medium text-content-secondary">{attempt.totalScore}/{attempt.maxScore}</span></li>)}
      </ul>}
    </div>
  </section>;
}

type OverviewState = ModulePracticeOverview | 'error' | undefined;

/**
 * The course content as a grid of module cards — practice progress, counts and a Practice button
 * each — plus a "General" card for the exams and decks not filed under any module.
 */
function ModuleGrid({ course }: { course: StudentCourseDetail }) {
  const navigate = useNavigate();
  const { byModule, general, loading, error, retry } = useCourseContent(course);
  const [overviews, setOverviews] = useState<Record<number, OverviewState>>({});
  const [practicing, setPracticing] = useState<CourseModuleSummary | null>(null);
  const modules = useMemo(() => sortedModules(course), [course]);

  useEffect(() => {
    let cancelled = false;
    setOverviews({});
    modules.forEach(m => {
      modulePracticeService
        .getOverview(m.moduleId)
        .then(o => {
          if (!cancelled) setOverviews(prev => ({ ...prev, [m.moduleId]: o }));
        })
        .catch(() => {
          if (!cancelled) setOverviews(prev => ({ ...prev, [m.moduleId]: 'error' }));
        });
    });
    return () => {
      cancelled = true;
    };
  }, [modules]);

  if (loading) return <CardGridSkeleton count={Math.min(Math.max(modules.length, 3), 6)} />;
  if (error) return <LoadError message={error} onRetry={retry} />;

  if (modules.length === 0 && general.length === 0) {
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

  const practicingOverview = practicing ? overviews[practicing.moduleId] : undefined;

  return (
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
            onOpen={() => navigate(studentModulePath(course.courseId, m.moduleId))}
            onPractice={() => setPracticing(m)}
          />
        ))}
        {general.length > 0 && (
          <ModuleCard
            title="General"
            description="Exams and flashcard decks not filed under a module."
            counts={countItems(general)}
            onOpen={() => navigate(studentModulePath(course.courseId, GENERAL_MODULE))}
          />
        )}
      </div>

      {practicing && (
        <ModulePracticeModal
          open
          onClose={() => setPracticing(null)}
          moduleId={practicing.moduleId}
          moduleTitle={practicing.title}
          overview={practicingOverview === 'error' ? null : practicingOverview}
        />
      )}
    </section>
  );
}

/**
 * The card body opens the module; the Practice button sits outside it (a button can't nest in a
 * button). No `onPractice` = the General card: no practice, no progress bar.
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
        {onPractice && <PracticeProgress overview={overview} />}
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

/** Practiced questions of a module; a dash when the overview could not be read. */
function PracticeProgress({ overview }: { overview: OverviewState }) {
  if (overview === undefined) return <Skeleton className="mt-auto h-6 w-full" />;
  if (overview === 'error') return <p className="mt-auto text-xs text-content-subtle">Practice progress —</p>;
  return (
    <div className="mt-auto w-full space-y-1.5">
      <Progress value={practicePercent(overview)} label="Practice progress" size="sm" />
      <p className="text-2xs text-content-subtle">
        {overview.practicedQuestions}/{overview.totalQuestions} questions practiced
        {overview.totalAttempts > 0 && ` · ${Math.round(overview.accuracyRate)}% accuracy`}
      </p>
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
