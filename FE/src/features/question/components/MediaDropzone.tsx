import React, { useRef, useState } from 'react';
import { Icon } from '@/assets/icons';

const ACCEPT = 'image/*,audio/*,video/*,application/pdf';
const MAX_SIZE = 20 * 1024 * 1024;

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const fileIcon = (type: string) =>
  type.startsWith('image/') ? Icon.Image : type.startsWith('video/') ? Icon.Video : Icon.File;

/**
 * Drag & drop / browse area for question media. Files stay in the browser for
 * now — there is no upload endpoint for question media on the backend yet.
 */
export function MediaDropzone({ files, onChange, disabled }: { files: File[]; onChange: (files: File[]) => void; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    const tooBig = incoming.filter(f => f.size > MAX_SIZE);
    const wrongType = incoming.filter(f => !/^(image|audio|video)\//.test(f.type) && f.type !== 'application/pdf');
    const ok = incoming.filter(f => !tooBig.includes(f) && !wrongType.includes(f));
    const known = new Set(files.map(f => `${f.name}:${f.size}`));
    onChange([...files, ...ok.filter(f => !known.has(`${f.name}:${f.size}`))]);
    setRejected([
      ...tooBig.map(f => `${f.name} is larger than 20 MB.`),
      ...wrongType.map(f => `${f.name} is not an image, audio, video or PDF file.`),
    ]);
  };

  return (
    <div>
      <span className="block text-sm font-medium text-content-secondary mb-1">Media Attachments</span>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={e => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={e => { e.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); if (!disabled) addFiles(e.dataTransfer.files); }}
        className={`flex flex-col items-center justify-center gap-1.5 rounded-[12px] border-2 border-dashed px-4 py-7 text-center transition-all focus:outline-none focus:ring-2 focus:ring-brand-600/20 ${
          disabled ? 'opacity-60 cursor-not-allowed border-line' : 'cursor-pointer'
        } ${dragging ? 'border-brand-600 bg-brand-600/5' : 'border-line hover:border-brand-600/60 hover:bg-surface-alt'}`}
      >
        <Icon.Upload className="w-7 h-7 text-content-subtle" />
        <p className="text-sm text-content-secondary">
          <span className="font-semibold text-brand-ink">Browse</span> or drag &amp; drop media files
        </p>
        <p className="text-xs text-content-subtle">Images, audio, video or PDF · up to 20 MB each</p>
        <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
      </div>

      {rejected.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {rejected.map(r => <li key={r} className="text-xs text-danger">{r}</li>)}
        </ul>
      )}

      {files.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {files.map((f, i) => {
            const FileIcon = fileIcon(f.type);
            return (
              <li key={`${f.name}:${f.size}`} className="flex items-center gap-2 rounded-[10px] border border-line px-3 py-2">
                <FileIcon className="w-4 h-4 text-content-soft flex-shrink-0" />
                <span className="text-sm text-content truncate flex-1 min-w-0">{f.name}</span>
                <span className="text-xs text-content-subtle flex-shrink-0">{formatSize(f.size)}</span>
                <button
                  type="button"
                  onClick={() => onChange(files.filter((_, fi) => fi !== i))}
                  aria-label={`Remove ${f.name}`}
                  className="p-1 flex-shrink-0 text-content-subtle hover:text-danger"
                >
                  <Icon.X className="w-4 h-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {files.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-content-subtle mt-1.5">
          <Icon.Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          Media upload isn't available on the server yet — these files are not saved with the question.
        </p>
      )}
    </div>
  );
}
