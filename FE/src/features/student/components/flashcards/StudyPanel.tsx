import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastHost';
import { Icon } from '@/assets/icons';
import { getApiErrorMessage } from '@/utils/apiError';
import { studentDeckService, type DeckMode, type StudyCard } from '@/services/studentDeck.service';
import { CardFace, ConfirmModal, plural } from './flashcardUi';

/** A study run: a server session (FP-01/02) or a review of missed cards (FP-03, no session). */
type Run = { kind: 'session'; sessionId: string } | { kind: 'review' };

export interface StudySummary {
  total: number;
  known: number;
  wrong: number;
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
 * Study state of one deck: "Start studying" opens a study session in the BE's
 * order (FP-01), "Review missed cards" takes the LEARNING cards most-missed
 * first (FP-03). Each flipped card is marked Known (FC-08 KNOWN) or Not yet
 * (FC-08 WRONG); the end closes the session (FP-02) and leaves a summary.
 */
export function useDeckStudy(deckId: number, onProgress: (p: DeckProgress) => void) {
  const toast = useToast();
  const [run, setRun] = useState<Run | null>(null);
  const [cards, setCards] = useState<StudyCard[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [marks, setMarks] = useState<Record<number, 'KNOWN' | 'WRONG'>>({});
  const [summary, setSummary] = useState<StudySummary | null>(null);
  const [starting, setStarting] = useState<'session' | 'review' | null>(null);
  const [finishing, setFinishing] = useState(false);
  const marksRef = useRef(marks);
  marksRef.current = marks;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;

  const begin = async (kind: 'session' | 'review') => {
    setStarting(kind);
    try {
      let list: StudyCard[];
      if (kind === 'session') {
        const s = await studentDeckService.startSession(deckId);
        list = s.cards;
        onProgressRef.current({ learned: list.filter(c => c.status === 'KNOWN').length, total: list.length });
        if (list.length === 0) {
          toast.info('This deck has no cards yet.');
          return;
        }
        setRun({ kind: 'session', sessionId: s.sessionId });
      } else {
        list = await studentDeckService.getReviewCards(deckId, 50);
        if (list.length === 0) {
          toast.info('No missed cards to review. Nice work!');
          return;
        }
        setRun({ kind: 'review' });
      }
      setCards(list);
      setIndex(0);
      setFlipped(false);
      setMarks({});
      setSummary(null);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not start studying.'));
    } finally {
      setStarting(null);
    }
  };

  const finish = useCallback(async () => {
    if (!run) return;
    const m = marksRef.current;
    const known = Object.keys(m).filter(id => m[Number(id)] === 'KNOWN').map(Number);
    const wrong = Object.keys(m).filter(id => m[Number(id)] === 'WRONG').map(Number);
    let result: StudySummary = { total: cards.length, known: known.length, wrong: wrong.length, review: run.kind === 'review' };
    if (run.kind === 'session') {
      setFinishing(true);
      try {
        const s = await studentDeckService.finishSession(run.sessionId, known, wrong);
        result = { total: s.totalCards, known: s.knownCount, wrong: s.wrongCount, review: false };
      } catch (err) {
        // The progress is already saved card by card; only the session summary failed.
        toast.error(getApiErrorMessage(err, 'Could not close the study session.'));
      } finally {
        setFinishing(false);
      }
    }
    setRun(null);
    setSummary(result);
  }, [run, cards.length, toast]);

  const mark = (status: 'KNOWN' | 'WRONG') => {
    const card = cards[index];
    if (!card || !flipped) return;
    const cardId = card.cardId;
    setMarks(m => ({ ...m, [cardId]: status }));
    studentDeckService
      .writeProgress(cardId, { status })
      .then(p => onProgressRef.current({ learned: p.learnedCount, total: p.totalCards }))
      .catch(err => toast.error(getApiErrorMessage(err, 'Could not save your progress for this card.')));
    if (index < cards.length - 1) {
      setIndex(i => i + 1);
      setFlipped(false);
    } else {
      // Last card: put the mark in marksRef now so finish() counts it.
      marksRef.current = { ...marksRef.current, [cardId]: status };
      void finish();
    }
  };

  const toggleStar = () => {
    const card = cards[index];
    if (!card) return;
    const next = !card.isStarred;
    const cardId = card.cardId;
    setCards(cs => cs.map(c => (c.cardId === cardId ? { ...c, isStarred: next } : c)));
    studentDeckService.writeProgress(cardId, { isStarred: next }).catch(err => {
      setCards(cs => cs.map(c => (c.cardId === cardId ? { ...c, isStarred: !next } : c)));
      toast.error(getApiErrorMessage(err, 'Could not update the star.'));
    });
  };

  const go = (delta: number) => {
    setIndex(i => Math.min(Math.max(i + delta, 0), cards.length - 1));
    setFlipped(false);
  };

  return {
    run,
    cards,
    index,
    card: cards[index] as StudyCard | undefined,
    flipped,
    marks,
    summary,
    starting,
    finishing,
    begin,
    finish,
    mark,
    toggleStar,
    go,
    flip: () => setFlipped(f => !f),
    showAnswer: () => setFlipped(true),
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
  const [confirmLearnAll, setConfirmLearnAll] = useState(false);
  const [learningAll, setLearningAll] = useState(false);
  const busy = study.starting != null || study.run != null;

  const learnAll = async () => {
    setLearningAll(true);
    try {
      const res = await studentDeckService.learnAll(deckId);
      onProgress({ learned: res.learnedCount, total: res.totalCards });
      toast.success('Every card is marked as learned.');
      setConfirmLearnAll(false);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not mark the deck as learned.'));
    } finally {
      setLearningAll(false);
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
        <Button
          className="w-full"
          variant="ghost"
          icon={<Icon.CheckCircle className="w-4 h-4" />}
          onClick={() => setConfirmLearnAll(true)}
          disabled={busy}
        >
          Mark all as learned
        </Button>
      {confirmLearnAll && (
        <ConfirmModal
          title="Mark all as learned?"
          message="Every card you haven't studied yet will be marked as known. Cards you already studied keep their status."
          confirmLabel="Mark all"
          busy={learningAll}
          onConfirm={learnAll}
          onClose={() => setConfirmLearnAll(false)}
        />
      )}
    </div>
  );
}

/** "Session finished — 8 known · 2 not yet" banner above the card list. */
export function StudySummaryBanner({ summary, onClose }: { summary: StudySummary; onClose: () => void }) {
  const skipped = Math.max(summary.total - summary.known - summary.wrong, 0);
  return (
    <div className="card px-5 py-3.5 flex flex-wrap items-center gap-x-6 gap-y-2">
      <span className="flex items-center gap-2 text-sm font-semibold text-content">
        <Icon.CheckCircle className="w-5 h-5 text-success" /> {summary.review ? 'Review finished' : 'Session finished'}
      </span>
      <span className="text-sm">
        <strong className="text-success">{summary.known}</strong> <span className="text-content-soft">known</span>
      </span>
      <span className="text-sm">
        <strong className="text-warning">{summary.wrong}</strong> <span className="text-content-soft">not yet</span>
      </span>
      {skipped > 0 && (
        <span className="text-sm">
          <strong className="text-content">{skipped}</strong> <span className="text-content-soft">skipped</span>
        </span>
      )}
      <button type="button" onClick={onClose} aria-label="Dismiss" className="ml-auto text-content-subtle hover:text-content">
        <Icon.X className="w-4 h-4" />
      </button>
    </div>
  );
}

/** The card being studied: flip, Known / Not yet, star. Keys: Space flip · 1 Known · 2 Not yet · S star · ← → move. */
export function StudySession({ study, mode }: { study: DeckStudy; mode: DeckMode }) {
  const { run, card, cards, index, flipped, marks } = study;

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    if (!run || !card || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
    if (document.querySelector('[role="dialog"]')) return;
    if (e.key === ' ' || e.key === 'Enter') {
      if ((e.target as HTMLElement | null)?.tagName === 'BUTTON' && e.key === 'Enter') return;
      e.preventDefault();
      study.flip();
    } else if (e.key === 'ArrowLeft') study.go(-1);
    else if (e.key === 'ArrowRight') study.go(1);
    else if (e.key === '1') study.mark('KNOWN');
    else if (e.key === '2') study.mark('WRONG');
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
  const markOf = marks[card.cardId];

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
          {/* Both faces share one grid cell, so the card is as tall as the taller face. */}
          <div
            aria-hidden={flipped}
            className="card [grid-area:1/1] min-h-72 p-[clamp(1.25rem,4vw,2.5rem)] flex flex-col items-center justify-center gap-4 [backface-visibility:hidden]"
          >
            <span className="text-2xs font-semibold uppercase tracking-wide text-content-subtle">Front</span>
            <CardFace card={card} mode={mode} side="front" />
            <span className="text-xs text-content-subtle">Click or press Space to flip</span>
          </div>
          <div
            aria-hidden={!flipped}
            className="card bg-primary-light [grid-area:1/1] min-h-72 p-[clamp(1.25rem,4vw,2.5rem)] flex flex-col items-center justify-center gap-4 [backface-visibility:hidden] [transform:rotateY(180deg)]"
          >
            <span className="text-2xs font-semibold uppercase tracking-wide text-content-subtle">Back</span>
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
        {markOf && (
          <span className={`absolute z-10 top-4 left-4 text-xs font-semibold ${markOf === 'KNOWN' ? 'text-success' : 'text-warning'}`}>
            {markOf === 'KNOWN' ? 'Known' : 'Not yet'}
          </span>
        )}
      </div>

      {flipped ? (
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" size="lg" icon={<Icon.X className="w-4 h-4" />} onClick={() => study.mark('WRONG')}>
            Not yet
          </Button>
          <Button size="lg" icon={<Icon.Check className="w-4 h-4" />} onClick={() => study.mark('KNOWN')}>
            Known
          </Button>
        </div>
      ) : (
        <Button variant="secondary" size="lg" className="w-full" onClick={study.showAnswer}>
          Show answer
        </Button>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" icon={<Icon.ChevronLeft className="w-4 h-4" />} onClick={() => study.go(-1)} disabled={index === 0}>
          Previous
        </Button>
        <span className="text-xs text-content-subtle">{plural(Object.keys(marks).length, 'card')} marked</span>
        <Button
          variant="ghost"
          size="sm"
          iconRight={<Icon.ChevronRight className="w-4 h-4" />}
          onClick={() => study.go(1)}
          disabled={index === cards.length - 1}
        >
          Skip
        </Button>
      </div>
      <p className="text-center text-xs text-content-subtle">Keys: Space flip · 1 Known · 2 Not yet · S star · ← → move</p>
    </div>
  );
}
