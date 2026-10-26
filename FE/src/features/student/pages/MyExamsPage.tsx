import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/Card';
import { Icon } from '@/assets/icons';
import { ROUTES, studentCoursePath, studentExamAttemptsPath, studentTakeExamPath } from '@/app/routes';
import { getApiErrorMessage } from '@/utils/apiError';
import { studentCourseService, type MyExam } from '@/services/studentCourse.service';
import { ListSkeleton, LoadError, PageTitle, formatScore } from '../components/studentUi';

const PAGE_SIZE = 10;

/**
 * My Exams — every exam the student has attempted, with attempt count and
 * best score (ME-01). Exams not taken yet are listed on each course page.
 */
export function MyExamsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [exams, setExams] = useState<MyExam[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    studentCourseService
      .getMyExams({ page: page - 1, size: PAGE_SIZE })
      .then(res => {
        if (cancelled) return;
        setExams(res.content);
        setTotal(res.totalElements);
      })
      .catch(err => {
        if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load your exams.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, reload]);

  return (
    <div className="space-y-[clamp(1.25rem,2.5vw,1.75rem)]">
      <PageTitle title="My Exams" subtitle="Exams you have taken and your best score on each." />

      {loading ? (
        <ListSkeleton />
      ) : error ? (
        <LoadError message={error} onRetry={() => setReload(r => r + 1)} />
      ) : exams.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Icon.ClipboardList className="w-7 h-7" />}
            title="No exams taken yet"
            message="Open one of your courses to start an exam."
            action={<Button onClick={() => navigate(ROUTES.studentCourses)}>Go to My Courses</Button>}
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-line">
            {exams.map(exam => (
              <li key={exam.examId} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-[clamp(0.875rem,1.5vw,1.25rem)] py-4">
                <div className="w-9 h-9 rounded-[10px] bg-primary-light flex items-center justify-center flex-shrink-0">
                  <Icon.Award className="w-4.5 h-4.5 text-primary" />
                </div>
                <div className="flex-1 min-w-[12rem]">
                  <button
                    type="button"
                    onClick={() => navigate(studentExamAttemptsPath(exam.examId))}
                    className="block text-sm font-semibold text-content break-words text-left hover:text-primary hover:underline"
                  >
                    {exam.title}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(studentCoursePath(exam.courseId))}
                    className="text-xs text-content-subtle hover:text-primary hover:underline text-left"
                  >
                    {exam.courseTitle}
                  </button>
                </div>
                <div className="flex gap-6 text-center">
                  <div>
                    <p className="text-sm font-semibold text-content">{exam.attemptCount}</p>
                    <p className="text-2xs text-content-subtle">Attempts</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-content">{formatScore(exam.bestScore, exam.maxScore)}</p>
                    <p className="text-2xs text-content-subtle">Best score</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  icon={<Icon.Eye className="w-4 h-4" />}
                  onClick={() => navigate(studentExamAttemptsPath(exam.examId))}
                >
                  View attempts
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Icon.RefreshCw className="w-4 h-4" />}
                  onClick={() => navigate(studentTakeExamPath(exam.examId))}
                >
                  Retake
                </Button>
              </li>
            ))}
          </ul>
          <div className="border-t border-line">
            <Pagination page={page} total={total} perPage={PAGE_SIZE} onChange={setPage} unit="exams" />
          </div>
        </div>
      )}
    </div>
  );
}
