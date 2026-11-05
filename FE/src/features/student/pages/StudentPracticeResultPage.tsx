import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';
import { Icon } from '@/assets/icons';
import { ROUTES, studentCoursePath, studentModulePath, studentModulePracticePath } from '@/app/routes';
import { getApiErrorMessage } from '@/utils/apiError';
import { RUBRIC_TYPES } from '@/services/studentAttempt.service';
import { studentProgressService } from '@/services/studentProgress.service';
import {
  AWAITING_GRADE,
  PRACTICE_MODE_LABEL,
  modulePracticeService,
  toReviewQuestion,
  type PracticeQuestionView,
  type PracticeResult,
  type PracticeSession,
  type ResultQuestion,
} from '@/services/modulePractice.service';
import { LoadError, STUDENT_PAGE_CLASS } from '../components/studentUi';
import { QUESTION_TYPE_LABEL, QuestionText } from '../components/QuestionAnswerInput';
import { PracticeVerdict, scorePercent, summaryOutcome } from '../components/PracticeVerdict';
import { PracticeExplanation } from '../components/PracticeExplanation';
import { ReportQuestionIssueButton } from '../components/ReportQuestionIssueDialog';
import { AnswerReview } from '../components/result/AnswerReview';
import { QuestionNav, ResultPalette, useArrowKeyNav, type OutcomeMeta } from '../components/result/ResultNavigator';

const POLL_MS = 5000;
const POLL_LIMIT_MS = 3 * 60_000;

const sortQuestions = (r: PracticeResult): PracticeResult => ({ ...r, questions: [...r.questions].sort((a, b) => a.orderIndex - b.orderIndex) });

type Outcome = 'correct' | 'incorrect' | 'graded' | 'unanswered' | 'pending' | 'failed';

const OUTCOME: Record<Outcome, { label: string; badge: 'success' | 'danger' | 'purple' | 'default' | 'warning'; icon: React.ReactNode }> = {
  correct: { label: 'Correct', badge: 'success', icon: <Icon.CheckCircle className="w-5 h-5 text-success" /> },
  incorrect: { label: 'Incorrect', badge: 'danger', icon: <Icon.XCircle className="w-5 h-5 text-danger" /> },
  graded: { label: 'AI scored', badge: 'purple', icon: <Icon.Award className="w-5 h-5 text-primary" /> },
  unanswered: { label: 'Unanswered', badge: 'default', icon: <Icon.HelpCircle className="w-5 h-5 text-content-subtle" /> },
  pending: { label: 'Grading', badge: 'warning', icon: <Icon.Clock className="w-5 h-5 text-warning" /> },
  failed: { label: 'Not graded', badge: 'warning', icon: <Icon.AlertCircle className="w-5 h-5 text-warning" /> },
};

/** Same fills as the exam result's palette. */
const PALETTE: OutcomeMeta<Outcome> = {
  correct: { label: OUTCOME.correct.label, cell: 'bg-success-solid text-white' },
  incorrect: { label: OUTCOME.incorrect.label, cell: 'bg-danger-solid text-white' },
  graded: { label: OUTCOME.graded.label, cell: 'bg-brand-600 text-white' },
  unanswered: { label: OUTCOME.unanswered.label, cell: 'bg-content-subtle text-white' },
  pending: { label: OUTCOME.pending.label, cell: 'bg-highlight text-brand-950' },
  failed: { label: OUTCOME.failed.label, cell: 'bg-warning-strong text-white' },
};

function outcomeOf(q: ResultQuestion): Outcome {
  if (q.attemptCount === 0) return 'unanswered';
  if (AWAITING_GRADE.has(q.gradingStatus)) return 'pending';
  if (q.gradingStatus === 'FAILED') return 'failed';
  const o = summaryOutcome({ answered: true, latestIsCorrect: q.latestIsCorrect, gradingStatus: q.gradingStatus, questionType: q.questionType });
  return o === 'correct' ? 'correct' : o === 'wrong' ? 'incorrect' : o === 'partial' ? 'graded' : 'pending';
}

