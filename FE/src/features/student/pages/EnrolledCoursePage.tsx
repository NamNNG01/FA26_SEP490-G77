import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Icon } from '@/assets/icons';
import { Container } from '@/features/landing/components/Container';
import { studentCourseService, type StudentCourseDetail } from '@/services/studentCourse.service';
import { studentLearningService, type CourseDeck, type CourseExam, type StudentPage } from '@/services/studentLearning.service';

type Tab = 'exams' | 'flashcards';

export function EnrolledCoursePage() {
  const { courseId: courseParam } = useParams<{ courseId: string }>();
  const courseId = Number(courseParam);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'flashcards' ? 'flashcards' : 'exams';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [course, setCourse] = useState<StudentCourseDetail | null>(null);
  const [loadingCourse, setLoadingCourse] = useState(true);
  const [courseError, setCourseError] = useState('');
  const [refreshCourse, setRefreshCourse] = useState(0);

  useEffect(() => {
    let active = true;
    setLoadingCourse(true);
    setCourseError('');
    studentCourseService.getCourse(courseId).then((result) => {
      if (active) setCourse(result);
    }).catch((reason: unknown) => {
      if (active) setCourseError(reason instanceof Error ? reason.message : 'We couldn’t load this course.');
    }).finally(() => {
      if (active) setLoadingCourse(false);
    });
    return () => { active = false; };
  }, [courseId, refreshCourse]);

  function selectTab(nextTab: Tab) {
    setTab(nextTab);
    const params = new URLSearchParams(searchParams);
    params.set('tab', nextTab);
    setSearchParams(params, { replace: true });
  }

  if (!Number.isFinite(courseId) || courseId <= 0) return <LearningState title="Course not found" message="This course link doesn’t look right." onBack={() => navigate('/student/courses')} />;
  if (loadingCourse) return <Container className="py-12"><div className="mx-auto max-w-4xl animate-pulse space-y-5"><div className="skeleton h-52 rounded-3xl" /><div className="skeleton h-10 w-2/3 rounded" /><div className="skeleton h-24 rounded-2xl" /></div></Container>;
  if (courseError || !course) return <Container className="py-14"><LearningState title="Course didn’t load" message={courseError || 'This course may no longer be available.'} onBack={() => navigate('/student/courses')} onRetry={() => setRefreshCourse((value) => value + 1)} /></Container>;

  return <>
    <section className="border-b border-line-soft bg-gradient-to-br from-primary-light via-surface-alt to-surface-alt">
      <Container className="py-8 sm:py-10">
        <button type="button" onClick={() => navigate('/student/courses')} className="inline-flex items-center gap-2 text-sm font-medium text-content-soft hover:text-brand-ink"><Icon.ChevronLeft className="h-4 w-4" />My courses</button>
        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
          {course.thumbnailUrl ? <img src={course.thumbnailUrl} alt="" className="h-20 w-20 rounded-2xl object-cover shadow-sm" /> : <span className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-2xl bg-surface text-brand-ink shadow-sm"><Icon.Book className="h-9 w-9" /></span>}
          <div className="min-w-0 flex-1"><p className="text-sm font-medium text-brand-ink">{course.category?.name ?? 'Your course'}</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-content sm:text-3xl">{course.title}</h1><p className="mt-2 line-clamp-2 max-w-2xl text-sm leading-relaxed text-content-soft">{course.description || 'Keep moving through the course at your own pace.'}</p></div>
          {course.enrollment?.isEnrolled && typeof course.enrollment.progress === 'number' && <div className="min-w-28 rounded-xl bg-surface px-4 py-3 text-center shadow-sm"><p className="text-xl font-bold text-brand-ink">{Math.round(course.enrollment.progress)}%</p><p className="text-xs text-content-subtle">complete</p></div>}
        </div>
      </Container>
    </section>
    <Container className="py-7 sm:py-9">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm font-semibold text-brand-ink">Keep learning</p><h2 className="mt-1 text-2xl font-bold text-content">Study materials</h2></div>
        <div className="inline-flex rounded-xl border border-line-soft bg-surface p-1 shadow-sm" role="tablist" aria-label="Course study materials">
          <button type="button" role="tab" aria-selected={tab === 'exams'} onClick={() => selectTab('exams')} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${tab === 'exams' ? 'bg-brand-600 text-white shadow-sm' : 'text-content-secondary hover:bg-surface-alt'}`}><Icon.ClipboardList className="h-4 w-4" />Exams</button>
          <button type="button" role="tab" aria-selected={tab === 'flashcards'} onClick={() => selectTab('flashcards')} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${tab === 'flashcards' ? 'bg-brand-600 text-white shadow-sm' : 'text-content-secondary hover:bg-surface-alt'}`}><Icon.Layers className="h-4 w-4" />Flashcards</button>
        </div>
      </div>
      {tab === 'exams' ? <CourseExams courseId={courseId} /> : <CourseDecks courseId={courseId} />}
    </Container>
  </>;
}

