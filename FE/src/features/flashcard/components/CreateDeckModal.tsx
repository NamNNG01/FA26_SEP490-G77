import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/ToastHost';
import { Icon } from '@/assets/icons';
import { FLASHCARD_COURSES, type Flashcard } from '../mockFlashcardDecks';
import {
  CardEditorPanel,
  CardList,
  DeckInfoFields,
  firstModuleOf,
  useCardEditor,
  validateDeckInfo,
  type DeckInfo,
  type DeckInfoErrors,
} from './DeckEditor';

/** Placeholder deck id for card ids until the deck is created and gets a real one. */
const DRAFT_DECK_ID = 'FD-NEW';

const initialInfo = (): DeckInfo => {
  const courseId = FLASHCARD_COURSES[0]?.id ?? '';
  return { name: '', courseId, moduleId: firstModuleOf(courseId), description: '', status: 'Draft' };
};

/**
 * New Flashcard — the detail screen's layout with every field as an input:
 * deck info (name, course, module, status, description) and the card list +
 * card editor, created in one go. Mount it only while open so each opening
 * starts from a blank draft.
 */
export function CreateDeckModal({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (info: DeckInfo, cards: Flashcard[]) => void;
}) {
  const toast = useToast();
  const [info, setInfo] = useState<DeckInfo>(initialInfo);
  const [errors, setErrors] = useState<DeckInfoErrors>({});
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const editor = useCardEditor(DRAFT_DECK_ID, cards, setCards);

  const blank = initialInfo();
  const touched = info.name.trim() !== '' || info.description.trim() !== '' || info.courseId !== blank.courseId
    || info.moduleId !== blank.moduleId || info.status !== blank.status || cards.length > 0 || editor.hasInput;

  const update = (patch: Partial<DeckInfo>) => {
    setInfo(prev => ({ ...prev, ...patch }));
    setErrors(prev => {
      const next = { ...prev };
      (Object.keys(patch) as (keyof DeckInfoErrors)[]).forEach(k => delete next[k]);
      return next;
    });
  };

  const requestClose = () => (touched ? setConfirmDiscard(true) : onClose());

  const submit = () => {
    const found = validateDeckInfo(info);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast.error('Please fix the highlighted deck fields.');
      return;
    }
    if (info.status === 'Published' && cards.length === 0) {
      toast.error('A published deck must contain at least one card — add cards or save it as Draft.');
      return;
    }
    if (editor.hasInput) {
      toast.warning(editor.editingId ? 'Update or clear the card in the editor first.' : 'Add or clear the card in the editor first.');
      editor.frontRef.current?.focus();
      return;
    }
    onCreate({ ...info, name: info.name.trim(), description: info.description.trim() }, cards);
  };

  return (
    <Modal open onClose={requestClose} title="New Flashcard Deck" size="2xl"
      footer={confirmDiscard ? (
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-[13px] text-[#374151]">Discard this new deck? Everything entered will be lost.</span>
          <Button variant="outline" onClick={() => setConfirmDiscard(false)}>Keep Editing</Button>
          <Button variant="danger" onClick={onClose}>Discard</Button>
        </div>
      ) : (
        <>
          <Button variant="outline" onClick={requestClose}>Cancel</Button>
          <Button icon={<Icon.Check className="w-4 h-4" />} onClick={submit}>Create Deck</Button>
        </>
      )}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
        <div className="space-y-5 min-w-0">
          <section className="card p-5" aria-label="Deck information">
            <h3 className="mb-4 text-[15px] font-semibold text-[#111827]">Deck Information</h3>
            <DeckInfoFields idPrefix="new-deck" value={info} errors={errors} onChange={update} showStatus />
          </section>
          <CardList cards={cards} editor={editor} emptyHint="Add cards with the card editor — or create the deck now and add them later." />
        </div>
        <CardEditorPanel editor={editor} idPrefix="new-card" className="lg:sticky lg:top-0"
          footnote={<>Cards are added to the list and created with the deck on <span className="font-medium text-[#6B7280]">Create Deck</span>.</>} />
      </div>
    </Modal>
  );
}
