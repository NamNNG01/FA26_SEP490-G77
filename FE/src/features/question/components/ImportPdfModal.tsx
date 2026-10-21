import React, { useEffect, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Checkbox } from '@/components/ui/Checkbox';
import { Select } from '@/components/ui/Select';
import { Icon } from '@/assets/icons';
import {
  IMPORT_EXTENSIONS,
  IMPORT_MAX_BYTES,
  questionService,
  type ImportBlock,
  type ImportPreviewResponse,
  type QuestionDifficulty,
} from '@/services/question.service';
import { DIFFICULTY_OPTIONS, QUESTION_TYPE_OPTIONS, fromImported, type QuestionDraft } from '../model';

const typeLabel = (t: string) => QUESTION_TYPE_OPTIONS.find(o => o.value === t)?.label ?? t;
const isValid = (b: ImportBlock) => !b.errors?.length && b.questionData != null;
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
 * Q-09: upload a PDF / DOCX written in the import template, check the
 * questions the backend found, and add the valid ones to the form. Nothing is
 * saved here — the questions are saved with the rest of the form (Q-03).
 */
export function ImportPdfModal({ open, onClose, onImported, courseId, moduleId, room }: {
  open: boolean;
  onClose: () => void;
  onImported: (drafts: QuestionDraft[]) => void;
  courseId: string;
  moduleId: string;
  /** How many more questions the form can take (Q-03 saves up to 50 at a time). */
  room: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<QuestionDifficulty>('MEDIUM');
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (open) return;
    abortRef.current?.abort();
    setFile(null);
    setFileError(null);
    setDragOver(false);
    setUploading(false);
    setError(null);
    setPreview(null);
    setSelected(new Set());
  }, [open]);

  const acceptFile = (f?: File | null) => {
    if (!f) return;
    const problem = fileProblem(f);
    setFileError(problem);
    setFile(problem ? null : f);
    setError(null);
  };

  const handlePreview = async () => {
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
      setPreview({ ...res, blocks });
      setSelected(new Set(blocks.filter(isValid).map(b => b.index)));
    } catch (err) {
      if (!controller.signal.aborted) setError(previewErrorMessage(err));
    } finally {
      if (abortRef.current === controller) setUploading(false);
    }
  };

  const validBlocks = preview?.blocks.filter(isValid) ?? [];
  const chosen = validBlocks.filter(b => selected.has(b.index));
  const overLimit = chosen.length > room;
  const allChosen = validBlocks.length > 0 && chosen.length === validBlocks.length;

  const toggle = (index: number, on: boolean) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (on) next.add(index);
      else next.delete(index);
      return next;
    });

  const addToForm = () => {
    if (!chosen.length || overLimit) return;
    onImported(chosen.map(b => fromImported(b.questionData!)));
  };

  const backToFile = () => {
    setPreview(null);
    setSelected(new Set());
    setError(null);
  };

  const close = () => {
    abortRef.current?.abort();
    onClose();
  };

  const footer = preview ? (
    <>
      <Button variant="outline" onClick={backToFile}>Choose another file</Button>
      <Button onClick={addToForm} disabled={!chosen.length || overLimit} icon={<Icon.Plus className="w-4 h-4" />}>
        Add {chosen.length} question{chosen.length === 1 ? '' : 's'}
      </Button>
    </>
  ) : (
    <>
      <Button variant="outline" onClick={close}>Cancel</Button>
      <Button onClick={handlePreview} loading={uploading} disabled={!file || !courseId} icon={<Icon.Upload className="w-4 h-4" />}>
        {uploading ? 'Reading file…' : 'Upload & preview'}
      </Button>
    </>
  );

  return (
    <Modal open={open} onClose={close} title="Import Questions from PDF or Word" size={preview ? 'xl' : 'md'} footer={footer}>
      {preview ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="flex items-center gap-2 min-w-0 text-content-secondary">
              <Icon.FileText className="w-4 h-4 text-brand-ink flex-shrink-0" />
              <span className="truncate font-medium">{preview.fileName}</span>
            </span>
            <span className="text-content-subtle">{preview.totalBlocks} found</span>
            <Badge variant="success">{preview.totalValid} valid</Badge>
            {preview.totalErrors > 0 && <Badge variant="danger">{preview.totalErrors} with errors</Badge>}
          </div>

          {preview.totalErrors > 0 && (
            <Alert
              type="warning"
              title="Some questions can’t be imported"
              message="Fix them in the file and upload it again, or add the valid ones now and write the rest by hand."
            />
          )}
          {overLimit && (
            <Alert type="warning" title="Too many questions" message={`The form can take ${room} more question${room === 1 ? '' : 's'} (up to 50 per save). Untick some, or save the form first.`} />
          )}

          {validBlocks.length > 0 && (
            <Checkbox
              label={`Select all valid (${validBlocks.length})`}
              checked={allChosen}
              indeterminate={chosen.length > 0 && !allChosen}
              onChange={on => setSelected(on ? new Set(validBlocks.map(b => b.index)) : new Set())}
            />
          )}

          <ul className="space-y-2">
            {preview.blocks.map(b => {
              const ok = isValid(b);
              return (
                <li
                  key={b.index}
                  className={`flex items-start gap-3 rounded-[10px] border p-3 ${ok ? 'border-line bg-surface' : 'border-danger-line bg-danger-light'}`}
                >
                  <div className="pt-0.5">
                    {ok ? (
                      <Checkbox checked={selected.has(b.index)} onChange={on => toggle(b.index, on)} />
                    ) : (
                      <Icon.AlertCircle className="w-[18px] h-[18px] text-danger" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-content-subtle">
                      <span className="font-semibold text-content-secondary">#{b.index}</span>
                      <Badge>{typeLabel(b.questionData?.questionType ?? b.questionType)}</Badge>
                      {b.questionData?.difficulty && <span>{b.questionData.difficulty}</span>}
                      {b.startLine > 0 && <span>Line {b.startLine}</span>}
                    </div>
                    <p className="text-sm text-content line-clamp-2 break-words">
                      {b.questionData?.content?.trim() || <span className="italic text-content-subtle">No question text</span>}
                    </p>
                    {!ok && (
                      <ul className="space-y-0.5 text-xs text-danger">
                        {(b.errors?.length ? b.errors : [{ path: '', message: 'This block could not be read.', line: 0 }]).map((e, i) => (
                          <li key={i}>{e.line > 0 ? `Line ${e.line}: ` : ''}{e.message}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="space-y-4">
          {!courseId && <Alert type="warning" title="Select a course first" message="Choose the course (and module) in the Location panel — imported questions belong to it." />}

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
      )}
    </Modal>
  );
}
