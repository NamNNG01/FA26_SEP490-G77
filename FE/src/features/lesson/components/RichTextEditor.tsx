import React, { useRef } from 'react';
import { Icon } from '@/assets/icons';

const toolbarBtn = 'w-7 h-7 rounded-[6px] hover:bg-[#E5E7EB] text-[#374151] flex items-center justify-center select-none';

export function RichTextEditor({ html, onChange }: { html: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  const fire = (cmd: string, val?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, val as string);
    onChange(ref.current?.innerHTML ?? '');
  };

  return (
    <div className="rounded-[10px] border border-[#E5E7EB] overflow-hidden bg-white focus-within:ring-2 focus-within:ring-[#2563EB]/20 focus-within:border-[#2563EB]">
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-[#F3F4F6] bg-[#F9FAFB]">
        <button type="button" title="Bold" onMouseDown={e => e.preventDefault()} onClick={() => fire('bold')} className={`${toolbarBtn} font-bold text-[13px]`}>B</button>
        <button type="button" title="Italic" onMouseDown={e => e.preventDefault()} onClick={() => fire('italic')} className={`${toolbarBtn} italic text-[13px]`}>I</button>
        <button type="button" title="Underline" onMouseDown={e => e.preventDefault()} onClick={() => fire('underline')} className={`${toolbarBtn} underline text-[13px]`}>U</button>
        <div className="w-px h-4 bg-[#E5E7EB] mx-1" />
        <button type="button" title="Heading 2" onMouseDown={e => e.preventDefault()} onClick={() => fire('formatBlock', 'H2')} className={`${toolbarBtn} text-[12px] font-bold`}>H2</button>
        <button type="button" title="Heading 3" onMouseDown={e => e.preventDefault()} onClick={() => fire('formatBlock', 'H3')} className={`${toolbarBtn} text-[12px] font-bold`}>H3</button>
        <div className="w-px h-4 bg-[#E5E7EB] mx-1" />
        <button type="button" title="Bullet list" onMouseDown={e => e.preventDefault()} onClick={() => fire('insertUnorderedList')} className={toolbarBtn}><Icon.List className="w-4 h-4" /></button>
        <button type="button" title="Numbered list" onMouseDown={e => e.preventDefault()} onClick={() => fire('insertOrderedList')} className={`${toolbarBtn} text-[13px] font-semibold`}>1.</button>
        <div className="flex-1" />
        <button type="button" title="Clear formatting" onMouseDown={e => e.preventDefault()} onClick={() => fire('removeFormat')} className={`${toolbarBtn} text-[11px]`}>Clear</button>
      </div>
      <div ref={ref} contentEditable suppressContentEditableWarning
        onInput={() => onChange(ref.current?.innerHTML ?? '')}
        className="prose-block px-3 py-2.5 min-h-[120px] text-[14px] text-[#111827] outline-none"
        data-placeholder="Write the lesson content…"
        dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}