import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Spinner } from '@/components/ui/Spinner';
import { Icon } from '@/assets/icons';
import { ROUTES, studentCoursePath, studentModulePath, studentModulePracticePath } from '@/app/routes';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  AWAITING_GRADE,
  PRACTICE_MODE_LABEL,
  accuracyPercent,
  modulePracticeService,
  type PracticeQuestionView,
  type PracticeResult,
  type PracticeSession,
  type ResultQuestion,
} from '@/services/modulePractice.service';
import { LoadError, STUDENT_PAGE_CLASS } from '../components/studentUi';
import { QUESTION_TYPE_LABEL, QuestionText } from '../components/QuestionAnswerInput';
import { PracticeVerdict, scorePercent, summaryOutcome } from '../components/PracticeVerdict';
import { PracticeExplanation } from '../components/PracticeExplanation';

const POLL_MS = 5000;
const POLL_LIMIT_MS = 3 * 60_000;

const sortQuestions = (r: PracticeResult): PracticeResult => ({ ...r, questions: [...r.questions].sort((a, b) => a.orderIndex - b.orderIndex) });

/**
 * Result of one Module Practice session (MP-08): question statistics kept apart from attempt
 * statistics, then every question with its latest outcome. A row opens the question (MP-04) with
 * its last attempt and an "Explain" (MP-09). While AI grading is still running the page re-reads
 * the result every few seconds. Also readable while the session is still open.
 */
