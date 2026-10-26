import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@/assets/icons';
import { Container } from '@/features/landing/components/Container';
import { studentLearningService, type MyExam, type StudentPage } from '@/services/studentLearning.service';

export function MyExamHistoryPage() {
  const navigate = useNavigate();
  const [sort, setSort] = useState<'lastActivity' | 'title'>('lastActivity');
  const [pageIndex, setPageIndex] = useState(0);
  const [page, setPage] = useState<StudentPage<MyExam> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const exams = sort === 'title' && page ? [...page.content].sort((a, b) => a.title.localeCompare(b.title)) : page?.content ?? [];

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    studentLearningService.getMyExams({ page: pageIndex, size: 20, sort }).then((result) => {
      if (active) setPage(result);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'We couldn’t load your exam history.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [pageIndex, sort, refresh]);

  return <>
    <section className="border-b border-line-soft bg-gradient-to-br from-primary-light via-surface-alt to-surface-alt">
      <Container className="py-9 sm:py-12">
        <p className="text-sm font-semibold text-brand-ink">Look how far you’ve come</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-content sm:text-4xl">My exam history</h1>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-content-soft">A snapshot of the exams you’ve practiced and the progress you’ve made.</p>
      </Container>
    </section>
    <Container className="py-8 sm:py-10">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-content">Past exams</h2>{!loading && !error && page && <p className="mt-1 text-sm text-content-subtle">{page.totalElements} {page.totalElements === 1 ? 'exam' : 'exams'}</p>}</div><label className="sr-only" htmlFor="my-exam-sort">Sort exam history</label><select id="my-exam-sort" value={sort} onChange={(event) => { setSort(event.target.value as 'lastActivity' | 'title'); setPageIndex(0); }} className="h-10 rounded-lg border border-line bg-surface px-3 text-sm text-content"><option value="lastActivity">Most recent</option><option value="title">Exam name</option></select></div>
      {loading ? <div className="space-y-3">{Array.from({ length: 4 }, (_, index) => <div key={index} className="card h-28 animate-pulse bg-surface-alt" />)}</div> : error ? <HistoryState title="History didn’t load" message={error} onRetry={() => setRefresh((value) => value + 1)} /> : page?.content.length ? <>
        <div className="space-y-3">{exams.map((exam) => <article key={exam.examId} className="flex flex-col gap-4 rounded-2xl border border-line-soft bg-surface p-5 shadow-sm sm:flex-row sm:items-center"><span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary-light text-brand-ink"><Icon.Trophy className="h-6 w-6" /></span><div className="min-w-0 flex-1"><p className="text-xs text-content-subtle">{exam.courseTitle}</p><h3 className="mt-1 text-base font-semibold text-content">{exam.title}</h3><p className="mt-2 text-xs text-content-soft">{exam.attemptCount} {exam.attemptCount === 1 ? 'attempt' : 'attempts'} · Maximum score {exam.maxScore}</p></div><div className="flex items-center gap-4"><div className="min-w-20 text-right"><p className="text-xs text-content-subtle">Best score</p><p className="mt-1 text-xl font-bold text-brand-ink">{exam.bestScore ?? '—'}<span className="ml-1 text-xs font-medium text-content-subtle">/ {exam.maxScore}</span></p></div><button type="button" onClick={() => navigate(`/student/exams/${exam.examId}`)} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-semibold text-content-secondary hover:bg-surface-hover">View exam<Icon.ChevronRight className="h-4 w-4" /></button></div></article>)}</div>
        {page.totalPages > 1 && <div className="mt-7 flex items-center justify-center gap-3"><button type="button" disabled={page.first} onClick={() => setPageIndex((value) => Math.max(0, value - 1))} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-content-secondary disabled:opacity-40">Previous</button><span className="text-sm text-content-subtle">Page {page.page + 1} of {page.totalPages}</span><button type="button" disabled={page.last} onClick={() => setPageIndex((value) => value + 1)} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-content-secondary disabled:opacity-40">Next</button></div>}
      </> : <HistoryState title="No exam attempts yet" message="Once you finish a practice exam, your results and best score will appear here." action="Browse my courses" onClick={() => navigate('/student/courses')} />}
    </Container>
  </>;
}

function HistoryState({ title, message, action, onClick, onRetry }: { title: string; message: string; action?: string; onClick?: () => void; onRetry?: () => void }) {
  return <div className="mx-auto max-w-lg rounded-2xl border border-line-soft bg-surface px-6 py-12 text-center shadow-sm"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-light text-brand-ink"><Icon.Trophy className="h-7 w-7" /></span><h2 className="mt-4 text-xl font-semibold text-content">{title}</h2><p className="mt-2 text-sm leading-relaxed text-content-soft">{message}</p>{(action && onClick || onRetry) && <button type="button" onClick={onClick ?? onRetry} className="mt-5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">{action ?? 'Try again'}</button>}</div>;
}
