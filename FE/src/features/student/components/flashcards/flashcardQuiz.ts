import type { AnswerResponse, AttemptQuestion } from "@/services/studentAttempt.service";
import type { DeckMode } from "@/services/studentDeck.service";
import type { CardContent } from "./flashcardUi";

/** A card as Learn / Test need it: its content and its id. */
export type QuizCard = CardContent & { cardId: number };

/** Learn rounds and the choices of a question (fewer when the deck has fewer cards). */
export const LEARN_ROUND_SIZE = 8;
export const MAX_CHOICES = 4;
/** Below this many usable cards there is nothing to choose between. */
export const MIN_QUIZ_CARDS = 2;

/** One multiple-choice question: the front of `card`, the backs of `choices` (option id = card id). */
export interface QuizQuestion {
  card: QuizCard;
  choices: QuizCard[];
  question: AttemptQuestion;
}

/**
 * The back a choice shows, as compared for duplicates: the code of a CODE_SNIPPET card (or its text),
 * the output of a CODE_OUTPUT card, the text of a FLASHCARD card. Code is compared as written;
 * text ignores case and extra spaces.
 */
export function answerKey(card: CardContent, mode: DeckMode): string {
  if (mode === "CODE_SNIPPET") return (card.codeBody?.trim() || card.backText?.trim()) ?? "";
  if (mode === "CODE_OUTPUT") return card.backText?.trim() ?? "";
  return (card.backText ?? "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Cards that can be asked: a back with text (a FLASHCARD back that is only a picture is left out). */
export function usableCards<T extends CardContent>(cards: T[], mode: DeckMode): T[] {
  return cards.filter((c) => answerKey(c, mode) !== "");
}

export function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The question for `card`: its back plus up to MAX_CHOICES - 1 backs of other cards of `pool`, none
 * equal to the right one or to each other, in random order. `questionId` keys the question on screen.
 */
export function buildQuestion(
  card: QuizCard,
  pool: readonly QuizCard[],
  mode: DeckMode,
  questionId: number,
): QuizQuestion {
  const seen = new Set([answerKey(card, mode)]);
  const wrong: QuizCard[] = [];
  for (const other of shuffle(pool)) {
    if (wrong.length >= MAX_CHOICES - 1) break;
    const key = answerKey(other, mode);
    if (other.cardId === card.cardId || key === "" || seen.has(key)) continue;
    seen.add(key);
    wrong.push(other);
  }
  const choices = shuffle([card, ...wrong]);
  return {
    card,
    choices,
    question: {
      questionId,
      orderIndex: questionId,
      questionType: "SINGLE_CHOICE",
      content: mode === "CODE_OUTPUT" ? card.codeBody || card.frontText : card.frontText,
      options: choices.map((c) => ({
        optionId: c.cardId,
        optionText: c.backText,
        isCorrectAnswer: null,
      })),
      matching: null,
      maxPoints: 1,
      answerSpace: null,
    },
  };
}

/** The picked option, or null when nothing is picked. */
export function pickedOf(response: AnswerResponse | null | undefined): number | null {
  return response?.selectedOptionIds?.[0] ?? null;
}

export function isCorrect(q: QuizQuestion, response: AnswerResponse | null | undefined): boolean {
  return pickedOf(response) === q.card.cardId;
}
