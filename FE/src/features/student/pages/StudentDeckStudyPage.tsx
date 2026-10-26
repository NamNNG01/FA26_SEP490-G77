import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Tabs } from '@/components/ui/Tabs';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/Card';
import { Icon } from '@/assets/icons';
import { ROUTES, studentCoursePath } from '@/app/routes';
import { getApiErrorMessage } from '@/utils/apiError';
import { studentCourseService, type StudentCard } from '@/services/studentCourse.service';
import { LoadError, STUDENT_PAGE_CLASS } from '../components/studentUi';
import type { DeckStudyState } from '../components/DeckCard';

const VIEW_STUDY = 'Study';
const VIEW_LIST = 'All cards';

function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Deck study — flip through every card of one deck (MC-04). Read-only: the
 * API has no endpoint for students to record learned / starred progress yet.
 * Deck and course titles come from router state (MC-04 returns cards only).
 */
export function StudentDeckStudyPage() {
  const { deckId = '' } = useParams<{ deckId: string }>();
  const navigate = useNavigate();
  const state = (useLocation().state ?? null) as DeckStudyState | null;

  const [cards, setCards] = useState<StudentCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const [view, setView] = useState(VIEW_STUDY);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    studentCourseService
      .getAllDeckCards(deckId)
      .then(res => {
        if (cancelled) return;
        setCards(res);
        setIndex(0);
        setFlipped(false);
      })
      .catch(err => {
        if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load the cards.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deckId, reload]);

  const go = useCallback(
    (delta: number) => {
      setIndex(i => Math.min(Math.max(i + delta, 0), Math.max(cards.length - 1, 0)));
      setFlipped(false);
    },
    [cards.length],
  );

  const shuffle = () => {
    setCards(c => shuffled(c));
    setIndex(0);
    setFlipped(false);
  };

  // Keyboard: ← / → move, Space / Enter flips.
  useEffect(() => {
    if (view !== VIEW_STUDY || cards.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)) return;
      if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setFlipped(f => !f);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, cards.length, go]);

  const crumbs: { label: string; onClick?: () => void }[] = [
    { label: 'Flashcards', onClick: () => navigate(ROUTES.studentFlashcards) },
  ];
  if (state?.courseId && state.courseTitle) {
    const courseId = state.courseId;
    crumbs.push({ label: state.courseTitle, onClick: () => navigate(studentCoursePath(courseId)) });
  }
  crumbs.push({ label: state?.deckTitle ?? 'Deck' });

  const card = cards[index];

  return (
    <div className={`${STUDENT_PAGE_CLASS} space-y-[clamp(1.25rem,2.5vw,1.75rem)]`}>
      <Breadcrumb items={crumbs} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[clamp(1.25rem,1.1rem+0.6vw,1.5rem)] font-bold text-content">{state?.deckTitle ?? 'Flashcards'}</h1>
          {!loading && !error && <p className="text-sm text-content-soft mt-1">{cards.length} cards</p>}
        </div>
        {cards.length > 0 && <Tabs tabs={[VIEW_STUDY, VIEW_LIST]} active={view} onChange={setView} />}
      </div>

      {loading ? (
        <Skeleton className="w-full max-w-2xl mx-auto h-72 rounded-[14px]" />
      ) : error ? (
        <LoadError message={error} onRetry={() => setReload(r => r + 1)} />
      ) : cards.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Icon.Layers className="w-7 h-7" />} title="This deck has no cards yet" />
        </div>
      ) : view === VIEW_STUDY && card ? (
        <div className="max-w-2xl mx-auto space-y-4">
          <button
            type="button"
            onClick={() => setFlipped(f => !f)}
            aria-label={flipped ? 'Show front' : 'Show back'}
            className={`card w-full min-h-72 p-[clamp(1.25rem,4vw,2.5rem)] flex flex-col items-center justify-center gap-4 text-center transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
              flipped ? 'bg-primary-light' : ''
            }`}
          >
            <span className="text-2xs font-semibold uppercase tracking-wide text-content-subtle">
              {flipped ? 'Back' : 'Front'}
            </span>
            <p className="text-[clamp(1.05rem,1rem+0.5vw,1.35rem)] font-medium text-content whitespace-pre-line break-words">
              {flipped ? card.backText : card.frontText}
            </p>
            <CardProgressBadges card={card} />
            <span className="text-xs text-content-subtle">Click or press Space to flip</span>
          </button>

          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" icon={<Icon.ChevronLeft className="w-4 h-4" />} onClick={() => go(-1)} disabled={index === 0}>
              Previous
            </Button>
            <span className="text-sm font-medium text-content-secondary">
              {index + 1} / {cards.length}
            </span>
            <Button
              variant="outline"
              iconRight={<Icon.ChevronRight className="w-4 h-4" />}
              onClick={() => go(1)}
              disabled={index === cards.length - 1}
            >
              Next
            </Button>
          </div>
          <div className="flex justify-center">
            <Button variant="ghost" size="sm" icon={<Icon.RefreshCw className="w-4 h-4" />} onClick={shuffle}>
              Shuffle
            </Button>
          </div>
        </div>
      ) : (
        <ul className="card divide-y divide-line">
          {cards.map((c, i) => (
            <li key={c.cardId} className="grid gap-2 sm:grid-cols-[2rem_1fr_1fr_auto] items-start px-5 py-4">
              <span className="text-xs font-semibold text-content-subtle pt-0.5">{i + 1}</span>
              <p className="text-sm font-medium text-content whitespace-pre-line break-words">{c.frontText}</p>
              <p className="text-sm text-content-soft whitespace-pre-line break-words">{c.backText}</p>
              <CardProgressBadges card={c} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CardProgressBadges({ card }: { card: StudentCard }) {
  // MC-04 reports untouched cards as NEW — not worth a badge.
  const status = card.status && card.status !== 'NEW' ? card.status : null;
  if (!card.isStarred && !status) return null;
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {status && <Badge variant={status === 'LEARNED' ? 'success' : 'default'}>{status.replace(/_/g, ' ')}</Badge>}
      {card.isStarred && (
        <Badge variant="warning">
          <Icon.Star className="w-3 h-3" /> Starred
        </Badge>
      )}
    </span>
  );
}
