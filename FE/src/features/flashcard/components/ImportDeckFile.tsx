import { useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/assets/icons';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  FLASHCARD_IMPORT_MAX_BYTES,
  flashcardImportService,
  type FlashcardImportFormat,
  type FlashcardImportPreview,
} from '@/services/flashcardImport.service';
import { SIDE_MAX, type EditableCard } from './DeckEditor';

/**
 * Import from file for the New Flashcard Deck modal: ImportFileModal reads a
 * Word, Excel or PDF file as soon as it is chosen (POST /flashcards/import/preview),
 * then importableCards picks the cards that go straight into the draft list.
 */

export function ImportFileModal({ onClose, onRead }: {
  onClose: () => void;
  onRead: (preview: FlashcardImportPreview) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chooseFile = (candidate?: File) => {
    setError(null);
    setFileError(null);
    if (!candidate) return;
    const extension = candidate.name.toLowerCase().split('.').pop();
    if (!['docx', 'xlsx', 'pdf'].includes(extension ?? '')) {
      setFile(null);
      setFileError('Only Word (.docx), Excel (.xlsx), and PDF files can be imported.');
      return;
    }
    if (candidate.size === 0) {
      setFile(null);
      setFileError('This file is empty.');
      return;
    }
    if (candidate.size > FLASHCARD_IMPORT_MAX_BYTES) {
      setFile(null);
      setFileError(`This file is ${(candidate.size / 1024 / 1024).toFixed(2)} MB — the limit is 10 MB.`);
      return;
    }
    void readFile(candidate);
  };

  const readFile = async (candidate: File) => {
    setFile(candidate);
    setBusy(true);
    try {
      onRead(await flashcardImportService.preview(candidate));
    } catch (err) {
      setFile(null);
      setError(getApiErrorMessage(err, 'Could not read this file. Check the template and try again.'));
      setBusy(false);
    }
  };

  const downloadTemplate = async (format: FlashcardImportFormat) => {
    setBusy(true);
    setError(null);
    try {
      const { blob, filename } = await flashcardImportService.downloadTemplate(format);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not download the import template.'));
    } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={() => { if (!busy) onClose(); }} title="Import Flashcards from Word, Excel or PDF" size="md"
      footer={<Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-line px-3 py-2.5">
          <Icon.FileText className="h-4 w-4 flex-shrink-0 text-brand-ink" />
          <p className="min-w-[150px] flex-1 text-sm text-content-secondary">Use the import template. Up to 500 rows and {SIDE_MAX} characters per side.</p>
          <Button size="sm" variant="outline" icon={<Icon.Download className="h-3.5 w-3.5" />} onClick={() => void downloadTemplate('docx')} disabled={busy}>Word</Button>
          <Button size="sm" variant="outline" icon={<Icon.Download className="h-3.5 w-3.5" />} onClick={() => void downloadTemplate('xlsx')} disabled={busy}>Excel</Button>
        </div>
        <div role="button" tabIndex={0}
          onDragOver={event => { event.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={event => { event.preventDefault(); setDragOver(false); if (!busy) chooseFile(event.dataTransfer.files?.[0]); }}
          onClick={() => { if (!busy) inputRef.current?.click(); }}
          onKeyDown={event => { if ((event.key === 'Enter' || event.key === ' ') && !busy) { event.preventDefault(); inputRef.current?.click(); } }}
          className={`card cursor-pointer border-2 border-dashed bg-primary-light p-8 text-center transition-colors ${dragOver ? 'border-brand-600' : 'border-brand-line'}`}>
          <Icon.Upload className="mx-auto mb-3 h-10 w-10 text-brand-ink" />
          <p className="text-base font-semibold text-brand-ink-strong">Drag &amp; drop here or click to browse</p>
          <p className="mt-1 text-xs text-content-soft">Word (.docx), Excel (.xlsx), or PDF, up to 10 MB</p>
          <input ref={inputRef} type="file" accept=".docx,.xlsx,.pdf" className="hidden" onChange={event => { chooseFile(event.target.files?.[0]); event.target.value = ''; }} />
        </div>
        {fileError && <Alert type="error" title="Can’t use this file" message={fileError} />}
        {file && (
          <div className="flex items-center gap-3 rounded-[10px] bg-surface-alt p-3">
            <Icon.FileText className="h-5 w-5 flex-shrink-0 text-brand-ink" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-content-secondary">{file.name}</p>
              <p className="text-2xs text-content-subtle">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
            {busy && <span className="flex items-center gap-2 text-xs text-content-soft"><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full spinner" /> Reading file…</span>}
          </div>
        )}
        {error && <Alert type="error" title="Import failed" message={error} />}
      </div>
    </Modal>
  );
}

/** A file row left out of the import, by its 1-based card order in the file. */
export interface SkippedRow {
  rowIndex: number;
  reason: string;
}

const frontKey = (text: string) => text.trim().normalize('NFC').toLocaleLowerCase();

/**
 * The previewed cards that pass the card editor's rules — both sides required,
 * SIDE_MAX per side, a front not already in the deck or earlier in the file.
 */
export function importableCards(preview: FlashcardImportPreview, existing: EditableCard[]) {
  const fronts = new Set(existing.map(c => frontKey(c.frontText)));
  const cards: { frontText: string; backText: string }[] = [];
  const skipped: SkippedRow[] = [];
  for (const card of preview.cards) {
    const frontText = card.frontText.trim();
    const backText = card.backText.trim();
    let reason: string | null = null;
    if (!frontText || !backText) reason = 'a side is empty';
    else if (frontText.length > SIDE_MAX || backText.length > SIDE_MAX) reason = `a side is over ${SIDE_MAX} characters`;
    else if (fronts.has(frontKey(frontText))) reason = 'the front already exists';
    if (reason) {
      skipped.push({ rowIndex: card.rowIndex, reason });
      continue;
    }
    fronts.add(frontKey(frontText));
    cards.push({ frontText, backText });
  }
  return { cards, skipped };
}
