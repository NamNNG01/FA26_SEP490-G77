import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Icon } from '@/assets/icons';
import { Container } from '@/features/landing/components/Container';
import { studentLearningService, type StudentCard, type StudentPage } from '@/services/studentLearning.service';

export function FlashcardStudyPage() {
  const { deckId: deckParam } = useParams<{ deckId: string }>();
  const deckId = Number(deckParam);
  const location = useLocation();
  const navigate = useNavigate();
  const [page, setPage] = useState<StudentPage<StudentCard> | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [courseId] = useState<number | undefined>((location.state as { courseId?: number } | null)?.courseId);
  const [deckTitle] = useState<string>((location.state as { deckTitle?: string } | null)?.deckTitle ?? 'Flashcard set');

  useEffect(() => {
    if (!Number.isFinite(deckId) || deckId <= 0) return;
    let active = true;
    setLoading(true);
    setError('');
    studentLearningService.getDeckCards(deckId, pageIndex, 50).then((result) => {
      if (active) setPage(result);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'We couldn’t load these flashcards.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [deckId, pageIndex, refresh]);

  const cards = page?.content ?? [];
  const card = cards[cardIndex];
  const totalCards = page?.totalElements ?? cards.length;
  const position = pageIndex * (page?.size ?? 50) + cardIndex + 1;

  function nextCard() {
    setFlipped(false);
    if (cardIndex < cards.length - 1) setCardIndex((value) => value + 1);
    else if (page && !page.last) {
      setPageIndex((value) => value + 1);
      setCardIndex(0);
    }
  }

  function previousCard() {
    setFlipped(false);
    if (cardIndex > 0) setCardIndex((value) => value - 1);
    else if (pageIndex > 0) {
      setPageIndex((value) => value - 1);
      setCardIndex(Math.max(0, (page?.size ?? 50) - 1));
    }
  }

  const backToCourse = () => navigate(courseId ? `/student/courses/${courseId}?tab=flashcards` : '/student/courses');

  if (!Number.isFinite(deckId) || deckId <= 0) return <StudyState title="Flashcard set not found" message="This flashcard link doesn’t look right." onBack={backToCourse} />;

  return <Container className="py-8 sm:py-10">
    <button type="button" onClick={backToCourse} className="inline-flex items-center gap-2 text-sm font-medium text-content-soft hover:text-brand-ink"><Icon.ChevronLeft className="h-4 w-4" />Back to course</button>
    <div className="mx-auto mt-7 max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-semibold text-brand-ink">Flashcard practice</p><h1 className="mt-1 text-2xl font-bold text-content sm:text-3xl">{deckTitle}</h1></div>{!loading && page && <span className="rounded-full bg-primary-light px-3 py-1.5 text-sm font-semibold text-brand-ink">{totalCards ? `${position} of ${totalCards}` : '0 cards'}</span>}</div>
      {loading ? <div className="mt-6 h-[22rem] animate-pulse rounded-3xl bg-surface-alt" /> : error ? <div className="mt-6"><StudyState title="Flashcards didn’t load" message={error} onBack={backToCourse} onRetry={() => setRefresh((value) => value + 1)} /></div> : card ? <>
        <button type="button" onClick={() => setFlipped((value) => !value)} aria-label={flipped ? 'Show front of card' : 'Show answer'} className="mt-6 flex min-h-[22rem] w-full flex-col items-center justify-center rounded-3xl border border-line-soft bg-gradient-to-br from-surface via-surface to-primary-light p-8 text-center shadow-sm transition hover:shadow-md sm:p-12">
          <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-wide text-content-subtle shadow-sm">{flipped ? 'Answer' : 'Front'}</span>
          <span className="mt-8 max-w-2xl whitespace-pre-wrap text-xl font-semibold leading-relaxed text-content sm:text-2xl">{flipped ? card.backText : card.frontText}</span>
          <span className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-brand-ink"><Icon.RefreshCw className="h-4 w-4" />Tap to {flipped ? 'see the prompt' : 'flip the card'}</span>
        </button>
        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-content-subtle"><span className={`rounded-full px-2.5 py-1 font-medium ${card.status === 'LEARNED' ? 'bg-success-light text-success-strong' : 'bg-surface-alt text-content-subtle'}`}>{card.status === 'LEARNED' ? 'Learned' : 'New card'}</span>{card.isStarred && <span className="inline-flex items-center gap-1 rounded-full bg-warning-light px-2.5 py-1 font-medium text-warning-strong"><Icon.Star className="h-3.5 w-3.5" />Saved</span>}</div>
          <div className="flex gap-2"><button type="button" onClick={previousCard} disabled={position <= 1} className="inline-flex h-10 items-center gap-1 rounded-xl border border-line px-4 text-sm font-semibold text-content-secondary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"><Icon.ChevronLeft className="h-4 w-4" />Previous</button><button type="button" onClick={nextCard} disabled={!page || (page.last && cardIndex === cards.length - 1)} className="inline-flex h-10 items-center gap-1 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40">Next<Icon.ChevronRight className="h-4 w-4" /></button></div>
        </div>
      </> : <StudyState title="No cards in this set yet" message="This flashcard set is ready for its first card." onBack={backToCourse} />}
    </div>
  </Container>;
}

function StudyState({ title, message, onBack, onRetry }: { title: string; message: string; onBack?: () => void; onRetry?: () => void }) {
  return <div className="mx-auto max-w-lg rounded-2xl border border-line-soft bg-surface px-6 py-12 text-center shadow-sm"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-light text-brand-ink"><Icon.Layers className="h-7 w-7" /></span><h2 className="mt-4 text-xl font-semibold text-content">{title}</h2><p className="mt-2 text-sm leading-relaxed text-content-soft">{message}</p><div className="mt-5 flex justify-center gap-2">{onBack && <button type="button" onClick={onBack} className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-content-secondary hover:bg-surface-hover">Back to course</button>}{onRetry && <button type="button" onClick={onRetry} className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">Try again</button>}</div></div>;
}
