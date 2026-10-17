import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Table } from '@/components/ui/Table';
import { Dropdown } from '@/components/ui/Dropdown';
import { SearchInput } from '@/components/common/SearchInput';
import { Icon } from '@/assets/icons';
import { MOCK_EXAMS } from '../mockExams';
import { MOCK_MODULES, MOCK_COURSES, modulesByCourse, moduleLabel } from '@/features/module/mockModules';

export function ExamListPage({ onNavigate }: { onNavigate?: (id: string) => void }) {
  const [sortKey, setSortKey] = useState('updated');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [course, setCourse] = useState('all');
  const [module, setModule] = useState('all');

  const moduleOptions = course === 'all'
    ? MOCK_MODULES.map(m => ({ label: m.title, value: m.id }))
    : modulesByCourse(course).map(m => ({ label: m.title, value: m.id }));

  const rows = MOCK_EXAMS.filter(e => (course === 'all' || e.course === MOCK_COURSES.find(c => c.id === course)?.title) && (module === 'all' || e.moduleId === module));

  const columns = [
    { key: 'title', label: 'Exam', render: (r: Record<string, unknown>) => <span className="text-sm font-medium text-content-secondary">{r.title as string}</span> },
    { key: 'moduleId', label: 'Module', render: (r: Record<string, unknown>) => <span className="text-sm font-medium text-content-secondary">{moduleLabel(r.moduleId as string)}</span> },
    { key: 'course', label: 'Course', render: (r: Record<string, unknown>) => <span className="text-sm text-content-soft">{r.course as string}</span> },
    { key: 'questions', label: 'Questions', sortable: true, render: (r: Record<string, unknown>) => <span className="text-sm text-content-secondary">{r.questions as number}</span> },
    { key: 'status', label: 'Status', sortable: true, render: (r: Record<string, unknown>) => <Badge variant={(r.status === 'Published' ? 'success' : r.status === 'Draft' ? 'warning' : 'default') as 'success' | 'warning' | 'default'}>{r.status as string}</Badge> },
    { key: 'updated', label: 'Updated', render: (r: Record<string, unknown>) => <span className="text-sm text-content-soft">{r.updated as string}</span> },
    { key: 'actions', label: '', render: () => (
      <Dropdown trigger={<button className="p-1.5 hover:bg-accent rounded-[6px]"><Icon.MoreHorizontal className="w-4 h-4 text-content-soft" /></button>}
        items={[{ label: 'Edit', icon: <Icon.Edit />, onClick: () => onNavigate?.('exam-edit') }, { label: 'Preview', icon: <Icon.Eye /> }, { label: 'Duplicate', icon: <Icon.Copy /> }, { divider: true } as {label: string; divider: true}, { label: 'Delete', icon: <Icon.Trash />, danger: true }]} />
    )},
  ];

  return (
    <div className="p-8 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-content">Exams</h2>
        <div className="flex gap-2">
          <Button variant="outline" icon={<Icon.Download className="w-4 h-4" />}>Export</Button>
          <Button icon={<Icon.Plus className="w-4 h-4" />} onClick={() => onNavigate?.('exam-create')}>New Exam</Button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-line-soft">
          <SearchInput className="w-full sm:w-64" placeholder="Search exams…" />
          <Select value={course} onChange={v => { setCourse(v); setModule('all'); }} options={[{ label: 'All Courses', value: 'all' }, ...MOCK_COURSES.map(c => ({ label: c.title, value: c.id }))]} className="w-full sm:w-52" />
          <Select value={module} onChange={setModule} options={[{ label: 'All Modules', value: 'all' }, ...moduleOptions]} className="w-full sm:w-52" />
          <Select value="all" options={[{ label: 'All Status', value: 'all' }, { label: 'Published', value: 'published' }, { label: 'Draft', value: 'draft' }, { label: 'Archived', value: 'archived' }]} className="w-full sm:w-36" />
          <div className="flex-1" />
          <Badge variant="default">{rows.length} active exams</Badge>
        </div>
        <Table columns={columns} data={rows as Record<string, unknown>[]} selectable resetKey={[course, module].join('|')} unit="exams" onSort={k => { sortKey === k ? setSortDir(d => d === 'asc' ? 'desc' : 'asc') : setSortKey(k); }} sortKey={sortKey} sortDir={sortDir} />
      </div>
    </div>
  );
}