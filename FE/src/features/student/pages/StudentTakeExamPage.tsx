import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { TimerDisplay } from '@/components/common/TimerDisplay';
import { QuestionPalette } from '@/components/common/QuestionPalette';
import { Icon } from '@/assets/icons';
import { ROUTES, studentExamAttemptsPath, studentExamPath, studentExamResultPath } from '@/app/routes';
import { getApiErrorMessage } from '@/utils/apiError';
import { useToast } from '@/components/ui/ToastHost';
import {
  DRAFT_BATCH_LIMIT,
  RUBRIC_TYPES,
  studentAttemptService,
  type AnswerResponse,
  type AttemptSession,
} from '@/services/studentAttempt.service';
import {
  CHECKABLE_TYPES,
  INSTANT_CHECK_TYPES,
  checkFromKey,
  checkParts,
  studentPracticeExamService,
  type AnswerCheck,
  type CheckOutcome,
} from '@/services/studentPracticeExam.service';
import { QUESTION_TYPE_LABEL, QuestionAnswerInput, QuestionText, isAnswered } from '../components/QuestionAnswerInput';
import { PracticeCheck, checkProgress } from '../components/PracticeCheck';
import { studentCodeExamService, type CodeLanguageInfo, type CodeQuestion } from '@/services/studentCodeExam.service';
import { CodeQuestionWorkspace, currentCodeAnswer } from '../components/code/CodeQuestionWorkspace';
import { ModulePracticeRunner } from '../components/ModulePracticeRunner';
import { ReportQuestionIssueButton } from '../components/ReportQuestionIssueDialog';
import { GroupPassageSplit } from '../components/GroupPassageSplit';
import {
  canChooseTakeMode,
  forgetTakeAs,
  parseTakeAs,
  rememberTakeAs,
  takeAsOf,
  takeExamBehavior,
  type TakeAs,
} from '../examModes';

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
 *  - Cancel offers "Save and exit" (drafts flushed, the attempt stays IN_PROGRESS and
 *    SA-01 resumes it) or "Discard" (the attempt and its drafts are deleted, SA-07).
 *    The deadline is the server's: when it passes, the screen submits on its own
 *    (and the BE auto-submits if the tab is gone).
 *  - Only questions made entirely of essay / code / diagram get the "Essay"
 *    layout (wider, taller editor); every other paper is a quiz.
 *  - CODE questions get a 20/80 workspace (question | VS Code–style editor with Run, CD-04).
 *    Submit grades them on every test case first (CD-05), then submits the attempt.
 *  - The attempt's examMode picks the behaviour (see examModes.ts): an EXAM kind (EXAM, CONTEST) is
 *    timed and shows nothing until it is submitted. A PRACTICE kind (PRACTICE, PRACTICE_EXAM, SMART_PRACTICE,
 *    MATERIAL_QUIZ) is untimed and checks each answer at once — the correct answer and the
 *    explanation show and the question locks. A self-made exam opened with `?as=exam` (TakeModeModal)
 *    runs like an exam instead: timed, submitted with a confirm, nothing checked before the end.
 *    Single choice / true-false are checked on the pick; multiple choice, matching,
 *    ordering and fill-blank have a check button that shows how far the answer is.
 *    Keys: 1–9 / A–Z pick an option, Enter checks or goes to the next question.
 *    The checks are kept per attempt in localStorage so a reload or a later resume keeps them.
 *    Its Submit is called Finish and needs no confirmation (it still closes the attempt with SA-04).
 *  - `?practiceSessionId=` runs a Module Practice session instead (MP-03…MP-07) — same screen,
 *    its own flow: see ModulePracticeRunner.
 */
export function StudentTakeExamPage() {
  const [searchParams] = useSearchParams();
  const practiceSessionId = searchParams.get('practiceSessionId');
  return practiceSessionId ? <ModulePracticeRunner sessionId={practiceSessionId} /> : <ExamAttemptScreen />;
}

function ExamAttemptScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const contestEndsAt = (location.state as { endsAt?: string } | null)?.endsAt;
  /** Set when the attempt was opened from a contest page. */
  const contestId = (location.state as { contestId?: number } | null)?.contestId ?? null;
  const toast = useToast();
  const examIdParam = searchParams.get('examId');
  const attemptIdParam = searchParams.get('attemptId');
  const takeAsParam = searchParams.get('as');

  const [session, setSession] = useState<AttemptSession | null>(null);
  /** Self-made exam: how the student chose to take it (`?as=`, then kept per attempt). */
  const [takeAs, setTakeAs] = useState<TakeAs | null>(null);
  const isContest = contestId != null || session?.examMode === 'CONTEST';
  /** From the exam's mode in the DB (and the Exam / Practice choice): timer, instant check and where leaving leads. */
  const behavior = takeExamBehavior(isContest ? 'CONTEST' : session?.examMode, takeAs);
  const practice = behavior.kind === 'PRACTICE';
  const instantCheck = behavior.instantCheck;
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const [answers, setAnswers] = useState<Record<number, AnswerResponse | null>>({});
  const [current, setCurrent] = useState(0);
  const [flagged, setFlagged] = useState<Set<number>>(() => new Set());
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [remaining, setRemaining] = useState<number | null>(null);

  const [confirm, setConfirm] = useState<'submit' | 'cancel' | null>(null);
  const [busy, setBusy] = useState<'submit' | 'save' | 'cancel' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<number, AnswerCheck>>({});
  const [checking, setChecking] = useState<number | null>(null);
  /** Question just checked: its "Next question" button takes the focus. */
  const [justChecked, setJustChecked] = useState<number | null>(null);
  /** CD-03 per CODE question, and the CD-06 languages. Empty when the paper has no CODE question or they failed to load. */
  const [codeMeta, setCodeMeta] = useState<Map<number, CodeQuestion>>(() => new Map());
  const [codeLanguages, setCodeLanguages] = useState<CodeLanguageInfo[]>([]);
  /** CD-05 failed on a manual submit: the confirm button becomes "Submit anyway". */
  const [codeGradeFailed, setCodeGradeFailed] = useState(false);
  // Practice shortcuts: the handler is rebuilt every render, the listener stays.
  const keyHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandlerRef.current?.(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
        setSession({ ...s, deadlineAt: contestEndsAt ?? s.deadlineAt, questions: [...s.questions].sort((a, b) => a.orderIndex - b.orderIndex) });
        setCurrent(0);
        setSaveState('saved');
        const chosen = canChooseTakeMode(s.examMode) ? (takeAsOf(s.attemptId) ?? parseTakeAs(takeAsParam)) : null;
        if (chosen) rememberTakeAs(s.attemptId, chosen);
        setTakeAs(chosen);
        setChecks(takeExamBehavior(s.examMode, chosen).instantCheck ? restoreChecks(s) : {});
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

  // CODE questions: languages, template and sample I/O. A failure leaves the editor usable without them.
  const sessionExamId = session?.examId;
  const hasCode = Boolean(session?.questions.some(q => q.questionType === 'CODE'));
  useEffect(() => {
    if (sessionExamId == null || !hasCode) return;
    let cancelled = false;
    Promise.allSettled([studentCodeExamService.getQuestions(sessionExamId), studentCodeExamService.getLanguages()]).then(([qs, langs]) => {
      if (cancelled) return;
      if (qs.status === 'fulfilled') setCodeMeta(new Map((qs.value?.questions ?? []).map(c => [c.questionId, c])));
      if (langs.status === 'fulfilled') setCodeLanguages(langs.value);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionExamId, hasCode]);

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
    // Updated now, not on the next render: a practice check flushes right after.
    answersRef.current = { ...answersRef.current, [questionId]: response };
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
    async (auto = false, skipCode = false) => {
      if (!session || finishedRef.current || submittingRef.current) return;
      submittingRef.current = true;
      setBusy('submit');
      setActionError(null);
      try {
        // A failed flush on auto-submit must not block it: the BE keeps the last stored drafts.
        await flush().catch(err => {
          if (!auto) throw err;
        });
        // CODE answers are graded on the test cases (CD-05) before the attempt is closed.
        const codeAnswers = skipCode
          ? []
          : session.questions
              .filter(q => q.questionType === 'CODE')
              .map(q =>
                currentCodeAnswer(session.attemptId, q.questionId, codeMeta.get(q.questionId) ?? null, codeLanguages, answersRef.current[q.questionId]?.text),
              )
              .filter(a => a != null);
        if (codeAnswers.length > 0) {
          try {
            await studentCodeExamService.submit(session.examId, codeAnswers);
          } catch (err) {
            // Time is up: never hold the attempt back for grading.
            if (!auto) {
              setCodeGradeFailed(true);
              setActionError(getApiErrorMessage(err, 'Your code could not be graded.'));
              setBusy(null);
              return;
            }
          }
        }
        await studentAttemptService.submit(session.attemptId);
        finishedRef.current = true;
        clearChecks(session.attemptId);
        forgetTakeAs(session.attemptId);
        if (contestId != null || session.examMode === 'CONTEST') {
          toast.info('You can take this contest again, but your result will not change.', { title: 'Contest submitted', duration: 10_000 });
        }
        navigate(studentExamResultPath(session.attemptId, session.examId), { replace: true });
      } catch (err) {
        setActionError(getApiErrorMessage(err, instantCheck ? 'Failed to finish. Please try again.' : 'Failed to submit. Please try again.'));
        setBusy(null);
      } finally {
        submittingRef.current = false;
      }
    },
    [session, flush, navigate, codeMeta, codeLanguages, contestId, toast, instantCheck],
  );

  /**
   * Where leaving the attempt leads. A course exam has its own page, a contest its contest page; every other
   * PRACTICE kind (practice exam, material quiz) has none, so its Attempts screen — which offers Continue — instead.
   */
  const timed = behavior.timed;
  const historyPath = `${ROUTES.studentExams}${behavior.historyType ? `?type=${behavior.historyType}` : ''}`;
  const exitPath = (examId: number) =>
    isContest
      ? contestId != null
        ? `${ROUTES.studentContests}/${contestId}`
        : ROUTES.studentContests
      : practice
        ? studentExamAttemptsPath(examId)
        : studentExamPath(examId);
  /** After a discard: the Attempts screen only while the exam still has a submitted attempt to show. */
  const exitAfterDiscard = async (examId: number) => {
    if (!practice) return exitPath(examId);
    const left = await studentAttemptService.getAllHistory(examId).catch(() => []);
    return left.some(a => a.status !== 'IN_PROGRESS') ? exitPath(examId) : historyPath;
  };

  /**
   * Cancel → "Save and exit": the drafts are flushed and the attempt stays IN_PROGRESS — starting the exam
   * again (SA-01) resumes it. An exam still runs on the server clock and is auto-submitted at its deadline;
   * a practice exam is untimed and waits until the student comes back.
   */
  const saveAndExit = async () => {
    if (!session) return;
    setBusy('save');
    setActionError(null);
    try {
      await flush();
      finishedRef.current = true;
      navigate(exitPath(session.examId), { replace: true });
    } catch (err) {
      setActionError(getApiErrorMessage(err, 'Failed to save your answers. Please try again.'));
      setBusy(null);
    }
  };

  /** Cancel → "Discard": the attempt and its drafts are deleted (SA-07). */
  const cancelAttempt = async () => {
    if (!session) return;
    setBusy('cancel');
    setActionError(null);
    // Stop autosave and the leave prompt first: the drafts are being thrown away.
    finishedRef.current = true;
    try {
      await studentAttemptService.deleteAttempt(session.attemptId);
      clearChecks(session.attemptId);
      forgetTakeAs(session.attemptId);
      navigate(await exitAfterDiscard(session.examId), { replace: true });
    } catch (err) {
      finishedRef.current = false;
      setActionError(getApiErrorMessage(err, 'Failed to cancel this attempt. Please try again.'));
      setBusy(null);
    }
  };

  /* ── Timer (server clock) ─────────────────────────────────────────────── */
  // Untimed (practice exam, material quiz): no countdown and no auto-submit.
  useEffect(() => {
    if (!session || !timed) {
      setRemaining(null);
      return;
    }
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
  }, [session, submit, timed]);

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
  /** Practice: question number → how its checked answer went. */
  const results = useMemo(() => {
    const m = new Map<number, CheckOutcome>();
    questions.forEach((q, i) => {
      const c = checks[q.questionId];
      if (c?.supported) m.set(i + 1, checkParts(q, answers[q.questionId], c).outcome);
    });
    return m;
  }, [questions, checks, answers]);

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
        <Button variant="outline" onClick={() => navigate(exitPath(session.examId))}>
          Back
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
  const check = checks[q.questionId];
  const checkable = instantCheck && CHECKABLE_TYPES.has(q.questionType);
  const progress = checkProgress(q, answers[q.questionId]);
  const isLast = current === questions.length - 1;
  const isCode = q.questionType === 'CODE';
  const goNext = () => (isLast ? setConfirm('submit') : goTo(current + 1));

  const checkAnswer = async () => {
    if (checking != null || check) return;
    const questionId = q.questionId;
    const response = answersRef.current[questionId] ?? null;
    const store = (res: AnswerCheck) =>
      setChecks(prev => {
        const next = { ...prev, [questionId]: res };
        saveChecks(session.attemptId, next);
        return next;
      });
    // The paper carries the key of a practice question: reveal it now, SA-09 confirms it below.
    const local = checkFromKey(q, response);
    if (local) {
      store(local);
      setJustChecked(questionId);
    }
    setChecking(local ? null : questionId);
    setActionError(null);
    try {
      // Saved alongside, not before: the check carries the answer itself, and waiting for the
      // draft save (and any autosave in flight) delayed every check. Submit flushes anyway.
      if (dirtyRef.current.has(questionId)) flush().catch(() => undefined);
      // Stores and locks the answer; the server verdict wins over the local one.
      const res = await studentPracticeExamService.checkAnswer(session.attemptId, q, response);
      store(res);
      if (!local) setJustChecked(questionId);
    } catch (err) {
      setActionError(getApiErrorMessage(err, 'Could not check this answer.'));
    } finally {
      setChecking(null);
    }
  };

  /** Practice single choice / true-false: picking an option is the answer, check it at once. */
  const changeAnswer = (response: AnswerResponse) => {
    setAnswer(q.questionId, response);
    if (instantCheck && !check && INSTANT_CHECK_TYPES.has(q.questionType)) void checkAnswer();
  };

  keyHandlerRef.current = e => {
    if (!instantCheck || confirm || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
    if (e.key === 'Enter') {
      // A focused button already reacts to Enter by itself.
      if (target?.closest('button, a')) return;
      // Last question: Enter does not finish — that is the header button's job.
      if (check) {
        if (isLast) return;
        goNext();
      }
      else if (checkable && progress.ready) void checkAnswer();
      else return;
      e.preventDefault();
      return;
    }
    if (check || !CHOICE_TYPES.has(q.questionType) || e.key.length !== 1) return;
    const index = /[1-9]/.test(e.key) ? Number(e.key) - 1 : /[a-z]/i.test(e.key) ? e.key.toLowerCase().charCodeAt(0) - 97 : -1;
    const option = q.options?.[index];
    if (!option) return;
    e.preventDefault();
    if (q.questionType !== 'MULTIPLE_CHOICE') return changeAnswer({ selectedOptionIds: [option.optionId] });
    const picked = new Set(answers[q.questionId]?.selectedOptionIds ?? []);
    if (picked.has(option.optionId)) picked.delete(option.optionId);
    else picked.add(option.optionId);
    changeAnswer({ selectedOptionIds: [...picked] });
  };

  return (
    <div className="h-[100dvh] flex flex-col bg-surface-alt">
      <header className="min-h-14 bg-surface border-b border-line-soft flex flex-wrap items-center px-[clamp(0.75rem,2vw,1.5rem)] py-2 gap-x-4 gap-y-2 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Icon.Logo className="w-7 h-7 flex-shrink-0 text-brand-ink" aria-hidden="true" />
          <span className="text-base font-bold text-content truncate">{session.title}</span>
          <span className="hidden sm:inline-flex flex-shrink-0 rounded-[6px] border border-line px-2 py-0.5 text-2xs font-medium text-content-soft">
            {isEssay ? 'Essay' : 'Quiz'}
          </span>
          {/* A self-made exam taken as an exam says so; a course exam needs no badge. */}
          {practice && (
            <Badge variant={instantCheck ? 'info' : 'warning'} size="sm">
              {instantCheck ? 'Practice' : 'Exam'}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <SaveIndicator state={saveState} />
          {remaining != null && <TimerDisplay seconds={remaining} warning={remaining < WARN_SECONDS} />}
          <Button
            size="sm"
            variant="outline"
            disabled={busy != null}
            loading={busy === 'cancel' || busy === 'save'}
            onClick={() => setConfirm('cancel')}
          >
            Cancel
          </Button>
          {/* Primary, not red: submitting is the expected finish, not a destructive action. */}
          {/* Practice finishes at once: every answer is already checked and locked, so there is nothing to confirm.
              A failed code grading turns it into "Finish anyway", as the exam's confirm dialog does. */}
          <Button
            size="sm"
            disabled={busy != null}
            loading={busy === 'submit'}
            onClick={() => (instantCheck ? void submit(false, codeGradeFailed) : setConfirm('submit'))}
          >
            {instantCheck ? (codeGradeFailed ? 'Finish anyway' : 'Finish') : 'Submit'}
          </Button>
        </div>
      </header>

      {actionError && !confirm && (
        <div role="alert" className="bg-danger-light text-danger text-sm px-6 py-2 flex items-center gap-2">
          <Icon.AlertCircle className="w-4 h-4 flex-shrink-0" /> {actionError}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        {/* Essay / diagram papers use the full width (30px gutters): draw.io and long answers need the room. */}
        {/* A question of a group: its passage in a column of its own (left), the question on the right. */}
        <GroupPassageSplit
          group={isCode ? null : q?.group}
          mainClassName={isCode ? 'p-[clamp(0.75rem,1.5vw,1.25rem)]' : isEssay ? 'p-[30px]' : 'p-[clamp(1rem,2.5vw,1.5rem)]'}
        >
          {/* CODE: the workspace fills the height between the question header and the nav buttons. */}
          <div className={isCode ? 'w-full space-y-3 md:h-full md:flex md:flex-col' : isEssay ? 'w-full space-y-3' : 'max-w-3xl mx-auto space-y-5'}>
            {/* Question header: number, type and points — the card below holds only the question text. */}
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-content uppercase tracking-wide">Question {current + 1}</h2>
              <Badge variant="info">{QUESTION_TYPE_LABEL[q.questionType] ?? q.questionType}</Badge>
              {q.maxPoints != null && <span className="text-xs text-content-subtle">{Number(q.maxPoints)} pts</span>}
              <span className="text-xs text-content-subtle">
                {current + 1} / {questions.length}
              </span>
              <ReportQuestionIssueButton className="ml-auto" questionId={q.questionId} />
            </div>

            {isCode ? (
              <div className="md:min-h-0 md:flex-1">
                <CodeQuestionWorkspace
                  key={q.questionId}
                  attemptId={session.attemptId}
                  question={q}
                  meta={codeMeta.get(q.questionId) ?? null}
                  languages={codeLanguages}
                  value={answers[q.questionId] ?? null}
                  onChange={changeAnswer}
                />
              </div>
            ) : (
              <>
                {/* Essay papers: a compact question (scrolls past ~12vh) so the answer area stays on screen. */}
                <div className={`card ${isEssay ? 'px-3 py-2 max-h-[12vh] overflow-y-auto' : 'p-[clamp(1rem,2.5vw,1.5rem)]'}`}>
                  <QuestionText
                    content={q.content}
                    className={`text-content font-medium ${isEssay ? 'text-xs leading-normal' : 'text-lg leading-relaxed'}`}
                  />
                </div>

                {/* A checked practice answer is locked: a revealed input locks itself (its key stays
                    readable), any other checked one is disabled by the fieldset. */}
                <fieldset disabled={Boolean(check) && !check?.supported} className="min-w-0">
                  <QuestionAnswerInput
                    key={q.questionId}
                    question={q}
                    value={answers[q.questionId] ?? null}
                    onChange={changeAnswer}
                    roomy={isEssay}
                    practice={instantCheck}
                    reveal={check?.supported ? check : null}
                    onEnter={checkable && !check && progress.ready ? () => void checkAnswer() : undefined}
                  />
                </fieldset>
              </>
            )}

            {instantCheck && !RUBRIC_TYPES.has(q.questionType) && (
              <PracticeCheck
                key={q.questionId}
                question={q}
                check={check}
                checking={checking === q.questionId}
                progress={progress}
                checkable={CHECKABLE_TYPES.has(q.questionType)}
                focusNext={justChecked === q.questionId}
                onCheck={checkAnswer}
              />
            )}

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
                {!isLast ? (
                  <Button data-next-question iconRight={<Icon.ChevronRight className="w-4 h-4" />} onClick={goNext}>
                    Next question
                  </Button>
                ) : (
                  // Practice finishes from the header only.
                  !instantCheck && (
                    <Button data-next-question icon={<Icon.Check className="w-4 h-4" />} onClick={goNext}>
                      Finish
                    </Button>
                  )
                )}
              </div>
            </div>
          </div>
        </GroupPassageSplit>

        <aside className="md:w-72 max-h-[35vh] md:max-h-none bg-surface border-t md:border-t-0 md:border-l border-line-soft p-5 overflow-y-auto flex-shrink-0">
          <h2 className="text-base font-semibold text-content mb-4">Question navigator</h2>
          <QuestionPalette
            total={questions.length}
            current={current + 1}
            answered={answeredSet}
            flagged={flagged}
            results={instantCheck ? results : undefined}
            onSelect={n => goTo(n - 1)}
          />
        </aside>
      </div>

      <Modal
        open={confirm === 'submit'}
        onClose={() => {
          if (busy != null) return;
          setConfirm(null);
          setCodeGradeFailed(false);
        }}
        title="Are you sure you want to submit?"
        size="sm"
        footer={
          <>
            <Button
              variant="outline"
              disabled={busy != null}
              onClick={() => {
                setConfirm(null);
                setCodeGradeFailed(false);
              }}
            >
              Keep working
            </Button>
            {/* CD-05 failed: submitting anyway closes the attempt without the test-case grading. */}
            <Button loading={busy === 'submit'} disabled={busy != null} onClick={() => submit(false, codeGradeFailed)}>
              {codeGradeFailed ? 'Submit anyway' : 'Submit exam'}
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
        title="Exit this attempt?"
        size="sm"
        // Closing the dialog (×, backdrop) keeps working.
        footer={
          <>
            <Button variant="danger" loading={busy === 'cancel'} disabled={busy != null} onClick={cancelAttempt}>
              Discard
            </Button>
            <Button loading={busy === 'save'} disabled={busy != null} onClick={saveAndExit}>
              Save and exit
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-base text-content-secondary leading-relaxed">
          <p>
            <span className="font-semibold text-content">Save and exit</span> keeps your {answeredSet.size} answer
            {answeredSet.size === 1 ? '' : 's'} so you can continue later.{' '}
            {!timed
              ? 'This practice has no time limit — it stays open until you come back.'
              : 'The timer keeps running: when time is up, the exam is submitted automatically.'}
          </p>
          <p>
            <span className="font-semibold text-content">Discard</span> deletes this attempt and its answers — it will not count
            in your history. This cannot be undone.
          </p>
        </div>
        {actionError && <p className="mt-3 text-sm text-danger">{actionError}</p>}
      </Modal>
    </div>
  );
}

const CHECKS_PREFIX = 'practice-checks:';

// localStorage, not sessionStorage: a saved practice attempt is resumed later, often in another tab.
function loadChecks(attemptId: number): Record<number, AnswerCheck> {
  try {
    const raw = localStorage.getItem(CHECKS_PREFIX + attemptId);
    return raw ? (JSON.parse(raw) as Record<number, AnswerCheck>) : {};
  } catch {
    return {};
  }
}

/**
 * Checks of a resumed practice attempt: the ones kept in this browser, overridden by every verdict SA-02
 * reports as stored on the server (the answer is locked) — so another device shows them too.
 */
function restoreChecks(session: AttemptSession): Record<number, AnswerCheck> {
  const checks = loadChecks(session.attemptId);
  for (const a of session.answers ?? []) {
    if (a.check) checks[a.questionId] = a.check;
  }
  return checks;
}

function saveChecks(attemptId: number, checks: Record<number, AnswerCheck>) {
  try {
    localStorage.setItem(CHECKS_PREFIX + attemptId, JSON.stringify(checks));
  } catch {
    // Storage blocked: the checks still hold until a reload.
  }
}

/** The attempt is closed (submitted or discarded): its checks are no longer needed. */
function clearChecks(attemptId: number) {
  try {
    localStorage.removeItem(CHECKS_PREFIX + attemptId);
  } catch {
    // Storage blocked: nothing was stored.
  }
}

const CHOICE_TYPES: ReadonlySet<string> = new Set(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE']);

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