/** MP-04 depends on the latest attempt and its grading: a new one of either is another read. */
const viewKey = (q: ResultQuestion) => `${q.sessionQuestionId}:${q.attemptCount}:${q.gradingStatus}`;

/**
 * Result of one Module Practice session (MP-08), laid out like the exam result: a header with the
 * module and the way on, then one question at a time (`?q=` 1-based) with its latest answer set
 * against the key (MP-04 `correctAnswer`) and an "Explain" (MP-09); Previous / Next and ← → move
 * through it. Beside it, a palette of every question coloured by its latest outcome. While AI
 * grading is still running the page re-reads the result every few seconds. Also readable while
 * the session is still open.
 */
export function StudentPracticeResultPage() {
  const { sessionId = '' } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [result, setResult] = useState<PracticeResult | null>(null);
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  /** Previous / Next of the question on screen, for the ← → keys (set every render). */
  const navRef = useRef<{ prev?: () => void; next?: () => void }>({});
  const questionRef = useRef<HTMLElement>(null);
  useArrowKeyNav(navRef);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    // MP-08 has no course: MP-03 gives it, for the breadcrumb and the way back.
    Promise.all([modulePracticeService.getResult(sessionId), modulePracticeService.getSession(sessionId)])
      .then(([r, s]) => {
        if (cancelled) return;
        setResult(sortQuestions(r));
        setSession(s);
      })
      .catch(err => {
        if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load the practice result.'));
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, reload]);

  // AI grading still running: re-read the result until it is done (or for a few minutes).
  const awaiting = (result?.questionsAwaitingGrade ?? 0) > 0;
  useEffect(() => {
    if (!awaiting) return;
    const started = Date.now();
    const id = window.setInterval(() => {
      if (Date.now() - started > POLL_LIMIT_MS) return window.clearInterval(id);
      modulePracticeService
        .getResult(sessionId)
        .then(r => setResult(sortQuestions(r)))
        .catch(() => undefined);
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [awaiting, sessionId]);

  const outcomes = useMemo(() => (result?.questions ?? []).map(outcomeOf), [result]);

  const breadcrumb = (
    <Breadcrumb
      items={[
        { label: 'My Courses', onClick: () => navigate(ROUTES.studentCourses) },
        ...(session
          ? [
              { label: session.courseTitle, onClick: () => navigate(studentCoursePath(session.courseId)) },
              { label: session.moduleTitle, onClick: () => navigate(studentModulePath(session.courseId, session.moduleId)) },
            ]
          : []),
        { label: 'Practice result' },
      ]}
    />
  );

  if (error) {
    return (
      <div className={`${STUDENT_PAGE_CLASS} space-y-6`}>
        {breadcrumb}
        <LoadError message={error} onRetry={() => setReload(r => r + 1)} />
      </div>
    );
  }

  if (!result || !session) {
    return (
      <div className={`${STUDENT_PAGE_CLASS} space-y-6`}>
        {breadcrumb}
        <Skeleton className="h-28 w-full" />
        <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-6">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      </div>
    );
  }

  const total = result.questions.length;
  const qParam = Number(searchParams.get('q'));
  const current = total === 0 ? 0 : Number.isInteger(qParam) && qParam >= 1 ? Math.min(qParam, total) - 1 : 0;
  const prevIndex = current > 0 ? current - 1 : undefined;
  const nextIndex = current < total - 1 ? current + 1 : undefined;

  const goTo = (index: number) => {
    // replace: walking through the questions must not fill the Back button's history.
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

  const q = result.questions[current];

  return (
    <div className={`${STUDENT_PAGE_CLASS} space-y-[clamp(1.25rem,2.5vw,1.75rem)]`}>
      {breadcrumb}

      <ResultHeader result={result} session={session} />

      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-[clamp(1rem,2vw,1.5rem)] items-start">
        {/* Navigator above the question on small screens (folded); beside it, top-aligned, from lg. */}
        {total > 0 && (
          <aside className="lg:order-2 min-w-0">
            <ResultPalette outcomes={outcomes} meta={PALETTE} current={current} onSelect={goTo} />
          </aside>
        )}

        <section ref={questionRef} className="lg:order-1 space-y-3 min-w-0 scroll-mt-[85px]" aria-label="Question">
          {!q ? (
            <div className="card px-5 py-10 text-center text-sm text-content-soft">This practice has no question.</div>
          ) : (
            <>
              <PracticeQuestionCard
                key={viewKey(q)}
                question={q}
                index={current}
                outcome={outcomes[current]}
                sessionId={result.sessionId}
                nav={<QuestionNav current={current} total={total} onPrev={navRef.current.prev} onNext={navRef.current.next} />}
              />
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
    </div>
  );
}

/** The module, mode and time on the left; Continue / Practice again and Back on the right; AI grading notes below. */
function ResultHeader({ result, session }: { result: PracticeResult; session: PracticeSession }) {
  const navigate = useNavigate();
  const inProgress = result.status === 'IN_PROGRESS';
  const modulePath = studentModulePath(session.courseId, session.moduleId);
  return (
    <div className="card p-5 min-w-0 space-y-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[clamp(1.25rem,1.1rem+0.6vw,1.5rem)] font-bold text-content">{result.moduleTitle}</h1>
            <Badge variant={inProgress ? 'warning' : 'success'}>{inProgress ? 'In progress' : 'Completed'}</Badge>
          </div>
          <p className="text-sm text-content-soft">
            {PRACTICE_MODE_LABEL[session.mode] ?? 'Practice'} · {formatDuration(result.durationSeconds)}
            {result.completedAt && ` · finished ${new Date(result.completedAt).toLocaleString()}`}
          </p>
        </div>
        <div className="flex flex-wrap md:flex-col gap-2">
          {inProgress ? (
            <Button icon={<Icon.Play className="w-4 h-4" />} onClick={() => navigate(studentModulePracticePath(result.sessionId))}>
              Continue practice
            </Button>
          ) : (
            <Button icon={<Icon.RefreshCw className="w-4 h-4" />} onClick={() => navigate(modulePath)}>
              Practice again
            </Button>
          )}
          <Button variant="outline" icon={<Icon.ChevronLeft className="w-4 h-4" />} onClick={() => navigate(modulePath)}>
            Back to module
          </Button>
        </div>
      </div>

      {result.questionsAwaitingGrade > 0 && (
        <p className="flex items-start gap-2 text-xs text-warning">
          <Icon.Clock className="w-4 h-4 flex-shrink-0" />
          {result.questionsAwaitingGrade} question{result.questionsAwaitingGrade === 1 ? ' is' : 's are'} still being graded by AI. This page
          refreshes on its own.
        </p>
      )}
      {result.questionsFailedGrade > 0 && (
        <p className="flex items-start gap-2 rounded-[10px] border border-danger-solid bg-danger-light p-3 text-xs text-danger">
          <Icon.AlertCircle className="w-4 h-4 flex-shrink-0" />
          AI grading failed for {result.questionsFailedGrade} question{result.questionsFailedGrade === 1 ? '' : 's'}. Answer {result.questionsFailedGrade === 1 ? 'it' : 'them'}{' '}
          again in a new practice to get a grade.
        </p>
      )}
    </div>
  );
}

/**
 * One question as on the exam result: outcome icon, number and type, the text and the outcome badge;
 * Bookmark / Report; then the latest answer against the key with "Explain", or — for an essay / code /
 * diagram answer — the answer beside its AI score and feedback. Reads MP-04 on mount (the page keys
 * it by the latest attempt and its grading, so a regrade reads it again).
 */
function PracticeQuestionCard({
  question: q,
  index,
  outcome,
  sessionId,
  nav,
}: {
  question: ResultQuestion;
  index: number;
  outcome: Outcome;
  sessionId: number;
  nav: React.ReactNode;
}) {
  const [view, setView] = useState<PracticeQuestionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);
  const [bookmarkError, setBookmarkError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    modulePracticeService
      .getQuestion(sessionId, q.sessionQuestionId)
      .then(v => {
        if (cancelled) return;
        setView(v);
        setBookmarked(v.isBookmarked);
      })
      .catch(err => {
        if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load this question.'));
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, q.sessionQuestionId, reload]);

  const toggleBookmark = async () => {
    setBookmarkBusy(true);
    setBookmarkError(null);
    try {
      setBookmarked((await studentProgressService.toggleBookmark(q.questionId)).isBookmarked);
    } catch (err) {
      setBookmarkError(getApiErrorMessage(err, 'Could not update the bookmark.'));
    } finally {
      setBookmarkBusy(false);
    }
  };

  const latest = view?.attempts.length ? view.attempts[view.attempts.length - 1] : null;
  const rubric = RUBRIC_TYPES.has(q.questionType);
  const graded = latest != null && !AWAITING_GRADE.has(latest.gradingStatus);

  return (
    <>
      <article className="card overflow-hidden">
        <div className="border-b border-line bg-surface-alt px-4 py-2.5">{nav}</div>
        <header className="flex items-start gap-3 px-4 py-3.5">
          <span className="mt-0.5 flex-shrink-0">{OUTCOME[outcome].icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-content-subtle">
              Question {index + 1} · {QUESTION_TYPE_LABEL[q.questionType] ?? q.questionType}
              {q.attemptCount > 1 && ` · ${q.attemptCount} attempts`}
            </p>
            {view && <QuestionText content={view.content} className="text-sm text-content mt-0.5" />}
          </div>
          <Badge variant={OUTCOME[outcome].badge} size="sm" className="flex-shrink-0">
            {outcome === 'graded' ? `AI score ${scorePercent(q.latestScore)}%` : OUTCOME[outcome].label}
          </Badge>
        </header>

        <div className="flex justify-end border-t border-line px-4 py-3">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={bookmarked ? 'primary' : 'outline'}
              disabled={bookmarkBusy || !view}
              aria-pressed={bookmarked}
              aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark question'}
              icon={<Icon.Star className={`w-4 h-4 ${bookmarked ? 'fill-current' : ''}`} />}
              onClick={toggleBookmark}
            >
              {bookmarked ? 'Bookmarked' : 'Bookmark'}
            </Button>
            <ReportQuestionIssueButton questionId={q.questionId} />
          </div>
        </div>

        {error ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-4">
            <p className="text-sm text-danger">{error}</p>
            <Button size="sm" variant="outline" icon={<Icon.RefreshCw className="w-4 h-4" />} onClick={() => setReload(r => r + 1)}>
              Try again
            </Button>
          </div>
        ) : !view ? (
          <div className="border-t border-line px-4 py-8 flex justify-center">
            <Spinner />
          </div>
        ) : rubric ? (
          // Written answer beside its AI score once the card is wide enough, so the feedback stays in view.
          <div className="@container border-t border-line px-4 py-4">
            <div className="grid gap-4 @3xl:grid-cols-[minmax(0,1fr)_minmax(15rem,20rem)] @3xl:items-start">
              <div className="min-w-0">
                <AnswerReview question={toReviewQuestion(view, latest)} />
              </div>
              {latest && (
                <div className="@3xl:sticky @3xl:top-[85px] min-w-0">
                  <PracticeVerdict attempt={latest} questionType={q.questionType} />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="border-t border-line px-4 py-4 space-y-4">
            <AnswerReview question={toReviewQuestion(view, latest)} />
            {/* Only the "being graded" / "could not be graded" notes: the badge already says right or wrong. */}
            {latest && (outcome === 'pending' || outcome === 'failed') && <PracticeVerdict attempt={latest} questionType={q.questionType} />}
            {graded && (
              <PracticeExplanation
                questionId={q.questionId}
                sessionId={sessionId}
                sessionQuestionId={q.sessionQuestionId}
                practiceAnswerId={latest.practiceAnswerId}
              />
            )}
          </div>
        )}
      </article>
      {bookmarkError && (
        <p role="alert" className="text-sm text-danger">
          {bookmarkError}
        </p>
      )}
    </>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  if (m < 1) return `${seconds}s`;
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}
