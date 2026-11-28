import React from "react";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/assets/icons";
import type { DeckMode } from "@/services/studentDeck.service";
import type { AttemptOption } from "@/services/studentAttempt.service";
import { CardFace } from "./flashcardUi";
import type { QuizQuestion } from "./flashcardQuiz";

/** Top bar of the Learn / Test screens (full screen, like the take-exam screen). */
export function QuizHeader({
  title,
  badge,
  children,
}: {
  title: string;
  badge: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="min-h-14 bg-surface border-b border-line-soft flex flex-wrap items-center px-[clamp(0.75rem,2vw,1.5rem)] py-2 gap-x-4 gap-y-2 flex-shrink-0">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Icon.Logo className="w-7 h-7 flex-shrink-0 text-brand-ink" aria-hidden="true" />
        <span className="text-base font-bold text-content truncate">{title}</span>
        <Badge variant="info" size="sm">
          {badge}
        </Badge>
      </div>
      <div className="flex items-center gap-3 flex-wrap">{children}</div>
    </header>
  );
}

/** The front of the card being asked. */
export function QuizPrompt({ q, mode }: { q: QuizQuestion; mode: DeckMode }) {
  return (
    <div className="card p-[clamp(1rem,2.5vw,1.5rem)] flex justify-center text-center">
      <CardFace card={q.card} mode={mode} side="front" />
    </div>
  );
}

/** Draws each option as the back of its card, so a code deck shows its code / output. */
export function choiceRenderer(
  q: QuizQuestion,
  mode: DeckMode,
): (option: AttemptOption) => React.ReactNode {
  return (option) => {
    const card = q.choices.find((c) => c.cardId === option.optionId);
    return card ? <CardFace card={card} mode={mode} side="back" /> : option.optionText;
  };
}

export function FullScreenMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-[100dvh] flex flex-col items-center justify-center gap-4 bg-surface-alt px-6 text-center">
      {children}
    </div>
  );
}

/** "3 cards with only a picture on the back are left out." */
export function SkippedNote({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <p className="flex items-center gap-2 rounded-[10px] bg-surface-muted px-3 py-2.5 text-sm text-content-soft">
      <Icon.Info className="w-4 h-4 flex-shrink-0" />
      {count} card{count === 1 ? "" : "s"} with only a picture on the back{" "}
      {count === 1 ? "is" : "are"} left out.
    </p>
  );
}
