import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { EmptyState } from '@/components/ui/Card';
import { Icon } from '@/assets/icons';
import { ROUTES, studentExamResultPath } from '@/app/routes';
import { studentProgressService, type LearningActivity } from '@/services/studentProgress.service';
import { getApiErrorMessage } from '@/utils/apiError';
import { LoadError, PageTitle, STUDENT_PAGE_CLASS } from '../components/studentUi';

const SIZE = 20;
const TYPES = [
  { label: 'All activities', value: '' },
  { label: 'Exams', value: 'EXAM' },
  { label: 'Flashcards', value: 'FLASHCARD' },
  { label: 'Quizzes', value: 'QUIZ' },
];

export function StudentLearningActivityPage() {
  const navigate = useNavigate();
  const [type, setType] = useState('');
  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);
  const [rows, setRows] = useState<LearningActivity[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    studentProgressService.getActivities({ page, size: SIZE, type: type as LearningActivity['activityType'] | undefined })
      .then(result => {
        if (cancelled) return;
        setRows(result.content);
        setTotal(result.totalElements);
        setTotalPages(result.totalPages);
      })
      .catch(err => { if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load your activity.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page, type, reload]);

  const goToActivity = (activity: LearningActivity) => {
    if (activity.activityType === 'EXAM') navigate(studentExamResultPath(activity.refId));
    else if (activity.activityType === 'FLASHCARD') navigate(`${ROUTES.studentFlashcards}/${activity.refId}`);
  };

  return <div className={`${STUDENT_PAGE_CLASS} space-y-6`}>
    <PageTitle title="Learning activity" subtitle="A timeline of your exams, quizzes, and flashcard study sessions." action={<Button variant="outline" onClick={() => navigate(ROUTES.studentCourses)}>My courses</Button>} />
    <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-content-soft">Recent learning activity</p>
      <Select aria-label="Filter activity type" className="w-full sm:w-52" value={type} options={TYPES} onChange={v => { setType(v); setPage(0); }} />
    </div>
    {loading ? <div className="card p-8 text-sm text-content-subtle">Loading activity…</div> : error ? <LoadError message={error} onRetry={() => setReload(v => v + 1)} /> : rows.length === 0 ?
      <div className="card"><EmptyState icon={<Icon.Activity className="w-7 h-7" />} title="No activity yet" message="Completed exams and study sessions will appear here." /></div> :
      <div className="card overflow-hidden">
        <ul className="divide-y divide-line">
          {rows.map((item, index) => <li key={`${item.activityType}-${item.refId}-${item.happenedAt}-${index}`} className="flex flex-wrap items-center gap-3 px-4 py-4">
            <span className="w-10 h-10 rounded-xl bg-primary-light text-primary flex items-center justify-center"><ActivityIcon type={item.activityType} /></span>
            <div className="min-w-[12rem] flex-1">
              <p className="text-sm font-semibold text-content">{item.title}</p>
              <p className="text-xs text-content-subtle">{item.activityType.replace('_', ' ')} · {new Date(item.happenedAt).toLocaleString()}</p>
            </div>
            <p className="text-sm text-content-secondary">{item.activityType === 'FLASHCARD' ? `${item.learnedCount ?? 0}/${item.totalCards ?? 0} cards learned` : item.score != null ? `Score ${item.score}${item.maxScore != null ? ` / ${item.maxScore}` : ''}` : ''}</p>
            {item.activityType !== 'QUIZ' && <Button size="sm" variant="outline" onClick={() => goToActivity(item)}>View</Button>}
          </li>)}
        </ul>
        <div className="border-t border-line"><Pagination page={page + 1} total={total} perPage={SIZE} onChange={p => setPage(p - 1)} unit="activities" /></div>
        <span className="sr-only">{totalPages} pages</span>
      </div>}
  </div>;
}

function ActivityIcon({ type }: { type: LearningActivity['activityType'] }) {
  if (type === 'EXAM') return <Icon.ClipboardList className="w-5 h-5" />;
  if (type === 'FLASHCARD') return <Icon.Layers className="w-5 h-5" />;
  return <Icon.Zap className="w-5 h-5" />;
}
