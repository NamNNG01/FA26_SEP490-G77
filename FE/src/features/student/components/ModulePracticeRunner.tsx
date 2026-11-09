import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
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
  gradeLocally,
  modulePracticeService,
  toAnswerReveal,
  toAttemptQuestion,
  type PracticeAttempt,
  type PracticeQuestionView,
  type PracticeSession,
  type SessionQuestionSummary,
} from '@/services/modulePractice.service';
import { QUESTION_TYPE_LABEL, QuestionAnswerInput, QuestionText } from './QuestionAnswerInput';
import { checkProgress } from './PracticeCheck';
import { PracticeExplanation } from './PracticeExplanation';
import { PracticeVerdict, SCORE_ONLY_TYPES, summaryOutcome } from './PracticeVerdict';
import { GroupPassageSplit } from './GroupPassageSplit';

/** A rubric attempt still being graded by AI is asked about again this often. */
const POLL_MS = 4000;
/** …and given up on after this long: the student can reopen the question later. */
const POLL_LIMIT_MS = 3 * 60_000;
/** The paper is worked through in parts of this many questions, each closed by its own results. */
const PART_SIZE = 8;

/** Marks an attempt shown from the local check while MP-05 is still saving it. */
const UNSAVED_ANSWER_ID = 0;
/** A background save that fails on the network or a 5xx / 429 is tried this many more times… */
const SAVE_RETRIES = 3;
/** …after 1 s, 2 s, 3 s. */
const SAVE_RETRY_MS = 1000;

