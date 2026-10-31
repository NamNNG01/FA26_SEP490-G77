import React, { useMemo, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/assets/icons';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  FLASHCARD_IMPORT_MAX_BYTES,
  FLASHCARD_IMPORT_MAX_ROWS,
  FLASHCARD_TEXT_MAX,
  flashcardImportService,
  type FlashcardImportCard,
  type FlashcardImportFormat,
  type FlashcardImportPreview,
} from '@/services/flashcardImport.service';

type Destination = 'current' | 'new';

export function FlashcardImportModal({ deckId, deckTitle, onClose, onImported }: {
  deckId: number;
  deckTitle: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<FlashcardImportPreview | null>(null);
  const [cards, setCards] = useState<FlashcardImportCard[]>([]);
  const [destination, setDestination] = useState<Destination>('current');
  const [newDeckTitle, setNewDeckTitle] = useState('');
  const [newDeckDescription, setNewDeckDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ deckId: number; createdCount: number; skippedDuplicateCount: number } | null>(null);
  const validCards = useMemo(() => cards.filter(card => card.valid), [cards]);

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
    setFile(candidate);
    setPreview(null);
    setCards([]);
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

  const runPreview = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const data = await flashcardImportService.preview(file, deckId);
      setPreview(data);
      setCards(data.cards);
      if (data.cards.length > FLASHCARD_IMPORT_MAX_ROWS) setError(`The preview has more than ${FLASHCARD_IMPORT_MAX_ROWS} cards.`);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not read this file. Check the template and try again.'));
    } finally { setBusy(false); }
  };

  const updateCard = (rowIndex: number, side: 'frontText' | 'backText', value: string) => {
    setCards(current => {
      const updated = current.map(card => card.rowIndex === rowIndex ? { ...card, [side]: value } : card);
      const duplicateKeys = new Set<string>();
      const seen = new Set<string>();
      updated.forEach(card => {
        const key = `${card.frontText.trim().normalize('NFC').toLocaleLowerCase()}\u0000${card.backText.trim().normalize('NFC').toLocaleLowerCase()}`;
        if (seen.has(key)) duplicateKeys.add(key);
        seen.add(key);
      });
      return updated.map(card => {
        const errors = [];
        if (!card.frontText.trim()) errors.push({ code: 'FRONT_EMPTY', message: 'Front side is required.' });
        else if (card.frontText.length > FLASHCARD_TEXT_MAX) errors.push({ code: 'FRONT_TOO_LONG', message: `Front side must be at most ${FLASHCARD_TEXT_MAX} characters.` });
        if (!card.backText.trim()) errors.push({ code: 'BACK_EMPTY', message: 'Back side is required.' });
        else if (card.backText.length > FLASHCARD_TEXT_MAX) errors.push({ code: 'BACK_TOO_LONG', message: `Back side must be at most ${FLASHCARD_TEXT_MAX} characters.` });
        const key = `${card.frontText.trim().normalize('NFC').toLocaleLowerCase()}\u0000${card.backText.trim().normalize('NFC').toLocaleLowerCase()}`;
        const original = preview?.cards.find(item => item.rowIndex === card.rowIndex);
        const unchanged = original?.frontText === card.frontText && original?.backText === card.backText;
        const duplicateInFile = duplicateKeys.has(key);
        if (duplicateInFile) errors.push({ code: 'DUPLICATE_IN_FILE', message: 'This card duplicates another row in the file.' });
        return { ...card, duplicate: duplicateInFile || Boolean(unchanged && original?.duplicate), errors, valid: errors.length === 0 };
      });
    });
  };

  const save = async () => {
    if (!preview || validCards.length === 0) return;
    if (destination === 'new' && !newDeckTitle.trim()) {
      setError('Enter a title for the new deck.');
      return;
    }
    if (destination === 'new' && newDeckTitle.trim().length > 255) {
      setError('The new deck title must be 255 characters or fewer.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = await flashcardImportService.save({
        ...(destination === 'current' ? { deckId } : { newDeck: { title: newDeckTitle.trim(), description: newDeckDescription.trim() || undefined, isPublic, courseId: null } }),
        source: 'IMPORT',
        aiGenerationId: null,
        skipDuplicates: true,
        cards: validCards.map(({ frontText, backText }) => ({ frontText: frontText.trim(), backText: backText.trim() })),
      });
      setResult({ deckId: saved.deckId, createdCount: saved.createdCount, skippedDuplicateCount: saved.skippedDuplicateCount });
      onImported();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not save the flashcards.'));
    } finally { setBusy(false); }
  };

  const dropCard = (rowIndex: number) => setCards(current => current.filter(card => card.rowIndex !== rowIndex));
  const countInvalid = cards.length - validCards.length;

  return <Modal open onClose={onClose} title={result ? 'Import complete' : preview ? 'Review imported flashcards' : 'Import Flashcards from Word, Excel or PDF'} size={preview ? '2xl' : 'md'}
    footer={result ? <Button onClick={onClose}>Done</Button> : <>
      <Button variant="outline" onClick={preview ? () => { setPreview(null); setCards([]); setError(null); } : onClose} disabled={busy}>{preview ? 'Choose another file' : 'Cancel'}</Button>
      {!preview ? <Button icon={<Icon.Scan className="h-4 w-4" />} onClick={() => void runPreview()} disabled={!file || busy} loading={busy}>Preview file</Button>
        : <Button icon={<Icon.Check className="h-4 w-4" />} onClick={() => void save()} disabled={busy || validCards.length === 0 || cards.length > FLASHCARD_IMPORT_MAX_ROWS || (destination === 'new' && !newDeckTitle.trim())} loading={busy}>Save {validCards.length} valid cards</Button>}
    </>}>
    {result ? <div className="space-y-3">
      <p className="text-sm text-content-secondary">Saved {result.createdCount} flashcards to {destination === 'new' ? `the new deck “${newDeckTitle.trim()}”` : `“${deckTitle}”`}.</p>
      {result.skippedDuplicateCount > 0 && <p className="text-sm text-content-soft">Skipped {result.skippedDuplicateCount} duplicate {result.skippedDuplicateCount === 1 ? 'card' : 'cards'}.</p>}
    </div> : !preview ? <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-line px-3 py-2.5">
        <Icon.FileText className="h-4 w-4 flex-shrink-0 text-brand-ink" />
        <p className="min-w-[150px] flex-1 text-sm text-content-secondary">Use the import template. Up to 500 rows and 2,000 characters per side.</p>
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
      {file && <div className="flex items-center gap-3 rounded-[10px] bg-surface-alt p-3">
        <Icon.FileText className="h-5 w-5 flex-shrink-0 text-brand-ink" />
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-content-secondary">{file.name}</p><p className="text-2xs text-content-subtle">{(file.size / 1024 / 1024).toFixed(2)} MB</p></div>
        <button type="button" onClick={event => { event.stopPropagation(); setFile(null); setFileError(null); }} disabled={busy} aria-label="Remove file" className="p-1 text-content-subtle hover:text-danger disabled:opacity-50"><Icon.X className="h-4 w-4" /></button>
      </div>}
      {error && <Alert type="error" title="Import failed" message={error} />}
    </div> : <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-content-secondary">
        <span className="font-medium">{preview.fileName}</span><Badge variant="info">{preview.fileType}</Badge>
        <span>{preview.totalRows} rows</span><Badge variant="success">{validCards.length} valid</Badge>
        {countInvalid > 0 && <Badge variant="danger">{countInvalid} need edits</Badge>}
        {preview.duplicateCount > 0 && <Badge variant="warning">{preview.duplicateCount} duplicates</Badge>}
      </div>
      {preview.warnings.map((warning, index) => <p key={`${warning.code}-${index}`} className="text-xs text-warning">{warning.message}</p>)}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[200px_1fr] sm:items-end">
        <Select label="Save cards to" value={destination} onChange={v => setDestination(v as Destination)} options={[{ label: `Current deck: ${deckTitle}`, value: 'current' }, { label: 'Create a new deck', value: 'new' }]} />
        {destination === 'new' && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="New deck title" maxLength={255} value={newDeckTitle} onChange={event => setNewDeckTitle(event.target.value)} placeholder="e.g. Biology Chapter 1" />
          <Input label="Description (optional)" maxLength={1000} value={newDeckDescription} onChange={event => setNewDeckDescription(event.target.value)} />
          <label className="flex items-center gap-2 text-sm text-content-secondary sm:col-span-2"><input type="checkbox" checked={isPublic} onChange={event => setIsPublic(event.target.checked)} /> Make this deck public</label>
        </div>}
      </div>
      <div className="max-h-[45vh] overflow-auto rounded-lg border border-line">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-surface-alt text-xs uppercase tracking-wide text-content-soft"><tr><th className="w-14 px-3 py-2">Row</th><th className="px-3 py-2">Front</th><th className="px-3 py-2">Back</th><th className="w-24 px-3 py-2">Actions</th></tr></thead>
          <tbody>{cards.map(card => <tr key={card.rowIndex} className={`border-t border-line-faint align-top ${!card.valid ? 'bg-danger-light/30' : card.duplicate ? 'bg-warning-light/30' : ''}`}>
            <td className="px-3 py-3 text-xs text-content-soft">{card.rowIndex}</td>
            <td className="px-3 py-3"><textarea aria-label={`Front text, row ${card.rowIndex}`} maxLength={FLASHCARD_TEXT_MAX} value={card.frontText} onChange={event => updateCard(card.rowIndex, 'frontText', event.target.value)} className="min-h-16 w-full resize-y rounded-lg border border-line bg-surface px-2.5 py-2 text-sm text-content focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20" />
              {card.errors.some(e => e.code.startsWith('FRONT')) && <p className="mt-1 text-xs text-danger">{card.errors.filter(e => e.code.startsWith('FRONT')).map(e => e.message).join(' ')}</p>}</td>
            <td className="px-3 py-3"><textarea aria-label={`Back text, row ${card.rowIndex}`} maxLength={FLASHCARD_TEXT_MAX} value={card.backText} onChange={event => updateCard(card.rowIndex, 'backText', event.target.value)} className="min-h-16 w-full resize-y rounded-lg border border-line bg-surface px-2.5 py-2 text-sm text-content focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20" />
              {card.errors.some(e => e.code.startsWith('BACK')) && <p className="mt-1 text-xs text-danger">{card.errors.filter(e => e.code.startsWith('BACK')).map(e => e.message).join(' ')}</p>}</td>
            <td className="px-3 py-3"><div className="flex flex-col items-start gap-1">{!card.valid && <Badge variant="danger">Invalid</Badge>}{card.duplicate && <Badge variant="warning">Duplicate</Badge>}<button type="button" onClick={() => dropCard(card.rowIndex)} className="inline-flex items-center gap-1 text-xs text-danger hover:underline"><Icon.Trash className="h-3.5 w-3.5" /> Remove</button></div></td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="text-xs text-content-soft">Only valid rows are sent. Duplicate cards are skipped during save.</p>
    </div>}
    {preview && error && <Alert type="error" title="Import failed" message={error} />}
  </Modal>;
}
