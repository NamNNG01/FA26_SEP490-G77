import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { PALETTE_RESULT_TONE, QuestionPalette } from '@/components/common/QuestionPalette';
import { Icon } from '@/assets/icons';
import { ROUTES, studentModulePath, studentPracticeResultPath } from '@/app/routes';
import { getApiErrorMessage } from '@/utils/apiError';
import { useToast } from '@/components/ui/ToastHost';
import { studentProgressService } from '@/services/studentProgress.service';
import { RUBRIC_TYPES, type AnswerResponse } from '@/services/studentAttempt.service';
import { INSTANT_CHECK_TYPES } from '@/services/studentPracticeExam.service';
import {
  AWAITING_GRADE,
  PRACTICE_MODE_LABEL,
  modulePracticeService,
  toAttemptQuestion,
  type PracticeAttempt,
  type PracticeQuestionView,
  type PracticeSession,
  type SessionQuestionSummary,
} from '@/services/modulePractice.service';
import { QUESTION_TYPE_LABEL, QuestionAnswerInput, QuestionText } from './QuestionAnswerInput';
import { checkProgress } from './PracticeCheck';
import { PracticeExplanation } from './PracticeExplanation';
import { PracticeVerdict, summaryOutcome } from './PracticeVerdict';
import { GroupPassageSplit } from './GroupPassageSplit';

/** A rubric attempt still being graded by AI is asked about again this often. */
const POLL_MS = 4000;
/** …and given up on after this long: the student can reopen the question later. */
const POLL_LIMIT_MS = 3 * 60_000;

/**
 * The take-exam screen for a Module Practice session (`/student/exam?practiceSessionId=`).
 * Same layout as an exam, but every question is answered on its own (MP-05), once: the answer is
 * locked as soon as it is sent. The BE sends only the verdict, never the key, so a wrong answer
 * offers an "Explain" (MP-09); practising it again is a new session (Review mistakes). Single choice / true-false are submitted on the pick. Essay, code and
 * diagram answers are graded by AI in the background; the screen polls MP-06 until they are.
 * Exit leaves the session open to continue later; Finish closes it (MP-07) and shows MP-08.
 */
