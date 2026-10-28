import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { TimerDisplay } from '@/components/common/TimerDisplay';
import { QuestionPalette } from '@/components/common/QuestionPalette';
import { Icon } from '@/assets/icons';
import { ROUTES } from '@/app/routes';
import type { AnswerResponse } from '@/services/studentAttempt.service';
import { isPracticeCorrect, studentPracticeService, type PracticeQuestion, type PracticeQuiz } from '@/services/studentPractice.service';
import { QUESTION_TYPE_LABEL, QuestionAnswerInput, QuestionText, isAnswered } from '../components/QuestionAnswerInput';

const WARN_SECONDS = 60;

/**
 * Practice quiz screen (full screen, outside the dashboard shell) for quizzes
 * built by Customize Random Quiz or Material to Quiz Creator.
 *
 * Everything runs in the browser: answers are kept in sessionStorage (a reload
 * resumes), the timer counts from when the quiz was opened, and submitting
 * grades on the client and shows the review on the same screen. Nothing is
 * sent to the BE (docs/notes/student-practice-quiz-be-gaps.md).
 */
export function StudentPracticeQuizPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const quizId = searchParams.get('quizId');

  const [quiz, setQuiz] = useState<PracticeQuiz | null>(() => (quizId ? studentPracticeService.get(quizId) : null));
  const [current, setCurrent] = useState(0);
  const [flagged, setFlagged] = useState<Set<number>>(() => new Set());
  const [remaining, setRemaining] = useState<number | null>(null);
  const [confirm, setConfirm] = useState(false);

  // First open starts the clock.
  useEffect(() => {
    if (quiz && !quiz.startedAt && !quiz.submittedAt) setQuiz(studentPracticeService.update({ ...quiz, startedAt: new Date().toISOString() }));
  }, [quiz]);

  const commit = useCallback((next: PracticeQuiz) => setQuiz(studentPracticeService.update(next)), []);

  const submit = useCallback(() => {
    setQuiz(q => (q && !q.submittedAt ? studentPracticeService.update({ ...q, submittedAt: new Date().toISOString() }) : q));
    setConfirm(false);
    setCurrent(0);
  }, []);

  useEffect(() => {
    if (!quiz?.startedAt || quiz.submittedAt) {
      setRemaining(null);
      return;
    }
    const deadline = Date.parse(quiz.startedAt) + quiz.timeLimitMinutes * 60_000;
    const tick = () => {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) submit();
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [quiz?.startedAt, quiz?.submittedAt, quiz?.timeLimitMinutes, submit]);

  const questions = quiz?.questions ?? [];
  const answeredSet = useMemo(() => {
    const s = new Set<number>();
    questions.forEach((q, i) => {
      if (isAnswered(quiz?.answers[q.questionId])) s.add(i + 1);
    });
    return s;
  }, [questions, quiz?.answers]);

  if (!quiz) {
    return (
      <FullScreenMessage>
        <Icon.AlertCircle className="w-10 h-10 text-content-subtle" />
        <p className="text-base text-content-soft max-w-md text-center">
          This practice quiz is no longer available. Practice quizzes are kept only in this browser tab.
        </p>
        <Button onClick={() => navigate(ROUTES.studentCourses)}>Back to My Courses</Button>
      </FullScreenMessage>
    );
  }

  if (quiz.submittedAt) {
    return (
      <PracticeResult
        quiz={quiz}
        onRetake={() => {
          setFlagged(new Set());
          setCurrent(0);
          commit({ ...quiz, answers: {}, startedAt: new Date().toISOString(), submittedAt: null });
        }}
        onExit={() => navigate(ROUTES.studentCourses)}
      />
    );
  }

  const q = questions[current];
  // Essay papers: wider column and a taller editor, like the take-exam screen.
  const isEssay = questions.every(x => x.questionType === 'ESSAY');
  const unanswered = questions.length - answeredSet.size;
  const isFlagged = flagged.has(current + 1);
  const setAnswer = (r: AnswerResponse) => commit({ ...quiz, answers: { ...quiz.answers, [q.questionId]: r } });
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
          <span className="text-base font-bold text-content truncate">{quiz.title}</span>
          <span className="hidden sm:inline-flex flex-shrink-0 rounded-[6px] border border-line px-2 py-0.5 text-2xs font-medium text-content-soft">
            {isEssay ? 'Essay practice' : 'Practice'}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {remaining != null && <TimerDisplay seconds={remaining} warning={remaining < WARN_SECONDS} />}
          <Button size="sm" variant="outline" onClick={() => navigate(ROUTES.studentCourses)}>
            Exit
          </Button>
          <Button size="sm" onClick={() => setConfirm(true)}>
            Submit
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        <main className="flex-1 overflow-y-auto p-[clamp(1rem,2.5vw,1.5rem)]">
          <div className={`${isEssay ? 'max-w-5xl' : 'max-w-3xl'} mx-auto space-y-5`}>
            {q.groupTitle && <p className="text-xs font-semibold text-content-soft uppercase tracking-wide">{q.groupTitle}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-content uppercase tracking-wide">Question {current + 1}</h2>
              <Badge variant="info">{QUESTION_TYPE_LABEL[q.questionType] ?? q.questionType}</Badge>
              {q.source && <span className="text-xs text-content-subtle truncate max-w-[20rem]">{q.source}</span>}
              <span className="text-xs text-content-subtle ml-auto">
                {current + 1} / {questions.length}
              </span>
            </div>

            <div className="card p-[clamp(1rem,2.5vw,1.5rem)]">
              <QuestionText content={q.content} className="text-content font-medium text-lg leading-relaxed" />
            </div>

            <QuestionAnswerInput key={q.questionId} question={q} value={quiz.answers[q.questionId] ?? null} onChange={setAnswer} roomy={isEssay} />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="outline" disabled={current === 0} icon={<Icon.ChevronLeft className="w-4 h-4" />} onClick={() => setCurrent(current - 1)}>
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
                  <Button iconRight={<Icon.ChevronRight className="w-4 h-4" />} onClick={() => setCurrent(current + 1)}>
                    Next question
                  </Button>
                ) : (
                  <Button icon={<Icon.Check className="w-4 h-4" />} onClick={() => setConfirm(true)}>
                    Finish
                  </Button>
                )}
              </div>
            </div>
          </div>
        </main>

        <aside className="md:w-72 max-h-[35vh] md:max-h-none bg-surface border-t md:border-t-0 md:border-l border-line-soft p-5 overflow-y-auto flex-shrink-0">
          <h2 className="text-base font-semibold text-content mb-4">Question navigator</h2>
          <QuestionPalette total={questions.length} current={current + 1} answered={answeredSet} flagged={flagged} onSelect={n => setCurrent(n - 1)} />
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
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Submit this practice quiz?"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Keep working
            </Button>
            <Button onClick={submit}>Submit</Button>
          </>
        }
      >
        <p className="text-base text-content-secondary leading-relaxed">
          {isEssay ? 'Essay answers are not graded — you will see a sample answer to compare with.' : 'It is graded right away.'} Practice
          results are not saved to your history.
        </p>
        {unanswered > 0 && (
          <p className="mt-3 text-sm text-warning">
            {unanswered} question{unanswered === 1 ? ' is' : 's are'} still unanswered.
          </p>
        )}
      </Modal>
    </div>
  );
}