function CourseExams({ courseId }: { courseId: number }) {
  const navigate = useNavigate();
  const [sort, setSort] = useState<'newest' | 'title'>('newest');
  const [page, setPage] = useState<StudentPage<CourseExam> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    studentLearningService.getCourseExams(courseId, { sort }).then((result) => { if (active) setPage(result); }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'We couldn’t load the exams.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [courseId, sort, refresh]);
  return <>
    <div className="mb-4 flex items-center justify-between gap-3"><p className="text-sm text-content-subtle">Practice exams for this course</p><label className="sr-only" htmlFor="exam-sort">Sort exams</label><select id="exam-sort" value={sort} onChange={(event) => setSort(event.target.value as 'newest' | 'title')} className="h-10 rounded-lg border border-line bg-surface px-3 text-sm text-content"><option value="newest">Recently added</option><option value="title">Exam name</option></select></div>
    {loading ? <div className="space-y-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="card h-28 animate-pulse bg-surface-alt" />)}</div> : error ? <LearningState title="Exams didn’t load" message={error} onRetry={() => setRefresh((value) => value + 1)} /> : page?.content.length ? <div className="space-y-3">{page.content.map((exam) => <article key={exam.examId} className="flex flex-col gap-4 rounded-2xl border border-line-soft bg-surface p-5 shadow-sm sm:flex-row sm:items-center"><span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary-light text-brand-ink"><Icon.ClipboardList className="h-6 w-6" /></span><div className="min-w-0 flex-1"><h3 className="text-base font-semibold text-content">{exam.title}</h3><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-content-subtle"><span>{exam.questionCount} questions</span><span>{exam.durationMinutes} min</span><span>Up to {exam.maxScore} points</span></div>{exam.myAttemptCount > 0 && <p className="mt-2 text-xs text-content-soft">{exam.myAttemptCount} {exam.myAttemptCount === 1 ? 'attempt' : 'attempts'}{exam.myBestScore !== null ? ` · Best ${exam.myBestScore}` : ''}</p>}</div><div className="flex items-center gap-3"><ExamProgress exam={exam} /><button type="button" onClick={() => navigate(`/student/exams/${exam.examId}`)} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">View exam<Icon.ChevronRight className="h-4 w-4" /></button></div></article>)}</div> : <LearningState title="No exams just yet" message="Published practice exams for this course will appear here when they’re ready." />}
  </>;
}

function ExamProgress({ exam }: { exam: CourseExam }) {
  if (exam.hasActiveAttempt) return <span className="rounded-full bg-warning-light px-3 py-1 text-xs font-semibold text-warning-strong">In progress</span>;
  if (exam.myBestScore !== null) return <span className="rounded-full bg-success-light px-3 py-1 text-xs font-semibold text-success-strong">Best {exam.myBestScore}</span>;
  return <span className="rounded-full bg-surface-alt px-3 py-1 text-xs font-semibold text-content-subtle">Not started</span>;
}

function CourseDecks({ courseId }: { courseId: number }) {
  const navigate = useNavigate();
  const [decks, setDecks] = useState<CourseDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    studentLearningService.getCourseDecks(courseId).then((result) => { if (active) setDecks(result); }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'We couldn’t load the flashcards.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [courseId, refresh]);
  return loading ? <div className="grid gap-4 sm:grid-cols-2">{Array.from({ length: 2 }, (_, index) => <div key={index} className="card h-52 animate-pulse bg-surface-alt" />)}</div> : error ? <LearningState title="Flashcards didn’t load" message={error} onRetry={() => setRefresh((value) => value + 1)} /> : decks.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{decks.map((deck) => <article key={deck.deckId} className="flex min-h-52 flex-col rounded-2xl border border-line-soft bg-surface p-5 shadow-sm"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-light text-brand-ink"><Icon.Layers className="h-5 w-5" /></span><h3 className="mt-4 text-lg font-semibold text-content">{deck.title}</h3><p className="mt-1 line-clamp-2 min-h-10 text-sm leading-relaxed text-content-soft">{deck.description || 'A quick set of cards to help you remember the key ideas.'}</p><div className="mt-auto flex items-center justify-between gap-2 pt-4"><span className="text-xs text-content-subtle">{deck.learnedCount} of {deck.cardCount} learned · {deck.starredCount} saved</span><button type="button" onClick={() => navigate(`/student/decks/${deck.deckId}`)} className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-brand-ink hover:bg-primary-light">Study<Icon.ChevronRight className="h-4 w-4" /></button></div></article>)}</div> : <LearningState title="No flashcard sets yet" message="Flashcard sets for this course will show up here." />;
}

function LearningState({ title, message, onBack, onRetry }: { title: string; message: string; onBack?: () => void; onRetry?: () => void }) {
  return <div className="mx-auto max-w-lg rounded-2xl border border-line-soft bg-surface px-6 py-12 text-center shadow-sm"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-light text-brand-ink"><Icon.Book className="h-7 w-7" /></span><h2 className="mt-4 text-xl font-semibold text-content">{title}</h2><p className="mt-2 text-sm leading-relaxed text-content-soft">{message}</p><div className="mt-5 flex justify-center gap-2">{onBack && <button type="button" onClick={onBack} className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-content-secondary hover:bg-surface-hover">My courses</button>}{onRetry && <button type="button" onClick={onRetry} className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">Try again</button>}</div></div>;
}
