import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Icon } from '@/assets/icons';
import { getApiErrorMessage } from '@/utils/apiError';
import { studentDeckLearnPath, studentDeckPath } from '@/app/routes';
import { studentDeckService, type DeckMode } from '@/services/studentDeck.service';
import type { AnswerResponse } from '@/services/studentAttempt.service';
import { QuestionPalette } from '@/components/common/QuestionPalette';
import { UnsavedChangesModal } from '@/components/common/UnsavedChangesModal';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { QuestionAnswerInput } from '../components/QuestionAnswerInput';
import {
  MIN_QUIZ_CARDS,
  buildQuestion,
  isCorrect,
  pickedOf,
  shuffle,
  usableCards,
  type QuizCard,
  type QuizQuestion,
} from '../components/flashcards/flashcardQuiz';
import { FullScreenMessage, QuizHeader, QuizPrompt, SkippedNote, choiceRenderer } from '../components/flashcards/QuizParts';

/** Questions offered by default on the setup screen (fewer when the deck has fewer cards). */
const DEFAULT_QUESTIONS = 20;

interface Loaded {
  title: string;
  mode: DeckMode;
  pool: QuizCard[];
  skipped: number;
}

type Phase = 'setup' | 'taking' | 'result';

/**
 * Test (`/student/flashcards/:deckId/test`): a multiple-choice test on random cards of the deck, laid out
 * like the take-exam screen without a timer. Checked on this screen when submitted; nothing is saved and
 * the cards' progress is left as it is.
 */
export function StudentDeckTestPage() {
  const { deckId = '' } = useParams<{ deckId: string }>();
  return <TestScreen key={deckId} deckId={Number(deckId)} />;
}

