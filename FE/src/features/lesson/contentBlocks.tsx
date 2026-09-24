import React from 'react';
import { Icon } from '@/assets/icons';

export type ContentBlock =
  | { id: string; type: 'text'; collapsed: boolean; html: string }
  | { id: string; type: 'video'; collapsed: boolean; source: 'upload' | 'youtube' | 'vimeo'; value: string; fileName: string }
  | { id: string; type: 'image'; collapsed: boolean; fileName: string; objectUrl: string; caption: string }
  | { id: string; type: 'pdf'; collapsed: boolean; fileName: string; size: string }
  | { id: string; type: 'quiz'; collapsed: boolean; examId: string };

export type BlockType = ContentBlock['type'];

export const blockVariant = (b: string) => b === 'Video' ? 'info' : b === 'Quiz' ? 'purple' : b === 'PDF' ? 'warning' : b === 'Image' ? 'success' : 'default';

export const blockMeta: Record<BlockType, { label: string; icon: React.ReactNode; accent: string }> = {
  text: { label: 'Text', icon: <Icon.Type className="w-3.5 h-3.5" />, accent: '#EFF6FF' },
  video: { label: 'Video', icon: <Icon.Video className="w-3.5 h-3.5" />, accent: '#FEF2F2' },
  image: { label: 'Image', icon: <Icon.Image className="w-3.5 h-3.5" />, accent: '#F5F3FF' },
  pdf: { label: 'PDF', icon: <Icon.File className="w-3.5 h-3.5" />, accent: '#FFFBEB' },
  quiz: { label: 'Quiz', icon: <Icon.CheckCircle className="w-3.5 h-3.5" />, accent: '#F0FDF4' },
};

let idCounter = 1000;
export const nextBlockId = () => `blk-${++idCounter}`;

export function defaultBlock(type: BlockType): ContentBlock {
  switch (type) {
    case 'text': return { id: nextBlockId(), type, collapsed: false, html: '' };
    case 'video': return { id: nextBlockId(), type, collapsed: false, source: 'youtube', value: '', fileName: '' };
    case 'image': return { id: nextBlockId(), type, collapsed: false, fileName: '', objectUrl: '', caption: '' };
    case 'pdf': return { id: nextBlockId(), type, collapsed: false, fileName: '', size: '' };
    case 'quiz': return { id: nextBlockId(), type, collapsed: false, examId: '' };
  }
}

export function stripHtml(html: string) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || '').replace(/\s+/g, ' ').trim();
}

export function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}