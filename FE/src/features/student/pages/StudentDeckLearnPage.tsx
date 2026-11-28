import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/ToastHost";
import { Icon } from "@/assets/icons";
import { getApiErrorMessage } from "@/utils/apiError";
import { studentDeckPath, studentDeckTestPath } from "@/app/routes";
import { studentDeckService, type DeckMode } from "@/services/studentDeck.service";
import type { AnswerResponse } from "@/services/studentAttempt.service";
import { QuestionAnswerInput } from "../components/QuestionAnswerInput";
import { CardFace } from "../components/flashcards/flashcardUi";
import {
  LEARN_ROUND_SIZE,
  MIN_QUIZ_CARDS,
  buildQuestion,
  isCorrect,
  usableCards,
  type QuizCard,
  type QuizQuestion,
} from "../components/flashcards/flashcardQuiz";
import {
  FullScreenMessage,
  QuizHeader,
  QuizPrompt,
  SkippedNote,
  choiceRenderer,
} from "../components/flashcards/QuizParts";

interface Loaded {
  sessionId: string;
  title: string;
  mode: DeckMode;
  /** Every card that can be asked — the wrong choices come from here. */
  pool: QuizCard[];
  /** Ids of the cards already KNOWN when the session started. */
  knownAtStart: Set<number>;
  skipped: number;
}

interface Round {
  number: number;
  questions: QuizQuestion[];
  answers: Record<number, AnswerResponse>;
}

/**
 * Learn (`/student/flashcards/:deckId/learn`): multiple-choice questions on the cards not known yet,
 * LEARN_ROUND_SIZE per round. A right pick saves the card as KNOWN, a wrong one as WRONG and asks it again
 * in a later round, until every card is answered right. Picks are checked at once on this screen.
 */
export function StudentDeckLearnPage() {
  const { deckId = "" } = useParams<{ deckId: string }>();
  return <LearnScreen key={deckId} deckId={Number(deckId)} />;
}

