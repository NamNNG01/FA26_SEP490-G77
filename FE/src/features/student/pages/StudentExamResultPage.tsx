import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Progress } from '@/components/ui/Progress';
import { Modal } from '@/components/ui/Modal';
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
import { EmptyState } from '@/components/ui/Card';
import { LoadError, STUDENT_PAGE_CLASS, formatDateTime } from '../components/studentUi';
import { QUESTION_TYPE_LABEL, QuestionText, isAnswered, optionLetter } from '../components/QuestionAnswerInput';
import { useDrawioSnapshot } from '@/features/question/components/useDrawioSnapshot';
import { SAVABLE_QUESTION_TYPES } from '@/services/studentDeck.service';
import { SaveToFlashcardsModal } from '../components/flashcards/SaveToFlashcardsModal';
import { studentCodeExamService, type CodeLanguageInfo, type CodeSubmission } from '@/services/studentCodeExam.service';
import { CodeSubmissionHistory, CodeTestCaseStatus, latestSubmissionBefore } from '../components/code/CodeSubmissionHistory';

/** FC-12 needs the attempt submitted (or completed). */
const SAVABLE_ATTEMPT_STATUSES: ReadonlySet<string> = new Set(['SUBMITTED', 'COMPLETED']);

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

type Outcome = 'correct' | 'incorrect' | 'graded' | 'unanswered' | 'pending';

const OUTCOME: Record<Outcome, { label: string; badge: 'success' | 'danger' | 'info' | 'default' | 'warning'; icon: React.ReactNode }> = {
  correct: { label: 'Correct', badge: 'success', icon: <Icon.CheckCircle className="w-5 h-5 text-success" /> },
  incorrect: { label: 'Incorrect', badge: 'danger', icon: <Icon.XCircle className="w-5 h-5 text-danger" /> },
  graded: { label: 'Graded', badge: 'info', icon: <Icon.Award className="w-5 h-5 text-primary" /> },
  unanswered: { label: 'Unanswered', badge: 'default', icon: <Icon.HelpCircle className="w-5 h-5 text-content-subtle" /> },
  pending: { label: 'Not graded', badge: 'warning', icon: <Icon.Clock className="w-5 h-5 text-warning" /> },
};

function outcomeOf(q: ResultQuestion): Outcome {
  if (isGradingOpen(q)) return 'pending';
  if (!isAnswered(q.yourResponse)) return 'unanswered';
  // Essay / code / diagram answers carry rubric points, not a right/wrong verdict.
  if (RUBRIC_TYPES.has(q.questionType)) return 'graded';
  if (q.isCorrect != null) return q.isCorrect ? 'correct' : 'incorrect';
  if (q.scoreEarned != null && q.maxPoints != null) return Number(q.scoreEarned) >= Number(q.maxPoints) ? 'correct' : 'incorrect';
  return 'incorrect';
}

/** Rubric answers get rubric feedback, not an explanation. */
const hasExplanation = (q: ResultQuestion) => !RUBRIC_TYPES.has(q.questionType);

/** SE-01 takes at most 20 question ids per call. */
const EXPLAIN_BATCH = 20;

/** Palette cell per outcome — solid fills, so the status reads at a glance in both themes. */
const PALETTE_CELL: Record<Outcome, string> = {
  correct: 'bg-success-solid text-white',
  incorrect: 'bg-danger-solid text-white',
  graded: 'bg-brand-600 text-white',
  unanswered: 'bg-content-subtle text-white',
  pending: 'bg-highlight text-brand-950',
};

/** Score colour: green ≥ 80 %, amber ≥ 50 %, red below. */
const toneOf = (pct: number | null) => (pct == null ? 'text-content' : pct >= 80 ? 'text-success' : pct >= 50 ? 'text-warning' : 'text-danger');
const barColorOf = (pct: number | null) =>
  pct == null ? 'var(--color-primary)' : pct >= 80 ? 'var(--color-success-solid)' : pct >= 50 ? 'var(--color-warning)' : 'var(--color-danger-solid)';
const pctOf = (earned: number | null | undefined, max: number | null | undefined) =>
  max != null && Number(max) > 0 && earned != null ? Math.round((Number(earned) / Number(max)) * 100) : null;

/** Score of one module of the exam (questions carrying its moduleId). */
interface ModuleScore {
  key: string;
  name: string;
  earned: number;
  max: number;
  /** Questions of the module still waiting for the AI. */
  pending: number;
  /** Index of its first question, to jump to. */
  first: number;
}

/** Per-module scores, or [] when SA-05 sends no module or the exam covers only one. */
function moduleScores(questions: ResultQuestion[], outcomes: Outcome[]): ModuleScore[] {
  const byKey = new Map<string, ModuleScore>();
  questions.forEach((q, i) => {
    if (q.moduleId == null && !q.moduleName) return;
    const key = String(q.moduleId ?? q.moduleName);
    const m = byKey.get(key) ?? { key, name: q.moduleName || `Module ${q.moduleId}`, earned: 0, max: 0, pending: 0, first: i };
    m.max += Number(q.maxPoints ?? 0);
    if (outcomes[i] === 'pending') m.pending++;
    else m.earned += Number(q.scoreEarned ?? 0);
    byKey.set(key, m);
  });
  return byKey.size >= 2 ? [...byKey.values()] : [];
}

/** Typing in a field (or a picker) keeps its arrow keys. */
const isTypingTarget = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.getAttribute('role') === 'combobox');

interface ExplanationState {
  text: string | null;
  loading: boolean;
  error: string | null;
}