/**
 * The take-exam screen for a Module Practice session (`/student/exam?practiceSessionId=`).
 * The paper is split into parts of PART_SIZE questions, loaded one part per MP-04 batch call; the
 * progress bar on top shows every part, and a part's results show once all its questions are
 * answered (a rubric answer still grading, or whose grading failed, counts as answered), then
 * "Continue" opens the next one. Every question is answered once (MP-05) and locked.
 * Answers are saved in the background with retries: auto-graded questions are checked at once
 * against MP-04's `correctAnswer`, whose key shows beside the answer at once, and MP-05's verdict wins when it arrives; an answer that cannot be
 * saved is reopened with a toast. "Explain" (MP-09) is only offered in a part's results.
 * Single choice / true-false are submitted on the pick. Essay, code and diagram answers are graded
 * by AI in the background; the screen polls MP-06 until they are.
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
  /** The part whose results are on screen instead of a question; null while answering. */
  const [resultPart, setResultPart] = useState<number | null>(null);

  const [views, setViews] = useState<Record<number, PracticeQuestionView>>({});
  const [viewError, setViewError] = useState<string | null>(null);
  const [viewReload, setViewReload] = useState(0);
  const [drafts, setDrafts] = useState<Record<number, AnswerResponse | null>>({});
  /** Answers sent without a key to check against (MP-05's verdict is awaited on them), by sessionQuestionId. */
  const [checking, setChecking] = useState<Set<number>>(() => new Set());
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
        let index = questions.findIndex(q => q.sessionQuestionId === wanted);
        const firstOpen = questions.findIndex(q => !q.answered);
        // A part opens only once the ones before it are done.
        if (index < 0 || (firstOpen >= 0 && partOf(index) > partOf(firstOpen))) index = firstOpen;
        setSession({ ...s, questions });
        if (index >= 0) {
          setCurrent(index);
        } else if (questions.length > 0) {
          // Every question answered but not finished yet: back on the last part's results.
          setCurrent(questions.length - 1);
          setResultPart(partOf(questions.length - 1));
        }
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

  /* ── Parts ────────────────────────────────────────────────────────────── */
  const partCount = Math.ceil(questions.length / PART_SIZE);
  const part = partOf(current);
  const partStart = part * PART_SIZE;
  const partEnd = Math.min(questions.length, partStart + PART_SIZE);
  const partQuestions = (p: number) => questions.slice(p * PART_SIZE, (p + 1) * PART_SIZE);
  const partDone = (p: number) => partQuestions(p).every(q => q.answered);
  // The first part with an unanswered question; the parts after it stay locked.
  const firstOpenIndex = questions.findIndex(q => !q.answered);
  const openPart = firstOpenIndex >= 0 ? partOf(firstOpenIndex) : partCount - 1;

  /* ── A whole part (MP-04 batch) in one call; the next part is fetched ahead ── */
  // One request per question even when the prefetch and the page ask for it at the same time.
  const inflightRef = useRef(new Map<number, Promise<void>>());
  const fetchViews = (practiceSessionId: number, ids: number[]): Promise<void> => {
    const fresh = ids.filter(id => !inflightRef.current.has(id));
    if (fresh.length > 0) {
      const pending = modulePracticeService
        .getQuestions(practiceSessionId, fresh)
        .then(list => {
          setViews(prev => {
            const next = { ...prev };
            list.forEach(v => {
              if (!next[v.sessionQuestionId]) next[v.sessionQuestionId] = v;
            });
            return next;
          });
        })
        .finally(() => fresh.forEach(id => inflightRef.current.delete(id)));
      fresh.forEach(id => inflightRef.current.set(id, pending));
    }
    return Promise.all(ids.map(id => inflightRef.current.get(id))).then(() => undefined);
  };

  const missingOf = (p: number) => partQuestions(p).map(q => q.sessionQuestionId).filter(id => views[id] == null);
  const partMissing = missingOf(part).join(',');
  useEffect(() => {
    if (!session || !partMissing) return;
    let cancelled = false;
    setViewError(null);
    fetchViews(session.sessionId, partMissing.split(',').map(Number)).catch(err => {
      if (!cancelled) setViewError(getApiErrorMessage(err, 'Failed to load these questions.'));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sessionId, partMissing, viewReload]);

  // Once this part is on screen, load the next one quietly so "Continue" opens at once.
  // A failure here is retried by the effect above when that part is opened.
  const nextPartMissing = part + 1 < partCount ? missingOf(part + 1).join(',') : '';
  useEffect(() => {
    if (!session || partMissing || !nextPartMissing) return;
    fetchViews(session.sessionId, nextPartMissing.split(',').map(Number)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sessionId, partMissing, nextPartMissing]);

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

  /* ── AI grading in the background: poll MP-06 for every saved answer still being graded ── */
  // Not only the question on screen: a grade arriving while the part's results are open shows there.
  const gradingIds = questions
    .filter(q => q.answered && AWAITING_GRADE.has(q.gradingStatus))
    .map(q => q.sessionQuestionId)
    .filter(id => views[id]?.attempts.some(a => a.practiceAnswerId !== UNSAVED_ANSWER_ID))
    .join(',');
  /** When polling of each question started, so a re-run of the effect keeps the time limit. */
  const pollStartRef = useRef(new Map<number, number>());
  useEffect(() => {
    if (!session || !gradingIds) return;
    const ids = gradingIds.split(',').map(Number);
    ids.forEach(id => pollStartRef.current.has(id) || pollStartRef.current.set(id, Date.now()));
    let stopped = false;
    const timer = window.setInterval(() => {
      ids
        .filter(id => Date.now() - (pollStartRef.current.get(id) ?? 0) <= POLL_LIMIT_MS)
        .forEach(async id => {
          try {
            const h = await modulePracticeService.getHistory(session.sessionId, id);
            if (stopped) return;
            const last = h.attempts[h.attempts.length - 1];
            if (last && !AWAITING_GRADE.has(last.gradingStatus)) {
              setViews(prev => (prev[id] ? { ...prev, [id]: { ...prev[id], attempts: h.attempts } } : prev));
              patchSummary(id, { latestIsCorrect: last.isCorrect, latestScore: last.scoreEarned, gradingStatus: last.gradingStatus });
            }
          } catch {
            // Try again on the next tick.
          }
        });
    }, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sessionId, gradingIds]);

  /* ── Derived ──────────────────────────────────────────────────────────── */
  const unanswered = useMemo(() => questions.filter(q => !q.answered).length, [questions]);

  function patchSummary(id: number, patch: Partial<SessionQuestionSummary>) {
    setSession(prev => (prev ? { ...prev, questions: prev.questions.map(q => (q.sessionQuestionId === id ? { ...q, ...patch } : q)) } : prev));
  }

  const goTo = (index: number) => {
    const target = Math.max(0, Math.min(questions.length - 1, index));
    if (partOf(target) > openPart) return;
    setActionError(null);
    setResultPart(null);
    setCurrent(target);
  };

  /** A part from the progress bar: its results once it is done, else its first unanswered question. */
  const openPartAt = (p: number) => {
    if (p > openPart) return;
    if (partDone(p)) {
      setActionError(null);
      setCurrent(p * PART_SIZE);
      setResultPart(p);
      return;
    }
    const firstOpen = partQuestions(p).findIndex(q => !q.answered);
    goTo(p * PART_SIZE + Math.max(0, firstOpen));
  };

  /* ── Submit one attempt (MP-05) ───────────────────────────────────────── */
  // Saved in the background: the answer is shown (and the part moves on) at once, MP-05 follows.
  // The ref, not the state: a second click before the re-render must not send a second answer.
  const savesRef = useRef(new Map<number, Promise<void>>());
  const submitAnswer = (response: AnswerResponse | null) => {
    if (!session || !view || savesRef.current.has(view.sessionQuestionId) || view.attempts.length > 0 || !response) return;
    const save = saveAnswer(session.sessionId, view, current + 1, response).finally(() => {
      savesRef.current.delete(view.sessionQuestionId);
      setChecking(prev => {
        const next = new Set(prev);
        next.delete(view.sessionQuestionId);
        return next;
      });
    });
    savesRef.current.set(view.sessionQuestionId, save);
  };

  const saveAnswer = async (practiceSessionId: number, q: PracticeQuestionView, number: number, response: AnswerResponse) => {
    const id = q.sessionQuestionId;
    setActionError(null);
    const rubric = RUBRIC_TYPES.has(q.questionType);
    // Auto-graded: the verdict from MP-04's key. Rubric: "grading" until MP-05 hands it to the AI.
    const local = rubric ? null : gradeLocally(q, response);
    const unsaved: PracticeAttempt | null =
      !rubric && local == null
        ? null
        : {
            practiceAnswerId: UNSAVED_ANSWER_ID,
            attemptNumber: 1,
            response,
            isCorrect: local,
            scoreEarned: null,
            gradingStatus: rubric ? 'PENDING_AI' : 'AUTO',
            feedback: null,
            criteriaScores: null,
            timeSpentSeconds: 0,
            answeredAt: new Date().toISOString(),
            gradedAt: null,
          };
    const withoutUnsaved = (attempts: PracticeAttempt[]) => attempts.filter(a => a.practiceAnswerId !== UNSAVED_ANSWER_ID);
    if (unsaved) {
      setViews(prev => (prev[id] ? { ...prev, [id]: { ...prev[id], attempts: [unsaved] } } : prev));
      patchSummary(id, { answered: true, attemptCount: 1, latestIsCorrect: local, latestScore: null, gradingStatus: unsaved.gradingStatus });
    } else {
      // No key to check against: wait for MP-05's verdict on the question.
      setChecking(prev => new Set(prev).add(id));
    }
    const body = {
      response,
      timeSpentSeconds: Math.min(24 * 3600, Math.round((Date.now() - shownAtRef.current) / 1000)),
      // The same key on every retry: MP-05 answers a repeat with the stored attempt.
      requestKey: newRequestKey(),
    };
    shownAtRef.current = Date.now();
    try {
      const res = await withRetry(() => modulePracticeService.submitAnswer(practiceSessionId, id, body));
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
        // The saved attempt replaces the local one: MP-05's verdict wins.
        const saved = withoutUnsaved(v.attempts);
        const attempts = res.duplicate && saved.length > 0 ? saved : [...saved, attempt];
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
    } catch (err) {
      // Not saved even after the retries: the question opens again with the pick still in the draft.
      setViews(prev => (prev[id] ? { ...prev, [id]: { ...prev[id], attempts: withoutUnsaved(prev[id].attempts) } } : prev));
      patchSummary(id, { answered: false, attemptCount: 0, latestIsCorrect: null, latestScore: null, gradingStatus: 'UNANSWERED' });
      toast.error(`Question ${number} could not be saved — please answer it again.`, {
        details: [getApiErrorMessage(err, 'Could not submit this answer.')],
        duration: 8000,
      });
    }
  };

  /* ── Grade again: an answer whose AI grading failed ───────────────────── */
  // MP-05 is append-only: the same response sent again is a new attempt, handed to the AI again.
  const [regrading, setRegrading] = useState<Set<number>>(() => new Set());
  const regrade = async (id: number) => {
    const v = views[id];
    const last = v?.attempts[v.attempts.length - 1];
    if (!session || !last?.response || last.gradingStatus !== 'FAILED' || regrading.has(id)) return;
    setRegrading(prev => new Set(prev).add(id));
    try {
      const body = { response: last.response, timeSpentSeconds: 0, requestKey: newRequestKey() };
      const res = await withRetry(() => modulePracticeService.submitAnswer(session.sessionId, id, body));
      const attempt: PracticeAttempt = {
        practiceAnswerId: res.practiceAnswerId,
        attemptNumber: res.attemptNumber,
        response: last.response,
        isCorrect: res.isCorrect,
        scoreEarned: res.scoreEarned,
        gradingStatus: res.gradingStatus,
        feedback: res.feedback,
        criteriaScores: res.criteriaScores,
        timeSpentSeconds: 0,
        answeredAt: res.answeredAt,
        gradedAt: res.gradedAt,
      };
      // The poll above picks it up while the AI grades it.
      pollStartRef.current.delete(id);
      setViews(prev => (prev[id] ? { ...prev, [id]: { ...prev[id], attempts: [...prev[id].attempts, attempt], attemptCount: res.attemptNumber } } : prev));
      patchSummary(id, { attemptCount: res.attemptNumber, latestIsCorrect: res.isCorrect, latestScore: res.scoreEarned, gradingStatus: res.gradingStatus });
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not send this answer for grading again.'));
    } finally {
      setRegrading(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  /* ── Finish (MP-07) / exit ────────────────────────────────────────────── */
  const finish = async () => {
    if (!session) return;
    setFinishing(true);
    setActionError(null);
    // Answers still being saved go in before the session closes.
    await Promise.allSettled(savesRef.current.values());
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

  const isLastOfPart = current === partEnd - 1;
  const partUnanswered = partQuestions(part).filter(q => !q.answered).length;
  const thisPartDone = partUnanswered === 0;
  const isRubric = RUBRIC_TYPES.has(summary.questionType);
  const question = view ? toAttemptQuestion(view) : null;
  // One answer per question: once sent it is shown read-only.
  const editing = latest == null;
  const value = editing ? (drafts[summary.sessionQuestionId] ?? null) : (latest?.response ?? null);
  const progress = question ? checkProgress(question, value) : null;
  const answerVerdict = verdictOf(summary.questionType, latest);
  // Practice: once answered, the key shows beside the answer (rubric types have none).
  const reveal = !editing && view ? toAnswerReveal(view) : null;
  // Only an answer with no key to check against waits on MP-05; every other one is saved behind the scenes.
  const busy = checking.has(summary.sessionQuestionId);
  const questionMedia = imagesOf(view);

  const changeAnswer = (response: AnswerResponse) => {
    // While the answer is on its way the pick stays as sent.
    if (!editing || savesRef.current.has(summary.sessionQuestionId)) return;
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
          onClick={() => void submitAnswer(value)}
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
            {questions.length - unanswered}/{questions.length} answered · {questions.filter(q => q.latestIsCorrect === true).length} correct
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

      <PartProgress
        questions={questions}
        current={current}
        resultPart={resultPart}
        openPart={openPart}
        onSelect={openPartAt}
      />

      {resultPart != null ? (
        <div className="flex-1 min-h-0 flex">
          <PartResults
            part={resultPart}
            partCount={partCount}
            questions={partQuestions(resultPart)}
            views={views}
            sessionId={session.sessionId}
            regrading={regrading}
            onRegrade={id => void regrade(id)}
            finishing={finishing}
            onOpen={index => goTo(resultPart * PART_SIZE + index)}
            // A save that failed after the results opened sends the student back to that question first.
            onContinue={() => openPartAt(partDone(resultPart) ? resultPart + 1 : resultPart)}
            onFinish={() => (unanswered > 0 ? setConfirmFinish(true) : void finish())}
          />
        </div>
      ) : (
      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        {/* A question of a group: its passage in a column of its own (left), the question on the right. */}
        <GroupPassageSplit group={view?.group} narrow mainClassName={isRubric ? 'p-[30px]' : 'p-[clamp(1rem,2.5vw,1.5rem)]'}>
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

                {/* A submitted answer is shown read-only: a revealed input locks itself (its "Show the
                    correct order" stays clickable), any other one is disabled by the fieldset. */}
                <fieldset disabled={(!editing && !reveal) || busy} className="min-w-0">
                  <QuestionAnswerInput
                    key={summary.sessionQuestionId}
                    question={question}
                    value={value}
                    onChange={changeAnswer}
                    roomy={isRubric}
                    practice
                    verdict={answerVerdict}
                    reveal={reveal}
                  />
                </fieldset>

                {submitButton}

                {/* No key to check against: MP-05's verdict is waited for, where it will appear. */}
                {busy && editing && (
                  <div
                    role="status"
                    className="flex items-center gap-2 rounded-[10px] border border-line bg-surface px-4 py-3 text-sm font-medium text-content-soft"
                  >
                    <Icon.RefreshCw className="w-4 h-4 animate-spin flex-shrink-0" /> Checking your answer…
                  </div>
                )}

                {/* Right / wrong and the key sit on the answer; the box below is left for scores, grading and failures.
                    The explanation waits for the part's results. */}
                {!editing && latest && answerVerdict == null && <PracticeVerdict attempt={latest} questionType={summary.questionType} />}
              </>
            )}

            {/* Forward only, and only once this question is answered (or sent for grading); the part's
                last question leads to its results. */}
            {!editing && (
              <div className="flex flex-wrap items-center justify-end gap-3">
                {!isLastOfPart ? (
                  <Button iconRight={<Icon.ChevronRight className="w-4 h-4" />} onClick={() => goTo(current + 1)}>
                    Next question
                  </Button>
                ) : thisPartDone ? (
                  <Button iconRight={<Icon.ChevronRight className="w-4 h-4" />} onClick={() => openPartAt(part)}>
                    See part {part + 1} results
                  </Button>
                ) : (
                  // An earlier answer of this part could not be saved: back to it first.
                  <Button iconRight={<Icon.ChevronRight className="w-4 h-4" />} onClick={() => openPartAt(part)}>
                    Answer question {partStart + partQuestions(part).findIndex(q => !q.answered) + 1} again
                  </Button>
                )}
              </div>
            )}
          </div>
        </GroupPassageSplit>
      </div>
      )}

      <Modal
        error={actionError && <Alert type="error" message={actionError} />}
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
      </Modal>
    </div>
  );
}

/** Index of the part a question (0-based) belongs to. */
function partOf(index: number): number {
  return Math.floor(index / PART_SIZE);
}

/** Right / wrong of a submitted, graded answer — never for essay / diagram, which only get a score. */
function verdictOf(questionType: string, latest: PracticeAttempt | null): boolean | null {
  return latest && !SCORE_ONLY_TYPES.has(questionType) && !AWAITING_GRADE.has(latest.gradingStatus) && latest.gradingStatus !== 'FAILED'
    ? latest.isCorrect
    : null;
}

/** The images of the question itself (not of its options). */
function imagesOf(view: PracticeQuestionView | undefined) {
  return view?.media?.filter(m => m.optionId == null && m.mediaType?.toUpperCase().startsWith('IMAGE')) ?? [];
}

type Outcome = 'correct' | 'wrong' | 'partial' | 'awaiting' | 'failed' | 'answered' | 'open';

/** How one question of the paper went, for the progress bar and a part's results. */
function outcomeOf(q: SessionQuestionSummary): Outcome {
  if (!q.answered) return 'open';
  if (AWAITING_GRADE.has(q.gradingStatus)) return 'awaiting';
  if (q.gradingStatus === 'FAILED') return 'failed';
  return summaryOutcome(q) ?? 'answered';
}

const TICK_TONE: Record<Outcome, string> = {
  correct: 'bg-success-solid',
  wrong: 'bg-danger-solid',
  partial: 'bg-warning',
  awaiting: 'bg-info',
  failed: 'bg-content-subtle',
  answered: 'bg-content-subtle',
  open: 'bg-line',
};

/**
 * One segment per part of PART_SIZE questions, a tick per question coloured by how it went.
 * A done part opens its results, the part being answered its first open question; later parts are locked.
 */
function PartProgress({
  questions,
  current,
  resultPart,
  openPart,
  onSelect,
}: {
  questions: SessionQuestionSummary[];
  current: number;
  resultPart: number | null;
  openPart: number;
  onSelect: (part: number) => void;
}) {
  const partCount = Math.ceil(questions.length / PART_SIZE);
  const activePart = resultPart ?? partOf(current);
  const answered = questions.filter(q => q.answered).length;
  return (
    <nav aria-label="Practice progress" className="bg-surface border-b border-line-soft px-[clamp(0.75rem,2vw,1.5rem)] py-3 flex-shrink-0">
      <div className="flex items-center justify-between gap-3 mb-2 text-xs">
        <span className="font-semibold text-content">
          Part {activePart + 1} of {partCount}
        </span>
        <span className="text-content-subtle">
          {answered}/{questions.length} answered
        </span>
      </div>
      <ol className="flex gap-1.5">
        {Array.from({ length: partCount }, (_, p) => {
          const items = questions.slice(p * PART_SIZE, (p + 1) * PART_SIZE);
          const locked = p > openPart;
          const done = items.every(q => q.answered);
          const active = p === activePart;
          return (
            <li key={p} className="flex-1 min-w-0" style={{ flexGrow: items.length }}>
              <button
                type="button"
                disabled={locked}
                onClick={() => onSelect(p)}
                aria-current={active ? 'step' : undefined}
                aria-label={`Part ${p + 1}, questions ${p * PART_SIZE + 1}–${p * PART_SIZE + items.length}${done ? ', done' : locked ? ', locked' : ''}`}
                title={locked ? 'Finish the parts before this one first' : done ? `See part ${p + 1} results` : `Go to part ${p + 1}`}
                className={`w-full flex gap-px rounded-[4px] p-0.5 transition-colors ${
                  active ? 'ring-2 ring-brand-600 ring-offset-1 ring-offset-surface' : ''
                } ${locked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-surface-hover'}`}
              >
                {items.map((q, i) => {
                  const index = p * PART_SIZE + i;
                  const here = resultPart == null && index === current;
                  return (
                    <span
                      key={q.sessionQuestionId}
                      className={`h-2 flex-1 min-w-0 rounded-[2px] ${here ? 'bg-brand-600' : TICK_TONE[outcomeOf(q)]}`}
                    />
                  );
                })}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

const OUTCOME_LABEL: Record<Outcome, string> = {
  correct: 'Correct',
  wrong: 'Wrong',
  partial: 'Scored',
  awaiting: 'Grading…',
  failed: 'Not graded',
  answered: 'Answered',
  open: 'Not answered',
};

const OUTCOME_TEXT: Record<Outcome, string> = {
  correct: 'text-success-strong',
  wrong: 'text-danger-strong',
  partial: 'text-warning-strong',
  awaiting: 'text-info',
  failed: 'text-content-soft',
  answered: 'text-content-soft',
  open: 'text-content-subtle',
};

/** The question text as one plain line for a results row. */
function plainText(content: string | undefined): string {
  return (content ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\{\{\d+\}\}/g, '___')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Results of one finished part, side by side: the chosen question on the left (60%) — the answer as
 * given, the key, its verdict or AI score, and "Explain" (MP-09), only offered here — and the part's
 * questions on the right (40%). Below `md` the list comes first, as a row of chips.
 */
function PartResults({
  part,
  partCount,
  questions,
  views,
  sessionId,
  regrading,
  onRegrade,
  finishing,
  onOpen,
  onContinue,
  onFinish,
}: {
  part: number;
  partCount: number;
  questions: SessionQuestionSummary[];
  views: Record<number, PracticeQuestionView>;
  sessionId: number;
  /** Answers being sent for grading again, by sessionQuestionId. */
  regrading: ReadonlySet<number>;
  onRegrade: (sessionQuestionId: number) => void;
  finishing: boolean;
  onOpen: (indexInPart: number) => void;
  onContinue: () => void;
  onFinish: () => void;
}) {
  const outcomes = questions.map(outcomeOf);
  const isLastPart = part === partCount - 1;
  const first = part * PART_SIZE + 1;
  const [selected, setSelected] = useState(0);
  // A save that failed after the results opened: that question has to be answered again first.
  const firstOpen = outcomes.indexOf('open');

  useEffect(() => setSelected(0), [part]);

  // An unanswered row (its save failed) goes back to the question instead.
  const choose = (i: number) => (outcomes[i] === 'open' ? onOpen(i) : setSelected(i));
  const label = (q: SessionQuestionSummary) => QUESTION_TYPE_LABEL[q.questionType] ?? q.questionType;
  const shown = questions[selected];
  const shownView = shown ? views[shown.sessionQuestionId] : undefined;

  return (
    <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
      <aside className="order-1 md:order-2 md:w-2/5 md:min-h-0 flex flex-col bg-surface border-b md:border-b-0 md:border-l border-line-soft flex-shrink-0">
        <h2 className="px-4 pt-4 pb-3 text-sm font-semibold text-content">
          Part {part + 1} of {partCount} · questions {first}–{first + questions.length - 1}
        </h2>

        {/* Narrow screens: one chip per question. */}
        <div className="md:hidden flex gap-2 overflow-x-auto px-4 pb-3" role="tablist" aria-label="Questions of this part">
          {questions.map((q, i) => (
            <button
              key={q.sessionQuestionId}
              type="button"
              role="tab"
              aria-selected={i === selected}
              aria-label={`Question ${first + i}, ${OUTCOME_LABEL[outcomes[i]]}`}
              onClick={() => choose(i)}
              className={`flex-shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                i === selected ? 'border-brand-600 bg-primary-light text-content' : 'border-line text-content-secondary'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${TICK_TONE[outcomes[i]]}`} aria-hidden="true" />Q{first + i}
            </button>
          ))}
        </div>

        <ul className="hidden md:block flex-1 min-h-0 overflow-y-auto divide-y divide-line-soft border-t border-line-soft" role="tablist" aria-label="Questions of this part">
          {questions.map((q, i) => {
            const o = outcomes[i];
            return (
              <li key={q.sessionQuestionId}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={i === selected}
                  onClick={() => choose(i)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-l-4 ${
                    i === selected ? 'bg-primary-light border-brand-600' : 'border-transparent hover:bg-surface-hover'
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${TICK_TONE[o]}`} aria-hidden="true" />
                  <span className="text-sm font-semibold text-content w-9 flex-shrink-0">Q{first + i}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-content-secondary truncate">{plainText(views[q.sessionQuestionId]?.content) || label(q)}</span>
                    <span className="block text-xs text-content-subtle">{label(q)}</span>
                  </span>
                  <span className={`text-xs font-semibold flex-shrink-0 ${OUTCOME_TEXT[o]}`}>{OUTCOME_LABEL[o]}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="p-4 border-t border-line-soft flex justify-end">
          {firstOpen >= 0 ? (
            <Button iconRight={<Icon.ChevronRight className="w-4 h-4" />} onClick={() => onOpen(firstOpen)}>
              Answer question {first + firstOpen} again
            </Button>
          ) : isLastPart ? (
            <Button icon={<Icon.CheckCircle className="w-4 h-4" />} loading={finishing} disabled={finishing} onClick={onFinish}>
              Finish practice
            </Button>
          ) : (
            <Button iconRight={<Icon.ChevronRight className="w-4 h-4" />} onClick={onContinue}>
              Continue to part {part + 2}
            </Button>
          )}
        </div>
      </aside>

      <section
        role="tabpanel"
        aria-label={shown ? `Question ${first + selected}` : undefined}
        className="order-2 md:order-1 md:w-3/5 flex-1 min-h-0 overflow-y-auto p-[clamp(1rem,2.5vw,1.5rem)]"
      >
        {shown && (
          <div className="max-w-3xl mx-auto space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-content uppercase tracking-wide">Question {first + selected}</h3>
              <Badge variant="info">{label(shown)}</Badge>
              <span className={`ml-auto text-xs font-semibold ${OUTCOME_TEXT[outcomes[selected]]}`}>{OUTCOME_LABEL[outcomes[selected]]}</span>
            </div>
            {shownView ? (
              <ReviewAnswer
                key={shown.sessionQuestionId}
                view={shownView}
                sessionId={sessionId}
                regrading={regrading.has(shown.sessionQuestionId)}
                onRegrade={() => onRegrade(shown.sessionQuestionId)}
              />
            ) : (
              <div className="card p-10 flex justify-center">
                <Spinner />
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}


/** One answered question in a part's results: the answer read-only beside the key, its outcome, and "Explain". */
function ReviewAnswer({
  view,
  sessionId,
  regrading,
  onRegrade,
}: {
  view: PracticeQuestionView;
  sessionId: number;
  regrading: boolean;
  onRegrade: () => void;
}) {
  const latest = view.attempts.length ? view.attempts[view.attempts.length - 1] : null;
  const verdict = verdictOf(view.questionType, latest);
  const saved = latest != null && latest.practiceAnswerId !== UNSAVED_ANSWER_ID;
  const reveal = toAnswerReveal(view);
  return (
    <div className="space-y-3">
      {view.group?.passageText?.trim() && (
        <details className="rounded-[10px] border border-line bg-surface px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold text-content-soft">{view.group.title || 'Reading passage'}</summary>
          <QuestionText content={view.group.passageText} className="mt-2 text-sm text-content-secondary leading-relaxed" />
        </details>
      )}
      <QuestionText content={view.content} className="text-sm text-content font-medium leading-relaxed" />
      {imagesOf(view).map(m => (
        <img key={m.mediaId} src={m.url} alt={m.altText ?? ''} className="max-h-60 rounded-[8px] border border-line" />
      ))}
      {/* With a key the input is read-only by itself, and its "Show the correct order" must stay clickable. */}
      <fieldset disabled={!reveal} className="min-w-0">
        {/* Quiz types: the key beside the answer — right parts green, wrong ones red with the correct one. */}
        <QuestionAnswerInput
          question={toAttemptQuestion(view)}
          value={latest?.response ?? null}
          onChange={NO_CHANGE}
          practice
          verdict={verdict}
          reveal={reveal}
        />
      </fieldset>
      {latest && verdict == null && <PracticeVerdict attempt={latest} questionType={view.questionType} />}
      {saved && latest.gradingStatus === 'FAILED' && latest.response && (
        <Button size="sm" icon={<Icon.RefreshCw className="w-4 h-4" />} loading={regrading} disabled={regrading} onClick={onRegrade}>
          Grade again
        </Button>
      )}
      {saved && !AWAITING_GRADE.has(latest.gradingStatus) && latest.gradingStatus !== 'FAILED' && (
        <PracticeExplanation
          questionId={view.questionId}
          sessionId={sessionId}
          sessionQuestionId={view.sessionQuestionId}
          practiceAnswerId={latest.practiceAnswerId}
        />
      )}
    </div>
  );
}

const NO_CHANGE = () => undefined;

/** Runs `call`, again after a pause when it fails on the network or with a 5xx / 429 — never on other 4xx. */
async function withRetry<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (err) {
      const status = (err as { response?: { status?: number } } | null)?.response?.status;
      const retryable = status == null || status >= 500 || status === 429;
      if (!retryable || attempt >= SAVE_RETRIES) throw err;
      await new Promise(resolve => window.setTimeout(resolve, SAVE_RETRY_MS * (attempt + 1)));
    }
  }
}

function newRequestKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function FullScreenMessage({ children }: { children: React.ReactNode }) {
  return <div className="h-[100dvh] flex flex-col items-center justify-center gap-4 bg-surface-alt px-6">{children}</div>;
}
