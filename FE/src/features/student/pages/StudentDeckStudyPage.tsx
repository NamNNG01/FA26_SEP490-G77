import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Progress } from '@/components/ui/Progress';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/Card';
import { useToast } from '@/components/ui/ToastHost';
import { Icon } from '@/assets/icons';
import { ROUTES, studentCoursePath } from '@/app/routes';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  apiErrorCode,
  isDeckDeletable,
  isDeckEditable,
  isEndpointMissing,
  studentDeckService,
  type StudentDeckView,
  type ViewerCard,
} from '@/services/studentDeck.service';
import { LoadError, STUDENT_PAGE_CLASS, formatDateTime } from '../components/studentUi';
import type { DeckStudyState } from '../components/DeckCard';
import { CardFace, ConfirmModal, DeckModeBadge, DeckStatusBadge, plural } from '../components/flashcards/flashcardUi';
import { DeckFormModal } from '../components/flashcards/DeckFormModal';
import { CardFormModal } from '../components/flashcards/CardFormModal';
import { ImportCardsModal } from '../components/flashcards/ImportCardsModal';
import {
  StudyActions,
  StudySession,
  StudySummaryBanner,
  useDeckStudy,
  type DeckProgress,
} from '../components/flashcards/StudyPanel';

type Dialog =
  | { kind: 'edit' }
  | { kind: 'delete' }
  | { kind: 'publish' }
  | { kind: 'withdraw' }
  | { kind: 'import' }
  | { kind: 'card'; card?: ViewerCard }
  | { kind: 'deleteCard'; card: ViewerCard };

/** Reasons the BE refuses a deck action, in words. */
const CONFLICT_MESSAGE: Record<string, string> = {
  DECK_LOCKED: "This deck is under review or public, so it can't be changed.",
  ALREADY_PENDING_REVIEW: 'This deck is already waiting for review.',
  ALREADY_PUBLIC: 'This deck is already public.',
  NOT_PENDING_REVIEW: 'This deck is not waiting for review.',
};

/**
 * One deck: study it (any readable deck) and, for the student's own deck,
 * edit it, manage its cards, import cards and ask for it to be made public.
 *
 * Deck info comes from FC-14; until the BE has it, from router state (set by
 * the list and right after create) or the viewer (title + mode, read-only).
 */