const sortResult = (res: AttemptResult): AttemptResult => ({
  ...res,
  questions: [...res.questions].sort((a, b) => a.orderIndex - b.orderIndex),
});

function num(v: number | null | undefined): string {
  return v == null ? '—' : String(Math.round(Number(v) * 100) / 100);
}

/**
 * Attempt review (SA-05) — reached from My Exams and right after submitting.
 * A header with a dropdown of my submitted attempts of this exam
 * (SA-06, with their date), the score (per module when the exam spans
 * several), "Re-attempt" and "Back"; below it two columns:
 *  - left: one question at a time (`?q=` 1-based, so a refresh or a shared
 *    link keeps it) with its outcome, my answer, the correct answer and rubric
 *    feedback; Previous / Next and ← → move through it. Only the explanation
 *    is collapsed — opening it shows the cached text or asks the AI right away
 *    (SE-01). Essay / code / diagram questions have no explanation and show
 *    the answer beside its rubric grade;
 *  - right, level with the question: a palette of every question coloured
 *    by outcome — a click opens that question.
 * `?examId=` alone opens the newest submitted attempt; `?attemptId=` picks one.
 * Essay / code / diagram answers: the attempt lands here SUBMITTED with its
 * rubric answers ungraded. "Grade with AI" asks the AI (SE-02) and opens a
 * "grading" modal, polling until every answer is scored.
 */
