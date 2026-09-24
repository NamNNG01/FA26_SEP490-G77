import React, { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Icon } from '@/assets/icons';
import { QuestionPreviewModal } from '@/features/exam/components/QuestionPreviewModal';
import { ModuleQuestionList } from '@/features/exam/components/ModuleQuestionList';
import type { BankQuestion } from '@/features/exam/mockQuestionBank';
import { MOCK_COURSES, modulesByCourse } from '@/features/module/mockModules';

export function ExamFormPage({ mode, onNavigate }: { mode: 'create' | 'edit'; onNavigate?: (id: string) => void }) {
  const isEdit = mode === 'edit';
  const [savedAction, setSavedAction] = useState<'' | 'draft' | 'publish'>('');
  const [preview, setPreview] = useState<BankQuestion | null>(null);
  const [title, setTitle] = useState(isEdit ? 'ML Fundamentals — Final Examination' : '');
  const [courseId, setCourseId] = useState(isEdit ? 'ml' : '');
  const [moduleId, setModuleId] = useState(isEdit ? 'mod-1' : '');
  const [duration, setDuration] = useState(isEdit ? '90' : '');
  const [attempts, setAttempts] = useState('2');
  const [passMark, setPassMark] = useState(isEdit ? '70' : '');
  const [status, setStatus] = useState(isEdit ? 'Published' : 'Draft');
  const [description, setDescription] = useState(isEdit ? 'Comprehensive final examination covering all ML Fundamentals topics from the course curriculum.' : '');
  const [selected, setSelected] = useState<BankQuestion[]>([]);

  const moduleOptions = modulesByCourse(courseId);
  const questionsCount = selected.length;
  const canPublish = title.trim().length > 0 && courseId !== '' && moduleId !== '' && questionsCount >= 1;

  const toggle = (q: BankQuestion) => {
    setSelected(prev => {
      const has = prev.some(p => p.id === q.id);
      setSavedAction('');
      return has ? prev.filter(p => p.id !== q.id) : [...prev, q];
    });
  };

  const handlePublish = () => {
    setSavedAction('publish');
  };

  const handleSaveDraft = () => {
    setSavedAction('draft');
  };

  return (
    <div className="px-8 py-6 space-y-4 lg:h-full lg:flex lg:flex-col lg:overflow-hidden">
      <Breadcrumb items={[{ label: 'Exams', onClick: () => onNavigate?.('exam-list') }, { label: isEdit ? 'Edit Exam' : 'New Exam' }]} />
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[22px] font-bold text-[#111827]">{isEdit ? 'Edit Exam' : 'New Exam'}</h2>
      </div>

      {savedAction && (
        <Alert type="success" title={savedAction === 'draft' ? 'Draft saved' : isEdit ? 'Exam updated' : 'Exam published'}
          message={savedAction === 'draft' ? 'The exam draft has been saved. You can continue editing or publish it later.' : 'The exam configuration has been saved successfully.'} />
      )}

      {/* 75/25 two-column layout: question selection (left) + sticky settings sidebar (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 lg:flex-1 lg:min-h-0 items-start">
        {/* Left (75%): Select Questions */}
        <div className="lg:col-span-3 space-y-2 lg:min-h-0 lg:overflow-y-auto lg:pr-2">
          <div className="flex items-baseline gap-2 px-1">
            <h4 className="text-[15px] font-semibold text-[#111827]">Select Questions</h4>
            <span className="text-[12px] text-[#9CA3AF]">Questions are pulled from the module chosen in the sidebar.</span>
          </div>
          <ModuleQuestionList moduleId={moduleId} selected={selected} onToggle={toggle} onPreview={setPreview} />
          {!canPublish && (
            <p className="text-[12px] text-[#D97706] px-1">Complete the sidebar fields and select at least 1 question to save the exam.</p>
          )}
        </div>

        {/* Right (25%): sticky Exam Information sidebar */}
        <div className="lg:col-span-1 min-h-0 space-y-4">
          <div className="card p-4 space-y-3 lg:sticky lg:top-0">
            <h4 className="text-[14px] font-semibold text-[#111827]">Exam Information</h4>

            <Input label="Exam Name *" value={title} onChange={e => setTitle(e.target.value)} placeholder="Enter exam name" />
            <div>
              <label className="text-[13px] font-medium text-[#374151] block mb-1.5">Description <span className="text-[#9CA3AF] font-normal">(optional)</span></label>
              <textarea className="w-full h-14 px-3 py-2 rounded-[10px] border border-[#E5E7EB] text-[13px] resize-none focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]" value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the exam scope..." />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input label="Duration (min) *" type="number" value={duration} onChange={e => setDuration(e.target.value)} suffix="min" />
              <Input label="Pass Score (%) *" type="number" value={passMark} onChange={e => setPassMark(e.target.value)} suffix="%" />
            </div>
            <Select label="Status" value={status} onChange={setStatus} options={[{ label: 'Draft', value: 'Draft' }, { label: 'Published', value: 'Published' }, { label: 'Archived', value: 'Archived' }]} />
            <Select label="Attempts Allowed" value={attempts} onChange={setAttempts} options={[{ label: '1 attempt', value: '1' }, { label: '2 attempts', value: '2' }, { label: 'Unlimited', value: '0' }]} />

            <div className="pt-1 border-t border-[#F3F4F6]">
              <Select
                label="Course *"
                value={courseId}
                onChange={v => { setCourseId(v); setModuleId(''); }}
                options={[{ label: 'Select Course', value: '' }, ...MOCK_COURSES.map(c => ({ label: c.title, value: c.id }))]}
              />
            </div>
            <Select
              label="Module *"
              value={moduleId}
              onChange={setModuleId}
              disabled={courseId === ''}
              options={[{ label: 'Select Module', value: '' }, ...moduleOptions.map(m => ({ label: m.title, value: m.id }))]}
            />

            {questionsCount > 0 && (
              <p className="text-[12px] text-[#16A34A] font-medium">{questionsCount} question{questionsCount === 1 ? '' : 's'} selected</p>
            )}

            <div className="flex items-center gap-2 pt-2 border-t border-[#F3F4F6]">
              <Button className="flex-1" icon={<Icon.CheckCircle className="w-4 h-4" />} onClick={handlePublish} disabled={!canPublish}>Save Exam</Button>
              <Button variant="secondary" onClick={() => onNavigate?.('exam-list')}>Cancel</Button>
            </div>
          </div>
        </div>
      </div>

      <QuestionPreviewModal question={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
