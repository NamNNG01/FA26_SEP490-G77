import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Progress } from '@/components/ui/Progress';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';
import { Icon } from '@/assets/icons';
import { ROUTES, studentExamPath, studentTakeExamPath } from '@/app/routes';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  RUBRIC_TYPES,
  studentAttemptService,
  type AttemptHistoryItem,
  type AttemptResult,
  type ResultQuestion,
} from '@/services/studentAttempt.service';
import { LoadError, STUDENT_PAGE_CLASS, formatDateTime } from '../components/studentUi';
import { QUESTION_TYPE_LABEL, QuestionText, isAnswered, optionLetter } from '../components/QuestionAnswerInput';

/** While the AI grades, the result is re-read this often. */
const POLL_MS = 4_000;

/**
 * Rubric answers' gradingStatus (BE EssayGradingWorker): PENDING_AI waits for
 * the student to ask (SE-02) — the worker never starts on its own — then
 * QUEUED → GRADING → AI_GRADED, or FAILED (can be asked again).
 */
const GRADING_WAITING = 'PENDING_AI';
const GRADING_RUNNING: ReadonlySet<string> = new Set(['QUEUED', 'GRADING']);
const GRADING_FAILED = 'FAILED';

const isGradingOpen = (q: ResultQuestion) => q.gradingStatus === GRADING_WAITING || GRADING_RUNNING.has(q.gradingStatus ?? '');

type Outcome = 'correct' | 'incorrect' | 'unanswered' | 'pending';
type Filter = 'all' | Outcome;

const OUTCOME: Record<Outcome, { label: string; badge: 'success' | 'danger' | 'default' | 'warning'; icon: React.ReactNode }> = {
  correct: { label: 'Correct', badge: 'success', icon: <Icon.CheckCircle className="w-5 h-5 text-success" /> },
  incorrect: { label: 'Incorrect', badge: 'danger', icon: <Icon.XCircle className="w-5 h-5 text-danger" /> },
  unanswered: { label: 'Unanswered', badge: 'default', icon: <Icon.HelpCircle className="w-5 h-5 text-content-subtle" /> },
  pending: { label: 'Grading', badge: 'warning', icon: <Icon.Clock className="w-5 h-5 text-warning" /> },
};

function outcomeOf(q: ResultQuestion): Outcome {
  if (isGradingOpen(q)) return 'pending';
  if (!isAnswered(q.yourResponse)) return 'unanswered';
  if (q.isCorrect != null) return q.isCorrect ? 'correct' : 'incorrect';
  // Rubric answers carry points, not a verdict: full marks count as correct.
  if (q.scoreEarned != null && q.maxPoints != null) return Number(q.scoreEarned) >= Number(q.maxPoints) ? 'correct' : 'incorrect';
  return 'incorrect';
}

function num(v: number | null | undefined): string {
  return v == null ? '—' : String(Math.round(Number(v) * 100) / 100);
}

/**
 * Attempt review (SA-05) — reached from My Exams and right after submitting.
 * Two columns:
 *  - left: every question with its outcome, my answer, the correct answer
 *    and rubric feedback, always shown; only the explanation (cached, or
 *    generated on demand through SE-01) is collapsed;
 *  - right: a dropdown of my submitted attempts of this exam (SA-06, with
 *    their date), then the score, correct / incorrect counts and "Re-attempt".
 * `?examId=` alone opens the newest submitted attempt; `?attemptId=` picks one.
 * Essay / code / diagram answers: the page asks the AI to grade them (SE-02)
 * and shows a "grading" screen, polling until every answer is scored.
 */
