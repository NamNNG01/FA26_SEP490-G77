import React, { useRef } from 'react';
import { Icon } from '@/assets/icons';
import { formatSize } from '../contentBlocks';

export function UploadArea({ accept, hint, onFile }: {
  accept: string; hint?: string; onFile: (f: { fileName: string; size: string; objectUrl: string }) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  const handle = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    onFile({ fileName: f.name, size: formatSize(f.size), objectUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : '' });
  };

  return (
    <div>
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={e => { handle(e.target.files); e.target.value = ''; }} />
      <button type="button" onClick={() => ref.current?.click()}
        className="w-full border border-dashed border-line-strong rounded-[10px] px-4 py-6 flex flex-col items-center gap-2 text-content-soft hover:border-brand-600 hover:text-brand-ink hover:bg-brand-50/40 transition-colors">
        <Icon.Upload className="w-5 h-5" />
        <span className="text-sm font-medium">Click to upload</span>
        {hint && <span className="text-2xs text-content-subtle">{hint}</span>}
      </button>
    </div>
  );
}