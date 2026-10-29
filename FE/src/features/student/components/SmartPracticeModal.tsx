import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/assets/icons';
import { studentTakeExamPath } from '@/app/routes';
import type { MyCourse } from '@/services/studentCourse.service';
import {
  SMART_MINUTES,
  SMART_QUESTIONS,
  getAiError,
  studentAiService,
  type AiError,
  type CategoryAccuracy,
  type SmartPracticeStarted,
  type SmartPracticeStatus,
} from '@/services/studentAi.service';
import { AiErrorAlert, AiSparkle, accuracyTone } from './aiUi';

const DEFAULT_POLL_MS = 2000;

type Phase = 'form' | 'processing' | 'completed' | 'failed';

/**
 * Smart Practice (AI-01 + AI-02) — the AI picks questions from the student's weak modules.
 * The student only picks the course, question count and time; then the modal shows the
 * analysis from the 202 response, polls the job, and offers "Start practice" when the exam is ready.
 */
export function SmartPracticeModal({
  open,
  onClose,
  courses,
  initialCourseId,
}: {
  open: boolean;
  onClose: () => void;
  courses: MyCourse[];
  initialCourseId?: number | null;
}) {
  const navigate = useNavigate();
  const [courseId, setCourseId] = useState('');
  const [questionCount, setQuestionCount] = useState(String(SMART_QUESTIONS.default));
  const [minutes, setMinutes] = useState(String(SMART_MINUTES.default));
  const [touched, setTouched] = useState(false);

  const [phase, setPhase] = useState<Phase>('form');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AiError | null>(null);
  const [started, setStarted] = useState<SmartPracticeStarted | null>(null);
  const [result, setResult] = useState<SmartPracticeStatus | null>(null);
  const pollTimer = useRef<number | null>(null);
  /** Job being polled; a reply for any other job (or after close) is dropped. */
  const activeJob = useRef<string | null>(null);

  const stopPolling = () => {
    activeJob.current = null;
    if (pollTimer.current != null) window.clearTimeout(pollTimer.current);
    pollTimer.current = null;
  };

  // Fresh form each time the modal opens; stop polling when it closes.
  useEffect(() => {
    if (!open) {
      stopPolling();
      return;
    }
    const preset = initialCourseId != null && courses.some(c => c.courseId === initialCourseId) ? initialCourseId : courses[0]?.courseId;
    setCourseId(preset != null ? String(preset) : '');
    setQuestionCount(String(SMART_QUESTIONS.default));
    setMinutes(String(SMART_MINUTES.default));
    setTouched(false);
    setPhase('form');
    setBusy(false);
    setError(null);
    setStarted(null);
    setResult(null);
  }, [open, initialCourseId, courses]);

  useEffect(() => stopPolling, []);

  const poll = (jobId: string) => {
    studentAiService
      .getSmartPractice(jobId)
      .then(({ status, retryAfterMs }) => {
        if (activeJob.current !== jobId) return;
        if (status.status === 'PROCESSING') {
          pollTimer.current = window.setTimeout(() => poll(jobId), retryAfterMs ?? DEFAULT_POLL_MS);
          return;
        }
        setResult(status);
        setPhase(status.status === 'COMPLETED' && status.examId != null ? 'completed' : 'failed');
      })
      .catch(err => {
        if (activeJob.current !== jobId) return;
        setError(getAiError(err, 'Lost track of the smart practice job.'));
        setPhase('failed');
      });
  };

  const countNum = Number(questionCount);
  const minutesNum = Number(minutes);
  const errors = {
    course: courseId ? undefined : 'Select a course.',
    count:
      Number.isInteger(countNum) && countNum >= SMART_QUESTIONS.min && countNum <= SMART_QUESTIONS.max
        ? undefined
        : `Enter ${SMART_QUESTIONS.min} – ${SMART_QUESTIONS.max} questions.`,
    minutes:
      Number.isInteger(minutesNum) && minutesNum >= SMART_MINUTES.min && minutesNum <= SMART_MINUTES.max
        ? undefined
        : `Enter ${SMART_MINUTES.min} – ${SMART_MINUTES.max} minutes.`,
  };
  const invalid = Boolean(errors.course || errors.count || errors.minutes);

  const generate = async () => {
    setTouched(true);
    if (invalid) return;
    setBusy(true);
    setError(null);
    try {
      const job = await studentAiService.startSmartPractice({
        courseId: Number(courseId),
        questionCount: countNum,
        durationMinutes: minutesNum,
      });
      setStarted(job);
      setPhase('processing');
      activeJob.current = job.jobId;
      poll(job.jobId);
    } catch (err) {
      setError(getAiError(err, 'Failed to start the smart practice.'));
    } finally {
      setBusy(false);
    }
  };

  const backToForm = () => {
    stopPolling();
    setPhase('form');
    setError(null);
    setStarted(null);
    setResult(null);
  };

  const startPractice = () => {
    if (result?.examId == null) return;
    onClose();
    navigate(studentTakeExamPath(result.examId));
  };

  const footer =
    phase === 'form' ? (
      <Button
        loading={busy}
        disabled={busy || courses.length === 0 || (touched && invalid)}
        icon={<AiSparkle />}
        onClick={generate}
      >
        Generate
      </Button>
    ) : phase === 'completed' ? (
      <Button icon={<Icon.ChevronRight className="w-4 h-4" />} onClick={startPractice}>
        Start practice
      </Button>
    ) : phase === 'failed' ? (
      <Button variant="outline" icon={<Icon.RefreshCw className="w-4 h-4" />} onClick={backToForm}>
        Try again
      </Button>
    ) : null;

  return (
    <Modal open={open} onClose={onClose} title="Smart Practice" size="lg" footer={footer}>
      <div className="space-y-5">
        {phase === 'form' && (
          <>
            <p className="text-sm text-content-soft">
              The AI looks at the questions you got wrong in a course and builds a practice exam focused on your weak modules
              (about 70 % weak, 20 % medium, 10 % strong). You need at least 5 finished exams in the course.
            </p>
            {courses.length === 0 ? (
              <p className="text-sm text-content-soft">Enroll in a course first to get a smart practice.</p>
            ) : (
              <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                <div className="min-w-0 sm:col-span-2">
                  <Select
                    label="Course"
                    options={courses.map(c => ({ value: String(c.courseId), label: c.title }))}
                    value={courseId}
                    onChange={setCourseId}
                    error={touched ? errors.course : undefined}
                  />
                </div>
                <Input
                  label="Question Count"
                  type="number"
                  inputMode="numeric"
                  min={SMART_QUESTIONS.min}
                  max={SMART_QUESTIONS.max}
                  value={questionCount}
                  onChange={e => setQuestionCount(e.target.value)}
                  hint={`${SMART_QUESTIONS.min} – ${SMART_QUESTIONS.max}`}
                  error={touched ? errors.count : undefined}
                />
                <Input
                  label="Time Limit (minutes)"
                  type="number"
                  inputMode="numeric"
                  min={SMART_MINUTES.min}
                  max={SMART_MINUTES.max}
                  value={minutes}
                  onChange={e => setMinutes(e.target.value)}
                  hint={`${SMART_MINUTES.min} – ${SMART_MINUTES.max}`}
                  error={touched ? errors.minutes : undefined}
                />
              </div>
            )}
          </>
        )}

        {phase !== 'form' && started?.analysis && <AnalysisSummary analysis={started.analysis} />}

        {phase === 'processing' && (
          <div className="flex items-center gap-3 rounded-[10px] bg-primary-light px-4 py-3 text-sm text-brand-ink" role="status">
            <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full spinner" />
            The AI is picking your questions…
          </div>
        )}

        {phase === 'completed' && result && (
          <div className="space-y-3 rounded-[10px] border border-success-line bg-success-light px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-success-strong">
              <Icon.CheckCircle className="w-4 h-4" /> Your practice exam is ready
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-content-soft">
              {result.questionCount != null && <span>{result.questionCount} questions</span>}
              <span>{minutesNum} minutes</span>
              {result.estimatedDifficulty && <span>Difficulty: {result.estimatedDifficulty}</span>}
            </div>
            {result.focusAreas && result.focusAreas.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {result.focusAreas.map(a => (
                  <Badge key={a} size="sm" variant="info">
                    {a}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {phase === 'failed' && !error && (
          <Alert type="error" message="The AI could not build the practice exam. Your tokens were refunded — please try again." />
        )}

        {error && <AiErrorAlert error={error} />}
      </div>
    </Modal>
  );
}

function AnalysisSummary({ analysis }: { analysis: NonNullable<SmartPracticeStarted['analysis']> }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-content-soft">
        Based on <span className="font-semibold text-content">{analysis.totalAttempts}</span> finished exams:
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <CategoryList title="Focus on" items={analysis.weakCategories} empty="No weak modules found." />
        <CategoryList title="Already strong" items={analysis.strongCategories} empty="No strong modules yet." />
      </div>
    </div>
  );
}

function CategoryList({ title, items, empty }: { title: string; items: CategoryAccuracy[]; empty: string }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-content-subtle">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-content-subtle">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {items.map(c => (
            <li key={c.categoryId} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate text-content">{c.name}</span>
              <span className={`flex-shrink-0 font-semibold ${accuracyTone(c.accuracy).text}`}>{c.accuracy}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