export function StudentExamResultPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const attemptId = searchParams.get('attemptId');
  const examId = searchParams.get('examId');

  const [result, setResult] = useState<AttemptResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  /** Submitted attempts of the exam, newest first; null until loaded (or without examId). */
  const [attempts, setAttempts] = useState<AttemptHistoryItem[] | null>(null);

  useEffect(() => {
    if (!examId) return;
    let cancelled = false;
    studentAttemptService
      .getAllHistory(examId)
      .then(items => {
        if (cancelled) return;
        const submitted = items.filter(a => a.status !== 'IN_PROGRESS');
        setAttempts(submitted);
        if (!attemptId) {
          if (submitted.length > 0) setSearchParams({ examId, attemptId: String(submitted[0].attemptId) }, { replace: true });
          else {
            setError('You have no submitted attempt for this exam yet.');
            setLoading(false);
          }
        }
      })
      .catch(err => {
        if (cancelled) return;
        setAttempts([]);
        if (!attemptId) {
          setError(getApiErrorMessage(err, 'Failed to load your attempts.'));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // The list only depends on the exam; picking an attempt must not refetch it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  // Switching attempt: show the skeleton instead of the previous attempt's answers.
  useEffect(() => {
    setResult(null);
    setLoading(true);
    setFilter('all');
    setOpen(new Set());
  }, [attemptId]);

  useEffect(() => {
    if (!attemptId) {
      if (!examId) {
        setError('No attempt was selected.');
        setLoading(false);
      }
      return;
    }
    let cancelled = false;
    setError(null);
    studentAttemptService
      .getResult(attemptId)
      .then(res => {
        if (!cancelled) setResult({ ...res, questions: [...res.questions].sort((a, b) => a.orderIndex - b.orderIndex) });
      })
      .catch(err => {
        if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load the result.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attemptId, reload]);

  const outcomes = useMemo(() => (result?.questions ?? []).map(outcomeOf), [result]);
  const counts = useMemo(() => {
    const c: Record<Outcome, number> = { correct: 0, incorrect: 0, unanswered: 0, pending: 0 };
    outcomes.forEach(o => c[o]++);
    return c;
  }, [outcomes]);

  /* ── AI grading of essay / code / diagram answers ─────────────────────── */
  const [gradingError, setGradingError] = useState<string | null>(null);
  /** The student chose to see the result before the AI finished (or after it failed to start). */
  const [skipWait, setSkipWait] = useState(false);
  /** Attempts SE-02 was already sent for in this visit — never ask twice on our own. */
  const requestedRef = useRef<Set<number>>(new Set());

  const requestGrading = useCallback(async (id: number) => {
    requestedRef.current.add(id);
    setGradingError(null);
    try {
      await studentAttemptService.requestGrading(id);
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      // 409 NOTHING_TO_GRADE: already queued/graded elsewhere — just re-read.
      if (status !== 409) setGradingError(getApiErrorMessage(err, 'Could not start the AI grading.'));
    }
    setReload(r => r + 1);
  }, []);

  const waiting = result?.questions.some(q => q.gradingStatus === GRADING_WAITING) ?? false;
  const running = result?.questions.some(q => GRADING_RUNNING.has(q.gradingStatus ?? '')) ?? false;

  // Submitted with essay answers: ask the AI to grade them (once per attempt and visit).
  useEffect(() => {
    if (result && waiting && !requestedRef.current.has(result.attemptId)) requestGrading(result.attemptId);
  }, [result, waiting, requestGrading]);

  // Poll while the AI is working, until every answer is graded or failed.
  useEffect(() => {
    if (!running) return;
    const id = window.setTimeout(() => setReload(r => r + 1), POLL_MS);
    return () => window.clearTimeout(id);
  }, [running, result]);

  useEffect(() => {
    setSkipWait(false);
    setGradingError(null);
  }, [attemptId]);

  const breadcrumb = (
    <Breadcrumb
      items={[
        { label: 'My Exams', onClick: () => navigate(ROUTES.studentExams) },
        ...(examId ? [{ label: result?.examTitle ?? 'Exam', onClick: () => navigate(studentExamPath(examId)) }] : []),
        { label: 'Attempts' },
      ]}
    />
  );

  if (loading) {
    return (
      <div className={`${STUDENT_PAGE_CLASS} space-y-6`}>
        {breadcrumb}
        <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className={`${STUDENT_PAGE_CLASS} space-y-6`}>
        {breadcrumb}
        <LoadError message={error ?? 'Result not found.'} onRetry={() => setReload(r => r + 1)} />
      </div>
    );
  }

  if ((waiting || running) && !skipWait) {
    return (
      <div className={`${STUDENT_PAGE_CLASS} space-y-6`}>
        {breadcrumb}
        <GradingScreen
          result={result}
          error={gradingError}
          onRetry={() => requestGrading(result.attemptId)}
          onSkip={() => setSkipWait(true)}
        />
      </div>
    );
  }

  const failedCount = result.questions.filter(q => q.gradingStatus === GRADING_FAILED).length;

  const toggle = (questionId: number) =>
    setOpen(prev => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });

  const visible = result.questions.map((q, i) => ({ q, i, outcome: outcomes[i] })).filter(x => filter === 'all' || x.outcome === filter);
  const allOpen = visible.length > 0 && visible.every(x => open.has(x.q.questionId));

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: result.questions.length },
    { key: 'correct', label: 'Correct', count: counts.correct },
    { key: 'incorrect', label: 'Incorrect', count: counts.incorrect },
    { key: 'unanswered', label: 'Unanswered', count: counts.unanswered },
    { key: 'pending', label: 'Grading', count: counts.pending },
  ];

  return (
    <div className={`${STUDENT_PAGE_CLASS} space-y-[clamp(1.25rem,2.5vw,1.75rem)]`}>
      {breadcrumb}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-[clamp(1rem,2vw,1.5rem)] items-start">
        {/* Right column first on small screens: the score is the headline. */}
        <aside className="lg:order-2 lg:sticky lg:top-[10px]">
          <ScoreCard
            result={result}
            counts={counts}
            failedCount={failedCount}
            gradingError={gradingError}
            onRetryGrading={() => requestGrading(result.attemptId)}
            picker={
              attempts && attempts.length > 0 ? (
                <Select
                  label="Attempt"
                  options={attempts.map((a, i) => ({
                    value: String(a.attemptId),
                    label: `#${attempts.length - i} · ${formatDateTime(a.submittedAt ?? a.startTime)} · ${num(a.totalScore)}/${num(a.maxScore)}`,
                  }))}
                  value={String(result.attemptId)}
                  onChange={v => examId && setSearchParams({ examId, attemptId: v })}
                />
              ) : undefined
            }
            onReattempt={examId ? () => navigate(studentTakeExamPath(examId)) : undefined}
            onBack={examId ? () => navigate(studentExamPath(examId)) : () => navigate(ROUTES.studentExams)}
          />
        </aside>

        <section className="lg:order-1 space-y-3 min-w-0" aria-label="Questions">
          <div className="flex flex-wrap items-center gap-2">
            {filters
              .filter(f => f.key === 'all' || f.count > 0)
              .map(f => (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={filter === f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                    filter === f.key
                      ? 'bg-primary-light border-brand-600 text-brand-ink font-medium'
                      : 'border-line text-content-soft hover:bg-accent'
                  }`}
                >
                  {f.label} <span className="text-content-subtle">({f.count})</span>
                </button>
              ))}
            <button
              type="button"
              className="ml-auto text-sm text-brand-ink hover:underline"
              onClick={() => setOpen(allOpen ? new Set() : new Set(visible.map(x => x.q.questionId)))}
            >
              {allOpen ? 'Hide all explanations' : 'Show all explanations'}
            </button>
          </div>

          {visible.length === 0 ? (
            <div className="card px-5 py-10 text-center text-sm text-content-soft">No question in this filter.</div>
          ) : (
            visible.map(({ q, i, outcome }) => (
              <ResultQuestionCard
                key={q.questionId}
                attemptId={result.attemptId}
                question={q}
                index={i}
                outcome={outcome}
                explanationOpen={open.has(q.questionId)}
                onToggleExplanation={() => toggle(q.questionId)}
              />
            ))
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * Shown instead of the result while the AI grades the rubric answers: a
 * spinner with how many are done, re-read every few seconds by the page.
 * If grading could not start (e.g. 402 quota), offers retry or the
 * result without the AI scores.
 */
function GradingScreen({
  result,
  error,
  onRetry,
  onSkip,
}: {
  result: AttemptResult;
  error: string | null;
  onRetry: () => void;
  onSkip: () => void;
}) {
  const rubric = result.questions.filter(q => RUBRIC_TYPES.has(q.questionType) && q.gradingStatus !== 'AUTO');
  const done = rubric.filter(q => !isGradingOpen(q)).length;
  const total = Math.max(rubric.length, 1);
  return (
    <div className="card max-w-xl mx-auto px-[clamp(1.25rem,4vw,2.5rem)] py-12 flex flex-col items-center text-center gap-5" aria-live="polite">
      {error ? (
        <>
          <div className="w-14 h-14 rounded-full bg-danger-light flex items-center justify-center">
            <Icon.AlertCircle className="w-7 h-7 text-danger" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-bold text-content">AI grading could not start</h1>
            <p className="text-sm text-content-soft">{error}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button icon={<Icon.RefreshCw className="w-4 h-4" />} onClick={onRetry}>
              Try again
            </Button>
            <Button variant="outline" onClick={onSkip}>
              View result without AI scores
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="relative w-16 h-16 flex items-center justify-center">
            <Spinner size="lg" />
            <Icon.Brain className="absolute w-6 h-6 text-primary" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-bold text-content">AI is grading your answers…</h1>
            <p className="text-sm text-content-soft">
              {result.examTitle} — your written answers are being scored against the rubric. This usually takes under a minute.
            </p>
          </div>
          <div className="w-full max-w-xs space-y-1.5">
            <Progress value={(done / total) * 100} size="sm" />
            <p className="text-xs text-content-subtle">
              {done} / {rubric.length} answers graded
            </p>
          </div>
          <button type="button" onClick={onSkip} className="text-sm text-brand-ink hover:underline">
            Show the result now
          </button>
        </>
      )}
    </div>
  );
}

function ScoreCard({
  result,
  counts,
  picker,
  failedCount,
  gradingError,
  onRetryGrading,
  onReattempt,
  onBack,
}: {
  result: AttemptResult;
  counts: Record<Outcome, number>;
  /** Attempt dropdown, shown above the score. */
  picker?: React.ReactNode;
  /** Rubric answers the AI failed to grade (can be asked again). */
  failedCount: number;
  gradingError: string | null;
  onRetryGrading: () => void;
  onReattempt?: () => void;
  onBack: () => void;
}) {
  const max = result.maxScore != null ? Number(result.maxScore) : null;
  const score = result.totalScore != null ? Number(result.totalScore) : null;
  const pct = max && score != null ? Math.round((score / max) * 100) : null;
  const tone = pct == null ? 'text-content' : pct >= 80 ? 'text-success' : pct >= 50 ? 'text-warning' : 'text-danger';

  return (
    <div className="card p-5 space-y-5">
      <div>
        <h1 className="text-base font-semibold text-content break-words">{result.examTitle}</h1>
        <p className="text-xs text-content-subtle mt-0.5">Submitted {formatDateTime(result.submittedAt)}</p>
      </div>

      {picker}

      <p className="text-xs font-semibold text-content-subtle uppercase tracking-wide -mb-3">Your score</p>

      <div className="text-center">
        <p className={`text-[clamp(2.5rem,1.5rem+3vw,3.25rem)] font-black leading-none ${tone}`}>
          {num(score)}
          <span className="text-xl font-semibold text-content-subtle"> / {num(max)}</span>
        </p>
        {pct != null && <p className="text-sm text-content-soft mt-2">{pct}%</p>}
        {pct != null && (
          <div className="mt-3">
            <Progress value={pct} size="sm" />
          </div>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-2">
        {(
          [
            ['correct', counts.correct],
            ['incorrect', counts.incorrect],
            ['unanswered', counts.unanswered],
            ['pending', counts.pending],
          ] as [Outcome, number][]
        ).map(([k, v]) => (
          <div key={k} className="flex items-center gap-2 rounded-[10px] border border-line px-3 py-2.5">
            {OUTCOME[k].icon}
            <div className="flex flex-col-reverse">
              <dt className="text-xs text-content-subtle">{OUTCOME[k].label}</dt>
              <dd className="text-lg font-semibold text-content leading-tight">{v}</dd>
            </div>
          </div>
        ))}
      </dl>

      {(counts.pending > 0 || (result.pendingPoints != null && Number(result.pendingPoints) > 0)) && (
        <p className="flex items-start gap-2 text-xs text-warning">
          <Icon.Clock className="w-4 h-4 flex-shrink-0" />
          {num(result.pendingPoints)} points are still being graded by AI. This page refreshes on its own.
        </p>
      )}

      {(failedCount > 0 || gradingError) && (
        <div className="space-y-2 rounded-[10px] border border-danger-solid bg-danger-light p-3">
          <p className="flex items-start gap-2 text-xs text-danger">
            <Icon.AlertCircle className="w-4 h-4 flex-shrink-0" />
            {gradingError ?? `AI grading failed for ${failedCount} question${failedCount === 1 ? '' : 's'}.`}
          </p>
          <Button size="sm" variant="outline" icon={<Icon.RefreshCw className="w-4 h-4" />} onClick={onRetryGrading}>
            Retry AI grading
          </Button>
        </div>
      )}

      {result.autoSubmitted && <p className="text-xs text-content-subtle">Submitted automatically when time ran out.</p>}

      <div className="flex flex-col gap-2">
        {onReattempt && (
          <Button icon={<Icon.RefreshCw className="w-4 h-4" />} onClick={onReattempt}>
            Re-attempt
          </Button>
        )}
        <Button variant="outline" icon={<Icon.ChevronLeft className="w-4 h-4" />} onClick={onBack}>
          Back to exam
        </Button>
      </div>
    </div>
  );
}

function ResultQuestionCard({
  attemptId,
  question: q,
  index,
  outcome,
  explanationOpen,
  onToggleExplanation,
}: {
  attemptId: number;
  question: ResultQuestion;
  index: number;
  outcome: Outcome;
  explanationOpen: boolean;
  onToggleExplanation: () => void;
}) {
  return (
    <article className="card overflow-hidden">
      <header className="flex items-start gap-3 px-4 py-3.5">
        <span className="mt-0.5 flex-shrink-0">{OUTCOME[outcome].icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-content-subtle">
            Question {index + 1} · {QUESTION_TYPE_LABEL[q.questionType] ?? q.questionType}
          </p>
          <QuestionText content={q.content} className="text-sm text-content mt-0.5" />
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <Badge variant={OUTCOME[outcome].badge} size="sm">
            {OUTCOME[outcome].label}
          </Badge>
          <span className="text-xs text-content-subtle">
            {num(q.scoreEarned)} / {num(q.maxPoints)} pts
          </span>
        </div>
      </header>

      {/* Answers are always shown; only the explanation is collapsible. */}
      <div className="border-t border-line px-4 py-4 space-y-4">
        <AnswerReview question={q} />
        {q.gradingError && <p className="text-sm text-danger">Grading failed: {q.gradingError}</p>}
        {q.criteria && q.criteria.length > 0 && <CriteriaReview question={q} />}
        {q.overallFeedback && (
          <div>
            <p className="text-xs font-semibold text-content-subtle uppercase tracking-wide mb-1">Feedback</p>
            <p className="text-sm text-content-secondary whitespace-pre-line">{q.overallFeedback}</p>
          </div>
        )}
        <ExplanationBox attemptId={attemptId} question={q} open={explanationOpen} onToggle={onToggleExplanation} />
      </div>
    </article>
  );
}

function AnswerReview({ question: q }: { question: ResultQuestion }) {
  const r = q.yourResponse;
  const answered = isAnswered(r);

  if (q.options && (q.questionType === 'SINGLE_CHOICE' || q.questionType === 'MULTIPLE_CHOICE' || q.questionType === 'TRUE_FALSE')) {
    // Only what the student picked gets a filled row (green = right, red = wrong); a correct
    // option they did not pick is just outlined, so an unanswered question never looks answered.
    const picked = new Set(r?.selectedOptionIds ?? []);
    const multi = q.questionType === 'MULTIPLE_CHOICE';
    return (
      <div className="space-y-2">
        {!answered && (
          <p role="note" className="flex items-start gap-2 rounded-[10px] border border-warning-line bg-warning-light px-3 py-2 text-sm text-warning">
            <Icon.AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            You didn't answer this question — the correct answer is marked below.
          </p>
        )}
        <ul className="space-y-2">
          {q.options.map((opt, i) => {
            const mine = picked.has(opt.optionId);
            const right = opt.isCorrectAnswer === true;
            const cls = mine
              ? right
                ? 'border-success-solid bg-success-light'
                : 'border-danger-solid bg-danger-light'
              : right
                ? 'border-dashed border-success-solid bg-surface'
                : 'border-line bg-surface';
            return (
              <li key={opt.optionId} className={`flex items-start gap-3 p-3 rounded-[10px] border ${cls}`}>
                <SelectionMark multi={multi} checked={mine} />
                <span className="w-6 h-6 rounded-full bg-surface-muted text-xs font-bold text-content-secondary flex items-center justify-center flex-shrink-0">
                  {optionLetter(i)}
                </span>
                <span className="flex-1 text-sm text-content-secondary break-words">{opt.optionText}</span>
                <span className="flex flex-wrap justify-end gap-1 flex-shrink-0">
                  {mine &&
                    (right ? (
                      <Badge size="sm" variant="success">
                        <Icon.Check className="w-3 h-3" /> Your answer
                      </Badge>
                    ) : (
                      <Badge size="sm" variant="danger">
                        <Icon.X className="w-3 h-3" /> Your answer
                      </Badge>
                    ))}
                  {right && !mine && <span className="text-xs font-medium text-success">Correct answer</span>}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  if (q.questionType === 'ORDERING') return <OrderingReview question={q} />;
  if (q.questionType === 'MATCHING') return <MatchingReview question={q} />;
  if (q.questionType === 'FILL_BLANK') return <FillBlankReview question={q} />;

  return (
    <div>
      <p className="text-xs font-semibold text-content-subtle uppercase tracking-wide mb-1">Your answer</p>
      {!answered ? (
        <p className="text-sm text-content-subtle">You did not answer this question.</p>
      ) : q.questionType === 'DIAGRAM' ? (
        <p className="text-sm text-content-secondary">Diagram submitted ({(r?.drawioXml ?? '').length.toLocaleString()} characters of XML).</p>
      ) : (
        <pre
          className={`text-sm text-content-secondary whitespace-pre-wrap break-words rounded-[10px] bg-surface-alt border border-line p-3 max-h-80 overflow-y-auto ${
            q.questionType === 'CODE' ? 'font-mono' : 'font-sans'
          }`}
        >
          {r?.text}
        </pre>
      )}
    </div>
  );
}

/** Radio (single / true-false) or checkbox (multiple) showing what the student ticked, as on the take screen. */
function SelectionMark({ multi, checked }: { multi: boolean; checked: boolean }) {
  return (
    <span
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={checked}
      aria-disabled="true"
      aria-label={checked ? 'Selected' : 'Not selected'}
      className={`w-[18px] h-[18px] mt-[3px] flex items-center justify-center flex-shrink-0 border-2 ${
        multi ? 'rounded-[4px]' : 'rounded-full'
      } ${checked ? 'border-content-secondary bg-content-secondary' : 'border-content-subtle'}`}
    >
      {checked &&
        (multi ? (
          <Icon.Check className="w-3 h-3 text-surface" />
        ) : (
          <span className="block w-2 h-2 rounded-full bg-surface" />
        ))}
    </span>
  );
}

const same = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

/**
 * One line of a multi-part answer with its own verdict: ✓ / ✗, my value, and
 * the expected value next to it when wrong. `ok` null = no key to compare
 * (BE without `correctAnswer`), so the line is shown unmarked.
 */
function MarkedRow({
  ok,
  prefix,
  children,
  expected,
}: {
  ok: boolean | null;
  prefix: React.ReactNode;
  children: React.ReactNode;
  expected?: React.ReactNode;
}) {
  const cls = ok === true ? 'border-success-solid bg-success-light' : ok === false ? 'border-danger-solid bg-danger-light' : 'border-line bg-surface';
  return (
    <li className={`flex flex-wrap items-start gap-x-3 gap-y-1 p-3 rounded-[10px] border ${cls}`}>
      <span className="flex-shrink-0 mt-0.5" aria-label={ok === true ? 'Correct' : ok === false ? 'Incorrect' : undefined}>
        {ok === true ? (
          <Icon.CheckCircle className="w-4 h-4 text-success" />
        ) : ok === false ? (
          <Icon.XCircle className="w-4 h-4 text-danger" />
        ) : (
          <span className="block w-4 h-4" />
        )}
      </span>
      <span className="text-xs font-semibold text-content-subtle mt-0.5 flex-shrink-0">{prefix}</span>
      <span className="flex-1 min-w-[8rem] text-sm text-content-secondary break-words">{children}</span>
      {ok === false && expected != null && (
        <span className="w-full sm:w-auto pl-7 sm:pl-0 text-sm text-success-strong break-words">
          <span className="text-xs font-semibold uppercase tracking-wide text-content-subtle mr-1">Correct:</span>
          {expected}
        </span>
      )}
    </li>
  );
}

function ReviewHeading() {
  return <p className="text-xs font-semibold text-content-subtle uppercase tracking-wide mb-2">Your answer</p>;
}

const Missing = () => <span className="italic text-content-subtle">No answer</span>;

function OrderingReview({ question: q }: { question: ResultQuestion }) {
  const textOf = (id: number) => q.options?.find(o => o.optionId === id)?.optionText ?? `#${id}`;
  const mine = q.yourResponse?.orderedOptionIds ?? [];
  const key = q.correctAnswer?.orderedOptionIds ?? null;
  const rows = Math.max(mine.length, key?.length ?? 0);
  if (rows === 0) return <p className="text-sm text-content-subtle">You did not answer this question.</p>;
  return (
    <div>
      <ReviewHeading />
      <ol className="space-y-2">
        {Array.from({ length: rows }, (_, i) => {
          const given = mine[i];
          const expected = key?.[i];
          return (
            <MarkedRow
              key={i}
              ok={key ? given != null && given === expected : null}
              prefix={`${i + 1}.`}
              expected={expected != null ? textOf(expected) : undefined}
            >
              {given != null ? textOf(given) : <Missing />}
            </MarkedRow>
          );
        })}
      </ol>
    </div>
  );
}

function MatchingReview({ question: q }: { question: ResultQuestion }) {
  const given = new Map((q.yourResponse?.matches ?? []).map(m => [m.left.trim(), m.right]));
  const pairs = q.correctAnswer?.pairs ?? null;
  // With a key, list every left of the key (unmatched ones too); without one, only what was answered.
  const lefts = pairs ? pairs.map(p => p.left) : [...given.keys()];
  if (lefts.length === 0) return <p className="text-sm text-content-subtle">You did not answer this question.</p>;
  return (
    <div>
      <ReviewHeading />
      <ul className="space-y-2">
        {lefts.map(left => {
          const mine = given.get(left.trim());
          const expected = pairs?.find(p => same(p.left, left))?.right;
          return (
            <MarkedRow
              key={left}
              ok={pairs ? mine != null && same(mine, expected) : null}
              prefix={<span className="text-sm font-medium text-content normal-case">{left} →</span>}
              expected={expected}
            >
              {mine ?? <Missing />}
            </MarkedRow>
          );
        })}
      </ul>
    </div>
  );
}

function FillBlankReview({ question: q }: { question: ResultQuestion }) {
  const given = q.yourResponse?.blanks ?? {};
  const key = q.correctAnswer?.blanks ?? null;
  const indices = [...new Set([...Object.keys(key ?? {}), ...Object.keys(given)])].sort((a, b) => Number(a) - Number(b));
  if (indices.length === 0) return <p className="text-sm text-content-subtle">You did not answer this question.</p>;
  return (
    <div>
      <ReviewHeading />
      <ul className="space-y-2">
        {indices.map(n => {
          const mine = given[n];
          const accepted = key?.[n] ?? [];
          // Case-insensitive like the grader's default; a case-sensitive blank still gets the right
          // verdict when the whole question is correct.
          const ok = key ? q.isCorrect === true || (!!mine?.trim() && accepted.some(a => same(a, mine))) : null;
          return (
            <MarkedRow key={n} ok={ok} prefix={`(${n})`} expected={accepted.length ? accepted.join(' / ') : undefined}>
              {mine?.trim() ? mine : <Missing />}
            </MarkedRow>
          );
        })}
      </ul>
    </div>
  );
}

function CriteriaReview({ question: q }: { question: ResultQuestion }) {
  return (
    <div>
      <p className="text-xs font-semibold text-content-subtle uppercase tracking-wide mb-2">Rubric</p>
      <ul className="space-y-2">
        {q.criteria!.map(c => (
          <li key={c.criterionId} className="rounded-[10px] border border-line p-3">
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm font-medium text-content">{c.name}</span>
              <span className="text-sm font-semibold text-content-secondary flex-shrink-0">
                {num(c.points)} / {num(c.maxPoints)}
              </span>
            </div>
            {c.feedback && <p className="text-sm text-content-soft mt-1 whitespace-pre-line">{c.feedback}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Explanation, collapsed by default. Shows the SA-05 text when cached;
 * otherwise the student can ask the AI for one (SE-01).
 */
function ExplanationBox({
  attemptId,
  question: q,
  open,
  onToggle,
}: {
  attemptId: number;
  question: ResultQuestion;
  open: boolean;
  onToggle: () => void;
}) {
  const [text, setText] = useState<string | null>(q.explanation?.text ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Essay answers get rubric feedback instead.
  if (RUBRIC_TYPES.has(q.questionType) && !text) return null;

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await studentAttemptService.explain(attemptId, [q.questionId]);
      const item = res.items.find(x => x.questionId === q.questionId);
      if (item?.explanation) setText(item.explanation);
      else setError(item?.reason ? `No explanation available (${item.reason.replace(/_/g, ' ').toLowerCase()}).` : 'No explanation available.');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to get an explanation.'));
    } finally {
      setLoading(false);
    }
  };

  const panelId = `explanation-${q.questionId}`;
  return (
    <div className="rounded-[10px] bg-primary-light/60 border border-line">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 px-3 py-2.5 text-left text-xs font-semibold text-brand-ink uppercase tracking-wide"
      >
        <Icon.Lightbulb className="w-4 h-4" />
        {open ? 'Hide explanation' : 'Show explanation'}
        <Icon.ChevronDown className={`w-4 h-4 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div id={panelId} className="px-3 pb-3">
          {text ? (
            <p className="text-sm text-content-secondary whitespace-pre-line">{text}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-content-soft">No explanation yet.</p>
              <Button size="sm" variant="outline" loading={loading} icon={<Icon.Brain className="w-4 h-4" />} onClick={generate}>
                Explain with AI
              </Button>
              {error && <p className="w-full text-sm text-danger">{error}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
