import React from 'react';
import { Icon } from '@/assets/icons';
import type { ContentBlock } from '../contentBlocks';
import { blockMeta } from '../contentBlocks';

export function ContentBlockCard({ block, sub, onToggle, onDelete, onDragStart, onDragOver, onDrop, children }: {
  block: ContentBlock;
  sub?: React.ReactNode;
  onToggle: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  children: React.ReactNode;
}) {
  const meta = blockMeta[block.type];
  return (
    <div onDragOver={onDragOver} onDrop={onDrop} className="card overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-line-soft bg-surface-alt">
        <span draggable onDragStart={e => { e.dataTransfer.setData('text/plain', block.id); onDragStart(); }}
          className="cursor-grab active:cursor-grabbing text-content-subtle hover:text-content-secondary transition-colors p-0.5 -mx-0.5">
          <Icon.GripVertical className="w-4 h-4" />
        </span>
        <span className="w-6 h-6 rounded-[7px] flex items-center justify-center text-content-muted" style={{ background: meta.accent }}>{meta.icon}</span>
        <span className="text-sm font-semibold text-content-secondary">{meta.label}</span>
        {sub}
        <div className="flex-1" />
        <button type="button" onClick={onToggle} title={block.collapsed ? 'Expand' : 'Collapse'}
          className="p-1 rounded-[6px] hover:bg-surface-pressed text-content-soft transition-colors">
          <Icon.ChevronDown className={`w-4 h-4 transition-transform ${block.collapsed ? '' : 'rotate-180'}`} />
        </button>
        <button type="button" onClick={onDelete} title="Delete block"
          className="p-1 rounded-[6px] hover:bg-danger-light text-danger transition-colors">
          <Icon.Trash className="w-4 h-4" />
        </button>
      </div>
      {!block.collapsed && <div className="p-4">{children}</div>}
    </div>
  );
}