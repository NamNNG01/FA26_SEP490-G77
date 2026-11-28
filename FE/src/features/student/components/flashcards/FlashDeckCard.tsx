import React from "react";
import { Icon } from "@/assets/icons";
import { Progress } from "@/components/ui/Progress";
import { Skeleton } from "@/components/ui/Skeleton";
import type { DeckMode, ReviewStatus } from "@/services/studentDeck.service";
import { DeckModeBadge, DeckStatusBadge, plural } from "./flashcardUi";

export interface FlashDeckCardData {
  deckId: number;
  title: string;
  description: string | null;
  cardCount: number;
  learnedCount: number;
  mode?: DeckMode | null;
  /** Pass for the student's own decks only; null hides the badge. */
  reviewStatus?: ReviewStatus | null;
  /** Pass for other people's decks only ("by …"). */
  ownerName?: string | null;
  courseTitle?: string | null;
}

const CARD_SIZE = "w-[250px] h-[100px]";

/** Every Flashcards tab lays its decks out on this grid: fixed 250px columns, as many as fit (5 at full width). */
export const FLASH_DECK_GRID = "grid grid-cols-[repeat(auto-fill,250px)] gap-5";

/** Placeholder grid while a tab loads — same size as the real cards so nothing jumps. */
export function FlashDeckGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className={FLASH_DECK_GRID}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`card ${CARD_SIZE} p-3 flex flex-col justify-between`}>
          <div className="flex items-start gap-3">
            <Skeleton className="w-9 h-9 rounded-[10px]" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-2 w-full" />
        </div>
      ))}
    </div>
  );
}

/**
 * One deck in the Flashcards grids — the same fixed 250 × 100 card in every tab:
 * title and badges, "cards · by … · course", then the learned bar. The description
 * has no room, so it shows in the hover tooltip.
 * Pass `onToggleBookmark` to show the bookmark toggle in the corner — a sibling
 * of the open button, since a button can't hold another button.
 */
export function FlashDeckCard({
  deck,
  onOpen,
  bookmarked = false,
  onToggleBookmark,
}: {
  deck: FlashDeckCardData;
  onOpen: () => void;
  bookmarked?: boolean;
  onToggleBookmark?: () => void;
}) {
  const meta = [
    plural(deck.cardCount, "card"),
    deck.ownerName && `by ${deck.ownerName}`,
    deck.courseTitle,
  ]
    .filter(Boolean)
    .join(" · ");
  const showMode = deck.mode != null && deck.mode !== "FLASHCARD";
  const learnedPct =
    deck.cardCount > 0 ? Math.min(100, Math.round((deck.learnedCount / deck.cardCount) * 100)) : 0;

  return (
    <div className={`relative ${CARD_SIZE}`}>
      <button
        type="button"
        onClick={onOpen}
        title={deck.description ? `${deck.title}\n${deck.description}` : deck.title}
        className="card w-full h-full p-3 flex flex-col justify-between overflow-hidden text-left hover:shadow-md transition-shadow focus-visible:outline-2 focus-visible:outline-primary"
      >
        <div className={`flex items-start gap-3 w-full ${onToggleBookmark ? "pr-7" : ""}`}>
          <div className="w-9 h-9 rounded-[10px] bg-primary-light flex items-center justify-center flex-shrink-0">
            <Icon.Layers className="w-4.5 h-4.5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <h3 className="text-sm font-semibold text-content leading-5 truncate min-w-0">
                {deck.title}
              </h3>
              {showMode && (
                <span className="flex-shrink-0">
                  <DeckModeBadge mode={deck.mode!} />
                </span>
              )}
              {deck.reviewStatus && (
                <span className="flex-shrink-0">
                  <DeckStatusBadge status={deck.reviewStatus} />
                </span>
              )}
            </div>
            <p className="text-xs text-content-subtle leading-4 truncate">{meta}</p>
          </div>
        </div>
        {/* One line to fit the 100px card: label, bar, percent. */}
        <div className="w-full flex items-center gap-2">
          <span className="text-xs text-content-soft flex-shrink-0">Learned</span>
          <div className="flex-1 min-w-0">
            <Progress value={deck.learnedCount} max={Math.max(deck.cardCount, 1)} size="sm" />
          </div>
          <span className="text-xs font-medium text-content-secondary w-9 text-right flex-shrink-0">
            {learnedPct}%
          </span>
        </div>
      </button>
      {onToggleBookmark && (
        <button
          type="button"
          onClick={onToggleBookmark}
          aria-pressed={bookmarked}
          aria-label={bookmarked ? `Remove bookmark from ${deck.title}` : `Bookmark ${deck.title}`}
          title={bookmarked ? "Remove bookmark" : "Bookmark"}
          className={`absolute top-2.5 right-2.5 w-8 h-8 rounded-[8px] flex items-center justify-center transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-primary ${
            bookmarked ? "text-primary" : "text-content-subtle hover:text-content"
          }`}
        >
          <Icon.Bookmark className={`w-4 h-4 ${bookmarked ? "fill-current" : ""}`} />
        </button>
      )}
    </div>
  );
}
