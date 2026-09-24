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
        <p className="text-[13px] text-[#9CA3AF] text-center py-6">This lesson has no content blocks yet.</p>
      ) : (
        <div className="space-y-4">
          {blocks.map(b => {
            const meta = blockMeta[b.type];
            return (
              <div key={b.id} className="rounded-[10px] border border-[#E5E7EB] p-4">
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="w-6 h-6 rounded-[7px] flex items-center justify-center" style={{ background: meta.accent }}>{meta.icon}</span>
                  <span className="text-[12px] font-semibold text-[#374151] uppercase tracking-wide">{meta.label}</span>
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
        ? <div className="prose-block text-[14px] text-[#374151]" dangerouslySetInnerHTML={{ __html: block.html }} />
        : <p className="text-[12px] text-[#9CA3AF]">Empty text block.</p>;
    case 'video':
      return block.source === 'upload'
        ? <p className="text-[13px] text-[#6B7280]"><Icon.Video className="w-4 h-4 inline text-[#DC2626] mr-1.5 -mt-0.5" />{block.fileName || 'No video selected'}</p>
        : <a className="text-[13px] text-[#2563EB] hover:underline" href={block.value} target="_blank" rel="noreferrer">{block.value || `${block.source === 'youtube' ? 'YouTube' : 'Vimeo'} link pending`}</a>;
    case 'image':
      return block.objectUrl ? (
        <div>
          <img src={block.objectUrl} alt={block.fileName} className="max-h-64 w-full object-cover rounded-[8px]" />
          {block.caption && <p className="text-[12px] text-[#6B7280] mt-2 italic">{block.caption}</p>}
        </div>
      ) : <p className="text-[12px] text-[#9CA3AF]">No image selected.</p>;
    case 'pdf':
      return <p className="text-[13px] text-[#6B7280]"><Icon.File className="w-4 h-4 inline text-[#D97706] mr-1.5 -mt-0.5" />{block.fileName || 'No PDF selected'}</p>;
    case 'quiz': {
      const exam = MOCK_EXAMS.find(e => e.id === block.examId);
      return exam ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-[#374151]">{exam.title}</span>
          <Badge variant="default">{exam.subject}</Badge>
          <Badge variant="default">{exam.questions} questions</Badge>
        </div>
      ) : <p className="text-[12px] text-[#9CA3AF]">No exam selected yet.</p>;
    }
  }
}