import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { TimerDisplay } from '@/components/common/TimerDisplay';
import { QuestionPalette } from '@/components/common/QuestionPalette';
import { Icon } from '@/assets/icons';
import { studentExamPath, studentExamResultPath } from '@/app/routes';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  DRAFT_BATCH_LIMIT,
  RUBRIC_TYPES,
  studentAttemptService,
  type AnswerResponse,
  type AttemptSession,
} from '@/services/studentAttempt.service';
import { QUESTION_TYPE_LABEL, QuestionAnswerInput, QuestionText, isAnswered } from '../components/QuestionAnswerInput';

/** Unsaved answers are pushed to SA-03 this often. */
const AUTOSAVE_MS = 4000;
const WARN_SECONDS = 300;

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

/**
 * Full-screen take-exam screen (mounted outside the dashboard shell).
 *
 *  - `?examId=` starts an attempt (SA-01; an attempt already running is resumed),
 *    then the URL is swapped to `?attemptId=` so a reload resumes it (SA-02).
 *  - Answers are kept locally and saved as drafts (SA-03) every few seconds,
 *    when moving between questions, and before leaving.
 *  - Submit asks for confirmation, flushes the drafts and submits (SA-04).
 *  - Cancel saves the drafts and leaves; the attempt stays IN_PROGRESS and can
 *    be continued later. The deadline is the server's: when it passes, the
 *    screen submits on its own (and the BE auto-submits if the tab is gone).
 *  - Only questions made entirely of essay / code / diagram get the "Essay"
 *    layout (wider, taller editor); every other paper is a quiz.
 */