export function StudentExamResultPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const attemptId = searchParams.get('attemptId');
  const examId = searchParams.get('examId');
  /** SA-06 answered 403: the course was left (EN-04), so none of its attempts are shown. */
  const [notEnrolled, setNotEnrolled] = useState(false);

  const [result, setResult] = useState<AttemptResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  /** Explanations asked from the AI in this visit, by questionId. */
  const [explanations, setExplanations] = useState<Record<number, ExplanationState>>({});
  const explanationsRef = useRef(explanations);
  explanationsRef.current = explanations;
  const attemptIdRef = useRef(attemptId);
  attemptIdRef.current = attemptId;
  /** Submitted attempts of the exam, newest first; null until loaded (or without examId). */
  const [attempts, setAttempts] = useState<AttemptHistoryItem[] | null>(null);
  /** Previous / Next of the question on screen, for the ← → keys (set every render). */
  const navRef = useRef<{ prev?: () => void; next?: () => void }>({});
  const questionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || isTypingTarget(e.target)) return;
      // A dialog on top (grading) owns the keyboard.
      if (document.querySelector('[role="dialog"]')) return;
      const go = e.key === 'ArrowLeft' ? navRef.current.prev : e.key === 'ArrowRight' ? navRef.current.next : undefined;
      if (!go) return;
      e.preventDefault();
      go();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
        if ((err as { response?: { status?: number } })?.response?.status === 403) {
          setNotEnrolled(true);
          setLoading(false);
          return;
        }
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

  /** CD-07 of the exam (every attempt) and CD-06; null until loaded, or when the exam has no CODE question / they failed. */
  const [codeSubs, setCodeSubs] = useState<CodeSubmission[] | null>(null);
  const [codeLanguages, setCodeLanguages] = useState<CodeLanguageInfo[]>([]);
  const resultHasCode = Boolean(result?.questions.some(x => x.questionType === 'CODE'));
  useEffect(() => {
    if (!examId || !resultHasCode) return;
    let cancelled = false;
    Promise.allSettled([studentCodeExamService.getAllSubmissions(examId), studentCodeExamService.getLanguages()]).then(([subs, langs]) => {
      if (cancelled) return;
      setCodeSubs(subs.status === 'fulfilled' ? subs.value : null);
      if (langs.status === 'fulfilled') setCodeLanguages(langs.value);
    });
    return () => {
      cancelled = true;
    };
  }, [examId, resultHasCode]);

  /** Questions to save as flashcards (modal open while set). */
  const [saveQuestions, setSaveQuestions] = useState<number[] | null>(null);
  /** Questions saved to a deck in this visit, for the "Saved" mark. */
  const [savedIds, setSavedIds] = useState<Set<number>>(() => new Set());

  // Switching attempt: show the skeleton instead of the previous attempt's answers.
  useEffect(() => {
    setSavedIds(new Set());
    setResult(null);
    setLoading(true);
    setOpen(new Set());
    explanationsRef.current = {};
    setExplanations({});
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
        if (!cancelled) setResult(sortResult(res));
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
    const c: Record<Outcome, number> = { correct: 0, incorrect: 0, graded: 0, unanswered: 0, pending: 0 };
    outcomes.forEach(o => c[o]++);
    return c;
  }, [outcomes]);

  /* ── AI grading of essay / code / diagram answers ─────────────────────── */
  const [gradingError, setGradingError] = useState<string | null>(null);
  /** SE-02 sent and the result not re-read yet. */
  const [requesting, setRequesting] = useState(false);
  /** The student asked for grading in this visit — keeps the modal up to show a start error. */
  const [gradingAsked, setGradingAsked] = useState(false);
  /** The student closed the grading modal; the AI keeps going and the page keeps polling. */
  const [dismissed, setDismissed] = useState(false);

  const requestGrading = useCallback(async (id: number) => {
    setGradingError(null);
    setGradingAsked(true);
    setDismissed(false);
    setRequesting(true);
    try {
      await studentAttemptService.requestGrading(id);
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      // 409 NOTHING_TO_GRADE: already queued/graded elsewhere — just re-read.
      if (status !== 409) setGradingError(getApiErrorMessage(err, 'Could not start the AI grading.'));
    }
    // Re-read before dropping `requesting`, so the modal doesn't blink shut in between.
    try {
      const res = await studentAttemptService.getResult(id);
      if (attemptIdRef.current === String(id)) setResult(sortResult(res));
    } catch {
      setReload(r => r + 1);
    }
    setRequesting(false);
  }, []);

  const waiting = result?.questions.some(q => q.gradingStatus === GRADING_WAITING) ?? false;
  const running = result?.questions.some(q => GRADING_RUNNING.has(q.gradingStatus ?? '')) ?? false;
  const showGrading = !dismissed && (requesting || running || (gradingAsked && gradingError != null));

  // Poll while the AI is working, until every answer is graded or failed.
  useEffect(() => {
    if (!running) return;
    const id = window.setTimeout(() => setReload(r => r + 1), POLL_MS);
    return () => window.clearTimeout(id);
  }, [running, result]);

  useEffect(() => {
    setDismissed(false);
    setGradingAsked(false);
    setGradingError(null);
  }, [attemptId]);

  /* ── Explanations: opening one asks the AI straight away (SE-01) ──────── */
  const loadExplanations = useCallback(
    async (questionIds: number[]) => {
      if (!result) return;
      const forAttempt = String(result.attemptId);
      const need = questionIds.filter(id => {
        const q = result.questions.find(x => x.questionId === id);
        const e = explanationsRef.current[id];
        return q != null && hasExplanation(q) && !q.explanation?.text && !e?.text && !e?.loading;
      });
      if (need.length === 0) return;
      const patch = (entries: [number, ExplanationState][]) => {
        // The student may have switched attempt meanwhile — drop the stale answer.
        if (attemptIdRef.current !== forAttempt) return;
        explanationsRef.current = { ...explanationsRef.current, ...Object.fromEntries(entries) };
        setExplanations(explanationsRef.current);
      };
      patch(need.map(id => [id, { text: null, loading: true, error: null }]));
      const chunks: number[][] = [];
      for (let i = 0; i < need.length; i += EXPLAIN_BATCH) chunks.push(need.slice(i, i + EXPLAIN_BATCH));
      await Promise.all(
        chunks.map(async chunk => {
          try {
            const res = await studentAttemptService.explain(result.attemptId, chunk);
            patch(
              chunk.map(id => {
                const item = res.items.find(x => x.questionId === id);
                if (item?.explanation) return [id, { text: item.explanation, loading: false, error: null }];
                const error = item?.reason
                  ? `No explanation available (${item.reason.replace(/_/g, ' ').toLowerCase()}).`
                  : 'No explanation available.';
                return [id, { text: null, loading: false, error }];
              }),
            );
          } catch (err) {
            const error = getApiErrorMessage(err, 'Failed to get an explanation.');
            patch(chunk.map(id => [id, { text: null, loading: false, error }]));
          }
        }),
      );
    },
    [result],
  );

  const breadcrumb = (
    <Breadcrumb
      items={[
        { label: 'My Exams', onClick: () => navigate(ROUTES.studentExams) },
        ...(examId && !notEnrolled ? [{ label: result?.examTitle ?? 'Exam', onClick: () => navigate(studentExamPath(examId)) }] : []),
        { label: 'Attempts' },
      ]}
    />
  );

  // Checked first: SA-05 may still answer for one attempt, but a left course shows nothing.
  if (notEnrolled) {
    return (
      <div className={`${STUDENT_PAGE_CLASS} space-y-6`}>
        {breadcrumb}
        <div className="card">
          <EmptyState
            icon={<Icon.Lock className="w-7 h-7" />}
            title="Attempts not available"
            message="You are no longer enrolled in the course of this exam, so its attempts and results are closed."
            action={<Button onClick={() => navigate(ROUTES.studentExams)}>Back to My Exams</Button>}
          />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`${STUDENT_PAGE_CLASS} space-y-6`}>
        {breadcrumb}
        <Skeleton className="h-32 w-full" />
        <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-6">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-56 w-full" />
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

  const failedCount = result.questions.filter(q => q.gradingStatus === GRADING_FAILED).length;
  const total = result.questions.length;

  const toggle = (questionId: number) => {
    const opening = !open.has(questionId);
    setOpen(prev => {
      const next = new Set(prev);
      if (opening) next.add(questionId);
      else next.delete(questionId);
      return next;
    });
    if (opening) loadExplanations([questionId]);
  };

  const qParam = Number(searchParams.get('q'));
  const current = total === 0 ? 0 : Number.isInteger(qParam) && qParam >= 1 ? Math.min(qParam, total) - 1 : 0;
  const prevIndex = current > 0 ? current - 1 : undefined;
  const nextIndex = current < total - 1 ? current + 1 : undefined;

  const goTo = (index: number) => {
    // replace: walking through 40 questions must not fill the Back button's history.
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.set('q', String(index + 1));
        return next;
      },
      { replace: true },
    );
    // From the bottom of a long answer, bring the next question's top into view.
    const top = questionRef.current?.getBoundingClientRect().top;
    if (top != null && top < 0) questionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  navRef.current = {
    prev: prevIndex != null ? () => goTo(prevIndex) : undefined,
    next: nextIndex != null ? () => goTo(nextIndex) : undefined,
  };

  const modules = moduleScores(result.questions, outcomes);
  const q = result.questions[current];
  const canSave = SAVABLE_ATTEMPT_STATUSES.has(result.status);
  const savableIds = canSave ? result.questions.filter(x => SAVABLE_QUESTION_TYPES.has(x.questionType)).map(x => x.questionId) : [];

  return (
    <div className={`${STUDENT_PAGE_CLASS} space-y-[clamp(1.25rem,2.5vw,1.75rem)]`}>
      {breadcrumb}

      {/* The score is the headline: a full-width header above the question and its navigator. */}
      <ScoreCard
            result={result}
            counts={counts}
            modules={modules}
            onOpenModule={goTo}
            failedCount={failedCount}
            gradingError={gradingError}
            waitingForGrading={waiting && !running}
            grading={requesting || running}
            onRequestGrading={() => requestGrading(result.attemptId)}
            picker={
              attempts && attempts.length > 0 ? (
                <Select
                  label="Attempt"
                  maxVisibleOptions={5}
                  options={attempts.map((a, i) => ({
                    value: String(a.attemptId),
                    // Written answers still ungraded: a "0/100" would read as a real score.
                    label: `#${attempts.length - i} · ${formatDateTime(a.submittedAt ?? a.startTime)} · ${
                      Number(a.pendingPoints ?? 0) > 0 ? 'Not graded' : `${num(a.totalScore)}/${num(a.maxScore)}`
                    }`,
                  }))}
                  value={String(result.attemptId)}
                  onChange={v => examId && setSearchParams({ examId, attemptId: v })}
                />
              ) : undefined
            }
            onSaveAll={savableIds.length > 0 ? () => setSaveQuestions(savableIds) : undefined}
            onReattempt={examId ? () => navigate(studentTakeExamPath(examId)) : undefined}
            onBack={examId ? () => navigate(studentExamPath(examId)) : () => navigate(ROUTES.studentExams)}
          />

      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-[clamp(1rem,2vw,1.5rem)] items-start">
        {/* Navigator above the question on small screens (folded); beside it, top-aligned, from lg. */}
        {total > 0 && (
          <aside className="lg:order-2 min-w-0">
            <ResultPalette outcomes={outcomes} counts={counts} current={current} onSelect={goTo} />
          </aside>
        )}

        <section ref={questionRef} className="lg:order-1 space-y-3 min-w-0 scroll-mt-[85px]" aria-label="Question">
          {!q ? (
            <div className="card px-5 py-10 text-center text-sm text-content-soft">This attempt has no question.</div>
          ) : (
            <>
              <ResultQuestionCard
                key={q.questionId}
                nav={<QuestionNav current={current} total={total} onPrev={navRef.current.prev} onNext={navRef.current.next} />}
                question={q}
                index={current}
                outcome={outcomes[current]}
                explanation={explanations[q.questionId]}
                explanationOpen={open.has(q.questionId)}
                onToggleExplanation={() => toggle(q.questionId)}
                onRetryExplanation={() => loadExplanations([q.questionId])}
                saveAction={
                  savableIds.includes(q.questionId) ? (
                    savedIds.has(q.questionId) ? (
                      <Button size="sm" variant="ghost" icon={<Icon.Check className="w-4 h-4" />} onClick={() => setSaveQuestions([q.questionId])}>
                        Saved to flashcards
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" icon={<Icon.Layers className="w-4 h-4" />} onClick={() => setSaveQuestions([q.questionId])}>
                        Save to flashcards
                      </Button>
                    )
                  ) : undefined
                }
              />
              {q.questionType === 'CODE' && codeSubs && (() => {
                const sub = latestSubmissionBefore(codeSubs, q.questionId, result.submittedAt);
                return sub ? (
                  <div className="card flex flex-wrap items-center gap-2 px-4 py-3 text-sm text-content-soft">
                    <span className="font-medium text-content">Test cases</span>
                    <CodeTestCaseStatus submission={sub} />
                  </div>
                ) : null;
              })()}
              <div className="flex items-center justify-between gap-3">
                <Button variant="outline" icon={<Icon.ChevronLeft className="w-4 h-4" />} disabled={!navRef.current.prev} onClick={navRef.current.prev}>
                  Previous
                </Button>
                <Button disabled={!navRef.current.next} onClick={navRef.current.next}>
                  Next
                  <Icon.ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </>
          )}
        </section>
      </div>

      {codeSubs && (
        <CodeSubmissionHistory
          submissions={codeSubs}
          languages={codeLanguages}
          questions={result.questions
            .map((x, i) => ({ x, i }))
            .filter(({ x }) => x.questionType === 'CODE')
            .map(({ x, i }) => ({ questionId: x.questionId, label: `Q${i + 1} · ${truncate(x.content, 40)}` }))}
        />
      )}

      {saveQuestions && (
        <SaveToFlashcardsModal
          attemptId={result.attemptId}
          questionIds={saveQuestions}
          examId={examId}
          examTitle={result.examTitle}
          onClose={() => setSaveQuestions(null)}
          onSaved={ids => setSavedIds(prev => new Set([...prev, ...ids]))}
        />
      )}

      <Modal open={showGrading} onClose={() => setDismissed(true)} title="AI grading" size="sm">
        <GradingScreen
          result={result}
          error={requesting ? null : gradingError}
          onRetry={() => requestGrading(result.attemptId)}
          onClose={() => setDismissed(true)}
        />
      </Modal>
    </div>
  );
}

