import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Progress';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useToast } from '@/components/ui/ToastHost';
import { Icon } from '@/assets/icons';
import { studentDeckPath } from '@/app/routes';
import { getApiErrorMessage } from '@/utils/apiError';
import { studentAttemptService } from '@/services/studentAttempt.service';
import {
  apiErrorCode,
  deckViewFromListItem,
  isDeckEditable,
  isEndpointMissing,
  studentDeckService,
  type DeckListItem,
  type StudentDeckView,
} from '@/services/studentDeck.service';
import type { DeckStudyState } from '../DeckCard';
import { DeckFormModal } from './DeckFormModal';
import { plural } from './flashcardUi';

interface Target {
  deckId: number;
  title: string;
  deck: StudentDeckView;
}

interface Outcome {
  added: number;
  skipped: number;
  failed: { questionId: number; reason: string }[];
}

/**
 * Save result questions as flashcards (FC-12) — one question, or every
 * savable question of the attempt in turn. The deck is one of the student's
 * own FLASHCARD decks that can still be edited, or a new one.
 */
export function SaveToFlashcardsModal({
  attemptId,
  questionIds,
  examId,
  examTitle,
  onClose,
  onSaved,
}: {
  attemptId: number;
  /** One id = single question; more = "save all". */
  questionIds: number[];
  examId?: string | null;
  examTitle: string;
  onClose: () => void;
  /** Questions now in the deck (added, or already there). */
  onSaved: (questionIds: number[]) => void;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const bulk = questionIds.length > 1;

  const [decks, setDecks] = useState<DeckListItem[] | null>(null);
  const [listMissing, setListMissing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [courseId, setCourseId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(0);
  const [outcome, setOutcome] = useState<{ target: Target; result: Outcome } | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    let off = false;
    studentDeckService
      .listAllDecks({ scope: 'MINE', mode: 'FLASHCARD' })
      .then(all => {
        if (off) return;
        const editable = all.filter(d => d.mode === 'FLASHCARD' && isDeckEditable(d.reviewStatus));
        setDecks(editable);
        if (editable.length > 0) setSelected(editable[0].deckId);
      })
      .catch(err => {
        if (off) return;
        setDecks([]);
        if (isEndpointMissing(err)) setListMissing(true);
        else setListError(getApiErrorMessage(err, 'Could not load your decks.'));
      });
    // The new-deck form defaults to the exam's course.
    if (examId) {
      studentAttemptService
        .getExamDetail(examId)
        .then(e => !off && setCourseId(e.courseId))
        .catch(() => {});
    }
    return () => {
      off = true;
      cancelled.current = true;
    };
  }, [examId]);

  const save = async (target: Target) => {
    setSaving(true);
    setDone(0);
    cancelled.current = false;
    const result: Outcome = { added: 0, skipped: 0, failed: [] };
    const inDeck: number[] = [];
    for (const qid of questionIds) {
      if (cancelled.current) break;
      try {
        await studentDeckService.cardFromQuestion(target.deckId, qid, attemptId);
        result.added++;
        inDeck.push(qid);
      } catch (err) {
        if (apiErrorCode(err) === 'ALREADY_EXISTS') {
          result.skipped++;
          inDeck.push(qid);
        } else {
          result.failed.push({ questionId: qid, reason: getApiErrorMessage(err, 'Could not save.') });
          // The deck itself is unusable (locked, not mine, not enrolled): stop instead of failing every question.
          const code = apiErrorCode(err);
          const status = (err as { response?: { status?: number } })?.response?.status;
          if (code === 'DECK_LOCKED' || status === 403 || status === 404) break;
        }
      }
      setDone(d => d + 1);
    }
    setSaving(false);
    if (inDeck.length > 0) onSaved(inDeck);

    if (!bulk) {
      if (result.added) toast.success(`Saved to "${target.title}".`);
      else if (result.skipped) toast.info(`This question is already in "${target.title}".`);
      else toast.error(result.failed[0]?.reason ?? 'Could not save the question.');
      if (result.added || result.skipped) onClose();
      return;
    }
    setOutcome({ target, result });
  };

  const openDeck = (target: Target) =>
    navigate(studentDeckPath(target.deckId), {
      state: { deckTitle: target.title, deck: { ...target.deck, isOwner: true }, tab: 'mine' } satisfies DeckStudyState,
    });

  if (creating) {
    return (
      <DeckFormModal
        lockedMode="FLASHCARD"
        defaultCourseId={courseId}
        defaultTitle={bulk ? examTitle : ''}
        onClose={() => setCreating(false)}
        onSaved={deck => {
          setCreating(false);
          void save({ deckId: deck.deckId, title: deck.title, deck: { ...deck, isOwner: true } });
        }}
      />
    );
  }

  const chosen = decks?.find(d => d.deckId === selected);
  const total = questionIds.length;

  // ── Summary of "save all" ─────────────────────────────────────────────
  if (outcome) {
    const { target, result } = outcome;
    return (
      <Modal
        open
        onClose={onClose}
        title="Saved to flashcards"
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button iconRight={<Icon.ChevronRight className="w-4 h-4" />} onClick={() => openDeck(target)}>
              Open deck
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="text-content">
            Deck: <strong>{target.title}</strong>
          </p>
          <ul className="space-y-1">
            <li className="flex items-center gap-2 text-success">
              <Icon.CheckCircle className="w-4 h-4" /> Added {plural(result.added, 'card')}
            </li>
            {result.skipped > 0 && (
              <li className="flex items-center gap-2 text-content-soft">
                <Icon.Info className="w-4 h-4" /> Skipped {result.skipped} already in the deck
              </li>
            )}
            {result.failed.length > 0 && (
              <li className="flex items-center gap-2 text-danger">
                <Icon.XCircle className="w-4 h-4" /> {result.failed.length} failed
              </li>
            )}
          </ul>
          {result.failed.length > 0 && (
            <ul className="rounded-[10px] border border-line divide-y divide-line max-h-48 overflow-y-auto text-xs">
              {result.failed.map(f => (
                <li key={f.questionId} className="px-3 py-2 text-content-soft">
                  {f.reason}
                </li>
              ))}
            </ul>
          )}
          {result.added + result.skipped + result.failed.length < total && (
            <p className="text-xs text-content-subtle">Stopped before the last {total - result.added - result.skipped - result.failed.length} questions.</p>
          )}
        </div>
      </Modal>
    );
  }

  // ── Pick a deck / saving ──────────────────────────────────────────────
  return (
    <Modal
      open
      onClose={saving ? () => (cancelled.current = true) : onClose}
      title={bulk ? `Save ${plural(total, 'question')} to flashcards` : 'Save question to flashcards'}
      footer={
        saving ? (
          bulk ? (
            <Button variant="outline" onClick={() => (cancelled.current = true)}>
              Stop
            </Button>
          ) : undefined
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => chosen && save({ deckId: chosen.deckId, title: chosen.title, deck: deckViewFromListItem(chosen, true) })}
              disabled={!chosen}
            >
              Save
            </Button>
          </>
        )
      }
    >
      {saving ? (
        <div className="space-y-3 py-2">
          <p className="text-sm text-content-soft">{bulk ? `Saving questions… ${done} / ${total}` : 'Saving…'}</p>
          {bulk && <Progress value={done} max={total} size="sm" />}
        </div>
      ) : (
        <div className="space-y-3">
          {bulk && (
            <p className="text-sm text-content-soft">
              Each question becomes a card: the question on the front, the correct answer (and explanation) on the back. Questions already in
              the deck are skipped.
            </p>
          )}
          {decks == null ? (
            <p className="text-sm text-content-subtle">Loading your decks…</p>
          ) : decks.length === 0 ? (
            <p className="text-sm text-content-subtle">
              {listMissing
                ? "Your decks can't be listed yet — create a new deck below."
                : listError ?? 'You have no Flashcard deck you can add to. Create one below.'}
            </p>
          ) : (
            <div className="space-y-1.5">
              <SearchableSelect
                label="Deck"
                value={selected == null ? '' : String(selected)}
                onChange={v => setSelected(Number(v))}
                options={decks.map(d => ({ label: d.courseTitle ? `${d.title} · ${d.courseTitle}` : d.title, value: String(d.deckId) }))}
                placeholder="Choose a deck"
                searchPlaceholder="Search decks…"
                emptyText="No decks match"
              />
              {chosen && (
                <p className="text-xs text-content-subtle">
                  {plural(chosen.cardCount, 'card')}
                  {chosen.courseTitle && ` · ${chosen.courseTitle}`}
                </p>
              )}
            </div>
          )}
          <Button variant="outline" size="sm" icon={<Icon.Plus className="w-4 h-4" />} onClick={() => setCreating(true)}>
            New deck
          </Button>
        </div>
      )}
    </Modal>
  );
}
