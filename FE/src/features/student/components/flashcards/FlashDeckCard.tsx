import React from 'react';
import { Icon } from '@/assets/icons';
import { Progress } from '@/components/ui/Progress';
import type { DeckMode, ReviewStatus } from '@/services/studentDeck.service';
import { DeckModeBadge, DeckStatusBadge, plural } from './flashcardUi';

export interface FlashDeckCardData {
  deckId: number;
  title: string;
  description: string | null;
  cardCount: number;
  learnedCount: number;
  starredCount: number;
  mode?: DeckMode | null;
  /** Pass for the student's own decks only; null hides the badge. */
  reviewStatus?: ReviewStatus | null;
  /** Shown under the title (another student's public deck, or the course of my deck). */
  subtitle?: string | null;
}

/** One deck in the Flashcards grids (both tabs). */
export function FlashDeckCard({ deck, onOpen }: { deck: FlashDeckCardData; onOpen: () => void }) {
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
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-content leading-snug line-clamp-2 break-words">{deck.title}</h3>
          <p className="text-xs text-content-subtle mt-0.5 truncate">
            {plural(deck.cardCount, 'card')}
            {deck.subtitle && <> · {deck.subtitle}</>}
          </p>
        </div>
      </div>
      {(deck.mode || deck.reviewStatus) && (
        <div className="flex flex-wrap gap-1.5">
          {deck.mode && deck.mode !== 'FLASHCARD' && <DeckModeBadge mode={deck.mode} />}
          {deck.reviewStatus && <DeckStatusBadge status={deck.reviewStatus} />}
        </div>
      )}
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
