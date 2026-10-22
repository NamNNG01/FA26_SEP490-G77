import React, { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/ToastHost';
import { Icon } from '@/assets/icons';
import {
  IMPORT_EXTENSIONS,
  IMPORT_MAX_BYTES,
  questionService,
  type QuestionDifficulty,
} from '@/services/question.service';
import { DIFFICULTY_OPTIONS, fromImportBlock, type QuestionDraft } from '../model';
import { QuestionLocationCard } from './QuestionLocationCard';

const formatSize = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

/** Why a file can't be sent, or null. The backend sniffs the type, but the template is only PDF / DOCX. */
function fileProblem(f: File): string | null {
  const name = f.name.toLowerCase();
  if (!IMPORT_EXTENSIONS.some(ext => name.endsWith(ext))) return 'Only PDF and Word (.docx) files can be imported.';
  if (f.size === 0) return 'This file is empty.';
  if (f.size > IMPORT_MAX_BYTES) return `This file is ${formatSize(f.size)} — the limit is 10 MB.`;
  return null;
}

function previewErrorMessage(err: unknown): string {
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status === 403) return 'You are not assigned to this course, so you can’t import questions into it.';
  if (status === 413) return 'The file is larger than the server accepts (10 MB).';
  if (status === 504 || (err as { code?: string })?.code === 'ECONNABORTED') return 'Reading the file took too long. Try a smaller file or split it in two.';
  return err instanceof Error && err.message ? err.message : 'Could not read the file. Please try again.';
}

/**
 * Q-09: upload a PDF / DOCX written in the import template. Every question
 * the backend found goes straight into the form — blocks it couldn't read
 * come in blank, flagged with their errors. Nothing is saved here — the
 * questions are saved with the rest of the form (Q-03).
 */
export function ImportPdfModal({ open, onClose, onImported, courseId: pageCourseId, moduleId: pageModuleId }: {
  open: boolean;
  onClose: () => void;
  /** Also hands back the course / module picked here — the page switches to them. */
  onImported: (drafts: QuestionDraft[], courseId: string, moduleId: string) => void;
  /** The page's current location — the modal's pickers start from it. */
  courseId: string;
  moduleId: string;
}) {
  const [courseId, setCourseId] = useState(pageCourseId);
  const [moduleId, setModuleId] = useState(pageModuleId);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<QuestionDifficulty>('MEDIUM');
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  // Each time it opens, start from the location picked on the page.
  useEffect(() => {
    if (!open) return;
    setCourseId(pageCourseId);
    setModuleId(pageModuleId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open; later page changes don't override the modal's picks
  }, [open]);

  useEffect(() => {
    if (open) return;
    abortRef.current?.abort();
    setFile(null);
    setFileError(null);
    setDragOver(false);
    setUploading(false);
    setError(null);
  }, [open]);

  const acceptFile = (f?: File | null) => {
    if (!f) return;
    const problem = fileProblem(f);
    setFileError(problem);
    setFile(problem ? null : f);
    setError(null);
  };

  const handleImport = async () => {
    if (!file || !courseId || uploading) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setUploading(true);
    setError(null);
    try {
      const res = await questionService.previewImport(
        file,
        { courseId: Number(courseId), moduleId: moduleId ? Number(moduleId) : null, difficulty },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      const blocks = res.blocks ?? [];
      if (!blocks.length) {
        setError('No questions were found. Each question must start with a [TYPE: ...] line — see the template.');
        return;
      }
      onImported(blocks.map(b => fromImportBlock(b, difficulty)), courseId, moduleId);
    } catch (err) {
      if (!controller.signal.aborted) setError(previewErrorMessage(err));
    } finally {
      if (abortRef.current === controller) setUploading(false);
    }
  };

  const [templateBusy, setTemplateBusy] = useState<'pdf' | 'docx' | null>(null);
  const downloadTemplate = async (format: 'pdf' | 'docx') => {
    setTemplateBusy(format);
    try {
      await questionService.downloadImportTemplate(format);
    } catch {
      toast.error('Could not download the template. Please try again.');
    } finally {
      setTemplateBusy(null);
    }
  };

  const close = () => {
    abortRef.current?.abort();
    onClose();
  };

  const footer = (
    <>
      <Button variant="outline" onClick={close}>Cancel</Button>
      <Button onClick={handleImport} loading={uploading} disabled={!file || !courseId} icon={<Icon.Upload className="w-4 h-4" />}>
        {uploading ? 'Reading file…' : 'Import'}
      </Button>
    </>
  );

  return (
    <Modal open={open} onClose={close} title="Import Questions from PDF or Word" size="md" footer={footer}>
      <div className="space-y-4">
        <QuestionLocationCard
          hideHeading
          courseId={courseId}
          moduleId={moduleId}
          onChange={(c, m) => { setCourseId(c); setModuleId(m); setError(null); }}
          courseLocked={uploading}
        />
        <p className="-mt-2 text-xs text-content-subtle">The imported questions go into this course (and module, if picked).</p>

        <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-line px-3 py-2.5">
          <Icon.FileText className="w-4 h-4 text-brand-ink flex-shrink-0" />
          <p className="flex-1 min-w-[160px] text-sm text-content-secondary">Write the questions in the import template.</p>
          <Button size="sm" variant="outline" icon={<Icon.Download className="w-3.5 h-3.5" />} onClick={() => downloadTemplate('docx')} loading={templateBusy === 'docx'} disabled={templateBusy != null}>
            Word
          </Button>
          <Button size="sm" variant="outline" icon={<Icon.Download className="w-3.5 h-3.5" />} onClick={() => downloadTemplate('pdf')} loading={templateBusy === 'pdf'} disabled={templateBusy != null}>
            PDF
          </Button>
        </div>

        <div
          role="button"
          tabIndex={0}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); if (!uploading) acceptFile(e.dataTransfer.files?.[0]); }}
          onClick={() => { if (!uploading) inputRef.current?.click(); }}
          onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !uploading) { e.preventDefault(); inputRef.current?.click(); } }}
          className={`card p-8 text-center border-2 border-dashed transition-colors cursor-pointer bg-primary-light ${dragOver ? 'border-brand-600' : 'border-brand-line'}`}
        >
          <Icon.Upload className="w-10 h-10 text-brand-ink mx-auto mb-3" />
          <p className="text-base font-semibold text-brand-ink-strong">Drag & drop here or click to browse</p>
          <p className="text-xs text-content-soft mt-1">PDF or Word (.docx), up to 10 MB</p>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={e => { acceptFile(e.target.files?.[0]); e.target.value = ''; }}
          />
        </div>

        {fileError && <Alert type="error" title="Can’t use this file" message={fileError} />}

        {file && (
          <div className="flex items-center gap-3 p-3 bg-surface-alt rounded-[10px]">
            <Icon.FileText className="w-5 h-5 text-brand-ink flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-content-secondary truncate">{file.name}</p>
              <p className="text-2xs text-content-subtle">{formatSize(file.size)}</p>
            </div>
            <button type="button" onClick={() => setFile(null)} disabled={uploading} aria-label="Remove file" className="text-content-subtle hover:text-danger p-1">
              <Icon.X className="w-4 h-4" />
            </button>
          </div>
        )}

        <Select
          label="Default difficulty"
          options={DIFFICULTY_OPTIONS}
          value={difficulty}
          onChange={v => setDifficulty(v as QuestionDifficulty)}
          disabled={uploading}
        />
        <p className="-mt-2 text-xs text-content-subtle">Used for questions without a DIFFICULTY line.</p>

        {error && <Alert type="error" title="Import failed" message={error} />}
      </div>
    </Modal>
  );
}
