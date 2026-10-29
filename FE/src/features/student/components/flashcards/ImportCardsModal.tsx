import React, { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Progress';
import { Icon } from '@/assets/icons';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  IMPORT_MAX_BYTES,
  studentDeckService,
  type DeckMode,
  type ImportStatusView,
} from '@/services/studentDeck.service';
import { plural } from './flashcardUi';

const POLL_MS = 2000;
const ACCEPT = '.csv,.xlsx';

/** Sample rows per mode — columns are fixed by the BE: front, back, code_language, code_body. */
const TEMPLATE_ROWS: Record<DeckMode, string[][]> = {
  FLASHCARD: [
    ['Encapsulation', 'Hiding an object\'s state behind its methods.', '', ''],
    ['Polymorphism', 'One interface, many implementations.', '', ''],
  ],
  CODE_SNIPPET: [
    ['Print "Hello" in Java', '', 'JAVA', 'System.out.println("Hello");'],
    ['Sum of a list in Python', '', 'PYTHON', 'total = sum(numbers)'],
  ],
  CODE_OUTPUT: [
    ['', '3', 'PYTHON', 'print(1 + 2)'],
    ['', '10', 'JAVA', 'System.out.println(5 * 2);'],
  ],
};

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function downloadTemplate(mode: DeckMode) {
  const rows = [['front', 'back', 'code_language', 'code_body'], ...TEMPLATE_ROWS[mode]];
  const csv = rows.map(r => r.map(csvCell).join(',')).join('\r\n');
  // BOM so Excel opens Vietnamese text as UTF-8.
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `flashcards-${mode.toLowerCase()}-template.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Import cards from CSV / XLSX (FC-07), then poll FC-11 until the background
 * job finishes. Closing the modal stops polling; the import keeps running on the server.
 */
export function ImportCardsModal({
  deckId,
  mode,
  onClose,
  onImported,
}: {
  deckId: number;
  mode: DeckMode;
  onClose: () => void;
  /** Called once when the job completes with at least one card added. */
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<ImportStatusView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      window.clearTimeout(timer.current);
    };
  }, []);

  const pick = (f: File | null) => {
    setError(null);
    if (!f) return setFile(null);
    const ext = f.name.toLowerCase().split('.').pop();
    if (ext !== 'csv' && ext !== 'xlsx') {
      setFile(null);
      return setFileError('Choose a .csv or .xlsx file.');
    }
    if (f.size > IMPORT_MAX_BYTES) {
      setFile(null);
      return setFileError('The file is larger than 5 MB.');
    }
    setFileError(null);
    setFile(f);
  };

  const poll = (importId: number) => {
    timer.current = window.setTimeout(async () => {
      try {
        const s = await studentDeckService.getImportStatus(deckId, importId);
        if (!alive.current) return;
        setStatus(s);
        if (s.status === 'PROCESSING') poll(importId);
        else if (s.status === 'COMPLETED' && s.successCount > 0) onImported();
      } catch (err) {
        if (alive.current) setError(getApiErrorMessage(err, 'Could not read the import status.'));
      }
    }, POLL_MS);
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const started = await studentDeckService.importCards(deckId, file);
      if (!alive.current) return;
      setStatus({ importId: started.importId, status: started.status, progress: 0, totalRows: started.totalRows, successCount: 0, errorRows: null });
      poll(started.importId);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not upload the file.'));
    } finally {
      if (alive.current) setUploading(false);
    }
  };

  const running = uploading || status?.status === 'PROCESSING';
  const done = status && status.status !== 'PROCESSING';
  const errorRows = status?.errorRows ?? [];

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title="Import cards"
      footer={
        done ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              {running ? 'Close' : 'Cancel'}
            </Button>
            {!status && (
              <Button icon={<Icon.Upload className="w-4 h-4" />} onClick={upload} disabled={!file || uploading} loading={uploading}>
                Import
              </Button>
            )}
          </>
        )
      }
    >
      {!status ? (
        <div className="space-y-4">
          <div className="rounded-[10px] bg-surface-alt border border-line p-3 text-sm text-content-soft space-y-1.5">
            <p>
              A <strong>.csv</strong> or <strong>.xlsx</strong> file up to 5 MB. The first row names the columns:
            </p>
            <code className="block text-xs font-mono text-content">front, back, code_language, code_body</code>
            <p className="text-xs">
              {mode === 'FLASHCARD' && 'Fill front and back.'}
              {mode === 'CODE_SNIPPET' && 'Fill front, code_language (JAVA, PYTHON, C, CPP) and code_body.'}
              {mode === 'CODE_OUTPUT' && 'Fill code_body and back (the output); code_language is optional.'}
            </p>
            <button type="button" onClick={() => downloadTemplate(mode)} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
              <Icon.Download className="w-3.5 h-3.5" /> Download a sample CSV
            </button>
          </div>

          <label
            className={`flex flex-col items-center justify-center gap-2 rounded-[12px] border-2 border-dashed px-4 py-8 text-center cursor-pointer transition-colors ${
              fileError ? 'border-danger-solid' : 'border-line hover:border-brand-600'
            }`}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              pick(e.dataTransfer.files?.[0] ?? null);
            }}
          >
            <Icon.FileText className="w-7 h-7 text-content-subtle" />
            <span className="text-sm text-content">{file ? file.name : 'Choose a file or drop it here'}</span>
            {file && <span className="text-xs text-content-subtle">{(file.size / 1024).toFixed(0)} KB</span>}
            <input type="file" accept={ACCEPT} className="sr-only" onChange={e => pick(e.target.files?.[0] ?? null)} />
          </label>
          {fileError && <p className="text-xs text-danger">{fileError}</p>}
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {status.status === 'PROCESSING' && (
            <>
              <p className="text-sm text-content-soft">
                Importing {plural(status.totalRows, 'row')}… You can close this window; the import keeps running.
              </p>
              <Progress value={status.progress} max={100} label="Progress" />
            </>
          )}
          {status.status === 'FAILED' && (
            <p className="flex items-start gap-2 text-sm text-danger">
              <Icon.XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> The import failed. Check the file and try again.
            </p>
          )}
          {status.status === 'COMPLETED' && (
            <p className="flex items-start gap-2 text-sm text-content">
              <Icon.CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-success" />
              Added {status.successCount} of {plural(status.totalRows, 'row')}.
              {errorRows.length > 0 && ` ${plural(errorRows.length, 'row')} had errors.`}
            </p>
          )}
          {errorRows.length > 0 && (
            <div className="rounded-[10px] border border-line max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt text-xs text-content-subtle sticky top-0">
                  <tr>
                    <th className="text-left font-semibold px-3 py-2 w-20">Row</th>
                    <th className="text-left font-semibold px-3 py-2">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {errorRows.map(r => (
                    <tr key={r.row}>
                      <td className="px-3 py-2 text-content-secondary">{r.row}</td>
                      <td className="px-3 py-2 text-content">{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
