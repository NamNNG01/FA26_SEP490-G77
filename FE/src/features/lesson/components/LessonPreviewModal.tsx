import React from 'react';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/assets/icons';
import { MOCK_EXAMS } from '@/features/exam/mockExams';
import type { ContentBlock } from '../contentBlocks';
import { blockMeta } from '../contentBlocks';

export function LessonPreviewModal({ open, onClose, title, blocks }: {
  open: boolean; onClose: () => void; title: string; blocks: ContentBlock[];
}) {
  const hasBlocks = blocks.length > 0;
  return (
    <Modal open={open} onClose={onClose} title={title.trim() || 'Lesson Preview'} size="lg">
      {!hasBlocks ? (
        <p className="text-sm text-content-subtle text-center py-6">This lesson has no content blocks yet.</p>
      ) : (
        <div className="space-y-4">
          {blocks.map(b => {
            const meta = blockMeta[b.type];
            return (
              <div key={b.id} className="rounded-[10px] border border-line p-4">
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="w-6 h-6 rounded-[7px] flex items-center justify-center" style={{ background: meta.accent }}>{meta.icon}</span>
                  <span className="text-xs font-semibold text-content-secondary uppercase tracking-wide">{meta.label}</span>
                </div>
                <ContentPreview block={b} />
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

function ContentPreview({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'text':
      return block.html
        ? <div className="prose-block text-base text-content-secondary" dangerouslySetInnerHTML={{ __html: block.html }} />
        : <p className="text-xs text-content-subtle">Empty text block.</p>;
    case 'video':
      return block.source === 'upload'
        ? <p className="text-sm text-content-soft"><Icon.Video className="w-4 h-4 inline text-danger mr-1.5 -mt-0.5" />{block.fileName || 'No video selected'}</p>
        : <a className="text-sm text-brand-ink hover:underline" href={block.value} target="_blank" rel="noreferrer">{block.value || `${block.source === 'youtube' ? 'YouTube' : 'Vimeo'} link pending`}</a>;
    case 'image':
      return block.objectUrl ? (
        <div>
          <img src={block.objectUrl} alt={block.fileName} className="max-h-64 w-full object-cover rounded-[8px]" />
          {block.caption && <p className="text-xs text-content-soft mt-2 italic">{block.caption}</p>}
        </div>
      ) : <p className="text-xs text-content-subtle">No image selected.</p>;
    case 'pdf':
      return <p className="text-sm text-content-soft"><Icon.File className="w-4 h-4 inline text-warning mr-1.5 -mt-0.5" />{block.fileName || 'No PDF selected'}</p>;
    case 'quiz': {
      const exam = MOCK_EXAMS.find(e => e.id === block.examId);
      return exam ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-content-secondary">{exam.title}</span>
          <Badge variant="default">{exam.subject}</Badge>
          <Badge variant="default">{exam.questions} questions</Badge>
        </div>
      ) : <p className="text-xs text-content-subtle">No exam selected yet.</p>;
    }
  }
}