/* ── result ──────────────────────────────────────────────────────────────── */

function PracticeResult({ quiz, onRetake, onExit }: { quiz: PracticeQuiz; onRetake: () => void; onExit: () => void }) {
  const rows = quiz.questions.map(q => {
    const response = quiz.answers[q.questionId] ?? null;
    const answered = isAnswered(response);
    return { q, response, answered, graded: q.questionType !== 'ESSAY', correct: answered && isPracticeCorrect(q, response) };
  });
  // Essays are not graded: the score counts the other questions only.
  const graded = rows.filter(r => r.graded);
  const correct = graded.filter(r => r.correct).length;
  const percent = graded.length ? Math.round((correct / graded.length) * 100) : 0;
  const ungraded = rows.length - graded.length;
  const tone = percent >= 80 ? 'text-success' : percent >= 50 ? 'text-warning' : 'text-danger';

  return (
    <div className="min-h-[100dvh] bg-surface-alt">
      <div className="mx-auto w-full max-w-3xl px-[clamp(1rem,2.5vw,2rem)] py-[clamp(1.25rem,2.5vw,1.75rem)] space-y-5">
        <section className="card p-[clamp(1rem,2.5vw,1.5rem)] text-center space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-content-subtle">Practice result</p>
          <h1 className="text-lg font-bold text-content break-words">{quiz.title}</h1>
          {graded.length > 0 ? (
            <>
              <p className={`text-4xl font-bold ${tone}`}>{percent}%</p>
              <p className="text-sm text-content-soft">
                {correct} of {graded.length} correct · {rows.filter(r => !r.answered).length} unanswered
                {ungraded > 0 && ` · ${ungraded} essay not graded`}
              </p>
            </>
          ) : (
            <p className="text-sm text-content-soft">
              {rows.filter(r => r.answered).length} of {rows.length} answered · essays are not graded, compare yours with the sample
              answers below.
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Button variant="outline" onClick={onExit}>
              Back to My Courses
            </Button>
            <Button icon={<Icon.RefreshCw className="w-4 h-4" />} onClick={onRetake}>
              Retake
            </Button>
          </div>
        </section>

        <ol className="space-y-3">
          {rows.map(({ q, response, answered, graded: isGraded, correct: ok }, i) => (
            <li
              key={q.questionId}
              className={`card p-4 space-y-3 border-l-4 ${
                !isGraded ? '!border-l-line-strong' : ok ? '!border-l-success-solid' : answered ? '!border-l-danger-solid' : '!border-l-line-strong'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-content">Question {i + 1}</span>
                <Badge variant="info">{QUESTION_TYPE_LABEL[q.questionType] ?? q.questionType}</Badge>
                <Badge variant={!isGraded ? (answered ? 'info' : 'default') : ok ? 'success' : answered ? 'danger' : 'default'} className="ml-auto">
                  {!isGraded ? (answered ? 'Not graded' : 'Unanswered') : ok ? 'Correct' : answered ? 'Incorrect' : 'Unanswered'}
                </Badge>
              </div>
              <QuestionText content={q.content} className="text-sm text-content" />
              <dl className="grid gap-2 sm:grid-cols-2 text-sm">
                <div className="rounded-[10px] bg-surface-alt px-3 py-2">
                  <dt className="text-2xs uppercase tracking-wide text-content-subtle">Your answer</dt>
                  <dd className="text-content-secondary whitespace-pre-line break-words">{answered ? describeResponse(q, response) : '—'}</dd>
                </div>
                <div className="rounded-[10px] bg-success-light px-3 py-2">
                  <dt className="text-2xs uppercase tracking-wide text-success">{isGraded ? 'Correct answer' : 'Sample answer'}</dt>
                  <dd className="text-content whitespace-pre-line break-words">{describeKey(q)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function optionText(q: PracticeQuestion, id: number) {
  return q.options?.find(o => o.optionId === id)?.optionText ?? '?';
}

function describeResponse(q: PracticeQuestion, r: AnswerResponse | null): string {
  if (!r) return '—';
  switch (q.questionType) {
    case 'SINGLE_CHOICE':
    case 'MULTIPLE_CHOICE':
    case 'TRUE_FALSE':
      return (r.selectedOptionIds ?? []).map(id => optionText(q, id)).join('\n');
    case 'FILL_BLANK':
      return Object.entries(r.blanks ?? {})
        .map(([n, v]) => `(${n}) ${v || '—'}`)
        .join('\n');
    case 'MATCHING':
      return (r.matches ?? []).map(m => `${m.left} → ${m.right}`).join('\n');
    case 'ORDERING':
      return (r.orderedOptionIds ?? []).map((id, i) => `${i + 1}. ${optionText(q, id)}`).join('\n');
    case 'ESSAY':
      return r.text?.trim() || '—';
  }
}

function describeKey(q: PracticeQuestion): string {
  const k = q.answerKey;
  return describeResponse(q, {
    selectedOptionIds: k.correctOptionIds,
    blanks: k.blanks,
    matches: k.matches,
    text: k.sampleAnswer,
    orderedOptionIds: k.orderedOptionIds,
  });
}

function FullScreenMessage({ children }: { children: React.ReactNode }) {
  return <div className="h-[100dvh] flex flex-col items-center justify-center gap-4 bg-surface-alt px-6">{children}</div>;
}
