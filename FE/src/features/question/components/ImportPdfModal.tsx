import React, { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { useToast } from "@/components/ui/ToastHost";
import { Icon } from "@/assets/icons";
import { IMPORT_EXTENSIONS, IMPORT_MAX_BYTES, questionService } from "@/services/question.service";
import { fromImportBlock, type QuestionDraft } from "../model";
import { courseService } from "@/services/course.service";

const formatSize = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

function fileProblem(f: File): string | null {
  const name = f.name.toLowerCase();
  if (!IMPORT_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    return "Only Excel (.xlsx, .xls), Word (.docx), or PDF (.pdf) files can be imported.";
  }
  if (f.size === 0) return "This file is empty.";
  if (f.size > IMPORT_MAX_BYTES) return `This file is ${formatSize(f.size)} — the limit is 10 MB.`;
  return null;
}

function previewErrorMessage(err: unknown): string {
  const response = (err as { response?: { status?: number; data?: { message?: string } } })
    ?.response;
  if (response?.status === 403)
    return "You are not assigned to this course, so you can’t import questions into it.";
  if (response?.status === 413) return "The file is larger than the server accepts (10 MB).";
  if (response?.status === 504 || (err as { code?: string })?.code === "ECONNABORTED") {
    return "Reading the file took too long. Try a smaller file or split it in two.";
  }
  if (response?.data?.message) return response.data.message;
  return err instanceof Error && err.message
    ? err.message
    : "Could not read the file. Please try again.";
}

/**
 * Q-09: Upload Excel (.xlsx/.xls), Word (.docx), or PDF written in the import
 * template and load all parsed blocks directly onto the caller's screen.
 */
export function ImportPdfModal({
  open,
  onClose,
  onImported,
  courseId,
  moduleId,
  lockLocation = false,
}: {
  open: boolean;
  onClose: () => void;
  onImported: (drafts: QuestionDraft[], courseId: string, moduleId: string) => void;
  courseId: string;
  moduleId: string;
  /** Module may be empty (exam import); otherwise the page picks one before opening. */
  lockLocation?: boolean;
}) {
  const [courseName, setCourseName] = useState("");
  const [moduleName, setModuleName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templateBusy, setTemplateBusy] = useState<"pdf" | "docx" | "xlsx" | null>(null);
  const toast = useToast();

  // The location is picked on the page; the modal only shows it.
  useEffect(() => {
    if (!open || !courseId) return;
    let cancelled = false;
    setCourseName("");
    setModuleName("");
    courseService
      .getCourseById(courseId)
      .then((c) => {
        if (!cancelled) setCourseName(c.title);
      })
      .catch(() => {});
    if (moduleId) {
      courseService
        .getCourseModules(courseId)
        .then((mods) => {
          const m = mods.find((x) => String(x.moduleId) === moduleId);
          if (!cancelled && m) setModuleName(m.title);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [open, courseId, moduleId]);

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
        setError(
          "No questions were found in this file. Check the template structure and make sure at least one question is filled.",
        );
        return;
      }
      onImported(
        blocks.map((b) => fromImportBlock(b)),
        courseId,
        moduleId,
      );
    } catch (err) {
      if (!controller.signal.aborted) setError(previewErrorMessage(err));
    } finally {
      if (abortRef.current === controller) setUploading(false);
    }
  };

  const downloadTemplate = async (format: "pdf" | "docx" | "xlsx") => {
    setTemplateBusy(format);
    try {
      await questionService.downloadImportTemplate(format);
    } catch {
      toast.error("Could not download the template. Please try again.");
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
      <Button variant="outline" onClick={close}>
        Cancel
      </Button>
      <Button
        onClick={handleImport}
        loading={uploading}
        disabled={!file || !courseId || (!lockLocation && !moduleId)}
        icon={<Icon.Upload className="w-4 h-4" />}
      >
        {uploading ? "Importing…" : "Import Questions"}
      </Button>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={close}
      title="Import Questions (Excel, Word, PDF)"
      size="md"
      footer={footer}
      error={error && <Alert type="error" title="Import failed" message={error} />}
    >
      <div className="space-y-4">
        <div className="rounded-[10px] border border-line bg-surface-alt/60 px-3.5 py-2.5 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-content-secondary">
            <Icon.FolderOpen className="w-3.5 h-3.5 text-brand-ink" /> Importing into
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-content-subtle">Course</dt>
            <dd className="font-medium text-content truncate">
              {courseName || `Course #${courseId}`}
            </dd>
            <dt className="text-content-subtle">Module</dt>
            <dd className="font-medium text-content truncate">
              {moduleId ? (
                moduleName || `Module #${moduleId}`
              ) : (
                <span className="font-normal italic text-content-subtle">No module</span>
              )}
            </dd>
          </dl>
          <p className="text-2xs text-content-subtle">
            Close this window to change the course or module.
          </p>
        </div>

        <div className="rounded-[10px] border border-line px-3 py-2.5 space-y-2">
          <p className="flex items-center gap-1.5 text-sm text-content-secondary">
            <Icon.FileText className="w-4 h-4 text-brand-ink flex-shrink-0" /> Download import
            template
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { format: "xlsx", label: "Excel" },
                { format: "docx", label: "Word" },
                { format: "pdf", label: "PDF" },
              ] as const
            ).map((t) => (
              <Button
                key={t.format}
                size="sm"
                variant="outline"
                className="w-full"
                icon={<Icon.Download className="w-3.5 h-3.5" />}
                onClick={() => downloadTemplate(t.format)}
                loading={templateBusy === t.format}
                disabled={templateBusy != null}
              >
                {t.label}
              </Button>
            ))}
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (!uploading) acceptFile(e.dataTransfer.files?.[0]);
          }}
          onClick={() => {
            if (!uploading) inputRef.current?.click();
          }}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !uploading) {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          className={`card p-8 text-center border-2 border-dashed transition-colors cursor-pointer bg-primary-light ${dragOver ? "border-brand-600" : "border-brand-line"}`}
        >
          <Icon.Upload className="w-10 h-10 text-brand-ink mx-auto mb-3" />
          <p className="text-base font-semibold text-brand-ink-strong">
            Drag & drop here or click to browse
          </p>
          <p className="text-xs text-content-soft mt-1">
            Excel (.xlsx, .xls), Word (.docx), or PDF (.pdf), up to 10 MB
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,.xlsx,.xls,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="hidden"
            onChange={(e) => {
              acceptFile(e.target.files?.[0]);
              e.target.value = "";
            }}
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
            <button
              type="button"
              onClick={() => setFile(null)}
              disabled={uploading}
              aria-label="Remove file"
              className="text-content-subtle hover:text-danger p-1"
            >
              <Icon.X className="w-4 h-4" />
            </button>
          </div>
        )}

        <p className="text-xs text-content-subtle">
          Every question must include its own Difficulty (EASY, MEDIUM, or HARD) — imported
          questions will load directly on the page where you can filter and edit them before saving.
        </p>
      </div>
    </Modal>
  );
}
