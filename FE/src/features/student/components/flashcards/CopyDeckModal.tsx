import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { getApiErrorMessage } from "@/utils/apiError";
import {
  DECK_TITLE_MAX,
  apiStatus,
  studentDeckService,
  type CopyDeckView,
  type StudentDeckView,
} from "@/services/studentDeck.service";
import { plural } from "./flashcardUi";

/**
 * Copies a readable deck (cards included) into the student's personal library
 * as a private deck with no course. Mount it only while open.
 */
export function CopyDeckModal({
  deck,
  onClose,
  onCopied,
}: {
  deck: StudentDeckView;
  onClose: () => void;
  onCopied: (copy: CopyDeckView) => void;
}) {
  const [title, setTitle] = useState(`Copy of ${deck.title}`.slice(0, DECK_TITLE_MAX));
  const [titleError, setTitleError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return setTitleError("Enter a title.");
    if (t.length > DECK_TITLE_MAX) return setTitleError(`At most ${DECK_TITLE_MAX} characters.`);
    setTitleError(undefined);

    setSaving(true);
    try {
      onCopied(await studentDeckService.copyDeck(deck.deckId, t));
    } catch (err) {
      setTitleError(
        apiStatus(err) === 409
          ? "You already have a personal deck with this title — pick another one."
          : getApiErrorMessage(err, "Could not copy the deck."),
      );
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={saving ? () => {} : onClose}
      title="Copy to My decks"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="copy-deck-form" loading={saving} disabled={saving}>
            Copy deck
          </Button>
        </>
      }
    >
      <form id="copy-deck-form" onSubmit={submit} className="space-y-3" noValidate>
        <p className="text-sm text-content-soft">
          A private copy with all {plural(deck.cardCount, "card")} goes to My decks, with no course.
          Your study progress starts fresh, and you can edit the copy freely.
        </p>
        <Input
          label="Title"
          value={title}
          maxLength={DECK_TITLE_MAX}
          onChange={(e) => setTitle(e.target.value)}
          error={titleError}
          autoFocus
        />
      </form>
    </Modal>
  );
}
