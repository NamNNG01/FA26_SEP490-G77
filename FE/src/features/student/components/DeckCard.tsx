import React from 'react';
import { Icon } from '@/assets/icons';
import { Progress } from '@/components/ui/Progress';
import type { StudentDeck } from '@/services/studentCourse.service';
import type { StudentDeckView } from '@/services/studentDeck.service';

/** Router state the deck page reads until (or instead of) FC-14 answers. */
export interface DeckStudyState {
  deckTitle: string;
  courseId?: number;
  courseTitle?: string;
  /** The deck as the list / create call saw it; `isOwner` marks the student's own deck. */
  deck?: StudentDeckView;
  /** Flashcards tab to return to. */
  tab?: 'mine' | 'course';
}

export function DeckCard({ deck, onOpen }: { deck: StudentDeck; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="card p-4 flex flex-col gap-3 text-left hover:shadow-md transition-shadow focus-visible:outline-2 focus-visible:outline-primary"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-[10px] bg-primary-light flex items-center justify-center flex-shrink-0">
          <Icon.Layers className="w-4.5 h-4.5 text-primary" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-content leading-snug line-clamp-2">{deck.title}</h3>
          <p className="text-xs text-content-subtle mt-0.5">{deck.cardCount} cards</p>
        </div>
      </div>
      {deck.description && <p className="text-xs text-content-soft line-clamp-2">{deck.description}</p>}
      <div className="mt-auto space-y-2">
        <Progress value={deck.learnedCount} max={Math.max(deck.cardCount, 1)} label="Learned" size="sm" />
        {deck.starredCount > 0 && (
          <p className="inline-flex items-center gap-1 text-xs text-content-soft">
            <Icon.Star className="w-3.5 h-3.5" /> {deck.starredCount} starred
          </p>
        )}
      </div>
    </button>
  );
}