function TestScreen({ deckId }: { deckId: number }) {
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const [phase, setPhase] = useState<Phase>('setup');
  const [count, setCount] = useState('');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<number, AnswerResponse>>({});
  const [flagged, setFlagged] = useState<Set<number>>(() => new Set());
  const [current, setCurrent] = useState(0);
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  const { blocker, leave } = useUnsavedChangesGuard(phase === 'taking');

  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    setLoadError(null);
    studentDeckService
      .getViewer(deckId)
      .then(v => {
        if (cancelled) return;
        const pool: QuizCard[] = usableCards(v.cards, v.deckMode);
        setLoaded({ title: v.deckTitle, mode: v.deckMode, pool, skipped: v.cards.length - pool.length });
        setCount(String(Math.min(DEFAULT_QUESTIONS, pool.length)));
      })
      .catch(err => !cancelled && setLoadError(getApiErrorMessage(err, 'Could not open this deck.')));
    return () => {
      cancelled = true;
    };
  }, [deckId, reload]);

  const answeredSet = useMemo(
    () => new Set(questions.flatMap((q, i) => (pickedOf(answers[q.question.questionId]) != null ? [i + 1] : []))),
    [questions, answers],
  );
  const score = useMemo(() => questions.filter(q => isCorrect(q, answers[q.question.questionId])).length, [questions, answers]);

  const back = () => leave(() => navigate(studentDeckPath(deckId)));

  if (loadError) {
    return (
      <FullScreenMessage>
        <p className="text-sm text-content-soft">{loadError}</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={back}>
            Back to deck
          </Button>
          <Button icon={<Icon.RefreshCw className="w-4 h-4" />} onClick={() => setReload(r => r + 1)}>
            Retry
          </Button>
        </div>
      </FullScreenMessage>
    );
  }
  if (!loaded) {
    return (
      <FullScreenMessage>
        <Spinner />
      </FullScreenMessage>
    );
  }

  const max = loaded.pool.length;
  if (max < MIN_QUIZ_CARDS) {
    return (
      <FullScreenMessage>
        <p className="text-base text-content">A test needs at least {MIN_QUIZ_CARDS} cards with a text back.</p>
        <SkippedNote count={loaded.skipped} />
        <Button variant="outline" onClick={back}>
          Back to deck
        </Button>
      </FullScreenMessage>
    );
  }

  const n = Number(count);
  const countValid = Number.isInteger(n) && n >= 1 && n <= max;

  const start = () => {
    if (!countValid) return;
    setQuestions(shuffle(loaded.pool).slice(0, n).map((c, i) => buildQuestion(c, loaded.pool, loaded.mode, i + 1)));
    setAnswers({});
    setFlagged(new Set());
    setCurrent(0);
    setPhase('taking');
  };

  const submit = () => {
    setConfirmSubmit(false);
    setCurrent(0);
    setPhase('result');
  };

  if (phase === 'setup') {
    return (
      <div className="h-[100dvh] flex flex-col bg-surface-alt">
        <QuizHeader title={loaded.title} badge="Test">
          <Button size="sm" variant="outline" onClick={back}>
            Exit
          </Button>
        </QuizHeader>
        <main className="flex-1 overflow-y-auto p-[clamp(1rem,2.5vw,1.5rem)] flex justify-center">
          <form
            className="card w-full max-w-md p-6 space-y-4 self-start"
            onSubmit={e => {
              e.preventDefault();
              start();
            }}
          >
            <div>
              <h1 className="text-lg font-bold text-content">Set up your test</h1>
              <p className="text-sm text-content-soft">
                Multiple-choice questions on random cards of this deck. There is no time limit, and your card progress is not changed.
              </p>
            </div>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-content">Number of questions</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={max}
                value={count}
                onChange={e => setCount(e.target.value)}
                className="w-full rounded-[10px] border border-line bg-surface px-3 py-2 text-base text-content focus:outline-none focus:ring-2 focus:ring-brand-600"
                aria-invalid={!countValid}
              />
              <span className={`block text-xs ${countValid ? 'text-content-subtle' : 'text-danger'}`}>
                Between 1 and {max} ({max} card{max === 1 ? '' : 's'} can be asked).
              </span>
            </label>
            <SkippedNote count={loaded.skipped} />
            <Button type="submit" className="w-full" icon={<Icon.Play className="w-4 h-4" />} disabled={!countValid}>
              Start test
            </Button>
          </form>
        </main>
      </div>
    );
  }

  if (phase === 'result') {
    const percent = Math.round((score / questions.length) * 100);
    return (
      <div className="h-[100dvh] flex flex-col bg-surface-alt">
        <QuizHeader title={loaded.title} badge="Test result">
          <Button size="sm" variant="outline" onClick={back}>
            Back to deck
          </Button>
        </QuizHeader>
        <main className="flex-1 overflow-y-auto p-[clamp(1rem,2.5vw,1.5rem)] md:px-[15%] space-y-4">
          <div className="card p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-3xl font-bold text-content">{percent}%</p>
              <p className="text-sm text-content-soft">
                {score} of {questions.length} right · {questions.length - answeredSet.size} unanswered (counted as wrong)
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" icon={<Icon.Brain className="w-4 h-4" />} onClick={() => navigate(studentDeckLearnPath(deckId))}>
                Learn
              </Button>
              <Button icon={<Icon.RotateCcw className="w-4 h-4" />} onClick={() => setPhase('setup')}>
                New test
              </Button>
            </div>
          </div>
          <ol className="space-y-3">
            {questions.map((q, i) => {
              const a = answers[q.question.questionId] ?? null;
              const ok = isCorrect(q, a);
              return (
                <li key={q.question.questionId} className="card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-content uppercase tracking-wide">Question {i + 1}</h2>
                    <span className={`ml-auto text-xs font-semibold ${ok ? 'text-success-strong' : 'text-danger-strong'}`}>
                      {ok ? 'Correct' : a ? 'Wrong' : 'Unanswered'}
                    </span>
                  </div>
                  <QuizPrompt q={q} mode={loaded.mode} />
                  <QuestionAnswerInput
                    question={q.question}
                    value={a}
                    onChange={() => undefined}
                    reveal={{ correctOptionIds: [q.card.cardId] }}
                    renderOption={choiceRenderer(q, loaded.mode)}
                  />
                </li>
              );
            })}
          </ol>
        </main>
      </div>
    );
  }

  const q = questions[current];
  const isLast = current === questions.length - 1;
  const isFlagged = flagged.has(current + 1);
  const unanswered = questions.length - answeredSet.size;

  return (
    <div className="h-[100dvh] flex flex-col bg-surface-alt">
      <QuizHeader title={loaded.title} badge="Test">
        <span className="hidden sm:inline text-xs text-content-subtle">
          {answeredSet.size}/{questions.length} answered
        </span>
        <Button size="sm" variant="outline" onClick={() => navigate(studentDeckPath(deckId))}>
          Exit
        </Button>
        <Button size="sm" onClick={() => setConfirmSubmit(true)}>
          Submit
        </Button>
      </QuizHeader>

      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        <main className="flex-1 overflow-y-auto p-[clamp(1rem,2.5vw,1.5rem)]">
          <div className="w-full max-w-3xl mx-auto space-y-5">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-content uppercase tracking-wide">Question {current + 1}</h2>
              <span className="ml-auto text-xs text-content-subtle">
                {current + 1} / {questions.length}
              </span>
            </div>
            <QuizPrompt q={q} mode={loaded.mode} />
            <QuestionAnswerInput
              key={q.question.questionId}
              question={q.question}
              value={answers[q.question.questionId] ?? null}
              onChange={next => setAnswers(prev => ({ ...prev, [q.question.questionId]: next }))}
              renderOption={choiceRenderer(q, loaded.mode)}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="outline" disabled={current === 0} icon={<Icon.ChevronLeft className="w-4 h-4" />} onClick={() => setCurrent(current - 1)}>
                Previous
              </Button>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  aria-pressed={isFlagged}
                  onClick={() =>
                    setFlagged(prev => {
                      const next = new Set(prev);
                      if (next.has(current + 1)) next.delete(current + 1);
                      else next.add(current + 1);
                      return next;
                    })
                  }
                  icon={<Icon.Flag className={`w-4 h-4 ${isFlagged ? 'text-warning' : ''}`} />}
                  className={isFlagged ? '!border-warning-line !bg-warning-light' : ''}
                >
                  {isFlagged ? 'Flagged' : 'Flag for review'}
                </Button>
                {!isLast ? (
                  <Button iconRight={<Icon.ChevronRight className="w-4 h-4" />} onClick={() => setCurrent(current + 1)}>
                    Next question
                  </Button>
                ) : (
                  <Button icon={<Icon.Check className="w-4 h-4" />} onClick={() => setConfirmSubmit(true)}>
                    Finish
                  </Button>
                )}
              </div>
            </div>
          </div>
        </main>

        <aside className="md:w-72 max-h-[35vh] md:max-h-none bg-surface border-t md:border-t-0 md:border-l border-line-soft p-5 overflow-y-auto flex-shrink-0">
          <h2 className="text-base font-semibold text-content mb-4">Question navigator</h2>
          <QuestionPalette total={questions.length} current={current + 1} answered={answeredSet} flagged={flagged} onSelect={k => setCurrent(k - 1)} />
        </aside>
      </div>

      <ConfirmDialog
        open={confirmSubmit}
        onClose={() => setConfirmSubmit(false)}
        onConfirm={submit}
        title="Submit this test?"
        description="You can't change your answers after submitting."
        cancelLabel="Keep working"
        confirmLabel="Submit test"
      >
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
          <p className="mt-3 text-center text-warning">
            {unanswered} question{unanswered === 1 ? ' is' : 's are'} still unanswered — they count as wrong.
          </p>
        )}
      </ConfirmDialog>

      <UnsavedChangesModal
        blocker={blocker}
        title="Leave this test?"
        message="Your answers have not been submitted. If you leave now, this test is lost."
      />
    </div>
  );
}
