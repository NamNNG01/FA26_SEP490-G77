import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/ToastHost';
import { Icon } from '@/assets/icons';
import {
  IMPORT_EXTENSIONS,
  IMPORT_MAX_BYTES,
  questionService,
  type ImportBlock,
  type ImportPreviewResponse,
} from '@/services/question.service';
import { fromImportBlock, type QuestionDraft } from '../model';
import { QuestionLocationCard } from './QuestionLocationCard';

type PreviewFilter = 'all' | 'errors' | 'valid';

const formatSize = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

function fileProblem(f: File): string | null {
  const name = f.name.toLowerCase();
  if (!IMPORT_EXTENSIONS.some(ext => name.endsWith(ext))) {
    return 'Only Excel (.xlsx, .xls), Word (.docx), or PDF (.pdf) files can be imported.';
  }
  if (f.size === 0) return 'This file is empty.';
  if (f.size > IMPORT_MAX_BYTES) return `This file is ${formatSize(f.size)} — the limit is 10 MB.`;
  return null;
}

function previewErrorMessage(err: unknown): string {
  const response = (err as { response?: { status?: number; data?: { message?: string } } })?.response;
  if (response?.status === 403) return 'You are not assigned to this course, so you can’t import questions into it.';
  if (response?.status === 413) return 'The file is larger than the server accepts (10 MB).';
  if (response?.status === 504 || (err as { code?: string })?.code === 'ECONNABORTED') {
    return 'Reading the file took too long. Try a smaller file or split it in two.';
  }
  if (response?.data?.message) return response.data.message;
  return err instanceof Error && err.message ? err.message : 'Could not read the file. Please try again.';
}

function blockHasError(b: ImportBlock): boolean {
  return Boolean(b.errors && b.errors.length > 0);
}

function blockSummary(b: ImportBlock): string {
  const d = b.questionData;
  if (!d) return '';
  if (d.questionType === 'SINGLE_CHOICE' || d.questionType === 'MULTIPLE_CHOICE' || d.questionType === 'TRUE_FALSE') {
    const opts = d.options ?? [];
    const correctCount = opts.filter(o => o.isCorrect).length;
    return `${opts.length} option${opts.length === 1 ? '' : 's'} (${correctCount} correct)`;
  }
  if (d.questionType === 'ORDERING') {
    return `${(d.options ?? []).length} item${(d.options ?? []).length === 1 ? '' : 's'} to order`;
  }
  if (d.questionType === 'MATCHING') {
    const pairs = (d.answerKey as { pairs?: unknown[] } | null)?.pairs ?? [];
    return `${pairs.length} pair${pairs.length === 1 ? '' : 's'}`;
  }
  if (d.questionType === 'FILL_BLANK') {
    const blanks = (d.answerKey as { blanks?: unknown[] } | null)?.blanks ?? [];
    return `${blanks.length} blank${blanks.length === 1 ? '' : 's'}`;
  }
  if (d.questionType === 'CODE') {
    const lang = d.codeConfig?.allowedLanguages?.[0] ?? 'No language';
    const tcCount = (d.testCases ?? []).length;
    return `${lang} · ${tcCount} test case${tcCount === 1 ? '' : 's'}`;
  }
  if (d.questionType === 'ESSAY' || d.questionType === 'DIAGRAM' || d.questionType === 'DIAGRAM_ESSAY') {
    const criteria = (d.essayGradingRubric as { criteria?: unknown[] } | null)?.criteria ?? [];
    return `${criteria.length} rubric criterion${criteria.length === 1 ? '' : 'a'}`;
  }
  return '';
}

/**
 * Q-09: Upload Excel (.xlsx/.xls), Word (.docx), or PDF written in the import
 * template, preview every parsed question with error/valid filtering, then
 * send selected blocks to the caller's form.
 */