export function ModulePracticeRunner({ sessionId }: { sessionId: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const questionParam = searchParams.get('question');

  const [session, setSession] = useState<PracticeSession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [current, setCurrent] = useState(0);

  const [views, setViews] = useState<Record<number, PracticeQuestionView>>({});
  const [viewError, setViewError] = useState<string | null>(null);
  const [viewReload, setViewReload] = useState(0);
  const [drafts, setDrafts] = useState<Record<number, AnswerResponse | null>>({});
  const [submitting, setSubmitting] = useState<number | null>(null);
  const submittingRef = useRef(false);
  /** Bookmarks toggled here (MP-10), by questionId; otherwise MP-04's isBookmarked holds. */
  const [bookmarkOverrides, setBookmarkOverrides] = useState<Record<number, boolean>>({});
  const [bookmarkBusy, setBookmarkBusy] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  /** When the current question was shown, for timeSpentSeconds. */
  const shownAtRef = useRef(Date.now());

  /* ── Load (MP-03) ─────────────────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    modulePracticeService
      .getSession(sessionId)
      .then(s => {
        if (cancelled) return;
        if (s.status !== 'IN_PROGRESS') {
          navigate(studentPracticeResultPath(s.sessionId), { replace: true });
          return;
        }
        const questions = [...s.questions].sort((a, b) => a.orderIndex - b.orderIndex);
        const wanted = questionParam ? Number(questionParam) : s.nextSessionQuestionId;
        const index = questions.findIndex(q => q.sessionQuestionId === wanted);
        setSession({ ...s, questions });
        setCurrent(index >= 0 ? index : 0);
      })
      .catch(err => {
        if (!cancelled) setLoadError(getApiErrorMessage(err, 'Failed to open the practice session.'));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, reload]);

  const questions = session?.questions ?? [];
  const summary: SessionQuestionSummary | undefined = questions[current];
  const sqid = summary?.sessionQuestionId;
  const view = sqid != null ? views[sqid] : undefined;
  const loaded = sqid != null && views[sqid] != null;

  /* ── One question (MP-04), on demand; the next one is fetched ahead ──── */
  // One request per question even when the prefetch and the page ask for it at the same time.
  const inflightRef = useRef(new Map<number, Promise<PracticeQuestionView>>());
  const fetchView = (practiceSessionId: number, id: number): Promise<PracticeQuestionView> => {
    let pending = inflightRef.current.get(id);
    if (!pending) {
      pending = modulePracticeService
        .getQuestion(practiceSessionId, id)
        .then(v => {
          setViews(prev => (prev[id] ? prev : { ...prev, [id]: v }));
          return v;
        })
        .finally(() => inflightRef.current.delete(id));
      inflightRef.current.set(id, pending);
    }
    return pending;
  };

  useEffect(() => {
    if (!session || sqid == null || loaded) return;
    let cancelled = false;
    setViewError(null);
    fetchView(session.sessionId, sqid).catch(err => {
      if (!cancelled) setViewError(getApiErrorMessage(err, 'Failed to load this question.'));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sessionId, sqid, loaded, viewReload]);

  // MP-04 is a full round trip: once this question is on screen, load the next one quietly so
  // "Next question" opens at once. A failure here is retried by the effect above when it is opened.
  const nextSqid = questions[current + 1]?.sessionQuestionId;
  const nextLoaded = nextSqid != null && views[nextSqid] != null;
  useEffect(() => {
    if (!session || !loaded || nextSqid == null || nextLoaded) return;
    fetchView(session.sessionId, nextSqid).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sessionId, loaded, nextSqid, nextLoaded]);

  // The URL follows the question, so a reload reopens it.
  useEffect(() => {
    shownAtRef.current = Date.now();
    if (sqid != null && String(sqid) !== questionParam) {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          next.set('question', String(sqid));
          return next;
        },
        { replace: true },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sqid]);

  const latest: PracticeAttempt | null = view?.attempts.length ? view.attempts[view.attempts.length - 1] : null;
  const awaiting = latest != null && AWAITING_GRADE.has(latest.gradingStatus);

  /* ── AI grading in the background: poll MP-06 ─────────────────────────── */
  useEffect(() => {
    if (!session || sqid == null || !awaiting) return;
    const started = Date.now();
    let stopped = false;
    const id = window.setInterval(async () => {
      if (Date.now() - started > POLL_LIMIT_MS) {
        window.clearInterval(id);
        return;
      }
      try {
        const h = await modulePracticeService.getHistory(session.sessionId, sqid);
        if (stopped) return;
        const last = h.attempts[h.attempts.length - 1];
        if (last && !AWAITING_GRADE.has(last.gradingStatus)) {
          setViews(prev => (prev[sqid] ? { ...prev, [sqid]: { ...prev[sqid], attempts: h.attempts } } : prev));
          patchSummary(sqid, { latestIsCorrect: last.isCorrect, latestScore: last.scoreEarned, gradingStatus: last.gradingStatus });
        }
      } catch {
        // Try again on the next tick.
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sessionId, sqid, awaiting]);

  /* ── Derived ──────────────────────────────────────────────────────────── */
  const answeredSet = useMemo(() => {
    const s = new Set<number>();
    questions.forEach((q, i) => q.answered && s.add(i + 1));
    return s;
  }, [questions]);
  const results = useMemo(() => {
    const m = new Map<number, keyof typeof PALETTE_RESULT_TONE>();
    questions.forEach((q, i) => {
      const o = summaryOutcome(q);
      if (o) m.set(i + 1, o);
    });
    return m;
  }, [questions]);
  const unanswered = questions.length - answeredSet.size;

  function patchSummary(id: number, patch: Partial<SessionQuestionSummary>) {
    setSession(prev => (prev ? { ...prev, questions: prev.questions.map(q => (q.sessionQuestionId === id ? { ...q, ...patch } : q)) } : prev));
  }

  const goTo = (index: number) => {
    setActionError(null);
    setCurrent(Math.max(0, Math.min(questions.length - 1, index)));
  };

  /* ── Submit one attempt (MP-05) ───────────────────────────────────────── */
  const submitAnswer = async (response: AnswerResponse | null) => {
    // The ref, not the state: a second click before the re-render must not send a second answer.
    if (!session || !view || submittingRef.current || view.attempts.length > 0 || !response) return;
    const id = view.sessionQuestionId;
    submittingRef.current = true;
    setSubmitting(id);
    setActionError(null);
    try {
      const res = await modulePracticeService.submitAnswer(session.sessionId, id, {
        response,
        timeSpentSeconds: Math.min(24 * 3600, Math.round((Date.now() - shownAtRef.current) / 1000)),
        requestKey: newRequestKey(),
      });
      const attempt: PracticeAttempt = {
        practiceAnswerId: res.practiceAnswerId,
        attemptNumber: res.attemptNumber,
        response,
        isCorrect: res.isCorrect,
        scoreEarned: res.scoreEarned,
        gradingStatus: res.gradingStatus,
        feedback: res.feedback,
        criteriaScores: res.criteriaScores,
        timeSpentSeconds: 0,
        answeredAt: res.answeredAt,
        gradedAt: res.gradedAt,
      };
      setViews(prev => {
        const v = prev[id];
        if (!v) return prev;
        const attempts = res.duplicate ? v.attempts : [...v.attempts, attempt];
        return { ...prev, [id]: { ...v, attempts, attemptCount: attempts.length } };
      });
      setSession(prev =>
        prev
          ? {
              ...prev,
              answeredCount: res.session.answeredCount,
              correctCount: res.session.correctCount,
              nextSessionQuestionId: res.session.nextSessionQuestionId,
              questions: prev.questions.map(q =>
                q.sessionQuestionId === id
                  ? {
                      ...q,
                      answered: true,
                      attemptCount: res.attemptNumber,
                      latestIsCorrect: res.isCorrect,
                      latestScore: res.scoreEarned,
                      gradingStatus: res.gradingStatus,
                    }
                  : q,
              ),
            }
          : prev,
      );
      shownAtRef.current = Date.now();
    } catch (err) {
      setActionError(getApiErrorMessage(err, 'Could not submit this answer.'));
    } finally {
      submittingRef.current = false;
      setSubmitting(null);
    }
  };

  /* ── Finish (MP-07) / exit ────────────────────────────────────────────── */
  const finish = async () => {
    if (!session) return;
    setFinishing(true);
    setActionError(null);
    try {
      await modulePracticeService.complete(session.sessionId);
      navigate(studentPracticeResultPath(session.sessionId), { replace: true });
    } catch (err) {
      setActionError(getApiErrorMessage(err, 'Failed to finish. Please try again.'));
      setFinishing(false);
    }
  };

  const exit = () => {
    if (!session) return navigate(ROUTES.studentCourses);
    toast.info('Your session is kept — continue it any time from the module.');
    navigate(studentModulePath(session.courseId, session.moduleId));
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
          <Button icon={<Icon.RefreshCw className="w-4 h-4" />} onClick={() => setReload(r => r + 1)}>
            Retry
          </Button>
        </div>
      </FullScreenMessage>
    );
  }

  if (!session) {
    return (
      <FullScreenMessage>
        <Spinner />
        <p className="text-sm text-content-soft">Preparing your practice…</p>
      </FullScreenMessage>
    );
  }

  if (questions.length === 0 || !summary) {
    return (
      <FullScreenMessage>
        <p className="text-base text-content-soft">This practice session has no question.</p>
        <Button variant="outline" onClick={exit}>
          Back
        </Button>
      </FullScreenMessage>
    );
  }

  const isLast = current === questions.length - 1;
  const isRubric = RUBRIC_TYPES.has(summary.questionType);
  const question = view ? toAttemptQuestion(view) : null;
  // One answer per question: once sent it is shown read-only.
  const editing = latest == null;
  const value = editing ? (drafts[summary.sessionQuestionId] ?? null) : (latest?.response ?? null);
  const progress = question ? checkProgress(question, value) : null;
  const busy = submitting === summary.sessionQuestionId;
  const questionMedia = view?.media?.filter(m => m.optionId == null && m.mediaType?.toUpperCase().startsWith('IMAGE')) ?? [];

  const changeAnswer = (response: AnswerResponse) => {
    // While the answer is on its way the pick stays as sent.
    if (!editing || submittingRef.current) return;
    setDrafts(prev => ({ ...prev, [summary.sessionQuestionId]: response }));
    if (INSTANT_CHECK_TYPES.has(summary.questionType)) void submitAnswer(response);
  };

  const isBookmarked = bookmarkOverrides[summary.questionId] ?? view?.isBookmarked ?? false;

  const toggleBookmark = async () => {
    if (bookmarkBusy) return;
    setBookmarkBusy(true);
    setActionError(null);
    try {
      const res = await studentProgressService.toggleBookmark(summary.questionId);
      setBookmarkOverrides(prev => ({ ...prev, [summary.questionId]: res.isBookmarked }));
    } catch (err) {
      setActionError(getApiErrorMessage(err, 'Could not update the bookmark.'));
    } finally {
      setBookmarkBusy(false);
    }
  };

  // The answer is the pick for single choice / true-false; every other type has a submit button.
  const submitButton =
    editing && question && !INSTANT_CHECK_TYPES.has(summary.questionType) ? (
      <div className="flex flex-wrap items-center gap-3">
        <Button
          icon={<Icon.CheckCircle className="w-4 h-4" />}
          loading={busy}
          disabled={busy || !progress?.ready}
          onClick={() => {
            // An untouched ordering is submitted as shown.
            if (summary.questionType === 'ORDERING' && !value?.orderedOptionIds?.length) {
              return void submitAnswer({ orderedOptionIds: (question.options ?? []).map(o => o.optionId) });
            }
            void submitAnswer(value);
          }}
        >
          {isRubric ? 'Submit for AI grading' : (progress?.label ?? 'Check answer')}
        </Button>
        {progress?.hint && !isRubric && <span className="text-xs text-content-subtle">{progress.hint}</span>}
        {isRubric && <span className="text-xs text-content-subtle">Graded by AI against the question's rubric.</span>}
      </div>
    ) : editing && INSTANT_CHECK_TYPES.has(summary.questionType) && !busy ? (
      <p className="text-xs text-content-subtle">Pick an answer — it is checked right away.</p>
    ) : null;

  return (
    <div className="h-[100dvh] flex flex-col bg-surface-alt">
      <header className="min-h-14 bg-surface border-b border-line-soft flex flex-wrap items-center px-[clamp(0.75rem,2vw,1.5rem)] py-2 gap-x-4 gap-y-2 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Icon.Logo className="w-7 h-7 flex-shrink-0 text-brand-ink" aria-hidden="true" />
          <span className="text-base font-bold text-content truncate">{session.moduleTitle}</span>
          <Badge variant="info" size="sm">
            {PRACTICE_MODE_LABEL[session.mode] ?? 'Practice'}
          </Badge>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="hidden sm:inline text-xs text-content-subtle">
            {session.answeredCount}/{session.questionCount} answered · {session.correctCount} correct
          </span>
          <Button size="sm" variant="outline" disabled={finishing} onClick={exit}>
            Exit
          </Button>
          <Button size="sm" loading={finishing} disabled={finishing} onClick={() => (unanswered > 0 ? setConfirmFinish(true) : void finish())}>
            Finish
          </Button>
        </div>
      </header>

      {actionError && !confirmFinish && (
        <div role="alert" className="bg-danger-light text-danger text-sm px-6 py-2 flex items-center gap-2">
          <Icon.AlertCircle className="w-4 h-4 flex-shrink-0" /> {actionError}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        {/* A question of a group: its passage in a column of its own (left), the question on the right. */}
        <GroupPassageSplit group={view?.group} mainClassName={isRubric ? 'p-[30px]' : 'p-[clamp(1rem,2.5vw,1.5rem)]'}>
          <div className={isRubric ? 'w-full space-y-3' : 'max-w-3xl mx-auto space-y-5'}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-content uppercase tracking-wide">Question {current + 1}</h2>
              <Badge variant="info">{QUESTION_TYPE_LABEL[summary.questionType] ?? summary.questionType}</Badge>
              {summary.attemptCount > 0 && (
                <span className="text-xs text-content-subtle">
                  {summary.attemptCount} attempt{summary.attemptCount === 1 ? '' : 's'}
                </span>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                disabled={bookmarkBusy}
                aria-pressed={isBookmarked}
                aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark question'}
                title={isBookmarked ? 'Remove bookmark' : 'Bookmark question'}
                onClick={toggleBookmark}
              >
                <Icon.Star className={`w-4 h-4 ${isBookmarked ? 'fill-current text-warning' : ''}`} />
              </Button>
              <span className="text-xs text-content-subtle">
                {current + 1} / {questions.length}
              </span>
            </div>

            {!view || !question ? (
              viewError ? (
                <div className="card p-6 flex flex-col items-center gap-3 text-center">
                  <p className="text-sm text-content-soft">{viewError}</p>
                  <Button size="sm" variant="outline" icon={<Icon.RefreshCw className="w-4 h-4" />} onClick={() => setViewReload(r => r + 1)}>
                    Retry
                  </Button>
                </div>
              ) : (
                <div className="card p-10 flex justify-center">
                  <Spinner />
                </div>
              )
            ) : (
              <>
                <div className={`card ${isRubric ? 'px-3 py-2 max-h-[18vh] overflow-y-auto' : 'p-[clamp(1rem,2.5vw,1.5rem)]'}`}>
                  <QuestionText
                    content={view.content}
                    className={`text-content font-medium ${isRubric ? 'text-sm leading-normal' : 'text-lg leading-relaxed'}`}
                  />
                  {questionMedia.map(m => (
                    <img key={m.mediaId} src={m.url} alt={m.altText ?? ''} className="mt-3 max-h-72 rounded-[8px] border border-line" />
                  ))}
                </div>

                {/* A submitted answer is shown read-only. */}
                <fieldset disabled={!editing || busy} className="min-w-0">
                  <QuestionAnswerInput key={summary.sessionQuestionId} question={question} value={value} onChange={changeAnswer} roomy={isRubric} practice />
                </fieldset>

                {submitButton}

                {/* MP-05 takes a moment: say so at once, where the verdict will appear. */}
                {busy && (
                  <div
                    role="status"
                    className="flex items-center gap-2 rounded-[10px] border border-line bg-surface px-4 py-3 text-sm font-medium text-content-soft"
                  >
                    <Icon.RefreshCw className="w-4 h-4 animate-spin flex-shrink-0" />
                    {isRubric ? 'Sending your answer…' : 'Checking your answer…'}
                  </div>
                )}

                {!editing && latest && <PracticeVerdict attempt={latest} />}

                {!editing && latest && !awaiting && (
                  <PracticeExplanation
                    questionId={summary.questionId}
                    sessionId={session.sessionId}
                    sessionQuestionId={summary.sessionQuestionId}
                    practiceAnswerId={latest.practiceAnswerId}
                  />
                )}
              </>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="outline" disabled={current === 0} icon={<Icon.ChevronLeft className="w-4 h-4" />} onClick={() => goTo(current - 1)}>
                Previous
              </Button>
              {!isLast && (
                <Button iconRight={<Icon.ChevronRight className="w-4 h-4" />} onClick={() => goTo(current + 1)}>
                  Next question
                </Button>
              )}
            </div>
          </div>
        </GroupPassageSplit>

        <aside className="md:w-72 max-h-[35vh] md:max-h-none bg-surface border-t md:border-t-0 md:border-l border-line-soft p-5 overflow-y-auto flex-shrink-0">
          <h2 className="text-base font-semibold text-content mb-4">Question navigator</h2>
          <QuestionPalette total={questions.length} current={current + 1} answered={answeredSet} flagged={NO_FLAGS} results={results} onSelect={n => goTo(n - 1)} />
          <div className="mt-4 space-y-2 pt-4 border-t border-line-soft">
            {[
              { swatch: PALETTE_RESULT_TONE.correct, label: 'Correct', count: countOf(results, 'correct') },
              { swatch: PALETTE_RESULT_TONE.partial, label: 'Scored by AI', count: countOf(results, 'partial') },
              { swatch: PALETTE_RESULT_TONE.wrong, label: 'Wrong', count: countOf(results, 'wrong') },
              { swatch: 'bg-success-light border-success-line', label: 'Answered, not graded yet', count: answeredSet.size - results.size },
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
        open={confirmFinish}
        onClose={() => !finishing && setConfirmFinish(false)}
        title="Finish this practice?"
        size="sm"
        footer={
          <>
            <Button variant="outline" disabled={finishing} onClick={() => setConfirmFinish(false)}>
              Keep practicing
            </Button>
            <Button loading={finishing} disabled={finishing} onClick={finish}>
              Finish
            </Button>
          </>
        }
      >
        <p className="text-base text-content-secondary leading-relaxed">
          {unanswered} question{unanswered === 1 ? ' is' : 's are'} still unanswered. They are not counted as wrong — you can practice
          them in a new session.
        </p>
        {actionError && <p className="mt-3 text-sm text-danger">{actionError}</p>}
      </Modal>
    </div>
  );
}

/** Practice has no "flag for review": the palette gets an empty set. */
const NO_FLAGS: Set<number> = new Set();

function newRequestKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function countOf(results: Map<number, string>, outcome: string): number {
  let n = 0;
  results.forEach(o => {
    if (o === outcome) n++;
  });
  return n;
}

function FullScreenMessage({ children }: { children: React.ReactNode }) {
  return <div className="h-[100dvh] flex flex-col items-center justify-center gap-4 bg-surface-alt px-6">{children}</div>;
}
