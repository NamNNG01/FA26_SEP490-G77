import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { Tabs } from '@/components/ui/Tabs';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/assets/icons';
import { studentTakeExamPath } from '@/app/routes';
import { getApiErrorMessage } from '@/utils/apiError';
import { studentCourseService, type MyCourse } from '@/services/studentCourse.service';
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
import {
  PRACTICE_MINUTES,
  PRACTICE_QUESTIONS,
  getPracticeError,
  studentPracticeExamService,
  type PracticeDifficulty,
  type PracticeExamType,
} from '@/services/studentPracticeExam.service';
import { AiErrorAlert, AiSparkle, accuracyTone } from './aiUi';
import { TakeModePicker } from './TakeModeModal';
import type { TakeAs } from '../examModes';

const DEFAULT_POLL_MS = 2000;

/** The AI tab is hidden for now: the modal opens on Random whatever `initialMode` asks. Flip to bring it back. */
const AI_ENABLED = false;

export type SmartPracticeMode = 'AI' | 'RANDOM';

const MODE_TABS: Record<SmartPracticeMode, string> = { AI: 'AI', RANDOM: 'Random' };
const MODE_BY_TAB: Record<string, SmartPracticeMode> = { AI: 'AI', Random: 'RANDOM' };

type Phase = 'form' | 'processing' | 'completed' | 'failed';

const EXAM_TYPE_OPTIONS: { value: PracticeExamType; label: string }[] = [
  { value: 'QUIZ', label: 'Quiz' },
  { value: 'ESSAY', label: 'Assessment' },
];