export function StudentDeckStudyPage() {
  const { deckId: deckIdParam = '' } = useParams<{ deckId: string }>();
  const deckId = Number(deckIdParam);
  const navigate = useNavigate();
  const toast = useToast();
  const state = (useLocation().state ?? null) as DeckStudyState | null;

  const [deck, setDeck] = useState<StudentDeckView | null>(state?.deck ?? null);
  const [cards, setCards] = useState<ViewerCard[]>([]);
  const [progress, setProgress] = useState<DeckProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState(false);
  const study = useDeckStudy(deckId, setProgress);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [viewer, detail] = await Promise.all([
          studentDeckService.getViewer(deckId),
          studentDeckService.getDeck(deckId).catch(err => {
            if (isEndpointMissing(err)) return null; // FC-14 not on the BE yet
            throw err;
          }),
        ]);
        if (cancelled) return;
        setCards(viewer.cards);
        setDeck(prev => {
          const base: StudentDeckView = detail ??
            prev ?? {
              deckId,
              title: viewer.deckTitle,
              description: null,
              mode: viewer.deckMode,
              courseId: state?.courseId ?? null,
              courseTitle: state?.courseTitle ?? null,
              cardCount: viewer.cards.length,
              visibility: 'PRIVATE',
              reviewStatus: 'NONE',
              reviewNote: null,
              createdAt: null,
              isOwner: false,
            };
          return {
            ...base,
            // FC-14 may not say whether the caller owns it; the list / create state does.
            isOwner: detail?.isOwner ?? prev?.isOwner ?? base.isOwner ?? false,
            courseTitle: base.courseTitle ?? prev?.courseTitle ?? state?.courseTitle ?? null,
            mode: viewer.deckMode,
            cardCount: viewer.cards.length,
          };
        });
        if (detail?.learnedCount != null) setProgress({ learned: detail.learnedCount, total: viewer.cards.length });
      } catch (err) {
        if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load the deck.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Router state is only the first guess; reloads must not depend on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckId, reload]);

  const reloadCards = useCallback(async () => {
    try {
      const viewer = await studentDeckService.getViewer(deckId);
      setCards(viewer.cards);
      setDeck(d => (d ? { ...d, cardCount: viewer.cards.length } : d));
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to reload the cards.'));
    }
  }, [deckId, toast]);

  const isOwner = Boolean(deck?.isOwner);
  const editable = isOwner && deck != null && isDeckEditable(deck.reviewStatus);
  const deletable = isOwner && deck != null && isDeckDeletable(deck.reviewStatus);
  const backTab = state?.tab ?? (isOwner ? 'mine' : 'course');
  const flashcardsUrl = `${ROUTES.studentFlashcards}?tab=${backTab}`;

  /** Runs a deck action; a 409 reloads the deck since its status changed elsewhere. */
  const act = async (fn: () => Promise<void>, fallback: string) => {
    setBusy(true);
    try {
      await fn();
      setDialog(null);
    } catch (err) {
      const code = apiErrorCode(err);
      if (isEndpointMissing(err)) toast.error('This action is not available on the server yet.');
      else toast.error((code && CONFLICT_MESSAGE[code]) || getApiErrorMessage(err, fallback));
      if (code) {
        setDialog(null);
        setReload(r => r + 1);
      }
    } finally {
      setBusy(false);
    }
  };

  const crumbs: { label: string; onClick?: () => void }[] = [{ label: 'Flashcards', onClick: () => navigate(flashcardsUrl) }];
  const courseId = deck?.courseId ?? state?.courseId;
  const courseTitle = deck?.courseTitle ?? state?.courseTitle;
  if (courseId && courseTitle && !isOwner) crumbs.push({ label: courseTitle, onClick: () => navigate(studentCoursePath(courseId)) });
  crumbs.push({ label: deck?.title ?? state?.deckTitle ?? 'Deck' });

  if (loading && !deck) {
    return (
      <div className={`${STUDENT_PAGE_CLASS} space-y-4`}>
        <Breadcrumb items={crumbs} />
        <Skeleton className="h-28 w-full rounded-[14px]" />
        <Skeleton className="w-full max-w-2xl mx-auto h-72 rounded-[14px]" />
      </div>
    );
  }
  if (error || !deck) {
    return (
      <div className={`${STUDENT_PAGE_CLASS} space-y-4`}>
        <Breadcrumb items={crumbs} />
        <LoadError message={error ?? 'Failed to load the deck.'} onRetry={() => setReload(r => r + 1)} />
      </div>
    );
  }

  return (
    <div className={`${STUDENT_PAGE_CLASS} space-y-[clamp(1.25rem,2.5vw,1.75rem)]`}>
      <Breadcrumb items={crumbs} />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      {/* 70 / 30: deck info and status on the left, every action on the right (stacked below lg). */}
      <div className="card p-5 grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] lg:items-start">
        <div className="min-w-0 space-y-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <DeckModeBadge mode={deck.mode} />
              {isOwner && <DeckStatusBadge status={deck.reviewStatus} />}
            </div>
            <h1 className="text-[clamp(1.25rem,1.1rem+0.6vw,1.5rem)] font-bold text-content break-words">{deck.title}</h1>
            <p className="text-sm text-content-soft">
              {plural(deck.cardCount, 'card')}
              {courseTitle && <> · {courseTitle}</>}
              {!isOwner && deck.ownerName && <> · by {deck.ownerName}</>}
            </p>
            {deck.description && <p className="text-sm text-content-secondary whitespace-pre-line">{deck.description}</p>}
          </div>
          {progress && progress.total > 0 && (
            <div className="max-w-md">
              <Progress value={progress.learned} max={progress.total} label={`Learned ${progress.learned} / ${progress.total}`} size="sm" />
            </div>
          )}

        {isOwner && deck.reviewStatus === 'REJECTED' && (
          <div className="rounded-[10px] border border-danger-line bg-danger-light p-3 text-sm space-y-1">
            <p className="flex items-center gap-2 font-semibold text-danger">
              <Icon.XCircle className="w-4 h-4" /> Your request to make this deck public was rejected
            </p>
            {deck.reviewNote && <p className="text-content whitespace-pre-line">{deck.reviewNote}</p>}
            <p className="text-content-soft text-xs">Fix the deck, then resubmit it for review.</p>
          </div>
        )}
        {isOwner && deck.reviewStatus === 'PENDING_REVIEW' && (
          <div className="rounded-[10px] border border-warning-line bg-warning-light p-3 text-sm text-warning flex items-start gap-2">
            <Icon.Clock className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              Waiting for review{deck.submittedAt ? ` since ${formatDateTime(deck.submittedAt)}` : ''}. Editing is locked — withdraw the
              request to make changes.
            </span>
          </div>
        )}
        {isOwner && deck.reviewStatus === 'APPROVED' && (
          <div className="rounded-[10px] border border-success-line bg-success-light p-3 text-sm text-success flex items-start gap-2">
            <Icon.Eye className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>This deck is public. Public decks can't be edited, made private or deleted.</span>
          </div>
        )}
        </div>

        <div className="min-w-0 flex flex-col gap-3 lg:border-l lg:border-line lg:pl-5">
          <StudyActions study={study} deckId={deckId} cardCount={deck.cardCount} onProgress={setProgress} />
          {isOwner && (editable || deletable || deck.reviewStatus === 'PENDING_REVIEW') && (
            <div className={`grid grid-cols-2 gap-2 ${deck.cardCount > 0 ? 'border-t border-line pt-3' : ''}`}>
              {editable && (
                <>
                  <Button
                    className="col-span-2"
                    variant="outline"
                    icon={<Icon.Upload className="w-4 h-4" />}
                    onClick={() => setDialog({ kind: 'publish' })}
                    disabled={deck.cardCount === 0}
                    title={deck.cardCount === 0 ? 'Add at least one card first' : undefined}
                  >
                    {deck.reviewStatus === 'REJECTED' ? 'Resubmit for review' : 'Make public'}
                  </Button>
                  <Button variant="outline" size="sm" icon={<Icon.Edit className="w-4 h-4" />} onClick={() => setDialog({ kind: 'edit' })}>
                    Edit
                  </Button>
                </>
              )}
              {deck.reviewStatus === 'PENDING_REVIEW' && (
                <Button
                  className="col-span-2"
                  variant="outline"
                  icon={<Icon.RefreshCw className="w-4 h-4" />}
                  onClick={() => setDialog({ kind: 'withdraw' })}
                >
                  Withdraw request
                </Button>
              )}
              {deletable && (
                <Button
                  variant="ghost"
                  size="sm"
                  className={editable ? '' : 'col-span-2'}
                  icon={<Icon.Trash className="w-4 h-4" />}
                  onClick={() => setDialog({ kind: 'delete' })}
                >
                  Delete
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* While studying, the study card takes the place of the list. */}
      {study.run ? (
        <StudySession study={study} mode={deck.mode} />
      ) : (
        <section className="space-y-3" aria-label="Cards">
          {study.summary && <StudySummaryBanner summary={study.summary} onClose={study.dismissSummary} />}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-content">All cards ({cards.length})</h2>
            {editable && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" icon={<Icon.Upload className="w-4 h-4" />} onClick={() => setDialog({ kind: 'import' })}>
                  Import from file
                </Button>
                <Button size="sm" icon={<Icon.Plus className="w-4 h-4" />} onClick={() => setDialog({ kind: 'card' })}>
                  Add card
                </Button>
              </div>
            )}
          </div>

          {cards.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Icon.Layers className="w-7 h-7" />}
            title="This deck has no cards yet"
            message={editable ? deck.mode === 'FLASHCARD' ? 'Add cards one by one or import from a Word, Excel, or PDF template.' : 'Add cards one by one or import them from a CSV / XLSX file.' : undefined}
            action={editable ? <Button onClick={() => setDialog({ kind: 'card' })}>Add card</Button> : undefined}
          />
        </div>
      ) : (
        <ul className="card divide-y divide-line">
          {cards.map((c, i) => (
            <li key={c.cardId} className="grid gap-3 md:grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)_auto] items-start px-5 py-4">
              <span className="text-xs font-semibold text-content-subtle pt-1">{i + 1}</span>
              <div className="min-w-0 space-y-1 [&_p]:text-sm">
                <p className="!text-2xs font-semibold uppercase tracking-wide text-content-subtle">Front</p>
                <CardFace card={c} mode={deck.mode} side="front" />
              </div>
              <div className="min-w-0 space-y-1 [&_p]:text-sm [&_p]:text-content-soft">
                <p className="!text-2xs font-semibold uppercase tracking-wide !text-content-subtle">Back</p>
                <CardFace card={c} mode={deck.mode} side="back" />
              </div>
              {editable ? (
                <div className="flex gap-1">
                  <button
                    type="button"
                    aria-label={`Edit card ${i + 1}`}
                    onClick={() => setDialog({ kind: 'card', card: c })}
                    className="w-8 h-8 rounded-[8px] flex items-center justify-center text-content-subtle hover:bg-accent hover:text-content"
                  >
                    <Icon.Edit className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete card ${i + 1}`}
                    onClick={() => setDialog({ kind: 'deleteCard', card: c })}
                    className="w-8 h-8 rounded-[8px] flex items-center justify-center text-content-subtle hover:bg-danger-light hover:text-danger"
                  >
                    <Icon.Trash className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <span />
              )}
            </li>
          ))}
        </ul>
          )}
        </section>
      )}

      {/* ── Dialogs ────────────────────────────────────────────────────── */}
      {dialog?.kind === 'edit' && (
        <DeckFormModal
          deck={deck}
          onClose={() => setDialog(null)}
          onSaved={saved => {
            setDeck(d => ({
              ...(d ?? saved),
              ...saved,
              isOwner: true,
              courseTitle: saved.courseId === d?.courseId ? d?.courseTitle ?? null : saved.courseTitle ?? null,
            }));
            setDialog(null);
          }}
        />
      )}
      {dialog?.kind === 'card' && (
        <CardFormModal
          deckId={deckId}
          mode={deck.mode}
          card={dialog.card}
          onClose={() => setDialog(null)}
          onSaved={(_, addAnother) => {
            void reloadCards();
            if (!addAnother) setDialog(null);
          }}
        />
      )}
      {dialog?.kind === 'import' && (
        <ImportCardsModal deckId={deckId} deckTitle={deck.title} mode={deck.mode} onClose={() => setDialog(null)} onImported={() => void reloadCards()} />
      )}
      {dialog?.kind === 'deleteCard' && (
        <ConfirmModal
          title="Delete this card?"
          message="The card and everyone's progress on it will be deleted."
          confirmLabel="Delete card"
          danger
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            act(async () => {
              await studentDeckService.deleteCard(dialog.card.cardId);
              setCards(cs => cs.filter(c => c.cardId !== dialog.card.cardId));
              setDeck(d => (d ? { ...d, cardCount: Math.max(d.cardCount - 1, 0) } : d));
              toast.success('Card deleted.');
            }, 'Could not delete the card.')
          }
        />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmModal
          title="Delete this deck?"
          message={`"${deck.title}", its ${plural(deck.cardCount, 'card')} and all study progress will be deleted. This can't be undone.`}
          confirmLabel="Delete deck"
          danger
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            act(async () => {
              await studentDeckService.deleteDeck(deckId);
              toast.success('Deck deleted.');
              navigate(`${ROUTES.studentFlashcards}?tab=mine`, { replace: true });
            }, 'Could not delete the deck.')
          }
        />
      )}
      {dialog?.kind === 'publish' && (
        <ConfirmModal
          title={deck.reviewStatus === 'REJECTED' ? 'Resubmit for review?' : 'Make this deck public?'}
          message={
            <>
              A content manager will review the deck. While it waits you can't edit it (you can withdraw the request).{' '}
              <strong className="text-content">Once approved, the deck can't be edited, made private or deleted.</strong>
            </>
          }
          confirmLabel="Send for review"
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            act(async () => {
              const res = await studentDeckService.requestPublish(deckId);
              setDeck(d => (d ? { ...d, reviewStatus: res.reviewStatus, visibility: res.visibility, submittedAt: res.submittedAt } : d));
              toast.success('Sent for review.');
            }, 'Could not send the deck for review.')
          }
        />
      )}
      {dialog?.kind === 'withdraw' && (
        <ConfirmModal
          title="Withdraw the review request?"
          message="The deck goes back to private and you can edit it again. You can send it for review later."
          confirmLabel="Withdraw"
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            act(async () => {
              const res = await studentDeckService.withdrawReview(deckId);
              setDeck(d => (d ? { ...d, reviewStatus: res.reviewStatus, visibility: res.visibility, submittedAt: null } : d));
              toast.success('Review request withdrawn.');
            }, 'Could not withdraw the request.')
          }
        />
      )}
    </div>
  );
}
