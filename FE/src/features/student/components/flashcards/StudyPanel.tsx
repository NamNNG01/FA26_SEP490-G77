import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastHost';
import { Icon } from '@/assets/icons';
import { getApiErrorMessage } from '@/utils/apiError';
import { isEndpointMissing, studentDeckService, type DeckMode, type StudyCard } from '@/services/studentDeck.service';
import { CardFace, ConfirmModal, plural } from './flashcardUi';

/**
 * A study run, always a server session (FP-01/02). "review" studies only the cards not learned
 * yet (NEW / LEARNING) — the cards the student has not reached.
 */
type Run = { kind: 'session' | 'review'; sessionId: string };

export interface StudySummary {
  total: number;
  studied: number;
  review: boolean;
}

export interface DeckProgress {
  learned: number;
  total: number;
}

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);
};

/**
 * Study state of one deck, Quizlet style: moving forward from a card (Next or the → key, flipped
 * or not) counts it as studied and saves it as KNOWN right away (FC-08), so the deck progress grows
 * card by card. Going back does not count anything. "Start studying" takes every card in the BE's
 * order; "Review missed cards" only the cards not learned yet. The end closes the session (FP-02).
 */
export function useDeckStudy(deckId: number, onProgress: (p: DeckProgress) => void) {
  const toast = useToast();
  const [run, setRun] = useState<Run | null>(null);
  const [cards, setCards] = useState<StudyCard[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  /** Cards counted as studied in this run. */
  const [studied, setStudied] = useState<Record<number, true>>({});
  const [summary, setSummary] = useState<StudySummary | null>(null);
  const [starting, setStarting] = useState<'session' | 'review' | null>(null);
  const [finishing, setFinishing] = useState(false);
  const studiedRef = useRef(studied);
  studiedRef.current = studied;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  const begin = async (kind: 'session' | 'review') => {
    setStarting(kind);
    try {
      const s = await studentDeckService.startSession(deckId);
      onProgressRef.current({ learned: s.cards.filter(c => c.status === 'KNOWN').length, total: s.cards.length });
      const list = kind === 'review' ? s.cards.filter(c => c.status !== 'KNOWN') : s.cards;
      if (list.length === 0) {
        // Nothing to study: close the session that was just opened.
        studentDeckService.finishSession(s.sessionId, [], []).catch(() => {});
        toast.info(s.cards.length === 0 ? 'This deck has no cards yet.' : 'Every card is learned already. Nice work!');
        return;
      }
      setRun({ kind, sessionId: s.sessionId });
      setCards(list);
      setIndex(0);
      setFlipped(false);
      setStudied({});
      setSummary(null);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not start studying.'));
    } finally {
      setStarting(null);
    }
  };

  const finish = useCallback(async () => {
    if (!run) return;
    const ids = Object.keys(studiedRef.current).map(Number);
    let result: StudySummary = { total: cards.length, studied: ids.length, review: run.kind === 'review' };
    setFinishing(true);
    try {
      const s = await studentDeckService.finishSession(run.sessionId, ids, []);
      result = { ...result, studied: s.knownCount };
    } catch (err) {
      // The progress is already saved card by card; only the session summary failed.
      toast.error(getApiErrorMessage(err, 'Could not close the study session.'));
    } finally {
      setFinishing(false);
    }
    setRun(null);
    setSummary(result);
  }, [run, cards.length, toast]);

  /** Counts a card as studied once per run and saves it as KNOWN. */
  const countStudied = (card: StudyCard) => {
    if (studiedRef.current[card.cardId]) return;
    studiedRef.current = { ...studiedRef.current, [card.cardId]: true };
    setStudied(studiedRef.current);
    studentDeckService
      .writeProgress(card.cardId, { status: 'KNOWN' })
      .then(p => onProgressRef.current({ learned: p.learnedCount, total: p.totalCards }))
      .catch(err => toast.error(getApiErrorMessage(err, 'Could not save your progress for this card.')));
  };

  /** Next card (or the end of the run on the last one); the card left behind counts as studied. */
  const next = () => {
    const card = cards[index];
    if (!card || finishing) return;
    countStudied(card);
    if (index < cards.length - 1) {
      setIndex(i => i + 1);
      setFlipped(false);
    } else {
      void finish();
    }
  };

  const prev = () => {
    if (index === 0) return;
    setIndex(i => i - 1);
    setFlipped(false);
  };

  const toggleStar = () => {
    const card = cards[index];
    if (!card) return;
    const nextStar = !card.isStarred;
    const cardId = card.cardId;
    setCards(cs => cs.map(c => (c.cardId === cardId ? { ...c, isStarred: nextStar } : c)));
    studentDeckService.writeProgress(cardId, { isStarred: nextStar }).catch(err => {
      setCards(cs => cs.map(c => (c.cardId === cardId ? { ...c, isStarred: !nextStar } : c)));
      toast.error(getApiErrorMessage(err, 'Could not update the star.'));
    });
  };

  return {
    run,
    cards,
    index,
    card: cards[index] as StudyCard | undefined,
    flipped,
    studied,
    summary,
    starting,
    finishing,
    begin,
    finish,
    next,
    prev,
    toggleStar,
    flip: () => setFlipped(f => !f),
    dismissSummary: () => setSummary(null),
  };
}

export type DeckStudy = ReturnType<typeof useDeckStudy>;

/** Study buttons, stacked full width, for the action column of the deck header. */
export function StudyActions({
  study,
  deckId,
  cardCount,
  onProgress,
}: {
  study: DeckStudy;
  deckId: number;
  cardCount: number;
  onProgress: (p: DeckProgress) => void;
}) {
  const toast = useToast();
  const [confirm, setConfirm] = useState<'learnAll' | 'reset' | null>(null);
  const [working, setWorking] = useState(false);
  const busy = study.starting != null || study.run != null;

  const learnAll = async () => {
    setWorking(true);
    try {
      const res = await studentDeckService.learnAll(deckId);
      onProgress({ learned: res.learnedCount, total: res.totalCards });
      toast.success('Every card is marked as learned.');
      setConfirm(null);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not mark the deck as learned.'));
    } finally {
      setWorking(false);
    }
  };

  const resetProgress = async () => {
    setWorking(true);
    try {
      const res = await studentDeckService.resetProgress(deckId);
      onProgress({ learned: res.learnedCount, total: res.totalCards });
      study.dismissSummary();
      toast.success('Your progress on this deck is back to 0.');
      setConfirm(null);
    } catch (err) {
      toast.error(
        isEndpointMissing(err) ? 'Resetting progress is not available on the server yet.' : getApiErrorMessage(err, 'Could not reset your progress.'),
      );
    } finally {
      setWorking(false);
    }
  };

  if (cardCount === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <Button
        className="w-full"
        icon={<Icon.Zap className="w-4 h-4" />}
        onClick={() => study.begin('session')}
        loading={study.starting === 'session'}
        disabled={busy}
      >
        {study.summary ? 'Study again' : 'Start studying'}
      </Button>
      <Button
        className="w-full"
        variant="outline"
        icon={<Icon.RefreshCw className="w-4 h-4" />}
        onClick={() => study.begin('review')}
        loading={study.starting === 'review'}
        disabled={busy}
      >
        Review missed cards
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" size="sm" icon={<Icon.CheckCircle className="w-4 h-4" />} onClick={() => setConfirm('learnAll')} disabled={busy}>
          Mark all learned
        </Button>
        <Button variant="ghost" size="sm" icon={<Icon.RotateCcw className="w-4 h-4" />} onClick={() => setConfirm('reset')} disabled={busy}>
          Reset progress
        </Button>
      </div>
      {confirm === 'learnAll' && (
        <ConfirmModal
          title="Mark all as learned?"
          message="Every card you haven't studied yet will be marked as known. Cards you already studied keep their status."
          confirmLabel="Mark all"
          busy={working}
          onConfirm={learnAll}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === 'reset' && (
        <ConfirmModal
          title="Reset your progress?"
          message="Every card of this deck goes back to not learned and the progress starts again from 0. Your starred cards stay starred."
          confirmLabel="Reset progress"
          danger
          busy={working}
          onConfirm={resetProgress}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

/** "Session finished — 8 of 10 cards studied" banner above the card list. */
export function StudySummaryBanner({ summary, onClose }: { summary: StudySummary; onClose: () => void }) {
  return (
    <div className="card px-5 py-3.5 flex flex-wrap items-center gap-x-6 gap-y-2">
      <span className="flex items-center gap-2 text-sm font-semibold text-content">
        <Icon.CheckCircle className="w-5 h-5 text-success" /> {summary.review ? 'Review finished' : 'Session finished'}
      </span>
      <span className="text-sm">
        <strong className="text-success">{summary.studied}</strong> <span className="text-content-soft">of {plural(summary.total, 'card')} studied</span>
      </span>
      <button type="button" onClick={onClose} aria-label="Dismiss" className="ml-auto text-content-subtle hover:text-content">
        <Icon.X className="w-4 h-4" />
      </button>
    </div>
  );
}

/** Shared look of both card faces; the colors tell front from back. */
const FACE_CLASS =
  '[grid-area:1/1] min-h-72 rounded-[14px] border-2 shadow-sm p-[clamp(1.25rem,4vw,2.5rem)] flex flex-col items-center justify-center gap-4 [backface-visibility:hidden]';

/** The card being studied: flip, star, move. Keys: Space flip · ← previous · → next · S star. */
export function StudySession({ study, mode }: { study: DeckStudy; mode: DeckMode }) {
  const { run, card, cards, index, flipped } = study;

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    if (!run || !card || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
    if (document.querySelector('[role="dialog"]')) return;
    if (e.key === ' ' || e.key === 'Enter') {
      if ((e.target as HTMLElement | null)?.tagName === 'BUTTON' && e.key === 'Enter') return;
      e.preventDefault();
      study.flip();
    } else if (e.key === 'ArrowLeft') study.prev();
    else if (e.key === 'ArrowRight') study.next();
    else if (e.key.toLowerCase() === 's') study.toggleStar();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A new run starts from the header buttons: bring the study card into view.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!run) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    rootRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, [run]);

  // Moving to another card slides it in: from the right going forward, from the left going back.
  const slideRef = useRef<HTMLDivElement>(null);
  const prevIndex = useRef(index);
  const cardId = card?.cardId;
  useLayoutEffect(() => {
    const from = index >= prevIndex.current ? 1 : -1;
    const moved = index !== prevIndex.current;
    prevIndex.current = index;
    const el = slideRef.current;
    if (!moved || !el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.animate(
      [
        { transform: `translateX(${from * 56}px)`, opacity: 0 },
        { transform: 'translateX(0)', opacity: 1 },
      ],
      { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
  }, [cardId, index]);

  if (!run || !card) return null;
  const isLast = index === cards.length - 1;

  return (
    // overflow-x-clip: the sliding card must not widen the page on a phone.
    <div ref={rootRef} className="max-w-2xl mx-auto space-y-4 scroll-mt-[85px] overflow-x-clip">

      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-content-secondary">
          {run.kind === 'review' ? 'Reviewing missed cards · ' : 'Studying · '}
          {index + 1} / {cards.length}
        </span>
        <Button variant="ghost" size="sm" onClick={study.finish} loading={study.finishing} disabled={study.finishing}>
          End {run.kind === 'review' ? 'review' : 'session'}
        </Button>
      </div>

      {/* Keyed by card: the next card mounts face up (no turning back that would flash its answer) and slides in. */}
      <div ref={slideRef} key={card.cardId} className="relative [perspective:1200px]">
        <button
          type="button"
          onClick={study.flip}
          aria-label={flipped ? 'Show front' : 'Show back'}
          className="grid w-full rounded-[14px] text-center transition-transform duration-500 ease-out motion-reduce:transition-none [transform-style:preserve-3d] focus-visible:outline-2 focus-visible:outline-primary"
          style={{ transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
        >
          {/* Both faces share one grid cell, so the card is as tall as the taller face. Only the text is
              shown: the face's colour tells question from answer, the keys line below says how to flip. */}
          <div aria-hidden={flipped} className={`${FACE_CLASS} border-line-strong bg-surface`}>
            <CardFace card={card} mode={mode} side="front" />
          </div>
          <div aria-hidden={!flipped} className={`${FACE_CLASS} border-primary bg-primary-light [transform:rotateY(180deg)]`}>
            <CardFace card={card} mode={mode} side="back" />
          </div>
        </button>
        <button
          type="button"
          onClick={study.toggleStar}
          aria-pressed={card.isStarred}
          aria-label={card.isStarred ? 'Unstar card' : 'Star card'}
          title={card.isStarred ? 'Unstar (S)' : 'Star (S)'}
          className={`absolute z-10 top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center hover:bg-accent ${
            card.isStarred ? 'text-warning' : 'text-content-subtle'
          }`}
        >
          <Icon.Star className={`w-5 h-5 ${card.isStarred ? 'fill-current' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" size="lg" icon={<Icon.ChevronLeft className="w-4 h-4" />} onClick={study.prev} disabled={index === 0}>
          Previous
        </Button>
        <Button
          size="lg"
          iconRight={isLast ? <Icon.Check className="w-4 h-4" /> : <Icon.ChevronRight className="w-4 h-4" />}
          onClick={study.next}
          disabled={study.finishing}
        >
          {isLast ? 'Finish' : 'Next'}
        </Button>
      </div>
      <p className="text-center text-xs text-content-subtle">Keys: Space flip · ← previous · → next · S star</p>
    </div>
  );
}