export function StudentPracticeResultPage() {
  const { sessionId = '' } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [result, setResult] = useState<PracticeResult | null>(null);
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState<number | null>(null);

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
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const inProgress = result.status === 'IN_PROGRESS';
  const modulePath = studentModulePath(session.courseId, session.moduleId);

  return (
    <div className={`${STUDENT_PAGE_CLASS} space-y-[clamp(1.25rem,2.5vw,1.75rem)]`}>
      {breadcrumb}

      <section className="card p-[clamp(1rem,2vw,1.25rem)] space-y-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-[clamp(1.25rem,1.1rem+0.6vw,1.5rem)] font-bold text-content">{result.moduleTitle}</h1>
            <p className="text-sm text-content-soft mt-1">
              {PRACTICE_MODE_LABEL[session.mode] ?? 'Practice'} · {formatDuration(result.durationSeconds)}
              {result.completedAt && ` · finished ${new Date(result.completedAt).toLocaleString()}`}
            </p>
          </div>
          <Badge variant={inProgress ? 'warning' : 'success'}>{inProgress ? 'In progress' : 'Completed'}</Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Answered" value={`${result.answeredQuestions}/${result.totalQuestions}`} />
          <Stat label="Correct" value={String(result.questionsLatestCorrect)} tone="success" />
          <Stat label="Wrong" value={String(result.questionsLatestWrong)} tone={result.questionsLatestWrong > 0 ? 'danger' : undefined} />
          <Stat label="Accuracy" value={result.gradedAttempts > 0 ? `${accuracyPercent(result.accuracyRate)}%` : '—'} />
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-content-soft">
          <span>
            {result.totalAttempts} attempt{result.totalAttempts === 1 ? '' : 's'} · {result.correctAttempts} correct · {result.wrongAttempts} wrong
          </span>
          {result.questionsGradedWithoutVerdict > 0 && <span>{result.questionsGradedWithoutVerdict} scored by AI</span>}
          {result.questionsAwaitingGrade > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Icon.RefreshCw className="w-3.5 h-3.5 animate-spin" /> {result.questionsAwaitingGrade} being graded by AI
            </span>
          )}
          {result.questionsFailedGrade > 0 && <span className="text-danger">{result.questionsFailedGrade} could not be graded</span>}
          {result.unansweredQuestions > 0 && <span>{result.unansweredQuestions} not answered</span>}
        </div>

        <div className="flex flex-wrap gap-2">
          {inProgress ? (
            <Button icon={<Icon.Play className="w-4 h-4" />} onClick={() => navigate(studentModulePracticePath(result.sessionId))}>
              Continue practice
            </Button>
          ) : (
            <Button icon={<Icon.Play className="w-4 h-4" />} onClick={() => navigate(modulePath)}>
              Practice again
            </Button>
          )}
          <Button variant="outline" icon={<Icon.ChevronLeft className="w-4 h-4" />} onClick={() => navigate(modulePath)}>
            Back to module
          </Button>
        </div>
      </section>

      <section className="card overflow-hidden" aria-label="Questions">
        <h2 className="px-4 py-3 border-b border-line text-base font-semibold text-content">Questions</h2>
        <ul className="divide-y divide-line">
          {result.questions.map((q, i) => (
            <ResultRow
              key={q.sessionQuestionId}
              number={i + 1}
              question={q}
              sessionId={result.sessionId}
              expanded={open === q.sessionQuestionId}
              onToggle={() => setOpen(o => (o === q.sessionQuestionId ? null : q.sessionQuestionId))}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

function ResultRow({
  number,
  question: q,
  sessionId,
  expanded,
  onToggle,
}: {
  number: number;
  question: ResultQuestion;
  sessionId: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [view, setView] = useState<PracticeQuestionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const answered = q.attemptCount > 0;

  // Re-read when the grading of the latest attempt changed (the page polls the result).
  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    setError(null);
    modulePracticeService
      .getQuestion(sessionId, q.sessionQuestionId)
      .then(v => {
        if (!cancelled) setView(v);
      })
      .catch(err => {
        if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load this question.'));
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, sessionId, q.sessionQuestionId, q.gradingStatus, q.attemptCount]);

  const latest = view?.attempts.length ? view.attempts[view.attempts.length - 1] : null;

  return (
    <li>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="w-full flex flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
      >
        <span className="w-8 text-sm font-semibold text-content-secondary">{number}</span>
        <Badge size="sm" variant="info">
          {QUESTION_TYPE_LABEL[q.questionType] ?? q.questionType}
        </Badge>
        <OutcomeBadge question={q} />
        <span className="ml-auto text-xs text-content-subtle">
          {answered ? `${q.attemptCount} attempt${q.attemptCount === 1 ? '' : 's'}` : 'Not answered'}
        </span>
        <Icon.ChevronDown className={`w-4 h-4 text-content-subtle transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="px-4 pb-4 pl-[3.25rem] space-y-3">
          {error ? (
            <p className="text-sm text-danger">{error}</p>
          ) : !view ? (
            <Spinner />
          ) : (
            <>
              <QuestionText content={view.content} className="text-sm text-content leading-relaxed" />
              {latest ? (
                <>
                  <PracticeVerdict attempt={latest} />
                  {!AWAITING_GRADE.has(latest.gradingStatus) && (
                    <PracticeExplanation
                      questionId={q.questionId}
                      sessionId={sessionId}
                      sessionQuestionId={q.sessionQuestionId}
                      practiceAnswerId={latest.practiceAnswerId}
                    />
                  )}
                </>
              ) : (
                <p className="text-sm text-content-subtle">You did not answer this question.</p>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}

function OutcomeBadge({ question: q }: { question: ResultQuestion }) {
  if (q.attemptCount === 0) return null;
  if (AWAITING_GRADE.has(q.gradingStatus)) return <Badge size="sm">Grading…</Badge>;
  if (q.gradingStatus === 'FAILED')
    return (
      <Badge size="sm" variant="warning">
        Not graded
      </Badge>
    );
  const outcome = summaryOutcome({ answered: true, latestIsCorrect: q.latestIsCorrect, gradingStatus: q.gradingStatus });
  if (outcome === 'correct')
    return (
      <Badge size="sm" variant="success">
        Correct
      </Badge>
    );
  if (outcome === 'wrong')
    return (
      <Badge size="sm" variant="danger">
        Wrong
      </Badge>
    );
  if (outcome === 'partial')
    return (
      <Badge size="sm" variant="purple">
        AI score {scorePercent(q.latestScore)}%
      </Badge>
    );
  return null;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'danger' | 'success' }) {
  return (
    <div className="rounded-[10px] bg-accent px-3 py-2.5">
      <p className="text-xs text-content-subtle">{label}</p>
      <p className={`text-lg font-bold ${tone === 'danger' ? 'text-danger' : tone === 'success' ? 'text-success' : 'text-content'}`}>{value}</p>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  if (m < 1) return `${seconds}s`;
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}
