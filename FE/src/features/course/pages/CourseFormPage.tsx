import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Dropdown } from '@/components/ui/Dropdown';
import { Alert } from '@/components/ui/Alert';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Icon } from '@/assets/icons';

const formFields = {
  title: 'Machine Learning Fundamentals',
  subject: 'AI & Data Science',
  difficulty: 'Medium',
  status: 'Published',
};

export function CourseFormPage({ mode, onNavigate }: { mode: 'create' | 'edit'; onNavigate?: (id: string) => void }) {
  const [saved, setSaved] = useState(false);
  const isEdit = mode === 'edit';

  return (
    <div className="p-8 space-y-5">
      <Breadcrumb items={[{ label: 'Courses', onClick: () => onNavigate?.('course-list') }, { label: isEdit ? 'Edit Course' : 'Create Course' }]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-content">{isEdit ? 'Edit Course' : 'Create Course'}</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" icon={<Icon.Eye className="w-4 h-4" />}>Preview</Button>
          <Button variant="secondary" onClick={() => onNavigate?.('course-list')}>Cancel</Button>
          <Button icon={<Icon.Check className="w-4 h-4" />} onClick={() => setSaved(true)}>{isEdit ? 'Save Changes' : 'Create Course'}</Button>
        </div>
      </div>

      {saved && <Alert type="success" title={isEdit ? 'Course updated' : 'Course created'} message="The course has been saved successfully." />}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-lg font-semibold text-content">Course Details</h4>
            {isEdit && (
              <Dropdown trigger={<button className="text-content-subtle hover:text-content-secondary"><Icon.MoreVertical className="w-5 h-5" /></button>}
                items={[{ label: 'Duplicate', icon: <Icon.Copy /> }, { label: 'Archive', icon: <Icon.Lock /> }, { divider: true } as { label: string; divider: true }, { label: 'Delete', icon: <Icon.Trash />, danger: true }]} />
            )}
          </div>
          <Input label="Course Title" defaultValue={isEdit ? formFields.title : ''} placeholder="e.g. Machine Learning Fundamentals" />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Subject" value={isEdit ? formFields.subject : 'ai'} options={[{ label: 'AI & Data Science', value: 'AI & Data Science' }, { label: 'Programming', value: 'Programming' }, { label: 'Mathematics', value: 'Mathematics' }, { label: 'Data Engineering', value: 'Data Engineering' }]} />
            <Select label="Difficulty" value={isEdit ? formFields.difficulty : 'medium'} options={[{ label: 'Easy', value: 'Easy' }, { label: 'Medium', value: 'Medium' }, { label: 'Hard', value: 'Hard' }]} />
          </div>
          <div>
            <label className="text-sm font-medium text-content-secondary block mb-1.5">Description</label>
            <textarea className="w-full h-28 px-3 py-2.5 rounded-[10px] border border-line text-base text-content resize-none focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600" placeholder="Describe the course curriculum, objectives, and target audience..." />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input label="Estimated Hours" type="number" defaultValue="30" />
            <Select label="Status" value={isEdit ? formFields.status : 'draft'} options={[{ label: 'Draft', value: 'Draft' }, { label: 'Published', value: 'Published' }, { label: 'Archived', value: 'Archived' }]} />
          </div>
        </div>
        <div className="space-y-4">
          <div className="card p-5">
            <h4 className="text-base font-semibold text-content mb-4">Course Summary</h4>
            <div className="space-y-3">
              {[{ label: 'Modules', value: isEdit ? '3' : '—' }, { label: 'Lessons', value: isEdit ? '24' : '—' }, { label: 'Exams', value: isEdit ? '8' : '—' }, { label: 'Questions', value: isEdit ? '184' : '—' }, { label: 'Students', value: isEdit ? '1,247' : '—' }].map(s => (
                <div key={s.label} className="flex justify-between">
                  <span className="text-sm text-content-soft">{s.label}</span>
                  <span className="text-sm font-semibold text-content-secondary">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
          <Alert type="info" message="Content managers can add lessons, questions, and exams after the course shell is created." />
        </div>
      </div>
    </div>
  );
}