const DIFFICULTY_OPTIONS: { value: '' | PracticeDifficulty; label: string }[] = [
  { value: '', label: 'Any difficulty' },
  { value: 'EASY', label: 'Easy' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HARD', label: 'Hard' },
];

/** Free-text guidance the student gives the AI (sent as `context`). */
const AI_CONTEXT_MAX = 500;
/** Length of the practice exam name — the `title` column is VARCHAR(255). */
const TITLE_MAX = 255;

const limitsOf = (mode: SmartPracticeMode) =>
  mode === 'AI' ? { questions: SMART_QUESTIONS, minutes: SMART_MINUTES } : { questions: PRACTICE_QUESTIONS, minutes: PRACTICE_MINUTES };

/**
 * Create Practice Exam — a practice exam the student builds for one course. Two ways to pick the questions:
 *
 *  - AI (AI-01 + AI-02): the AI picks questions from the student's weak modules. The modal shows the
 *    analysis from the 202 response, polls the job, and offers "Start practice" when the exam is ready.
 *  - Random (PQ-01): random PUBLISHED questions of the course, optionally filtered by module and
 *    difficulty. The exam is created at once and the student goes straight to it.
 *
 * Both open the take screen in practice mode (each answer can be checked right away).
 * `lockCourse` (course detail page) fixes the course to `initialCourseId` and hides the course picker.
 */
export function SmartPracticeModal({
  open,
  onClose,
  courses,
  initialCourseId,
  initialMode = 'AI',
  lockCourse = false,
}: {
  open: boolean;
  onClose: () => void;
  courses: Pick<MyCourse, 'courseId' | 'title'>[];
  initialCourseId?: number | null;
  initialMode?: SmartPracticeMode;
  lockCourse?: boolean;
}) {
  const navigate = useNavigate();
  const startMode: SmartPracticeMode = AI_ENABLED ? initialMode : 'RANDOM';
  const [mode, setMode] = useState<SmartPracticeMode>(startMode);
  /** Random: take the new exam as an Exam (timed) or as Practice (each answer checked at once). */
  const [takeAs, setTakeAs] = useState<TakeAs>('PRACTICE');
  const [minutes, setMinutes] = useState(String(PRACTICE_MINUTES.default));
  const [courseId, setCourseId] = useState('');
  const [title, setTitle] = useState('');
  const [questionCount, setQuestionCount] = useState('');
  const [touched, setTouched] = useState(false);
  // AI only
  const [aiContext, setAiContext] = useState('');

  // Random only
  const [examType, setExamType] = useState<PracticeExamType>('QUIZ');
  const [difficulty, setDifficulty] = useState<'' | PracticeDifficulty>('');
  const [moduleIds, setModuleIds] = useState<string[]>([]);
  const [modules, setModules] = useState<{ value: string; label: string }[]>([]);
  const [modulesError, setModulesError] = useState<string | null>(null);
  const [loadingModules, setLoadingModules] = useState(false);
  const [randomError, setRandomError] = useState<string | null>(null);

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

  const resetCounts = (m: SmartPracticeMode) => {
    // Both tabs start empty: the student types the count, "Max …" is only the placeholder.
    setQuestionCount('');
  };

  // Fresh form each time the modal opens; stop polling when it closes.
  useEffect(() => {
    if (!open) {
      stopPolling();
      return;
    }
    const preset = initialCourseId != null && courses.some(c => c.courseId === initialCourseId) ? initialCourseId : courses[0]?.courseId;
    setCourseId(preset != null ? String(preset) : '');
    setMode(startMode);
    setTakeAs('PRACTICE');
    setMinutes(String(PRACTICE_MINUTES.default));
    setTitle('');
    resetCounts(startMode);
    setExamType('QUIZ');
    setDifficulty('');
    setModuleIds([]);
    setAiContext('');
    setTouched(false);
    setPhase('form');
    setBusy(false);
    setError(null);
    setRandomError(null);
    setStarted(null);
    setResult(null);
  }, [open, initialCourseId, startMode, courses]);

  useEffect(() => stopPolling, []);

  // Modules of the course — the "category" filter of PQ-01.
  useEffect(() => {
    setModuleIds([]);
    setModules([]);
    setModulesError(null);
    if (!open || mode !== 'RANDOM' || !courseId) return;
    let cancelled = false;
    setLoadingModules(true);
    studentCourseService
      .getCourseDetail(Number(courseId))
      .then(d => {
        if (cancelled) return;
        setModules(
          [...(d.modules ?? [])].sort((a, b) => a.orderIndex - b.orderIndex).map(m => ({ value: String(m.moduleId), label: m.title })),
        );
      })
      .catch(err => {
        if (!cancelled) setModulesError(getApiErrorMessage(err, 'Failed to load the modules.'));
      })
      .finally(() => {
        if (!cancelled) setLoadingModules(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, mode, courseId]);

  const changeMode = (m: SmartPracticeMode) => {
    if (m === mode) return;
    setMode(m);
    resetCounts(m);
    setTouched(false);
    setError(null);
    setRandomError(null);
  };

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
        setError(getAiError(err, 'Lost track of the practice exam job.'));
        setPhase('failed');
      });
  };

  const limits = limitsOf(mode);
  const countNum = Number(questionCount);
  // Practice is untimed: the student sets no limit, the BE (which still wants one) gets the longest it allows.
  // Taken as an exam, the student's duration is the timer.
  const timedRandom = mode === 'RANDOM' && takeAs === 'EXAM';
  const minutesNum = timedRandom ? Number(minutes) : limits.minutes.max;
  const errors = {
    minutes:
      !timedRandom || (Number.isInteger(minutesNum) && minutesNum >= limits.minutes.min && minutesNum <= limits.minutes.max)
        ? undefined
        : `Enter ${limits.minutes.min} – ${limits.minutes.max} minutes.`,
    title: title.trim() ? undefined : 'Enter a name for the practice exam.',
    course: courseId ? undefined : 'Select a course.',
    count: !questionCount.trim()
      ? 'Enter the number of questions.'
      : Number.isInteger(countNum) && countNum >= limits.questions.min && countNum <= limits.questions.max
        ? undefined
        : mode === 'RANDOM'
          ? `Enter at most ${limits.questions.max} questions.`
          : `Enter ${limits.questions.min} – ${limits.questions.max} questions.`,
  };
  const invalid = Boolean(errors.title || errors.course || errors.count || errors.minutes);

  const generateAi = async () => {
    setBusy(true);
    setError(null);
    try {
      const job = await studentAiService.startSmartPractice({
        courseId: Number(courseId),
        questionCount: countNum,
        durationMinutes: minutesNum,
        context: aiContext.trim() || undefined,
        title: title.trim(),
      });
      setStarted(job);
      setPhase('processing');
      activeJob.current = job.jobId;
      poll(job.jobId);
    } catch (err) {
      setError(getAiError(err, 'Failed to start the practice exam.'));
    } finally {
      setBusy(false);
    }
  };

  const generateRandom = async () => {
    setBusy(true);
    setRandomError(null);
    try {
      const created = await studentPracticeExamService.create({
        courseId: Number(courseId),
        questionCount: countNum,
        durationMinutes: minutesNum,
        examType,
        categoryIds: moduleIds.length > 0 ? moduleIds.map(Number) : undefined,
        difficulty: difficulty || undefined,
        title: title.trim(),
        mode: takeAs,
      });
      onClose();
      navigate(studentTakeExamPath(created.examId, takeAs));
    } catch (err) {
      setRandomError(getPracticeError(err, 'Failed to create the practice exam.'));
      setBusy(false);
    }
  };

  const generate = () => {
    setTouched(true);
    if (invalid) return;
    if (mode === 'AI') generateAi();
    else generateRandom();
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
        icon={mode === 'AI' ? <AiSparkle /> : <Icon.Zap className="w-4 h-4" />}
        onClick={generate}
      >
        {mode === 'AI' ? 'Generate' : 'Generate and Start'}
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
    <Modal open={open} onClose={() => !busy && onClose()} title="Create Practice Exam" size="lg" footer={footer}
      error={mode === 'RANDOM' ? randomError && <Alert type="error" message={randomError} /> : error && <AiErrorAlert error={error} />}>
      <div className="space-y-5">
        {phase === 'form' && (
          <>
            {AI_ENABLED && (
              <div className="flex flex-wrap items-center gap-3">
                <Tabs tabs={Object.values(MODE_TABS)} active={MODE_TABS[mode]} onChange={t => changeMode(MODE_BY_TAB[t])} />
              </div>
            )}
            <p className="text-sm text-content-soft">
              {mode === 'AI'
                ? 'The AI looks at the questions you got wrong in a course and builds a practice exam focused on your weak modules (about 70 % weak, 20 % medium, 10 % strong). You need at least 5 finished exams in the course.'
                : 'Random questions from the course question bank. Narrow them down by module and difficulty if you like. Practice exams do not count towards your course progress.'}
            </p>
            {courses.length === 0 ? (
              <p className="text-sm text-content-soft">Enroll in a course first to create a practice exam.</p>
            ) : (
              <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                <div className="min-w-0 sm:col-span-2">
                  <Input
                    label="Name"
                    required
                    maxLength={TITLE_MAX}
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Chapter 3 review"
                    error={touched ? errors.title : undefined}
                  />
                </div>
                {!lockCourse && (
                  <div className="min-w-0 sm:col-span-2">
                    <Select
                      label="Course"
                      options={courses.map(c => ({ value: String(c.courseId), label: c.title }))}
                      value={courseId}
                      onChange={setCourseId}
                      error={touched ? errors.course : undefined}
                    />
                  </div>
                )}
                <div className="min-w-0 sm:col-span-2">
                  <Input
                    label="Question Count"
                    type="number"
                    inputMode="numeric"
                    min={limits.questions.min}
                    max={limits.questions.max}
                    value={questionCount}
                    onChange={e => setQuestionCount(e.target.value)}
                    // The maximum is shown as the placeholder rather than a hint.
                    placeholder={`Max ${limits.questions.max}`}
                    error={touched ? errors.count : undefined}
                  />
                </div>
                {mode === 'AI' && (
                  <label className="min-w-0 flex flex-col gap-1.5 sm:col-span-2">
                    <span className="text-sm font-medium text-content-secondary">Context for the AI (optional)</span>
                    <textarea
                      rows={3}
                      maxLength={AI_CONTEXT_MAX}
                      value={aiContext}
                      onChange={e => setAiContext(e.target.value)}
                      placeholder="e.g. Focus on chapter 3, I keep mixing up joins and subqueries. More scenario-based questions please."
                      className="w-full rounded-[10px] border border-line bg-surface p-3 text-sm text-content placeholder:text-content-subtle focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
                    />
                    <span className="flex justify-between gap-2 text-xs text-content-subtle">
                      <span>Tell the AI what to focus on, what you struggle with or the kind of questions you want.</span>
                      <span className="flex-shrink-0">
                        {aiContext.length}/{AI_CONTEXT_MAX}
                      </span>
                    </span>
                  </label>
                )}
                {mode === 'RANDOM' && (
                  <>
                    <div className="min-w-0 space-y-1.5 sm:col-span-2">
                      <span className="block text-sm font-medium text-content-secondary">Take as</span>
                      <TakeModePicker value={takeAs} onChange={setTakeAs} />
                    </div>
                    {takeAs === 'EXAM' && (
                      <div className="min-w-0 sm:col-span-2">
                        <Input
                          label="Duration (minutes)"
                          type="number"
                          inputMode="numeric"
                          min={limits.minutes.min}
                          max={limits.minutes.max}
                          value={minutes}
                          onChange={e => setMinutes(e.target.value)}
                          error={touched ? errors.minutes : undefined}
                        />
                      </div>
                    )}
                    <Select
                      label="Exam Type"
                      options={EXAM_TYPE_OPTIONS}
                      value={examType}
                      onChange={v => setExamType(v as PracticeExamType)}
                    />
                    <Select
                      label="Difficulty"
                      options={DIFFICULTY_OPTIONS}
                      value={difficulty}
                      onChange={v => setDifficulty(v as '' | PracticeDifficulty)}
                    />
                    <div className="min-w-0 space-y-1.5 sm:col-span-2">
                      <MultiSelect
                        label="Modules (optional)"
                        placeholder={loadingModules ? 'Loading modules…' : modules.length === 0 ? 'No module in this course' : 'All modules'}
                        options={modules}
                        value={moduleIds}
                        onChange={setModuleIds}
                        disabled={loadingModules || modules.length === 0}
                      />
                      {modulesError ? (
                        <p className="text-xs text-danger">{modulesError}</p>
                      ) : (
                        <p className="text-xs text-content-subtle">Leave empty to draw from every module of the course.</p>
                      )}
                    </div>
                  </>
                )}
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
