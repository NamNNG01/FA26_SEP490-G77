import React, { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/assets/icons';
import type { BlockType, ContentBlock } from '../contentBlocks';
import { blockMeta, stripHtml } from '../contentBlocks';
import { ContentBuilder } from '../components/ContentBuilder';
import { LessonPreviewModal } from '../components/LessonPreviewModal';
import { MOCK_COURSES, modulesByCourse, courseLabel, moduleLabel } from '@/features/module/mockModules';

export function LessonFormPage({ mode, onNavigate, initialCourseId, initialModuleId }: { mode: 'create' | 'edit'; onNavigate?: (id: string) => void; initialCourseId?: string; initialModuleId?: string }) {
  const isEdit = mode === 'edit';
  const [saved, setSaved] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [title, setTitle] = useState(isEdit ? 'Introduction to Gradient Descent' : '');
  const [courseId, setCourseId] = useState(initialCourseId ?? 'ml');
  const [moduleId, setModuleId] = useState(initialModuleId ?? 'mod-1');
  const [order, setOrder] = useState(isEdit ? '1' : '');
  const [duration, setDuration] = useState(isEdit ? '12' : '');
  const [description, setDescription] = useState(isEdit ? 'In this lesson you will learn how gradient descent updates model parameters to minimize the loss function.' : '');
  const [published, setPublished] = useState(isEdit);
  const [blocks, setBlocks] = useState<ContentBlock[]>(isEdit
    ? [{ id: 'blk-1', type: 'text', collapsed: false, html: '<h2>Overview</h2><p>This lesson introduces gradient descent, the workhorse optimizer behind most machine learning models.</p><ul><li>Understand the cost function</li><li>Follow one update step</li><li>See learning rate effects</li></ul>' }]
    : []);

  const moduleOptions = modulesByCourse(courseId);

  const textWordCount = blocks.reduce((acc, b) => acc + (b.type === 'text' ? stripHtml(b.html).split(/\s+/).filter(Boolean).length : 0), 0);
  const videoCount = blocks.filter(b => b.type === 'video').length;
  const readingTime = Math.max(1, Math.ceil(textWordCount / 200) + videoCount * 2);

  const typeCounts = blocks.reduce<Record<string, number>>((acc, b) => { acc[b.type] = (acc[b.type] || 0) + 1; return acc; }, {});
  const hasBlocks = blocks.length > 0;
  const canPublish = title.trim().length > 0 && courseId !== '' && moduleId !== '' && hasBlocks;

  const finish = (publishedNow: boolean) => {
    setPublished(publishedNow);
    setSaved(true);
  };

  return (
    <div className="p-8 space-y-5">
      {courseId !== '' && moduleId !== '' ? (
        <Breadcrumb items={[
          { label: 'Courses', onClick: () => onNavigate?.('cm-courses') },
          { label: courseLabel(courseId), onClick: () => onNavigate?.('course-detail') },
          { label: moduleLabel(moduleId), onClick: () => onNavigate?.('module-detail') },
          { label: isEdit && title.trim() ? title.trim() : (isEdit ? 'Edit Lesson' : 'New Lesson') },
        ]} />
      ) : (
        <Breadcrumb items={[{ label: 'Courses', onClick: () => onNavigate?.('cm-courses') }, { label: isEdit ? 'Edit Lesson' : 'New Lesson' }]} />
      )}
      <div>
        <h2 className="text-[22px] font-bold text-[#111827]">{isEdit ? 'Edit Lesson' : 'New Lesson'}</h2>
        <p className="text-[13px] text-[#6B7280] mt-1">Build lessons from mixed content blocks — text, video, image, PDF, and quizzes.</p>
      </div>

      {saved && <Alert type="success" title={published ? 'Lesson published' : 'Draft saved'} message={published ? 'The lesson is now visible to enrolled students.' : 'The lesson draft has been saved. You can continue editing or publish it later.'} />}

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6 lg:flex-1 lg:min-h-0 items-start">
        <div className="lg:col-span-7 space-y-5 lg:min-h-0 lg:overflow-y-auto lg:pr-2">
          <div className="card p-5">
            <h4 className="text-[14px] font-semibold text-[#111827] mb-4">Lesson Information</h4>
            <div className="space-y-3">
              <Input label="Lesson Title" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Introduction to Gradient Descent" />
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Select label="Course (Required)" value={courseId} onChange={v => { setCourseId(v); setModuleId(''); }} options={[{ label: 'Select course', value: '' }, ...MOCK_COURSES.map(c => ({ label: c.title, value: c.id }))]} />
                <Select label="Module (Required)" value={moduleId} onChange={setModuleId} options={[{ label: 'Select module', value: '' }, ...moduleOptions.map(m => ({ label: m.title, value: m.id }))]} />
                <Input label="Order" type="number" value={order} onChange={e => setOrder(e.target.value)} placeholder="1" />
                <Input label="Estimated Duration" type="number" value={duration} onChange={e => setDuration(e.target.value)} suffix="min" />
              </div>
              <div>
                <label className="text-[13px] font-medium text-[#374151] block mb-1.5">Description <span className="text-[#9CA3AF] font-normal">(optional)</span></label>
                <textarea className="w-full h-20 px-3 py-2 rounded-[10px] border border-[#E5E7EB] text-[13px] resize-none focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]" value={description} onChange={e => setDescription(e.target.value)} placeholder="Summarize what students will learn in this lesson…" />
              </div>
            </div>
          </div>

          <ContentBuilder blocks={blocks} onChange={setBlocks} />
        </div>

        <div className="lg:col-span-3 space-y-4 lg:sticky lg:top-0">
          <div className="card p-5">
            <h4 className="text-[14px] font-semibold text-[#111827] mb-3">Estimated Reading Time</h4>
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-[10px] bg-[#EFF6FF] flex items-center justify-center"><Icon.Clock className="w-5 h-5 text-[#2563EB]" /></span>
              <div>
                <p className="text-[18px] font-bold text-[#111827]">~{readingTime} min</p>
                <p className="text-[12px] text-[#9CA3AF]">Based on content blocks</p>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <h4 className="text-[14px] font-semibold text-[#111827] mb-3">Content Summary</h4>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] text-[#6B7280]">Number of Blocks</span>
              <span className="text-[13px] font-semibold text-[#374151]">{blocks.length}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(typeCounts) as BlockType[]).map(t => (
                <Badge key={t} variant="default" className="text-[11px]">{typeCounts[t]} {blockMeta[t].label}{typeCounts[t] > 1 ? 's' : ''}</Badge>
              ))}
              {blocks.length === 0 && <span className="text-[12px] text-[#9CA3AF]">No blocks added yet.</span>}
            </div>
          </div>

          <div className="card p-5 space-y-2">
            <Button variant="outline" className="w-full" icon={<Icon.Eye className="w-4 h-4" />} onClick={() => setShowPreview(true)}>Preview</Button>
            <Button variant="secondary" className="w-full" icon={<Icon.FileText className="w-4 h-4" />} onClick={() => finish(false)}>Save Draft</Button>
            <Button className="w-full" icon={<Icon.CheckCircle className="w-4 h-4" />} onClick={() => finish(true)} disabled={!canPublish}>Publish Lesson</Button>
            <Button variant="ghost" className="w-full" icon={<Icon.X className="w-4 h-4" />} onClick={() => onNavigate?.('course-detail')}>Cancel</Button>
            {!canPublish && <p className="text-[12px] text-[#D97706]">Add a title, course, module, and at least one content block to publish.</p>}
          </div>
        </div>
      </div>

      <LessonPreviewModal open={showPreview} onClose={() => setShowPreview(false)} title={title} blocks={blocks} />
    </div>
  );
}