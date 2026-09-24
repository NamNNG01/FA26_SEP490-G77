import React, { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dropdown } from '@/components/ui/Dropdown';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Icon } from '@/assets/icons';
import { MOCK_EXAMS } from '@/features/exam/mockExams';
import type { BlockType, ContentBlock } from '../contentBlocks';
import { blockMeta, defaultBlock } from '../contentBlocks';
import { ContentBlockCard } from './ContentBlockCard';
import { RichTextEditor } from './RichTextEditor';
import { UploadArea } from './UploadArea';

const ADD_ITEMS: { type: BlockType }[] = [{ type: 'text' }, { type: 'video' }, { type: 'image' }, { type: 'pdf' }, { type: 'quiz' }];

function VideoBody({ block, onPatch }: { block: Extract<ContentBlock, { type: 'video' }>; onPatch: (patch: Partial<ContentBlock>) => void }) {
  const sources: { id: 'upload' | 'youtube' | 'vimeo'; label: string }[] = [
    { id: 'upload', label: 'Upload' },
    { id: 'youtube', label: 'YouTube' },
    { id: 'vimeo', label: 'Vimeo' },
  ];
  return (
    <div className="space-y-3">
      <div className="inline-flex items-center rounded-[8px] border border-[#E5E7EB] overflow-hidden">
        {sources.map(s => (
          <button key={s.id} type="button" onClick={() => onPatch({ source: s.id })}
            className={`px-3 py-1.5 text-[12px] font-medium transition-colors ${block.source === s.id ? 'bg-[#2563EB] text-white' : 'bg-white text-[#6B7280] hover:bg-[#F9FAFB]'}`}>
            {s.label}
          </button>
        ))}
      </div>

      {block.source === 'upload' ? (
        block.fileName ? (
          <div className="flex items-center gap-3 rounded-[10px] border border-[#E5E7EB] px-4 py-3">
            <Icon.Video className="w-5 h-5 text-[#DC2626]" />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-[#374151] truncate">{block.fileName}</p>
              <p className="text-[11px] text-[#9CA3AF]">Video uploaded</p>
            </div>
            <div className="flex-1" />
            <button type="button" onClick={() => onPatch({ fileName: '', value: '' })} className="text-[12px] font-medium text-[#2563EB] hover:underline">Replace</button>
          </div>
        ) : (
          <UploadArea accept="video/*" hint="MP4, WebM, MOV" onFile={f => onPatch({ fileName: f.fileName })} />
        )
      ) : (
        <Input label={block.source === 'youtube' ? 'YouTube URL' : 'Vimeo URL'}
          value={block.value}
          onChange={e => onPatch({ value: e.target.value })}
          placeholder={block.source === 'youtube' ? 'https://www.youtube.com/watch?v=…' : 'https://vimeo.com/…'} />
      )}
    </div>
  );
}

function ImageBody({ block, onPatch }: { block: Extract<ContentBlock, { type: 'image' }>; onPatch: (patch: Partial<ContentBlock>) => void }) {
  return (
    <div className="space-y-3">
      {block.objectUrl ? (
        <div className="rounded-[10px] border border-[#E5E7EB] overflow-hidden">
          <img src={block.objectUrl} alt={block.fileName} className="max-h-56 w-full object-cover" />
          <div className="flex items-center gap-2 px-3 py-2 bg-[#F9FAFB]">
            <Icon.Image className="w-4 h-4 text-[#7C3AED]" />
            <span className="text-[12px] text-[#374151] truncate flex-1">{block.fileName}</span>
            <button type="button" onClick={() => onPatch({ fileName: '', objectUrl: '' })} className="text-[12px] font-medium text-[#2563EB] hover:underline">Replace</button>
          </div>
        </div>
      ) : (
        <UploadArea accept="image/*" hint="PNG, JPG, GIF" onFile={f => onPatch({ fileName: f.fileName, objectUrl: f.objectUrl })} />
      )}
      <Input label="Caption" value={block.caption} onChange={e => onPatch({ caption: e.target.value })} placeholder="Add an optional caption…" />
    </div>
  );
}

export function ContentBuilder({ blocks, onChange }: { blocks: ContentBlock[]; onChange: (b: ContentBlock[]) => void }) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const add = (type: BlockType) => onChange([...blocks, defaultBlock(type)]);
  const patch = (id: string, p: Partial<ContentBlock>) => onChange(blocks.map(b => b.id === id ? { ...b, ...p } as ContentBlock : b));
  const remove = (id: string) => onChange(blocks.filter(b => b.id !== id));
  const toggleCollapse = (id: string) => onChange(blocks.map(b => b.id === id ? { ...b, collapsed: !b.collapsed } : b));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= blocks.length || from === to) return;
    const next = [...blocks];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    onChange(next);
  };

  const renderBody = (b: ContentBlock) => {
    switch (b.type) {
      case 'text': return <RichTextEditor html={b.html} onChange={html => patch(b.id, { html })} />;
      case 'video': return <VideoBody block={b} onPatch={p => patch(b.id, p)} />;
      case 'image': return <ImageBody block={b} onPatch={p => patch(b.id, p)} />;
      case 'pdf':
        return b.fileName ? (
          <div className="flex items-center gap-3 rounded-[10px] border border-[#E5E7EB] px-4 py-3">
            <Icon.File className="w-5 h-5 text-[#D97706]" />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-[#374151] truncate">{b.fileName}</p>
              {b.size && <p className="text-[11px] text-[#9CA3AF]">{b.size}</p>}
            </div>
            <div className="flex-1" />
            <button type="button" onClick={() => patch(b.id, { fileName: '', size: '' })} className="text-[12px] font-medium text-[#2563EB] hover:underline">Replace</button>
          </div>
        ) : (
          <UploadArea accept="application/pdf" hint="PDF documents only" onFile={f => patch(b.id, { fileName: f.fileName, size: f.size })} />
        );
      case 'quiz': {
        const exam = MOCK_EXAMS.find(e => e.id === b.examId);
        return (
          <div className="space-y-3">
            <Select label="Existing Exam" value={b.examId}
              options={[{ label: 'Select an existing exam…', value: '' }, ...MOCK_EXAMS.map(e => ({ label: e.title, value: e.id }))]}
              onChange={examId => patch(b.id, { examId })} />
            {exam && (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="default">{exam.subject}</Badge>
                <Badge variant="default">{exam.questions} questions</Badge>
                <Badge variant="default">{exam.duration} min</Badge>
              </div>
            )}
            <p className="text-[12px] text-[#9CA3AF]">Create new exams from the Exams area — quizzes reference an existing exam.</p>
          </div>
        );
      }
    }
  };

  const quizExam = (b: ContentBlock) => b.type === 'quiz' ? MOCK_EXAMS.find(e => e.id === b.examId) : undefined;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-[14px] font-semibold text-[#111827]">Content Builder</h4>
        <Dropdown
          trigger={<Button icon={<Icon.Plus className="w-4 h-4" />}>Add Block</Button>}
          items={ADD_ITEMS.map(i => ({ label: blockMeta[i.type].label, icon: blockMeta[i.type].icon, onClick: () => add(i.type) }))} />
      </div>

      {blocks.length === 0 ? (
        <div className="border border-dashed border-[#D1D5DB] rounded-[10px] px-4 py-10 text-center">
          <p className="text-[13px] text-[#9CA3AF]">No content blocks yet. Click <span className="font-medium text-[#2563EB]">Add Block</span> to build this lesson.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {blocks.map((b, i) => {
            const exam = quizExam(b);
            return (
              <ContentBlockCard key={b.id} block={b}
                sub={exam ? <Badge variant="purple" className="text-[11px]">{exam.title}</Badge> : undefined}
                onToggle={() => toggleCollapse(b.id)}
                onDelete={() => remove(b.id)}
                onDragStart={() => setDragIndex(i)}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); if (dragIndex !== null) move(dragIndex, i); setDragIndex(null); }}>
                {renderBody(b)}
              </ContentBlockCard>
            );
          })}
        </div>
      )}
    </div>
  );
}