import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@/assets/icons';
import { Container } from '@/features/landing/components/Container';
import { studentLearningService, type MyCourse, type StudentPage } from '@/services/studentLearning.service';

export function MyCoursesPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'ACTIVE' | 'COMPLETED'>('ACTIVE');
  const [courses, setCourses] = useState<StudentPage<MyCourse> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  const loadCourses = useCallback(() => {
    let active = true;
    setLoading(true);
    setError('');
    studentLearningService.getMyCourses({ status }).then((result) => {
      if (active) setCourses(result);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'We couldn’t load your courses.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [status]);

  useEffect(() => loadCourses(), [loadCourses, refresh]);

  return (
    <>
      <section className="border-b border-line-soft bg-gradient-to-br from-primary-light via-surface-alt to-surface-alt">
        <Container className="py-9 sm:py-12">
          <p className="text-sm font-semibold text-brand-ink">Your learning space</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-content sm:text-4xl">My courses</h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-content-soft">Pick up where you left off, or choose a course and keep building your skills.</p>
          <div className="mt-6 inline-flex rounded-xl border border-line-soft bg-surface p-1 shadow-sm" aria-label="Course status">
            {(['ACTIVE', 'COMPLETED'] as const).map((value) => <button key={value} type="button" aria-pressed={status === value} onClick={() => setStatus(value)} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${status === value ? 'bg-brand-600 text-white shadow-sm' : 'text-content-secondary hover:bg-surface-alt'}`}>{value === 'ACTIVE' ? 'In progress' : 'Completed'}</button>)}
          </div>
        </Container>
      </section>
      <Container className="py-8 sm:py-10">
        {!loading && !error && courses && <div className="mb-5"><p className="text-sm text-content-subtle">{courses.totalElements} {courses.totalElements === 1 ? 'course' : 'courses'} {status === 'ACTIVE' ? 'in progress' : 'completed'}</p></div>}
        {loading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="card h-72 animate-pulse bg-surface-alt" />)}</div> : error ? <StateCard title="Your courses didn’t load" message={error} action="Try again" onClick={() => setRefresh((value) => value + 1)} /> : courses?.content.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{courses.content.map((course) => <MyCourseCard key={course.courseId} course={course} onOpen={() => navigate(`/student/courses/${course.courseId}`)} onExam={() => course.nextExam && navigate(`/student/exams/${course.nextExam.examId}`)} />)}</div> : <StateCard title={status === 'ACTIVE' ? 'Your learning journey starts here' : 'No completed courses yet'} message={status === 'ACTIVE' ? 'Browse the course catalog and find something you’d love to learn.' : 'Courses you finish will be waiting for you here.'} action={status === 'ACTIVE' ? 'Explore courses' : undefined} onClick={status === 'ACTIVE' ? () => navigate('/courses') : undefined} />}
      </Container>
    </>
  );
}

function MyCourseCard({ course, onOpen, onExam }: { course: MyCourse; onOpen: () => void; onExam: () => void }) {
  const progress = Math.max(0, Math.min(100, course.progress ?? 0));
  return <article className="flex min-h-72 flex-col overflow-hidden rounded-2xl border border-line-soft bg-surface shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
    <button type="button" onClick={onOpen} className="relative h-36 w-full overflow-hidden bg-gradient-to-br from-brand-100 via-primary-light to-surface-alt text-left">
      {course.thumbnailUrl ? <img src={course.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface/80 text-brand-ink"><Icon.Book className="h-7 w-7" /></span></span>}
    </button>
    <div className="flex flex-1 flex-col p-5">
      <div className="flex items-center justify-between gap-2"><span className="text-xs text-content-subtle">{course.category?.name ?? 'Course'}</span><span className="rounded-full bg-primary-light px-2.5 py-1 text-xs font-semibold text-brand-ink">{progress}% complete</span></div>
      <button type="button" onClick={onOpen} className="mt-2 text-left text-lg font-semibold leading-snug text-content hover:text-brand-ink">{course.title}</button>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-alt"><div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} /></div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-content-subtle"><span>{course.publishedExamCount} exams</span><span>{course.deckCount} flashcard decks</span></div>
      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        <button type="button" onClick={onOpen} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700">Open course<Icon.ChevronRight className="h-4 w-4" /></button>
        {course.nextExam && <button type="button" onClick={onExam} className="inline-flex h-10 items-center justify-center rounded-xl border border-line px-3 text-sm font-semibold text-content-secondary hover:bg-surface-hover" title={`Next exam: ${course.nextExam.title}`}><Icon.ClipboardList className="h-4 w-4" /><span className="sr-only">Take next exam</span></button>}
      </div>
    </div>
  </article>;
}

function StateCard({ title, message, action, onClick }: { title: string; message: string; action?: string; onClick?: () => void }) {
  return <div className="mx-auto max-w-lg rounded-2xl border border-line-soft bg-surface px-6 py-12 text-center shadow-sm"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-light text-brand-ink"><Icon.Book className="h-7 w-7" /></span><h2 className="mt-4 text-xl font-semibold text-content">{title}</h2><p className="mt-2 text-sm leading-relaxed text-content-soft">{message}</p>{action && onClick && <button type="button" onClick={onClick} className="mt-5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">{action}</button>}</div>;
}
