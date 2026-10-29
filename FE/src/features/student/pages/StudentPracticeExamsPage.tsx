import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { EmptyState } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/ToastHost';
import { Icon } from '@/assets/icons';
import { studentExamAttemptsPath, studentTakePracticePath } from '@/app/routes';
import { getApiErrorMessage } from '@/utils/apiError';
import { studentCourseService, type MyCourse } from '@/services/studentCourse.service';
import { studentPracticeExamService, type PracticeExamItem } from '@/services/studentPracticeExam.service';
import { ListSkeleton, LoadError, PageTitle, STUDENT_PAGE_CLASS, formatDate, formatScore } from '../components/studentUi';
import { SmartPracticeModal } from '../components/SmartPracticeModal';
import { AiSparkle } from '../components/aiUi';

const PAGE_SIZE = 10;
const MY_COURSES_FETCH_SIZE = 100;
/** Practice exams are scored out of 10 (PracticeExamService.createGeneratedExam). */
const PRACTICE_MAX_SCORE = 10;

/**
 * Practice Exams — the custom practice exams the student generated (PQ-02), newest first.
 * Each one can be taken again (SA-01, practice mode) or deleted (PQ-03; its attempts are kept).
 * "New practice exam" opens Smart Practice on its Random tab.
 */
export function StudentPracticeExamsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [items, setItems] = useState<PracticeExamItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [courses, setCourses] = useState<MyCourse[]>([]);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<PracticeExamItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    studentPracticeExamService
      .list(page - 1, PAGE_SIZE)
      .then(res => {
        if (cancelled) return;
        // The last item of a page was deleted → step back a page.
        if (res.content.length === 0 && page > 1) {
          setPage(p => p - 1);
          return;
        }
        setItems(res.content);
        setTotal(res.totalElements);
      })
      .catch(err => {
        if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load your practice exams.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, reload]);

  // Courses for the "New practice exam" modal.
  useEffect(() => {
    studentCourseService
      .getMyCourses({ page: 0, size: MY_COURSES_FETCH_SIZE })
      .then(res => setCourses(res.content))
      .catch(() => setCourses([]));
  }, []);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await studentPracticeExamService.remove(toDelete.practiceId);
      toast.success(`Deleted "${toDelete.title}".`);
      setToDelete(null);
      setReload(r => r + 1);
    } catch (err) {
      setDeleteError(getApiErrorMessage(err, 'Failed to delete the practice exam.'));
    } finally {
      setDeleting(false);
    }
  };

  const newButton = (
    <Button icon={<AiSparkle />} onClick={() => setCreating(true)}>
      New practice exam
    </Button>
  );

  return (
    <div className={`${STUDENT_PAGE_CLASS} space-y-[clamp(1.25rem,2.5vw,1.75rem)]`}>
      <PageTitle
        title="Practice Exams"
        subtitle="Practice exams you built yourself. They do not count towards your course progress."
        action={newButton}
      />

      {loading ? (
        <ListSkeleton />
      ) : error ? (
        <LoadError message={error} onRetry={() => setReload(r => r + 1)} />
      ) : items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Icon.Zap className="w-7 h-7" />}
            title="No practice exams yet"
            message="Build one from the question bank of a course you study."
            action={newButton}
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-line">
            {items.map(item => (
              <li key={item.practiceId} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-[clamp(0.875rem,1.5vw,1.25rem)] py-4">
                <div className="w-9 h-9 rounded-[10px] bg-primary-light flex items-center justify-center flex-shrink-0">
                  <Icon.Zap className="w-4.5 h-4.5 text-primary" />
                </div>
                <div className="flex-1 min-w-[12rem]">
                  <p className="text-sm font-semibold text-content break-words">{item.title}</p>
                  <p className="flex flex-wrap gap-x-3 text-xs text-content-subtle">
                    {item.questionCount != null && <span>{item.questionCount} questions</span>}
                    {item.durationMinutes != null && <span>{item.durationMinutes} min</span>}
                    <span>Created {formatDate(item.createdAt)}</span>
                  </p>
                </div>
                <div className="flex gap-6 text-center">
                  <div>
                    <p className="text-sm font-semibold text-content">{item.attemptCount ?? 0}</p>
                    <p className="text-2xs text-content-subtle">Attempts</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-content">{formatScore(item.bestScore, PRACTICE_MAX_SCORE)}</p>
                    <p className="text-2xs text-content-subtle">Best score</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(item.attemptCount ?? 0) > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<Icon.Eye className="w-4 h-4" />}
                      onClick={() => navigate(studentExamAttemptsPath(item.examId))}
                    >
                      Results
                    </Button>
                  )}
                  <Button
                    size="sm"
                    icon={<Icon.RefreshCw className="w-4 h-4" />}
                    onClick={() => navigate(studentTakePracticePath(item.examId))}
                  >
                    {(item.attemptCount ?? 0) > 0 ? 'Retake' : 'Start'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Delete ${item.title}`}
                    title="Delete"
                    onClick={() => {
                      setDeleteError(null);
                      setToDelete(item);
                    }}
                  >
                    <Icon.Trash className="w-4 h-4 text-danger" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <div className="border-t border-line">
            <Pagination page={page} total={total} perPage={PAGE_SIZE} onChange={setPage} unit="practice exams" />
          </div>
        </div>
      )}

      <SmartPracticeModal open={creating} onClose={() => setCreating(false)} courses={courses} initialMode="RANDOM" />

      <Modal
        open={toDelete != null}
        onClose={() => !deleting && setToDelete(null)}
        title="Delete this practice exam?"
        size="sm"
        footer={
          <>
            <Button variant="outline" disabled={deleting} onClick={() => setToDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={deleting} disabled={deleting} icon={<Icon.Trash className="w-4 h-4" />} onClick={confirmDelete}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-base text-content-secondary leading-relaxed">
          <span className="font-semibold text-content">{toDelete?.title}</span> will be removed from this list. Attempts you already
          took are kept.
        </p>
        {deleteError && <p className="mt-3 text-sm text-danger">{deleteError}</p>}
      </Modal>
    </div>
  );
}
