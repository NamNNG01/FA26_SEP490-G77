import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/ToastHost';
import { Alert } from '@/components/ui/Alert';
import { getApiErrorMessage } from '@/utils/apiError';
import { focusFirstInvalidAfter } from '@/utils/focusFirstInvalid';
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
import { ImagePickButton } from '@/components/common/ImagePickButton';
import { uploadService } from '@/services/upload.service';
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
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fields = FIELDS[mode];
  /** FLASHCARD only: an optional image per face, keyed by that face's text field. */
  const withImages = mode === 'FLASHCARD';
  const blankImages: Partial<Record<Field, string | null>> = { frontText: null, backText: null };
  const [images, setImages] = useState<Partial<Record<Field, string | null>>>(
    card ? { frontText: card.frontImageUrl ?? null, backText: card.backImageUrl ?? null } : blankImages,
  );
  const [uploading, setUploading] = useState<Field | null>(null);
  const busy = saving || uploading != null;

  const set = (field: Field, value: string) => {
    setValues(v => ({ ...v, [field]: value }));
    setErrors(e => ({ ...e, [field]: undefined }));
  };

  const pickImage = async (field: Field, file: File) => {
    setUploading(field);
    setSaveError(null);
    try {
      const uploaded = await uploadService.uploadStudentAttachment(file);
      setImages(i => ({ ...i, [field]: uploaded.url }));
      setErrors(e => ({ ...e, [field]: undefined }));
    } catch (err) {
      setSaveError(getApiErrorMessage(err, 'Could not upload the image.'));
    } finally {
      setUploading(null);
    }
  };

  const save = async (addAnother: boolean) => {
    const next: Partial<Record<Field, string>> = {};
    fields.forEach(f => {
      // A flashcard face is complete with text, an image, or both.
      if (withImages && images[f.field]) return;
      if (f.required && !values[f.field].trim())
        next[f.field] = f.field === 'codeLanguage' ? 'Pick a language.' : withImages ? 'Add text or an image.' : 'Required.';
    });
    setSaveError(null);
    if (Object.keys(next).length > 0) {
      focusFirstInvalidAfter(() => setErrors(next));
      return;
    }
    setErrors({});

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
    if (withImages) {
      // null on edit clears a stored image.
      payload.frontImageUrl = images.frontText ?? null;
      payload.backImageUrl = images.backText ?? null;
    }

    setSaving(true);
    try {
      const saved = card ? await studentDeckService.updateCard(card.cardId, payload) : await studentDeckService.createCard(deckId, payload);
      toast.success(card ? 'Card updated.' : 'Card added.');
      onSaved(saved, addAnother);
      if (addAnother) {
        setValues(v => ({ ...blank, codeLanguage: v.codeLanguage }));
        setImages(blankImages);
      }
    } catch (err) {
      setSaveError(getApiErrorMessage(err, card ? 'Could not update the card.' : 'Could not add the card.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      size="lg"
      onClose={busy ? () => {} : onClose}
      title={card ? 'Edit card' : 'Add card'}
      error={saveError && <Alert type="error" message={saveError} />}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {!card && (
            <Button variant="secondary" onClick={() => save(true)} disabled={busy}>
              Save &amp; add another
            </Button>
          )}
          <Button onClick={() => save(false)} loading={saving} disabled={busy}>
            {card ? 'Save changes' : 'Add card'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {withImages && (
          <p className="rounded-[10px] border border-line bg-surface-alt px-3 py-2 text-sm text-content-secondary">
            Each side needs text, an image, or both.
          </p>
        )}
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
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={`card-${f.field}`} className="text-sm font-medium text-content-secondary">
                  {withImages ? `${f.label} text (optional)` : f.label}
                </label>
                {withImages && (
                  <ImagePickButton
                    variant="ghost"
                    loading={uploading === f.field}
                    disabled={busy}
                    onPick={file => void pickImage(f.field, file)}
                    onError={setSaveError}
                  >
                    {images[f.field] ? 'Replace image' : 'Add image'}
                  </ImagePickButton>
                )}
              </div>
              {withImages && images[f.field] && (
                <div className="relative w-fit">
                  <img
                    src={images[f.field]!}
                    alt={`${f.label} image`}
                    className="max-h-40 max-w-full rounded-[10px] border border-line object-contain"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="absolute right-1 top-1"
                    aria-label={`Remove ${f.label.toLowerCase()} image`}
                    disabled={busy}
                    onClick={() => setImages(i => ({ ...i, [f.field]: null }))}
                  >
                    Remove
                  </Button>
                </div>
              )}
              <textarea
                id={`card-${f.field}`}
                className={`${f.field === 'codeBody' || (mode === 'CODE_OUTPUT' && f.field === 'backText') ? CODE_TEXTAREA_CLASS : TEXTAREA_CLASS} ${
                  f.field === 'codeBody' ? 'h-48' : 'h-24'
                } resize-y ${errors[f.field] ? 'border-danger-solid' : ''}`}
                value={values[f.field]}
                aria-invalid={errors[f.field] ? true : undefined}
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