/** "Question 3 of 40" with compact Previous / Next, above the question card. */
function QuestionNav({
  current,
  total,
  onPrev,
  onNext,
}: {
  current: number;
  total: number;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const arrow = 'w-9 h-9 rounded-[8px] border border-line flex items-center justify-center text-content-secondary hover:bg-accent disabled:opacity-40 disabled:pointer-events-none';
  return (
    <div className="flex items-center gap-3">
      <p className="flex-1 min-w-0 text-sm text-content-soft" aria-live="polite">
        <span className="font-semibold text-content">Question {current + 1}</span> of {total}
      </p>
      <span className="hidden sm:inline text-xs text-content-subtle">Use ← → to move</span>
      <div className="flex gap-1.5">
        <button type="button" className={arrow} aria-label="Previous question" disabled={!onPrev} onClick={onPrev}>
          <Icon.ChevronLeft className="w-4 h-4" />
        </button>
        <button type="button" className={arrow} aria-label="Next question" disabled={!onNext} onClick={onNext}>
          <Icon.ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Every question as a numbered cell filled with its outcome's colour (legend
 * with counts below); a click opens it. On small screens the grid folds
 * behind a "Questions 3 / 40" toggle.
 */
function ResultPalette({
  outcomes,
  counts,
  current,
  onSelect,
}: {
  outcomes: Outcome[];
  counts: Record<Outcome, number>;
  current: number;
  onSelect: (index: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const present = (Object.keys(OUTCOME) as Outcome[]).filter(o => outcomes.includes(o));
  return (
    <div className="card p-4 space-y-3 min-w-0">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="result-palette"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between gap-2 text-left lg:pointer-events-none"
      >
        <span className="text-sm font-semibold text-content">Questions</span>
        <span className="flex items-center gap-1 text-xs text-content-subtle">
          {current + 1} / {outcomes.length}
          <Icon.ChevronDown className={`w-4 h-4 lg:hidden transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </span>
      </button>

      <div id="result-palette" className={`${expanded ? 'block' : 'hidden'} lg:block space-y-3`}>
        {/* p-1.5: room for the current cell's ring (2px + 2px offset) inside the scroll box, which
            would clip it. No negative margin here — Tailwind v4's space-y sets margin-bottom, so one
            would pull the legend up over the last row. */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] auto-rows-[2.5rem] gap-2 max-h-[min(45vh,20rem)] overflow-y-auto p-1.5">
          {outcomes.map((o, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                onSelect(i);
                setExpanded(false);
              }}
              aria-current={i === current ? 'step' : undefined}
              aria-label={`Question ${i + 1}, ${OUTCOME[o].label.toLowerCase()}`}
              title={`Question ${i + 1} · ${OUTCOME[o].label}`}
              className={`h-full rounded-[8px] text-sm font-semibold transition-all ${PALETTE_CELL[o]} ${
                i === current ? 'ring-2 ring-content ring-offset-2 ring-offset-surface' : 'hover:brightness-110'
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>

        <ul className="flex flex-wrap gap-x-3 gap-y-1.5">
          {present.map(o => (
            <li key={o} className="flex items-center gap-1.5 text-xs text-content-soft">
              <span className={`w-3 h-3 rounded-[3px] ${PALETTE_CELL[o]}`} aria-hidden="true" />
              {OUTCOME[o].label} <span className="text-content-subtle">({counts[o]})</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Body of the grading modal while the AI grades the rubric answers: a
 * spinner with how many are done, re-read every few seconds by the page.
 * If grading could not start (e.g. 402 quota), offers retry or closing.
 */
function GradingScreen({
  result,
  error,
  onRetry,
  onClose,
}: {
  result: AttemptResult;
  error: string | null;
  onRetry: () => void;
  onClose: () => void;
}) {
  const rubric = result.questions.filter(q => RUBRIC_TYPES.has(q.questionType) && q.gradingStatus !== 'AUTO');
  const done = rubric.filter(q => !isGradingOpen(q)).length;
  const total = Math.max(rubric.length, 1);
  return (
    <div className="py-6 flex flex-col items-center text-center gap-5" aria-live="polite">
      {error ? (
        <>
          <div className="w-14 h-14 rounded-full bg-danger-light flex items-center justify-center">
            <Icon.AlertCircle className="w-7 h-7 text-danger" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-bold text-content">AI grading could not start</h2>
            <p className="text-sm text-content-soft">{error}</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button icon={<Icon.RefreshCw className="w-4 h-4" />} onClick={onRetry}>
              Try again
            </Button>
            <Button variant="outline" onClick={onClose}>
              Close
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
            <h2 className="text-lg font-bold text-content">AI is grading your answers…</h2>
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
        </>
      )}
    </div>
  );
}

function ScoreCard({
  result,
  counts,
  modules,
  onOpenModule,
  picker,
  failedCount,
  gradingError,
  waitingForGrading,
  grading,
  onRequestGrading,
  onSaveAll,
  onReattempt,
  onBack,
}: {
  result: AttemptResult;
  counts: Record<Outcome, number>;
  /** Score per module; empty hides the breakdown. */
  modules: ModuleScore[];
  /** Opens a question (a module's first one). */
  onOpenModule: (index: number) => void;
  /** Attempt dropdown, left of the score. */
  picker?: React.ReactNode;
  /** Rubric answers the AI failed to grade (can be asked again). */
  failedCount: number;
  gradingError: string | null;
  /** Rubric answers wait for the student to ask the AI (attempt SUBMITTED). */
  waitingForGrading: boolean;
  /** SE-02 sent or the AI is working. */
  grading: boolean;
  onRequestGrading: () => void;
  /** Saves every savable question as a flashcard (FC-12); absent when none can be saved. */
  onSaveAll?: () => void;
  onReattempt?: () => void;
  onBack: () => void;
}) {
  const max = result.maxScore != null ? Number(result.maxScore) : null;
  const score = result.totalScore != null ? Number(result.totalScore) : null;
  const pct = pctOf(score, max);
  const tone = toneOf(pct);

  const showScore = !waitingForGrading && !grading;
  const stillGrading = counts.pending > 0 || (result.pendingPoints != null && Number(result.pendingPoints) > 0);

  return (
    <div className="card p-5 min-w-0 space-y-4">
      {/* The breadcrumb names the exam; the heading stays for screen readers. */}
      <h1 className="sr-only">{result.examTitle} — result</h1>
      {/* Attempt picker | score, centred and large | actions. The 1fr side columns keep the score in the middle. */}
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
        <div className="min-w-0 md:max-w-xs space-y-1">
          {picker}
          {result.autoSubmitted && <p className="text-xs text-content-subtle">Submitted automatically when time ran out.</p>}
        </div>

        {/* No score until the written answers are graded — "0 / 100" would read as a real result. */}
        {showScore ? (
          // As tall as the Re-attempt / Back pair beside it (~80px): label, one score line, bar.
          <div className="text-center space-y-1.5 md:min-w-[16rem]">
            <p className="text-xs font-semibold text-content-subtle uppercase tracking-wide leading-4">Your score</p>
            <p className={`flex flex-wrap items-baseline justify-center gap-x-1.5 leading-none ${tone}`}>
              <span className="text-[2.5rem] font-black break-all">{num(score)}</span>
              <span className="text-lg font-semibold text-content-subtle whitespace-nowrap">/ {num(max)}</span>
              {pct != null && <span className="text-sm font-semibold ml-1">{pct}%</span>}
            </p>
            <div className="mx-auto max-w-[14rem]">
              <Progress value={pct ?? 0} size="sm" color={barColorOf(pct)} />
            </div>
          </div>
        ) : (
          // Just the button while waiting; the warning box only when there is something to say.
          <div className={`w-full md:w-64 ${grading || gradingError ? 'space-y-2 rounded-[10px] border border-warning-line bg-warning-light p-3' : ''}`}>
            {grading && (
              <p className="flex items-start gap-2 text-xs text-warning">
                <Icon.Clock className="w-4 h-4 flex-shrink-0" />
                AI is grading {num(result.pendingPoints)} points of written answers…
              </p>
            )}
            {gradingError && <p className="text-xs text-danger">{gradingError}</p>}
            {/* Button's `loading` shows its spinner while SE-02 is sent and the AI is working. */}
            <Button size="sm" className="w-full" icon={<Icon.Brain className="w-4 h-4" />} loading={grading} disabled={grading} onClick={onRequestGrading}>
              {grading ? 'Grading…' : 'Grade with AI'}
            </Button>
          </div>
        )}

        <div className="flex flex-wrap md:flex-col gap-2 md:justify-self-end">
          {onReattempt && (
            <Button icon={<Icon.RefreshCw className="w-4 h-4" />} onClick={onReattempt}>
              Re-attempt
            </Button>
          )}
          {onSaveAll && (
            <Button variant="outline" icon={<Icon.Layers className="w-4 h-4" />} onClick={onSaveAll}>
              Save all to flashcards
            </Button>
          )}
          <Button variant="outline" icon={<Icon.ChevronLeft className="w-4 h-4" />} onClick={onBack}>
            Back to exam
          </Button>
        </div>
      </div>

      {showScore && stillGrading && (
        <p className="flex items-start gap-2 text-xs text-warning">
          <Icon.Clock className="w-4 h-4 flex-shrink-0" />
          {num(result.pendingPoints)} points are still being graded by AI. This page refreshes on its own.
        </p>
      )}

      {showScore && (failedCount > 0 || gradingError) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-danger-solid bg-danger-light p-3">
          <p className="flex items-start gap-2 text-xs text-danger">
            <Icon.AlertCircle className="w-4 h-4 flex-shrink-0" />
            {gradingError ?? `AI grading failed for ${failedCount} question${failedCount === 1 ? '' : 's'}.`}
          </p>
          <Button size="sm" variant="outline" icon={<Icon.RefreshCw className="w-4 h-4" />} loading={grading} disabled={grading} onClick={onRequestGrading}>
            Retry AI grading
          </Button>
        </div>
      )}

      {showScore && modules.length > 0 && (
        <div className="border-t border-line pt-4 min-w-0">
          <p className="text-xs font-semibold text-content-subtle uppercase tracking-wide mb-2">Score by module</p>
          <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
            {modules.map(m => {
              const mPct = pctOf(m.earned, m.max);
              return (
                <li key={m.key} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onOpenModule(m.first)}
                    title={`Open the first question of ${m.name}`}
                    className="w-full text-left rounded-[8px] px-2 py-1.5 -mx-2 hover:bg-accent space-y-1"
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm text-content truncate min-w-0">{m.name}</span>
                      <span className={`text-xs font-semibold flex-shrink-0 ${toneOf(mPct)}`}>
                        {num(m.earned)} / {num(m.max)}
                        {mPct != null && <span className="text-content-subtle font-normal"> · {mPct}%</span>}
                      </span>
                    </span>
                    <Progress value={mPct ?? 0} size="sm" color={barColorOf(mPct)} />
                    {m.pending > 0 && (
                      <span className="block text-xs text-warning">
                        {m.pending} question{m.pending === 1 ? '' : 's'} not graded yet
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}


function ResultQuestionCard({
  question: q,
  index,
  outcome,
  explanation,
  explanationOpen,
  onToggleExplanation,
  onRetryExplanation,
  nav,
  saveAction,
}: {
  question: ResultQuestion;
  index: number;
  outcome: Outcome;
  explanation: ExplanationState | undefined;
  explanationOpen: boolean;
  onToggleExplanation: () => void;
  onRetryExplanation: () => void;
  /** "Question 3 of 40" bar on top of the card. */
  nav?: React.ReactNode;
  /** "Save to flashcards" button, under the answer. */
  saveAction?: React.ReactNode;
}) {
  return (
    <article className="card overflow-hidden">
      {nav && <div className="border-b border-line bg-surface-alt px-4 py-2.5">{nav}</div>}
      <header className="flex items-start gap-3 px-4 py-3.5">
        <span className="mt-0.5 flex-shrink-0">{OUTCOME[outcome].icon}</span>
        <div className="flex-1 min-w-0">
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-content-subtle">
            Question {index + 1} · {QUESTION_TYPE_LABEL[q.questionType] ?? q.questionType}
            {q.moduleName && (
              <Badge size="sm" variant="default">
                <Icon.Layers className="w-3 h-3" /> {q.moduleName}
              </Badge>
            )}
          </p>
          <QuestionText content={q.content} className="text-sm text-content mt-0.5" />
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {q.gradingStatus === GRADING_FAILED ? (
            <Badge variant="danger" size="sm">
              Grading failed
            </Badge>
          ) : (
            <Badge variant={OUTCOME[outcome].badge} size="sm">
              {OUTCOME[outcome].label}
            </Badge>
          )}
          <span className="text-xs text-content-subtle">
            {/* Ungraded written answer: only its worth, not a "0 / 100". */}
            {outcome === 'pending' || q.gradingStatus === GRADING_FAILED
              ? `${num(q.maxPoints)} pts`
              : `${num(q.scoreEarned)} / ${num(q.maxPoints)} pts`}
          </span>
        </div>
      </header>

      {RUBRIC_TYPES.has(q.questionType) ? (
        // Written answer beside its grade once the card is wide enough (container query, not viewport:
        // the sidebar and score column eat most of a laptop screen), so the rubric stays in view.
        <div className="@container border-t border-line px-4 py-4">
          <div className="grid gap-4 @3xl:grid-cols-[minmax(0,1fr)_minmax(15rem,20rem)] @3xl:items-start">
          <div className="min-w-0">
            <AnswerReview question={q} />
          </div>
          <div className="@3xl:sticky @3xl:top-[85px] min-w-0">
            <RubricGrade question={q} outcome={outcome} />
          </div>
          </div>
        </div>
      ) : (
      /* Answers are always shown; only the explanation is collapsible. */
      <div className="border-t border-line px-4 py-4 space-y-4">
        <AnswerReview question={q} />
        {q.gradingError && <p className="text-sm text-danger">Grading failed: {q.gradingError}</p>}
        {hasExplanation(q) && (
          <ExplanationBox
            question={q}
            state={explanation}
            open={explanationOpen}
            onToggle={onToggleExplanation}
            onRetry={onRetryExplanation}
          />
        )}
        {saveAction && <div className="flex justify-end">{saveAction}</div>}
      </div>
      )}
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

  if (answered && q.questionType !== 'DIAGRAM') return <WrittenAnswer text={r?.text ?? ''} code={q.questionType === 'CODE'} />;

  return (
    <div>
      <p className="text-xs font-semibold text-content-subtle uppercase tracking-wide mb-1">Your answer</p>
      {!answered ? (
        <p className="rounded-[10px] border border-dashed border-line px-3 py-6 text-center text-sm text-content-subtle">
          You did not answer this question.
        </p>
      ) : (
        <DiagramReview xml={r?.drawioXml ?? ''} />
      )}
    </div>
  );
}

/** Past this many lines a written answer folds, with "Show full answer". */
const FOLD_LINES = 18;
const FOLD_CHARS = 1500;

/**
 * Essay / code answer for reading: an essay in a relaxed sans paragraph with
 * its word count; code monospaced with line numbers and a copy button.
 * A long answer is folded behind a fade until expanded.
 */
function WrittenAnswer({ text, code }: { text: string; code: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const lines = text.replace(/\n+$/, '').split('\n');
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const long = lines.length > FOLD_LINES || text.length > FOLD_CHARS;
  const folded = long && !expanded;

  const copy = () => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => undefined);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-xs font-semibold text-content-subtle uppercase tracking-wide">Your answer</p>
        <span className="flex items-center gap-2 text-xs text-content-subtle">
          {code ? `${lines.length} line${lines.length === 1 ? '' : 's'}` : `${words.toLocaleString('en-US')} word${words === 1 ? '' : 's'}`}
          {code && (
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1 rounded-[6px] border border-line px-2 py-0.5 text-content-soft hover:bg-accent"
            >
              {copied ? <Icon.Check className="w-3.5 h-3.5 text-success" /> : <Icon.Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
        </span>
      </div>

      <div className={`relative rounded-[10px] border border-line bg-surface-alt ${folded ? 'max-h-[22rem] overflow-hidden' : ''}`}>
        {code ? (
          <pre className="overflow-x-auto py-3 text-[13px] leading-6 font-mono text-content-secondary">
            <code className="grid grid-cols-[auto_minmax(0,1fr)]">
              {lines.map((line, i) => (
                <React.Fragment key={i}>
                  <span className="select-none text-right pl-3 pr-3 text-content-subtle border-r border-line" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="pl-3 pr-4 whitespace-pre">{line || ' '}</span>
                </React.Fragment>
              ))}
            </code>
          </pre>
        ) : (
          <p className="px-4 py-3.5 text-[15px] leading-7 text-content whitespace-pre-wrap break-words">{text}</p>
        )}
        {folded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 rounded-b-[10px] bg-gradient-to-t from-surface-alt to-transparent" />
        )}
      </div>

      {long && (
        <button type="button" onClick={() => setExpanded(e => !e)} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-ink hover:underline">
          {expanded ? 'Collapse answer' : 'Show full answer'}
          <Icon.ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      )}
    </div>
  );
}

/** The submitted diagram, rendered to a picture by a hidden draw.io (the BE keeps only the XML). */
function DiagramReview({ xml }: { xml: string }) {
  const snapshot = useDrawioSnapshot(xml);
  return (
    <div className="rounded-[10px] border border-line bg-white p-3 flex items-center justify-center min-h-[140px]">
      {snapshot.svg ? (
        <img src={snapshot.svg} alt="Your diagram" className="max-h-[420px] max-w-full object-contain" />
      ) : snapshot.status === 'loading' ? (
        <span className="flex items-center gap-2 text-sm text-content-soft">
          <Spinner size="sm" /> Rendering your diagram…
        </span>
      ) : (
        <span className="text-sm text-content-soft">
          Diagram submitted ({xml.length.toLocaleString()} characters of XML) — couldn’t render a preview.
        </span>
      )}
      {snapshot.frame}
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

/**
 * Grade of an essay / code / diagram answer: the score with a bar, each
 * rubric criterion with its own bar and feedback, then the overall feedback.
 * Before the AI has graded it, just says so.
 */
function RubricGrade({ question: q, outcome }: { question: ResultQuestion; outcome: Outcome }) {
  const failed = q.gradingStatus === GRADING_FAILED;
  if (outcome === 'pending' || failed) {
    return (
      <div className={`rounded-[10px] border p-4 space-y-1.5 ${failed ? 'border-danger-line bg-danger-light' : 'border-warning-line bg-warning-light'}`}>
        <p className={`flex items-center gap-2 text-sm font-semibold ${failed ? 'text-danger' : 'text-warning'}`}>
          {failed ? <Icon.AlertCircle className="w-4 h-4" /> : <Icon.Clock className="w-4 h-4" />}
          {failed ? 'AI grading failed' : 'Not graded yet'}
        </p>
        <p className="text-sm text-content-secondary">
          {failed
            ? q.gradingError ?? 'Retry the AI grading from the score panel.'
            : q.gradingStatus === GRADING_WAITING
              ? `Worth ${num(q.maxPoints)} pts. Use “Grade with AI” in the score panel to get your rubric score and feedback.`
              : `Worth ${num(q.maxPoints)} pts. The AI is grading this answer…`}
        </p>
      </div>
    );
  }

  const pct = pctOf(q.scoreEarned, q.maxPoints);
  const criteria = q.criteria ?? [];
  return (
    <div className="rounded-[10px] border border-line bg-surface p-4 space-y-4">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold text-content-subtle uppercase tracking-wide">Score</p>
          {q.gradingStatus === 'AI_GRADED' && (
            <Badge size="sm" variant="purple">
              <Icon.Brain className="w-3 h-3" /> AI graded
            </Badge>
          )}
        </div>
        <p className={`flex items-baseline gap-1.5 leading-none ${toneOf(pct)}`}>
          <span className="text-3xl font-black">{num(q.scoreEarned)}</span>
          <span className="text-sm font-semibold text-content-subtle">/ {num(q.maxPoints)} pts</span>
          {pct != null && <span className="ml-auto text-sm font-semibold">{pct}%</span>}
        </p>
        <Progress value={pct ?? 0} size="sm" color={barColorOf(pct)} />
      </div>

      {criteria.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-content-subtle uppercase tracking-wide mb-2">Rubric</p>
          <ul className="divide-y divide-line">
            {criteria.map(c => {
              const cPct = pctOf(c.points, c.maxPoints);
              return (
                <li key={c.criterionId} className="py-2.5 first:pt-0 last:pb-0 space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm font-medium text-content">{c.name}</span>
                    <span className={`text-sm font-semibold flex-shrink-0 ${toneOf(cPct)}`}>
                      {num(c.points)}
                      <span className="text-content-subtle font-normal"> / {num(c.maxPoints)}</span>
                    </span>
                  </div>
                  <Progress value={cPct ?? 0} size="sm" color={barColorOf(cPct)} />
                  {c.feedback && <p className="text-sm text-content-soft leading-relaxed whitespace-pre-line">{c.feedback}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {q.overallFeedback && (
        <div className="rounded-[10px] border border-brand-200 bg-primary-light/60 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-ink uppercase tracking-wide mb-1.5">
            <Icon.Lightbulb className="w-4 h-4" /> Feedback
          </p>
          <p className="text-sm text-content-secondary leading-relaxed whitespace-pre-line">{q.overallFeedback}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Explanation, collapsed by default. Shows the SA-05 text when cached;
 * otherwise opening it has already asked the AI (SE-01, done by the page).
 */
function ExplanationBox({
  question: q,
  state,
  open,
  onToggle,
  onRetry,
}: {
  question: ResultQuestion;
  state: ExplanationState | undefined;
  open: boolean;
  onToggle: () => void;
  onRetry: () => void;
}) {
  const text = q.explanation?.text ?? state?.text ?? null;
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
          ) : state?.error ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-danger">{state.error}</p>
              <Button size="sm" variant="outline" icon={<Icon.RefreshCw className="w-4 h-4" />} onClick={onRetry}>
                Try again
              </Button>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-content-soft" aria-live="polite">
              <Spinner size="sm" />
              AI is writing an explanation…
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** First `max` characters of a question on one line, for filter labels. */
function truncate(text: string, max: number): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}
