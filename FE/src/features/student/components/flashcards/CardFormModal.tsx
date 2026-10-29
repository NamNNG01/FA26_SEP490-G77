import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/ToastHost';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  CARD_CODE_MAX,
  CARD_TEXT_MAX,
  CODE_LANGUAGES,
  CODE_LANGUAGE_LABEL,
  studentDeckService,
  type CardView,
  type CardWriteRequest,
  type CodeLanguage,
  type DeckMode,
  type ViewerCard,
} from '@/services/studentDeck.service';
import { CODE_TEXTAREA_CLASS, TEXTAREA_CLASS } from './flashcardUi';

type Field = 'frontText' | 'backText' | 'codeLanguage' | 'codeBody';

/** Fields each deck mode uses, and which are required (FC-04). */
const FIELDS: Record<DeckMode, { field: Field; label: string; required: boolean }[]> = {
  FLASHCARD: [
    { field: 'frontText', label: 'Front', required: true },
    { field: 'backText', label: 'Back', required: true },
  ],
  CODE_SNIPPET: [
    { field: 'frontText', label: 'Prompt (front)', required: true },
    { field: 'codeLanguage', label: 'Language', required: true },
    { field: 'codeBody', label: 'Code (back)', required: true },
  ],
  CODE_OUTPUT: [
    { field: 'codeLanguage', label: 'Language', required: false },
    { field: 'codeBody', label: 'Code (front)', required: true },
    { field: 'backText', label: 'Output (back)', required: true },
  ],
};

/** Add (FC-04) or edit (FC-05) one card. Mount only while open. */
export function CardFormModal({
  deckId,
  mode,
  card,
  onClose,
  onSaved,
}: {
  deckId: number;
  mode: DeckMode;
  card?: ViewerCard;
  onClose: () => void;
  onSaved: (card: CardView, addAnother: boolean) => void;
}) {
  const toast = useToast();
  const blank = { frontText: '', backText: '', codeLanguage: '', codeBody: '' };
  const [values, setValues] = useState<Record<Field, string>>(
    card
      ? { frontText: card.frontText ?? '', backText: card.backText ?? '', codeLanguage: card.codeLanguage ?? '', codeBody: card.codeBody ?? '' }
      : blank,
  );
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [saving, setSaving] = useState(false);
  const fields = FIELDS[mode];

  const set = (field: Field, value: string) => {
    setValues(v => ({ ...v, [field]: value }));
    setErrors(e => ({ ...e, [field]: undefined }));
  };

  const save = async (addAnother: boolean) => {
    const next: Partial<Record<Field, string>> = {};
    fields.forEach(f => {
      if (f.required && !values[f.field].trim()) next[f.field] = f.field === 'codeLanguage' ? 'Pick a language.' : 'Required.';
    });
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const payload: CardWriteRequest = {};
    fields.forEach(f => {
      const v = values[f.field];
      if (f.field === 'codeLanguage') {
        // On edit an empty value is sent so "None" clears a stored language.
        if (v || card) payload.codeLanguage = v as CodeLanguage;
      } else if (f.field === 'codeBody') {
        payload.codeBody = v;
      } else {
        payload[f.field] = v.trim();
      }
    });

    setSaving(true);
    try {
      const saved = card ? await studentDeckService.updateCard(card.cardId, payload) : await studentDeckService.createCard(deckId, payload);
      toast.success(card ? 'Card updated.' : 'Card added.');
      onSaved(saved, addAnother);
      if (addAnother) setValues(v => ({ ...blank, codeLanguage: v.codeLanguage }));
    } catch (err) {
      toast.error(getApiErrorMessage(err, card ? 'Could not update the card.' : 'Could not add the card.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      size="lg"
      onClose={saving ? () => {} : onClose}
      title={card ? 'Edit card' : 'Add card'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          {!card && (
            <Button variant="secondary" onClick={() => save(true)} disabled={saving}>
              Save &amp; add another
            </Button>
          )}
          <Button onClick={() => save(false)} loading={saving} disabled={saving}>
            {card ? 'Save changes' : 'Add card'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {fields.map(f =>
          f.field === 'codeLanguage' ? (
            <Select
              key={f.field}
              label={f.required ? f.label : `${f.label} (optional)`}
              options={[
                ...(f.required ? [] : [{ value: '', label: 'None' }]),
                ...CODE_LANGUAGES.map(l => ({ value: l, label: CODE_LANGUAGE_LABEL[l] })),
              ]}
              value={values.codeLanguage}
              onChange={v => set('codeLanguage', v)}
              error={errors.codeLanguage}
            />
          ) : (
            <div key={f.field} className="flex flex-col gap-1.5">
              <label htmlFor={`card-${f.field}`} className="text-sm font-medium text-content-secondary">
                {f.label}
              </label>
              <textarea
                id={`card-${f.field}`}
                className={`${f.field === 'codeBody' || (mode === 'CODE_OUTPUT' && f.field === 'backText') ? CODE_TEXTAREA_CLASS : TEXTAREA_CLASS} ${
                  f.field === 'codeBody' ? 'h-48' : 'h-24'
                } resize-y ${errors[f.field] ? 'border-danger-solid' : ''}`}
                value={values[f.field]}
                maxLength={f.field === 'codeBody' ? CARD_CODE_MAX : CARD_TEXT_MAX}
                spellCheck={f.field !== 'codeBody'}
                onChange={e => set(f.field, e.target.value)}
                onKeyDown={e => {
                  // Tab inserts spaces in code instead of leaving the field.
                  if (f.field !== 'codeBody' || e.key !== 'Tab' || e.shiftKey) return;
                  e.preventDefault();
                  const el = e.currentTarget;
                  const { selectionStart: s, selectionEnd: end } = el;
                  const v = el.value.slice(0, s) + '    ' + el.value.slice(end);
                  set('codeBody', v);
                  requestAnimationFrame(() => el.setSelectionRange(s + 4, s + 4));
                }}
              />
              {errors[f.field] && <p className="text-xs text-danger">{errors[f.field]}</p>}
            </div>
          ),
        )}
      </div>
    </Modal>
  );
}
