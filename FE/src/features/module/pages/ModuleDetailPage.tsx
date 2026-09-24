import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Table } from '@/components/ui/Table';
import { Dropdown } from '@/components/ui/Dropdown';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Tooltip } from '@/components/ui/Tooltip';
import { Icon } from '@/assets/icons';
import { MOCK_MODULES, courseLabel, moduleLabel } from '../mockModules';
import { EditModuleModal } from '@/components/modules/EditModuleModal';
import { type CourseModule } from '../mockModules';
import { MOCK_LESSONS } from '@/features/lesson/mockLessons';
import { MOCK_QUESTION_BANK } from '@/features/exam/mockQuestionBank';
import { blockVariant } from '@/features/lesson/contentBlocks';

const MODEL_DEFAULT = 'mod-1';

export function ModuleDetailPage({ onNavigate }: { onNavigate?: (id: string) => void }) {
  const [sortKey, setSortKey] = useState('order');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [editingModule, setEditingModule] = useState<CourseModule | null>(null);
  const [currentModule, setCurrentModule] = useState<CourseModule>(() => MOCK_MODULES.find(m => m.id === MODEL_DEFAULT) ?? MOCK_MODULES[0]);
  const module = currentModule;
  const lessons = MOCK_LESSONS.filter(l => l.moduleId === module.id).sort((a, b) => a.order - b.order);
  const questionCount = MOCK_QUESTION_BANK.filter(q => q.moduleId === module.id).length;
  const lessonDuration = lessons.reduce((s, l) => s + (parseInt(l.duration, 10) || 0), 0);

  const columns = [
    { key: 'title', label: 'Lesson', sortable: true, render: (r: Record<string, unknown>) => <span className="text-[13.5px] font-medium text-[#374151]">{r.title as string}</span> },
    { key: 'order', label: 'Order', sortable: true, render: (r: Record<string, unknown>) => <span className="text-[13px] text-[#374151]">{r.order as number}</span> },
    { key: 'blocks', label: 'Content Blocks', render: (r: Record<string, unknown>) => {
      const list = r.blocks as string[];
      return (
        <Tooltip label={<span className="flex flex-wrap gap-1">{list.map(b => <Badge key={b} variant={blockVariant(b) as 'info' | 'purple' | 'warning' | 'success' | 'default'} className="text-[10px]">{b}</Badge>)}</span>}>
          <span className="text-[13px] text-[#374151] cursor-help">{list.length} Block{list.length > 1 ? 's' : ''}</span>
        </Tooltip>
      );
    }},
    { key: 'duration', label: 'Duration', render: (r: Record<string, unknown>) => <span className="text-[13px] text-[#6B7280]">{r.duration as string}</span> },
    { key: 'status', label: 'Status', sortable: true, render: (r: Record<string, unknown>) => <Badge variant={(r.status === 'Published' ? 'success' : r.status === 'Draft' ? 'warning' : 'default') as 'success' | 'warning' | 'default'}>{r.status as string}</Badge> },
    { key: 'updated', label: 'Updated', render: (r: Record<string, unknown>) => <span className="text-[13px] text-[#6B7280]">{r.updated as string}</span> },
    { key: 'actions', label: '', render: () => (
      <Dropdown trigger={<button className="p-1.5 hover:bg-[#F3F4F6] rounded-[6px]"><Icon.MoreHorizontal className="w-4 h-4 text-[#6B7280]" /></button>}
        items={[{ label: 'Edit', icon: <Icon.Edit />, onClick: () => onNavigate?.('lesson-edit') }, { label: 'Duplicate', icon: <Icon.Copy /> }, { divider: true } as { label: string; divider: true }, { label: 'Delete', icon: <Icon.Trash />, danger: true }]} />
    )},
  ];

  return (
    <div className="p-8 space-y-5">
      <Breadcrumb items={[
        { label: 'Courses', onClick: () => onNavigate?.('cm-courses') },
        { label: courseLabel(module.courseId), onClick: () => onNavigate?.('course-detail') },
        { label: module.title },
      ]} />

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-[10px] bg-[#EFF6FF] flex items-center justify-center"><Icon.Grid className="w-5 h-5 text-[#2563EB]" /></span>
            <div>
              <h2 className="text-[22px] font-bold text-[#111827]">{module.title}</h2>
              <p className="text-[12.5px] text-[#6B7280]">Module {module.order} · {courseLabel(module.courseId)}</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" icon={<Icon.Edit className="w-4 h-4" />} onClick={() => setEditingModule(module)}>Edit Module</Button>
          <Button icon={<Icon.Plus className="w-4 h-4" />} onClick={() => onNavigate?.('lesson-create')}>New Lesson</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[{ label: 'Lessons', value: String(lessons.length), color: '#7C3AED' }, { label: 'Questions', value: String(questionCount), color: '#D97706' }, { label: 'Estimated Duration', value: `${lessonDuration} min`, color: '#2563EB' }, { label: 'Status', value: module.status, color: module.status === 'Active' ? '#16A34A' : module.status === 'Draft' ? '#D97706' : '#9CA3AF' }].map(s => (
          <div key={s.label} className="card p-4 flex items-center gap-3">
            <div className="w-2 h-10 rounded-full flex-shrink-0" style={{ background: s.color }} />
            <div>
              <p className="text-[20px] font-bold text-[#111827]">{s.value}</p>
              <p className="text-[12px] text-[#9CA3AF]">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between">
          <h4 className="text-[14px] font-semibold text-[#111827]">Module Information</h4>
          <Badge variant={module.status === 'Active' ? 'success' : module.status === 'Draft' ? 'warning' : 'default'}>{module.status}</Badge>
        </div>
        <p className="text-[13px] text-[#6B7280] leading-relaxed mt-2">{module.description}</p>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#F3F4F6]">
          <p className="text-[13.5px] font-medium text-[#374151]">Lessons</p>
          <Badge variant="default">{lessons.length} lessons</Badge>
        </div>
        <Table columns={columns} data={lessons as Record<string, unknown>[]} selectable onSort={k => { sortKey === k ? setSortDir(d => d === 'asc' ? 'desc' : 'asc') : setSortKey(k); }} sortKey={sortKey} sortDir={sortDir} />
      </div>

      <EditModuleModal
        open={!!editingModule}
        module={editingModule}
        onClose={() => setEditingModule(null)}
        onSaved={(m) => { setCurrentModule(m); setEditingModule(null); }}
      />
    </div>
  );
}