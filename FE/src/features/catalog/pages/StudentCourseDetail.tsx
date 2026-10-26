import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@/assets/icons';
import { Container } from '@/features/landing/components/Container';
import { studentCourseService, type StudentCourseDetail as CourseDetail } from '@/services/studentCourse.service';

export function StudentCourseDetail({ courseId }: { courseId: number }) {
  const navigate = useNavigate();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    studentCourseService.getCourse(courseId).then((result) => {
      if (active) setCourse(result);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'We couldn’t load this course.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [courseId, refresh]);

  if (loading) return <Container className="py-12"><div className="mx-auto max-w-4xl animate-pulse space-y-5"><div className="skeleton h-56 rounded-3xl" /><div className="skeleton h-8 w-2/3 rounded" /><div className="skeleton h-24 rounded-2xl" /></div></Container>;

  if (error || !course) return <Container className="py-16"><div className="card mx-auto max-w-lg p-8 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-danger-light text-danger"><Icon.AlertCircle className="h-6 w-6" /></div><h1 className="mt-4 text-xl font-semibold text-content">We couldn’t find this course</h1><p className="mt-2 text-sm text-content-soft">{error || 'This course may no longer be available.'}</p><div className="mt-5 flex justify-center gap-2"><button type="button" onClick={() => navigate('/courses')} className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold text-content-secondary hover:bg-surface-hover">Browse courses</button><button type="button" onClick={() => setRefresh((value) => value + 1)} className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">Try again</button></div></div></Container>;

  const progress = course.enrollment?.progress;
  const enrolled = course.enrollment?.isEnrolled ?? course.isEnrolled ?? false;

  return (
    <>
      <section className="border-b border-line-soft bg-gradient-to-br from-primary-light via-surface-alt to-surface-alt">
        <Container className="py-9 sm:py-12">
          <button type="button" onClick={() => navigate('/courses')} className="inline-flex items-center gap-2 text-sm font-medium text-content-soft hover:text-brand-ink"><Icon.ChevronLeft className="h-4 w-4" />All courses</button>
          <div className="mt-6 grid gap-7 lg:grid-cols-[1fr_19rem] lg:items-center">
            <div>
              <span className="inline-flex rounded-full bg-surface px-3 py-1 text-xs font-semibold text-brand-ink shadow-sm">{course.category?.name ?? 'Course'}</span>
              <h1 className="mt-4 max-w-3xl text-3xl font-bold tracking-tight text-content sm:text-4xl">{course.title}</h1>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-content-soft">{course.description || 'A guided course to help you grow your skills, one step at a time.'}</p>
              {course.manager?.fullName && <p className="mt-4 text-sm text-content-subtle">Created by <span className="font-medium text-content-secondary">{course.manager.fullName}</span></p>}
            </div>
            <div className="rounded-2xl border border-line-soft bg-surface p-5 shadow-sm">
              <p className="text-sm text-content-subtle">Course access</p>
              <p className="mt-1 text-2xl font-bold text-content">{course.price === 0 ? 'Free' : new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(course.price)}</p>
              {enrolled ? <div className="mt-4 rounded-xl bg-success-light px-4 py-3"><p className="text-sm font-semibold text-success">You’re enrolled</p>{typeof progress === 'number' && <p className="mt-1 text-xs text-content-soft">{Math.round(progress)}% course progress</p>}</div> : <p className="mt-3 text-sm leading-relaxed text-content-soft">Browse the course outline and see what you can learn.</p>}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-surface-alt p-3"><p className="text-xl font-bold text-content">{course.stats?.publishedExamCount ?? course.publishedExamCount ?? 0}</p><p className="mt-1 text-xs text-content-subtle">Practice exams</p></div>
                <div className="rounded-xl bg-surface-alt p-3"><p className="text-xl font-bold text-content">{course.stats?.deckCount ?? course.deckCount ?? 0}</p><p className="mt-1 text-xs text-content-subtle">Flashcard decks</p></div>
              </div>
            </div>
          </div>
        </Container>
      </section>
      <Container className="py-9 sm:py-12">
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-sm font-semibold text-brand-ink">Your learning path</p><h2 className="mt-1 text-2xl font-bold text-content">Course modules</h2></div>
            <p className="text-sm text-content-subtle">{course.modules?.length ?? 0} {course.modules?.length === 1 ? 'module' : 'modules'}</p>
          </div>
          {course.modules?.length ? <ol className="mt-5 space-y-3">{course.modules.slice().sort((a, b) => a.orderIndex - b.orderIndex).map((module, index) => <li key={module.moduleId} className="flex items-center gap-4 rounded-2xl border border-line-soft bg-surface p-4 sm:p-5"><span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary-light text-sm font-bold text-brand-ink">{String(index + 1).padStart(2, '0')}</span><span className="min-w-0 flex-1"><span className="block text-base font-semibold text-content">{module.title}</span><span className="mt-1 block text-xs text-content-subtle">Module {index + 1}</span></span><Icon.ChevronRight className="h-4 w-4 flex-shrink-0 text-content-subtle" /></li>)}</ol> : <div className="mt-5 rounded-2xl border border-dashed border-line-strong bg-surface-alt px-5 py-10 text-center"><Icon.Layers className="mx-auto h-7 w-7 text-content-subtle" /><p className="mt-3 text-sm font-medium text-content-secondary">The course outline is being prepared</p><p className="mt-1 text-sm text-content-subtle">Check back soon for the first module.</p></div>}
        </div>
      </Container>
    </>
  );
}