function LearnScreen({ deckId }: { deckId: number }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  /** Cards still to learn, in asking order; the current round is its head. */
  const [queue, setQueue] = useState<QuizCard[]>([]);
  const [runTotal, setRunTotal] = useState(0);
  const [round, setRound] = useState<Round | null>(null);
  const [current, setCurrent] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [known, setKnown] = useState<Set<number>>(() => new Set());
  const [missed, setMissed] = useState<Set<number>>(() => new Set());
  const [finished, setFinished] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const questionSeq = useRef(0);
  const closed = useRef(false);
  const activeSessionId = useRef<string | null>(null);
  const knownRef = useRef(known);
  knownRef.current = known;
  const missedRef = useRef(missed);
  missedRef.current = missed;
  const closeActiveSession = useCallback(() => {
    const sessionId = activeSessionId.current;
    if (!sessionId || closed.current) return null;
    closed.current = true;
    activeSessionId.current = null;
    return studentDeckService.finishSession(
      sessionId,
      [...knownRef.current],
      [...missedRef.current],
    );
  }, []);
  /** "Learn again" after a finished run: the next session learns every card, known or not. */
  const learnEveryCard = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(null);
    setLoadError(null);
    studentDeckService
      .startSession(deckId, 0, "PRACTICE")
      .then((s) => {
        if (cancelled) {
          // StrictMode / early unmount: close the orphaned session immediately.
          studentDeckService.finishSession(s.sessionId, [], []).catch(() => {});
          return;
        }
        const pool: QuizCard[] = usableCards(s.cards, s.deckMode);
        closed.current = false;
        activeSessionId.current = s.sessionId;
        setLoaded({
          sessionId: s.sessionId,
          title: s.deckTitle,
          mode: s.deckMode,
          pool,
          knownAtStart: new Set(s.cards.filter((c) => c.status === "KNOWN").map((c) => c.cardId)),
          skipped: s.cards.length - pool.length,
        });
      })
      .catch(
        (err) => !cancelled && setLoadError(getApiErrorMessage(err, "Could not open this deck.")),
      );
    return () => {
      cancelled = true;
      closeActiveSession()?.catch(() => {});
    };
  }, [deckId, reload, closeActiveSession]);

  const startRound = useCallback(
    (cards: QuizCard[], number: number) => {
      if (!loaded) return;
      setRound({
        number,
        questions: cards
          .slice(0, LEARN_ROUND_SIZE)
          .map((c) => buildQuestion(c, loaded.pool, loaded.mode, ++questionSeq.current)),
        answers: {},
      });
      setCurrent(0);
      setShowResults(false);
    },
    [loaded],
  );

  /** Starts a run on `cards` (the cards not known yet, or every card). */
  const startRun = useCallback(
    (cards: QuizCard[]) => {
      setQueue(cards);
      setRunTotal(cards.length);
      setKnown(new Set());
      setMissed(new Set());
      startRound(cards, 1);
    },
    [startRound],
  );

  useEffect(() => {
    if (!loaded) return;
    if (loaded.pool.length < MIN_QUIZ_CARDS) return;
    const open = learnEveryCard.current
      ? loaded.pool
      : loaded.pool.filter((c) => !loaded.knownAtStart.has(c.cardId));
    learnEveryCard.current = false;
    if (open.length > 0) startRun(open);
  }, [loaded, startRun]);

  /** Closes the study session once (finish, exit or leaving the page). */
  const closeSession = useCallback(async () => {
    if (!loaded || closed.current) return null;
    closed.current = true;
    activeSessionId.current = null;
    return studentDeckService.finishSession(loaded.sessionId, [...known], [...missed]);
  }, [loaded, known, missed]);

  const save = (cardId: number, status: "KNOWN" | "WRONG") =>
    studentDeckService.writeProgress(cardId, { status }).catch((err) => {
      toast.error(getApiErrorMessage(err, "Could not save your progress on this card."));
    });

  const pick = (response: AnswerResponse) => {
    if (!round) return;
    const q = round.questions[current];
    if (round.answers[q.question.questionId]) return;
    setRound({ ...round, answers: { ...round.answers, [q.question.questionId]: response } });
    if (isCorrect(q, response)) {
      setKnown((prev) => new Set(prev).add(q.card.cardId));
      void save(q.card.cardId, "KNOWN");
    } else {
      setMissed((prev) => new Set(prev).add(q.card.cardId));
      void save(q.card.cardId, "WRONG");
    }
  };

  /** The cards after this round: the ones not asked yet, then the ones answered wrong. */
  const nextQueue = (): QuizCard[] => {
    if (!round) return queue;
    const wrong = round.questions
      .filter((q) => !isCorrect(q, round.answers[q.question.questionId]))
      .map((q) => q.card);
    return [...queue.slice(round.questions.length), ...wrong];
  };

  const continueLearning = async () => {
    if (!round) return;
    const rest = nextQueue();
    if (rest.length > 0) {
      setQueue(rest);
      startRound(rest, round.number + 1);
      return;
    }
    setQueue([]);
    setFinishing(true);
    try {
      await closeSession();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not close this study session."));
    } finally {
      setFinishing(false);
      setFinished(true);
    }
  };

  const exit = () => {
    closeSession()?.catch(() => {});
    navigate(studentDeckPath(deckId));
  };

  if (loadError) {
    return (
      <FullScreenMessage>
        <p className="text-sm text-content-soft">{loadError}</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(studentDeckPath(deckId))}>
            Back to deck
          </Button>
          <Button
            icon={<Icon.RefreshCw className="w-4 h-4" />}
            onClick={() => setReload((r) => r + 1)}
          >
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

  if (loaded.pool.length < MIN_QUIZ_CARDS) {
    return (
      <FullScreenMessage>
        <p className="text-base text-content">
          Learn needs at least {MIN_QUIZ_CARDS} cards with a text back.
        </p>
        <SkippedNote count={loaded.skipped} />
        <Button variant="outline" onClick={exit}>
          Back to deck
        </Button>
      </FullScreenMessage>
    );
  }

  const allKnownAtStart =
    !finished && !round && loaded.pool.every((c) => loaded.knownAtStart.has(c.cardId));
  if (!finished && !round && !allKnownAtStart) {
    // The first round is being set up.
    return (
      <FullScreenMessage>
        <Spinner />
      </FullScreenMessage>
    );
  }

  if (finished || !round) {
    return (
      <FullScreenMessage>
        <Icon.Trophy className="w-12 h-12 text-warning" />
        <h1 className="text-xl font-bold text-content">
          {allKnownAtStart ? "You already know every card" : "Nice work — every card learned!"}
        </h1>
        {!allKnownAtStart && (
          <p className="text-sm text-content-soft">
            {runTotal} card{runTotal === 1 ? "" : "s"} learned · {missed.size} needed another try
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" onClick={exit}>
            Back to deck
          </Button>
          <Button
            variant="outline"
            icon={<Icon.ClipboardList className="w-4 h-4" />}
            onClick={() => {
              closeSession()?.catch(() => {});
              navigate(studentDeckTestPath(deckId));
            }}
          >
            Take a test
          </Button>
          <Button
            icon={<Icon.RotateCcw className="w-4 h-4" />}
            onClick={() => {
              if (finished) {
                // The session is closed: open a new one, then learn every card.
                setFinished(false);
                setRound(null);
                setLoaded(null);
                learnEveryCard.current = true;
                setReload((r) => r + 1);
                return;
              }
              startRun(loaded.pool);
            }}
          >
            {finished ? "Learn again" : "Learn all again"}
          </Button>
        </div>
      </FullScreenMessage>
    );
  }

  const q = round.questions[current];
  const answer = round.answers[q.question.questionId] ?? null;
  const answered = answer != null;
  const isLast = current === round.questions.length - 1;
  const roundCorrect = round.questions.filter((x) =>
    isCorrect(x, round.answers[x.question.questionId]),
  ).length;

  return (
    <div className="h-[100dvh] flex flex-col bg-surface-alt">
      <QuizHeader title={loaded.title} badge="Learn">
        <span className="hidden sm:inline text-xs text-content-subtle">
          {known.size}/{runTotal} learned
        </span>
        <Button size="sm" variant="outline" onClick={exit}>
          Exit
        </Button>
      </QuizHeader>

      <nav
        aria-label="Learn progress"
        className="bg-surface border-b border-line-soft px-[clamp(0.75rem,2vw,1.5rem)] py-3 flex-shrink-0"
      >
        <div className="flex items-center justify-between gap-3 mb-2 text-xs">
          <span className="font-semibold text-content">Round {round.number}</span>
          <span className="text-content-subtle">
            {known.size}/{runTotal} cards learned
          </span>
        </div>
        <ol className="flex gap-1">
          {round.questions.map((x, i) => {
            const a = round.answers[x.question.questionId];
            const tone =
              !showResults && i === current
                ? "bg-brand-600"
                : !a
                  ? "bg-line"
                  : isCorrect(x, a)
                    ? "bg-success-solid"
                    : "bg-danger-solid";
            return (
              <li key={x.question.questionId} className={`h-2 flex-1 rounded-[2px] ${tone}`} />
            );
          })}
        </ol>
      </nav>

      <main className="flex-1 overflow-y-auto p-[clamp(1rem,2.5vw,1.5rem)] md:px-[15%]">
        {showResults ? (
          <div className="w-full space-y-4">
            <div className="card p-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-content">Round {round.number} done</h2>
                <p className="text-sm text-content-soft">
                  {roundCorrect} of {round.questions.length} right
                  {roundCorrect < round.questions.length
                    ? " — the missed cards come back in a later round."
                    : "."}
                </p>
              </div>
              <Button
                iconRight={<Icon.ChevronRight className="w-4 h-4" />}
                loading={finishing}
                disabled={finishing}
                onClick={() => void continueLearning()}
              >
                {nextQueue().length > 0 ? "Continue" : "Finish"}
              </Button>
            </div>
            <ul className="space-y-2">
              {round.questions.map((x) => {
                const ok = isCorrect(x, round.answers[x.question.questionId]);
                return (
                  <li
                    key={x.question.questionId}
                    className="card p-4 flex flex-col sm:flex-row gap-3 sm:items-start"
                  >
                    <span
                      className={`flex-shrink-0 ${ok ? "text-success-strong" : "text-danger-strong"}`}
                    >
                      {ok ? (
                        <Icon.CheckCircle className="w-5 h-5" />
                      ) : (
                        <Icon.XCircle className="w-5 h-5" />
                      )}
                    </span>
                    <div className="flex-1 min-w-0 grid gap-3 sm:grid-cols-2">
                      <CardFace card={x.card} mode={loaded.mode} side="front" />
                      <CardFace card={x.card} mode={loaded.mode} side="back" />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div className="w-full space-y-5">
            {round.number === 1 && current === 0 && <SkippedNote count={loaded.skipped} />}
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-content uppercase tracking-wide">
                Question {current + 1}
              </h2>
              <span className="ml-auto text-xs text-content-subtle">
                {current + 1} / {round.questions.length}
              </span>
            </div>
            <QuizPrompt q={q} mode={loaded.mode} />
            <QuestionAnswerInput
              key={q.question.questionId}
              question={q.question}
              value={answer}
              onChange={pick}
              practice
              reveal={answered ? { correctOptionIds: [q.card.cardId] } : null}
              renderOption={choiceRenderer(q, loaded.mode)}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-content-subtle">
                {answered
                  ? isCorrect(q, answer)
                    ? "Correct — this card is learned."
                    : "Not quite — this card comes back in a later round."
                  : "Pick an answer — it is checked right away."}
              </p>
              {answered && (
                <Button
                  iconRight={<Icon.ChevronRight className="w-4 h-4" />}
                  onClick={() => (isLast ? setShowResults(true) : setCurrent(current + 1))}
                >
                  {isLast ? `See round ${round.number} results` : "Next question"}
                </Button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