export function StudentTakeExamPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const examIdParam = searchParams.get('examId');
  const attemptIdParam = searchParams.get('attemptId');

  const [session, setSession] = useState<AttemptSession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const [answers, setAnswers] = useState<Record<number, AnswerResponse | null>>({});
  const [current, setCurrent] = useState(0);
  const [flagged, setFlagged] = useState<Set<number>>(() => new Set());
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [remaining, setRemaining] = useState<number | null>(null);

  const [confirm, setConfirm] = useState<'submit' | 'cancel' | null>(null);
  const [busy, setBusy] = useState<'submit' | 'cancel' | 'delete' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Draft bookkeeping lives in refs: the autosave timer must see the latest values.
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const seqRef = useRef<Record<number, number>>({});
  const dirtyRef = useRef<Set<number>>(new Set());
  const savingRef = useRef<Promise<void> | null>(null);
  const finishedRef = useRef(false);
  const submittingRef = useRef(false);

  /* ── Load ─────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (session && String(session.attemptId) === attemptIdParam) return;
    if (!attemptIdParam && !examIdParam) {
      setLoadError('No exam was selected.');
      return;
    }
    let cancelled = false;
    setLoadError(null);
    const load = attemptIdParam ? studentAttemptService.get(attemptIdParam) : studentAttemptService.start(examIdParam!);
    load
      .then(s => {
        if (cancelled) return;
        if (s.status !== 'IN_PROGRESS') {
          navigate(studentExamResultPath(s.attemptId, s.examId), { replace: true });
          return;
        }
        const initial: Record<number, AnswerResponse | null> = {};
        const seqs: Record<number, number> = {};
        for (const a of s.answers ?? []) {
          initial[a.questionId] = a.response;
          seqs[a.questionId] = a.draftSeq ?? 0;
        }
        seqRef.current = seqs;
        dirtyRef.current = new Set();
        setAnswers(initial);
        setSession({ ...s, questions: [...s.questions].sort((a, b) => a.orderIndex - b.orderIndex) });
        setCurrent(0);
        setSaveState('saved');
        if (!attemptIdParam) setSearchParams({ attemptId: String(s.attemptId) }, { replace: true });
      })
      .catch(err => {
        if (!cancelled) setLoadError(getApiErrorMessage(err, 'Failed to open the exam.'));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptIdParam, examIdParam, reload]);

  /* ── Drafts ───────────────────────────────────────────────────────────── */
  const flush = useCallback(async (): Promise<void> => {
    if (!session) return;
    // One save at a time; a later call waits and then sends what is left.
    while (savingRef.current) await savingRef.current;
    const ids = [...dirtyRef.current];
    if (ids.length === 0) return;
    const entries = ids.map(questionId => ({
      questionId,
      seq: seqRef.current[questionId] ?? 0,
      response: answersRef.current[questionId] ?? null,
    }));
    setSaveState('saving');
    const run = (async () => {
      try {
        for (let i = 0; i < entries.length; i += DRAFT_BATCH_LIMIT) {
          const chunk = entries.slice(i, i + DRAFT_BATCH_LIMIT);
          const res = await studentAttemptService.saveDrafts(session.attemptId, chunk);
          const done = new Set([...res.saved.map(s => s.questionId), ...res.rejected.map(r => r.questionId)]);
          for (const e of chunk) {
            // Edited again while saving → stays dirty with its newer seq.
            if (done.has(e.questionId) && seqRef.current[e.questionId] === e.seq) dirtyRef.current.delete(e.questionId);
          }
        }
        setSaveState(dirtyRef.current.size > 0 ? 'dirty' : 'saved');
      } catch (err) {
        setSaveState('error');
        throw err;
      }
    })();
    savingRef.current = run.then(
      () => undefined,
      () => undefined,
    );
    try {
      await run;
    } finally {
      savingRef.current = null;
    }
  }, [session]);

  const setAnswer = (questionId: number, response: AnswerResponse) => {
    seqRef.current[questionId] = (seqRef.current[questionId] ?? 0) + 1;
    dirtyRef.current.add(questionId);
    setAnswers(prev => ({ ...prev, [questionId]: response }));
    setSaveState('dirty');
  };

  useEffect(() => {
    if (!session) return;
    const id = window.setInterval(() => {
      if (dirtyRef.current.size > 0 && !finishedRef.current) flush().catch(() => undefined);
    }, AUTOSAVE_MS);
    return () => window.clearInterval(id);
  }, [session, flush]);

  // Closing the tab with unsaved answers: let the browser ask.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current.size > 0 && !finishedRef.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  /* ── Submit / cancel ──────────────────────────────────────────────────── */
  const submit = useCallback(
    async (auto = false) => {
      if (!session || finishedRef.current || submittingRef.current) return;
      submittingRef.current = true;
      setBusy('submit');
      setActionError(null);
      try {
        // A failed flush on auto-submit must not block it: the BE keeps the last stored drafts.
        await flush().catch(err => {
          if (!auto) throw err;
        });
        await studentAttemptService.submit(session.attemptId);
        finishedRef.current = true;
        navigate(studentExamResultPath(session.attemptId, session.examId), { replace: true });
      } catch (err) {
        setActionError(getApiErrorMessage(err, 'Failed to submit. Please try again.'));
        setBusy(null);
      } finally {
        submittingRef.current = false;
      }
    },
    [session, flush, navigate],
  );

  const saveAndExit = async () => {
    if (!session) return;
    setBusy('cancel');
    setActionError(null);
    try {
      await flush();
      finishedRef.current = true;
      navigate(studentExamPath(session.examId), { replace: true });
    } catch (err) {
      setActionError(getApiErrorMessage(err, 'Failed to save your answers. Please try again.'));
      setBusy(null);
    }
  };

  const deleteAttempt = async () => {
    if (!session) return;
    setBusy('delete');
    setActionError(null);
    // Stop autosave and the leave prompt first: the drafts are being thrown away.
    finishedRef.current = true;
    try {
      await studentAttemptService.deleteAttempt(session.attemptId);
      navigate(studentExamPath(session.examId), { replace: true });
    } catch (err) {
      finishedRef.current = false;
      setActionError(getApiErrorMessage(err, 'Failed to delete this attempt. Please try again.'));
      setBusy(null);
    }
  };

  /* ── Timer (server clock) ─────────────────────────────────────────────── */
  useEffect(() => {
    if (!session) return;
    const offset = Date.parse(session.serverTime) - Date.now();
    const deadline = Date.parse(session.deadlineAt);
    const tick = () => {
      const left = Math.max(0, Math.round((deadline - (Date.now() + offset)) / 1000));
      setRemaining(left);
      if (left === 0) submit(true);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [session, submit]);

  /* ── Derived ──────────────────────────────────────────────────────────── */
  const questions = session?.questions ?? [];
  const isEssay = questions.length > 0 && questions.every(q => RUBRIC_TYPES.has(q.questionType));
  const answeredSet = useMemo(() => {
    const s = new Set<number>();
    questions.forEach((q, i) => {
      if (isAnswered(answers[q.questionId])) s.add(i + 1);
    });
    return s;
  }, [questions, answers]);
  const unanswered = questions.length - answeredSet.size;

  const goTo = (index: number) => {
    setCurrent(Math.max(0, Math.min(questions.length - 1, index)));
    if (dirtyRef.current.size > 0) flush().catch(() => undefined);
  };

  /* ── Render ───────────────────────────────────────────────────────────── */
  if (loadError) {
    return (
      <FullScreenMessage>
        <Icon.AlertCircle className="w-10 h-10 text-content-subtle" />
        <p className="text-base text-content-soft max-w-md text-center">{loadError}</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Go back
          </Button>
          {(attemptIdParam || examIdParam) && (
            <Button icon={<Icon.RefreshCw className="w-4 h-4" />} onClick={() => setReload(r => r + 1)}>
              Retry
            </Button>
          )}
        </div>
      </FullScreenMessage>
    );
  }

  if (!session) {
    return (
      <FullScreenMessage>
        <Spinner />
        <p className="text-sm text-content-soft">Preparing your exam…</p>
      </FullScreenMessage>
    );
  }

  if (questions.length === 0) {
    return (
      <FullScreenMessage>
        <p className="text-base text-content-soft">This exam has no question.</p>
        <Button variant="outline" onClick={() => navigate(studentExamPath(session.examId))}>
          Back to exam
        </Button>
      </FullScreenMessage>
    );
  }

  const q = questions[current];
  const isFlagged = flagged.has(current + 1);
  const toggleFlag = () =>
    setFlagged(prev => {
      const next = new Set(prev);
      if (next.has(current + 1)) next.delete(current + 1);
      else next.add(current + 1);
      return next;
    });

  return (
    <div className="h-[100dvh] flex flex-col bg-surface-alt">
      <header className="min-h-14 bg-surface border-b border-line-soft flex flex-wrap items-center px-[clamp(0.75rem,2vw,1.5rem)] py-2 gap-x-4 gap-y-2 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Icon.Logo className="w-7 h-7 flex-shrink-0 text-brand-ink" aria-hidden="true" />
          <span className="text-base font-bold text-content truncate">{session.title}</span>
          <span className="hidden sm:inline-flex flex-shrink-0 rounded-[6px] border border-line px-2 py-0.5 text-2xs font-medium text-content-soft">
            {isEssay ? 'Essay' : 'Quiz'}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <SaveIndicator state={saveState} />
          {remaining != null && <TimerDisplay seconds={remaining} warning={remaining < WARN_SECONDS} />}
          <Button
            size="sm"
            variant="outline"
            disabled={busy != null}
            loading={busy === 'cancel'}
            onClick={() => setConfirm('cancel')}
          >
            Cancel
          </Button>
          {/* Primary, not red: submitting is the expected finish, not a destructive action. */}
          <Button size="sm" disabled={busy != null} loading={busy === 'submit'} onClick={() => setConfirm('submit')}>
            Submit
          </Button>
        </div>
      </header>

      {actionError && !confirm && (
        <div role="alert" className="bg-danger-light text-danger text-sm px-6 py-2 flex items-center gap-2">
          <Icon.AlertCircle className="w-4 h-4 flex-shrink-0" /> {actionError}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        <main className="flex-1 overflow-y-auto p-[clamp(1rem,2.5vw,1.5rem)]">
          <div className={`${isEssay ? 'max-w-4xl' : 'max-w-3xl'} mx-auto space-y-5`}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="info">{QUESTION_TYPE_LABEL[q.questionType] ?? q.questionType}</Badge>
              {q.maxPoints != null && <span className="text-xs text-content-subtle">{Number(q.maxPoints)} pts</span>}
              <span className="text-xs text-content-subtle ml-auto">
                Question {current + 1} / {questions.length}
              </span>
            </div>

            <div className="card p-[clamp(1rem,2.5vw,1.5rem)]">
              <p className="text-xs font-semibold text-content-subtle uppercase tracking-wide mb-3">Question {current + 1}</p>
              <QuestionText content={q.content} className="text-lg text-content leading-relaxed font-medium" />
            </div>

            <QuestionAnswerInput
              key={q.questionId}
              question={q}
              value={answers[q.questionId] ?? null}
              onChange={r => setAnswer(q.questionId, r)}
              roomy={isEssay}
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                variant="outline"
                disabled={current === 0}
                icon={<Icon.ChevronLeft className="w-4 h-4" />}
                onClick={() => goTo(current - 1)}
              >
                Previous
              </Button>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  aria-pressed={isFlagged}
                  onClick={toggleFlag}
                  icon={<Icon.Flag className={`w-4 h-4 ${isFlagged ? 'text-warning' : ''}`} />}
                  className={isFlagged ? '!border-warning-line !bg-warning-light' : ''}
                >
                  {isFlagged ? 'Flagged' : 'Flag for review'}
                </Button>
                {current < questions.length - 1 ? (
                  <Button iconRight={<Icon.ChevronRight className="w-4 h-4" />} onClick={() => goTo(current + 1)}>
                    Next question
                  </Button>
                ) : (
                  <Button icon={<Icon.Check className="w-4 h-4" />} onClick={() => setConfirm('submit')}>
                    Finish
                  </Button>
                )}
              </div>
            </div>
          </div>
        </main>

        <aside className="md:w-72 max-h-[35vh] md:max-h-none bg-surface border-t md:border-t-0 md:border-l border-line-soft p-5 overflow-y-auto flex-shrink-0">
          <h2 className="text-base font-semibold text-content mb-4">Question navigator</h2>
          <QuestionPalette
            total={questions.length}
            current={current + 1}
            answered={answeredSet}
            flagged={flagged}
            onSelect={n => goTo(n - 1)}
          />
          <div className="mt-4 space-y-2 pt-4 border-t border-line-soft">
            {[
              { swatch: 'bg-success-light border-success-line', label: 'Answered', count: answeredSet.size },
              { swatch: 'bg-warning-light border-warning-line', label: 'Flagged', count: flagged.size },
              { swatch: 'bg-surface-alt border-line', label: 'Unanswered', count: unanswered },
            ].map(s => (
              <div key={s.label} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded-[4px] border ${s.swatch}`} />
                  <span className="text-content-soft">{s.label}</span>
                </div>
                <span className="font-semibold text-content-secondary">{s.count}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>

      <Modal
        open={confirm === 'submit'}
        onClose={() => busy == null && setConfirm(null)}
        title="Are you sure you want to submit?"
        size="sm"
        footer={
          <>
            <Button variant="outline" disabled={busy != null} onClick={() => setConfirm(null)}>
              Keep working
            </Button>
            <Button loading={busy === 'submit'} disabled={busy != null} onClick={() => submit(false)}>
              Submit exam
            </Button>
          </>
        }
      >
        <p className="text-base text-content-secondary leading-relaxed">You can't change your answers after submitting.</p>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            { label: 'Answered', value: answeredSet.size },
            { label: 'Unanswered', value: unanswered },
            { label: 'Flagged', value: flagged.size },
          ].map(s => (
            <div key={s.label} className="flex flex-col-reverse rounded-[10px] border border-line py-3">
              <dt className="text-xs text-content-soft">{s.label}</dt>
              <dd className="text-xl font-semibold text-content">{s.value}</dd>
            </div>
          ))}
        </dl>
        {unanswered > 0 && (
          <p className="mt-3 text-sm text-warning">
            {unanswered} question{unanswered === 1 ? ' is' : 's are'} still unanswered.
          </p>
        )}
        {actionError && <p className="mt-3 text-sm text-danger">{actionError}</p>}
      </Modal>

      <Modal
        open={confirm === 'cancel'}
        onClose={() => busy == null && setConfirm(null)}
        title="Save and exit?"
        size="sm"
        footer={
          <>
            <Button
              variant="danger"
              loading={busy === 'delete'}
              disabled={busy != null}
              icon={<Icon.Trash className="w-4 h-4" />}
              onClick={deleteAttempt}
            >
              Delete attempt
            </Button>
            <Button loading={busy === 'cancel'} disabled={busy != null} onClick={saveAndExit}>
              Save & exit
            </Button>
          </>
        }
      >
        <p className="text-base text-content-secondary leading-relaxed">
          Your answers are saved and you can continue this attempt later from the exam page.
        </p>
        <p className="mt-3 text-sm text-warning">
          The timer keeps running while you are away — the attempt is submitted automatically when time is up.
        </p>
        <p className="mt-3 text-sm text-danger">
          Delete attempt throws away all {answeredSet.size} answer{answeredSet.size === 1 ? '' : 's'} of this attempt — it will
          not count in your history. This cannot be undone.
        </p>
        {actionError && <p className="mt-3 text-sm text-danger">{actionError}</p>}
      </Modal>
    </div>
  );
}

function FullScreenMessage({ children }: { children: React.ReactNode }) {
  return <div className="h-[100dvh] flex flex-col items-center justify-center gap-4 bg-surface-alt px-6">{children}</div>;
}

function SaveIndicator({ state }: { state: SaveState }) {
  const map: Record<SaveState, { text: string; cls: string; icon: React.ReactNode }> = {
    saved: { text: 'All changes saved', cls: 'text-content-subtle', icon: <Icon.CheckCircle className="w-3.5 h-3.5" /> },
    dirty: { text: 'Unsaved changes', cls: 'text-content-subtle', icon: <Icon.Clock className="w-3.5 h-3.5" /> },
    saving: { text: 'Saving…', cls: 'text-content-subtle', icon: <Icon.RefreshCw className="w-3.5 h-3.5 animate-spin" /> },
    error: { text: 'Not saved — retrying', cls: 'text-danger', icon: <Icon.AlertCircle className="w-3.5 h-3.5" /> },
  };
  const s = map[state];
  return (
    <span className={`hidden sm:inline-flex items-center gap-1 text-xs ${s.cls}`} aria-live="polite">
      {s.icon}
      {s.text}
    </span>
  );
}