export function ImportPdfModal({ open, onClose, onImported, courseId: pageCourseId, moduleId: pageModuleId, lockLocation = false }: {
  open: boolean;
  onClose: () => void;
  onImported: (drafts: QuestionDraft[], courseId: string, moduleId: string) => void;
  courseId: string;
  moduleId: string;
  lockLocation?: boolean;
}) {
  const [courseId, setCourseId] = useState(pageCourseId);
  const [moduleId, setModuleId] = useState(pageModuleId);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [keptBlocks, setKeptBlocks] = useState<ImportBlock[]>([]);
  const [filter, setFilter] = useState<PreviewFilter>('all');
  const [templateBusy, setTemplateBusy] = useState<'pdf' | 'docx' | 'xlsx' | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setCourseId(pageCourseId);
    setModuleId(pageModuleId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset location when opening
  }, [open]);

  useEffect(() => {
    if (open) return;
    abortRef.current?.abort();
    setFile(null);
    setFileError(null);
    setDragOver(false);
    setUploading(false);
    setError(null);
    setPreview(null);
    setKeptBlocks([]);
    setFilter('all');
  }, [open]);

  const acceptFile = (f?: File | null) => {
    if (!f) return;
    const problem = fileProblem(f);
    setFileError(problem);
    setFile(problem ? null : f);
    setError(null);
  };

  const handlePreview = async () => {
    if (!file || !courseId || (!lockLocation && !moduleId) || uploading) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setUploading(true);
    setError(null);
    try {
      const res = await questionService.previewImport(
        file,
        { courseId: Number(courseId), moduleId: moduleId ? Number(moduleId) : null },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      const blocks = res.blocks ?? [];
      if (!blocks.length) {
        setError('No questions were found in this file. Check the template structure and make sure at least one question is filled.');
        return;
      }
      setPreview(res);
      setKeptBlocks(blocks);
      setFilter('all');
    } catch (err) {
      if (!controller.signal.aborted) setError(previewErrorMessage(err));
    } finally {
      if (abortRef.current === controller) setUploading(false);
    }
  };

  const downloadTemplate = async (format: 'pdf' | 'docx' | 'xlsx') => {
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

  const errorBlocks = useMemo(() => keptBlocks.filter(blockHasError), [keptBlocks]);
  const validBlocks = useMemo(() => keptBlocks.filter(b => !blockHasError(b)), [keptBlocks]);
  const filteredBlocks = useMemo(() => {
    if (filter === 'errors') return errorBlocks;
    if (filter === 'valid') return validBlocks;
    return keptBlocks;
  }, [filter, keptBlocks, errorBlocks, validBlocks]);

  const removeBlock = (blockIndex: number) => {
    setKeptBlocks(prev => prev.filter(b => b.index !== blockIndex));
  };

  const confirmBlocks = (blocksToImport: ImportBlock[]) => {
    if (!blocksToImport.length) return;
    onImported(blocksToImport.map(b => fromImportBlock(b)), courseId, moduleId);
  };

  const isPreviewStep = preview != null;
  const locUnit = preview?.fileType === 'XLSX' ? 'Row' : 'Line';

  const footer = isPreviewStep ? (
    <div className="flex flex-wrap items-center justify-between gap-2 w-full">
      <Button
        variant="outline"
        onClick={() => { setPreview(null); setKeptBlocks([]); setError(null); }}
      >
        Back to Upload
      </Button>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={close}>Cancel</Button>
        {validBlocks.length > 0 && errorBlocks.length > 0 && (
          <Button
            variant="outline"
            onClick={() => confirmBlocks(validBlocks)}
          >
            Import Valid Only ({validBlocks.length})
          </Button>
        )}
        <Button
          onClick={() => confirmBlocks(keptBlocks)}
          disabled={keptBlocks.length === 0}
          icon={<Icon.Check className="w-4 h-4" />}
        >
          {errorBlocks.length > 0 ? `Import All to Fix (${keptBlocks.length})` : `Import Questions (${keptBlocks.length})`}
        </Button>
      </div>
    </div>
  ) : (
    <>
      <Button variant="outline" onClick={close}>Cancel</Button>
      <Button
        onClick={handlePreview}
        loading={uploading}
        disabled={!file || !courseId || (!lockLocation && !moduleId)}
        icon={<Icon.Upload className="w-4 h-4" />}
      >
        {uploading ? 'Reading file…' : 'Preview Questions'}
      </Button>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={close}
      title={isPreviewStep ? `Import Preview — ${preview.fileName}` : 'Import Questions (Excel, Word, PDF)'}
      size={isPreviewStep ? 'xl' : 'md'}
      footer={footer}
      error={error && <Alert type="error" title="Import failed" message={error} />}
    >
      {isPreviewStep ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-line bg-surface-alt/60 px-3.5 py-2.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-content-secondary">
              <Badge variant="info" size="sm">{preview.fileType}</Badge>
              <span>
                <strong>{keptBlocks.length}</strong> question{keptBlocks.length === 1 ? '' : 's'} ·{' '}
                <span className="text-success font-medium">{validBlocks.length} valid</span> ·{' '}
                <span className={errorBlocks.length > 0 ? 'text-danger font-medium' : 'text-content-subtle'}>
                  {errorBlocks.length} with errors
                </span>
              </span>
            </div>
            <div className="inline-flex items-center rounded-[8px] border border-line bg-surface p-0.5 gap-0.5">
              {([
                { key: 'all', label: `All (${keptBlocks.length})` },
                { key: 'errors', label: `Errors (${errorBlocks.length})` },
                { key: 'valid', label: `Valid (${validBlocks.length})` },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFilter(tab.key)}
                  className={`px-2.5 py-1 rounded-[6px] text-xs font-medium transition-colors ${
                    filter === tab.key
                      ? 'bg-brand-600 text-white'
                      : 'text-content-secondary hover:bg-surface-alt'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {errorBlocks.length > 0 && (
            <Alert
              type="warning"
              title="Some imported questions are incomplete or invalid"
              message="Parsed fields are preserved. You can remove broken rows here, import only the valid ones, or import all to fix them directly in the form."
            />
          )}

          <div className="max-h-[52vh] overflow-y-auto space-y-2.5 pr-1">
            {filteredBlocks.length === 0 ? (
              <div className="py-10 text-center text-sm text-content-subtle border border-dashed border-line rounded-[10px]">
                {filter === 'errors'
                  ? 'No questions with errors — everything looks valid!'
                  : filter === 'valid'
                    ? 'No completely valid questions found under this filter.'
                    : 'All preview questions have been removed.'}
              </div>
            ) : (
              filteredBlocks.map(block => {
                const hasErr = blockHasError(block);
                const d = block.questionData;
                const diff = d?.difficulty;
                const summary = blockSummary(block);
                return (
                  <div
                    key={block.index}
                    className={`rounded-[10px] border p-3.5 transition-colors ${
                      hasErr
                        ? 'border-danger-line bg-danger-light/30'
                        : 'border-line bg-surface'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-bold text-brand-ink">#{block.index}</span>
                          <span className="text-2xs text-content-subtle">{locUnit} {block.startLine}</span>
                          {block.questionType && (
                            <Badge variant="default" size="sm">{block.questionType}</Badge>
                          )}
                          {diff ? (
                            <Badge variant={diff === 'HARD' ? 'danger' : diff === 'MEDIUM' ? 'warning' : 'success'} size="sm">
                              {diff}
                            </Badge>
                          ) : (
                            <Badge variant="danger" size="sm">Missing Difficulty</Badge>
                          )}
                          <Badge variant={hasErr ? 'danger' : 'success'} size="sm">
                            {hasErr ? `${block.errors.length} error${block.errors.length === 1 ? '' : 's'}` : 'Valid'}
                          </Badge>
                          {summary && <span className="text-xs text-content-subtle">{summary}</span>}
                        </div>

                        <p className="text-sm text-content font-medium line-clamp-2">
                          {d?.content?.trim() ? d.content : <span className="italic text-content-subtle">(No question content parsed)</span>}
                        </p>

                        {hasErr && (
                          <ul className="mt-1.5 space-y-0.5 text-xs text-danger-strong list-disc pl-4">
                            {block.errors.map((errItem, idx) => (
                              <li key={idx}>
                                {errItem.line > 0 ? `${locUnit} ${errItem.line}: ` : ''}
                                {errItem.message}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => removeBlock(block.index)}
                        className="p-1.5 rounded-[6px] text-content-subtle hover:text-danger hover:bg-danger-light/60 flex-shrink-0"
                        title="Remove from import list"
                        aria-label={`Remove question #${block.index}`}
                      >
                        <Icon.Trash className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {lockLocation ? (
            <p className="text-xs text-content-subtle">Imported questions will use the exam’s selected course and module.</p>
          ) : (
            <>
              <QuestionLocationCard
                hideHeading
                courseId={courseId}
                moduleId={moduleId}
                onChange={(c, m) => { setCourseId(c); setModuleId(m); setError(null); }}
                courseLocked={uploading}
                moduleRequired
              />
              <p className="-mt-2 text-xs text-content-subtle">The imported questions go into this course and module.</p>
            </>
          )}

          <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-line px-3 py-2.5">
            <Icon.FileText className="w-4 h-4 text-brand-ink flex-shrink-0" />
            <p className="flex-1 min-w-[140px] text-sm text-content-secondary">Download import template (DIFFICULTY included):</p>
            <Button size="sm" variant="outline" icon={<Icon.Download className="w-3.5 h-3.5" />} onClick={() => downloadTemplate('xlsx')} loading={templateBusy === 'xlsx'} disabled={templateBusy != null}>
              Excel
            </Button>
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
            <p className="text-xs text-content-soft mt-1">Excel (.xlsx, .xls), Word (.docx), or PDF (.pdf), up to 10 MB</p>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,.xlsx,.xls,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
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

          <p className="text-xs text-content-subtle">
            Every question must include its own Difficulty (EASY, MEDIUM, or HARD) and required fields — you can review and filter errors on the next step.
          </p>
        </div>
      )}
    </Modal>
  );
}
