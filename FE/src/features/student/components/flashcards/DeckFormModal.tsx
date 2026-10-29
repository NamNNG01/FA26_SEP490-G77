import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/ToastHost';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  DECK_DESCRIPTION_MAX,
  DECK_MODES,
  DECK_MODE_LABEL,
  DECK_TITLE_MAX,
  studentDeckService,
  type DeckMode,
  type DeckUpdateRequest,
  type StudentDeckView,
} from '@/services/studentDeck.service';
import { TEXTAREA_CLASS, useActiveCourses } from './flashcardUi';

const NO_COURSE = '';

const MODE_HINT: Record<DeckMode, string> = {
  FLASHCARD: 'Text on the front, text on the back.',
  CODE_SNIPPET: 'A prompt on the front, a code snippet on the back.',
  CODE_OUTPUT: 'Code on the front, its output on the back.',
};

/**
 * New deck (FC-01) or edit deck (FC-02). Mount it only while open so each
 * opening starts from the deck's current values.
 *
 * - `lockedMode`: the mode can't be picked (e.g. saving questions needs FLASHCARD).
 * - A deck that has cards can't change mode, and a deck can't leave its course (BE rules).
 */
export function DeckFormModal({
  deck,
  lockedMode,
  defaultCourseId,
  defaultTitle = '',
  onClose,
  onSaved,
}: {
  /** Edit this deck; omit to create one. */
  deck?: StudentDeckView;
  lockedMode?: DeckMode;
  defaultCourseId?: number | null;
  defaultTitle?: string;
  onClose: () => void;
  onSaved: (deck: StudentDeckView) => void;
}) {
  const toast = useToast();
  const { courses, error: coursesError } = useActiveCourses();
  const [title, setTitle] = useState(deck?.title ?? defaultTitle.slice(0, DECK_TITLE_MAX));
  const [description, setDescription] = useState(deck?.description ?? '');
  const [mode, setMode] = useState<DeckMode>(deck?.mode ?? lockedMode ?? 'FLASHCARD');
  const [courseId, setCourseId] = useState<string>(
    deck?.courseId != null ? String(deck.courseId) : defaultCourseId != null ? String(defaultCourseId) : NO_COURSE,
  );
  const [titleError, setTitleError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const modeLocked = Boolean(lockedMode) || (deck != null && deck.cardCount > 0);
  // The course list may not hold the deck's course (enrollment ended) — keep it selectable.
  const courseOptions = [
    ...(deck?.courseId == null ? [{ value: NO_COURSE, label: 'No course (personal)' }] : []),
    ...(courses ?? []).map(c => ({ value: String(c.courseId), label: c.title })),
  ];
  if (courseId !== NO_COURSE && courses && !courses.some(c => String(c.courseId) === courseId)) {
    courseOptions.push({ value: courseId, label: deck?.courseTitle ?? `Course #${courseId}` });
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return setTitleError('Enter a title.');
    if (t.length > DECK_TITLE_MAX) return setTitleError(`At most ${DECK_TITLE_MAX} characters.`);
    setTitleError(undefined);
    const desc = description.trim();
    const course = courseId === NO_COURSE ? undefined : Number(courseId);

    setSaving(true);
    try {
      let saved: StudentDeckView;
      if (deck) {
        const patch: DeckUpdateRequest = {};
        if (t !== deck.title) patch.title = t;
        if (desc !== (deck.description ?? '')) patch.description = desc;
        if (mode !== deck.mode) patch.mode = mode;
        if (course != null && course !== deck.courseId) patch.courseId = course;
        saved = Object.keys(patch).length > 0 ? await studentDeckService.updateDeck(deck.deckId, patch) : deck;
        toast.success('Deck updated.');
      } else {
        saved = await studentDeckService.createDeck({ title: t, description: desc || undefined, mode, courseId: course });
        toast.success('Deck created.');
      }
      onSaved(saved);
    } catch (err) {
      toast.error(getApiErrorMessage(err, deck ? 'Could not update the deck.' : 'Could not create the deck.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={saving ? () => {} : onClose}
      title={deck ? 'Edit deck' : 'New deck'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="deck-form" loading={saving} disabled={saving}>
            {deck ? 'Save changes' : 'Create deck'}
          </Button>
        </>
      }
    >
      <form id="deck-form" onSubmit={submit} className="space-y-4" noValidate>
        <Input
          label="Title"
          value={title}
          maxLength={DECK_TITLE_MAX}
          onChange={e => setTitle(e.target.value)}
          error={titleError}
          placeholder="e.g. OOP vocabulary"
          autoFocus
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="deck-description" className="text-sm font-medium text-content-secondary">
            Description <span className="font-normal text-content-subtle">(optional)</span>
          </label>
          <textarea
            id="deck-description"
            className={`${TEXTAREA_CLASS} h-20 resize-none`}
            value={description}
            maxLength={DECK_DESCRIPTION_MAX}
            onChange={e => setDescription(e.target.value)}
          />
          <p className="text-xs text-content-subtle text-right">
            {description.length}/{DECK_DESCRIPTION_MAX}
          </p>
        </div>
        <div className="space-y-1.5">
          <Select
            label="Card type"
            options={DECK_MODES.map(m => ({ value: m, label: DECK_MODE_LABEL[m] }))}
            value={mode}
            onChange={v => setMode(v as DeckMode)}
            disabled={modeLocked}
          />
          <p className="text-xs text-content-soft">
            {lockedMode
              ? 'Questions can only be saved to Flashcard decks.'
              : deck && deck.cardCount > 0
                ? "A deck with cards can't change its card type."
                : MODE_HINT[mode]}
          </p>
        </div>
        <div className="space-y-1.5">
          <Select
            label="Course"
            options={courseOptions}
            value={courseId}
            onChange={setCourseId}
            disabled={courses == null}
          />
          <p className="text-xs text-content-soft">
            {coursesError ?? (deck?.courseId != null ? "A deck can't be detached from its course." : 'Only courses you are studying.')}
          </p>
        </div>
      </form>
    </Modal>
  );
}
