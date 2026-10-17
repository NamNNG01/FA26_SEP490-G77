import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Table } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { Dropdown } from '@/components/ui/Dropdown';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Progress } from '@/components/ui/Progress';
import { Switch } from '@/components/ui/Switch';
import { Alert, Toast } from '@/components/ui/Alert';
import { Select } from '@/components/ui/Select';
import { Icon } from '@/assets/icons';
import { MOCK_COURSES, courseLabel, modulesByCourse, moduleLabel, type CourseModule } from '@/features/module/mockModules';
import { MOCK_LESSONS } from '@/features/lesson/mockLessons';
import { MOCK_QUESTION_BANK } from '@/features/exam/mockQuestionBank';
import { MOCK_EXAMS } from '@/features/exam/mockExams';
import { SectionHeader } from '@/components/ui/Card';
import { CourseOverviewPanel } from '../components/CourseOverviewPanel';
import { CourseExplorer } from '../components/CourseExplorer';
import { AddModuleModal } from '@/components/modules/AddModuleModal';
import { EditModuleModal } from '@/components/modules/EditModuleModal';

export function CourseDetailPage({ onNavigate }: { onNavigate?: (id: string, params?: Record<string, string>) => void }) {
  const [tab, setTab] = useState('Overview');
  const courseId = MOCK_COURSES[0].id;

  const [modules, setModules] = useState<CourseModule[]>(() => modulesByCourse(courseId));
  const [isAddModuleOpen, setIsAddModuleOpen] = useState(false);
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleModuleCreated = (m: CourseModule) => {
    setModules(prev => [...prev, m].sort((a, b) => a.order - b.order));
    setToast({ type: 'success', message: `Module "${m.title}" created successfully.` });
  };

  const handleModuleUpdated = (m: CourseModule) => {
    setModules(prev => prev.map(mod => (mod.id === m.id ? m : mod)).sort((a, b) => a.order - b.order));
    setToast({ type: 'success', message: `Module "${m.title}" updated successfully.` });
  };

  const editingModule = editingModuleId ? modules.find(m => m.id === editingModuleId) ?? null : null;

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(modules.filter(m => MOCK_LESSONS.some(l => l.moduleId === m.id)).map(m => m.id)));
  const toggleModule = (id: string) => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const expandAll = () => setExpanded(new Set(modules.map(m => m.id)));
  const collapseAll = () => setExpanded(new Set());
  const addLesson = (moduleId: string) => onNavigate?.('lesson-create', { courseId, moduleId });

  const totalLessons = MOCK_LESSONS.filter(l => l.courseId === courseId).length;
  const totalQuestions = MOCK_QUESTION_BANK.filter(q => q.courseId === courseId).length;
  const courseExams = MOCK_EXAMS.filter(e => modules.some(m => m.id === e.moduleId));
  const totalExams = courseExams.length;

  const course = MOCK_COURSES[0];

  const students = [
    { name: 'Aarav Mehta', progress: 92, exams: 7, lastActive: '2h ago' },
    { name: 'Linh Tran', progress: 78, exams: 5, lastActive: '1d ago' },
    { name: 'Diego Ramírez', progress: 64, exams: 3, lastActive: '3d ago' },
    { name: 'Sofia Laurent', progress: 55, exams: 2, lastActive: '1w ago' },
    { name: 'Kenji Watanabe', progress: 23, exams: 0, lastActive: '2w ago' },
  ];

  const modulePerformance = modules.map(m => ({
    module: moduleLabel(m.id),
    avg: 58 + (m.order * 7) % 40,
    pass: 52 + (m.order * 9) % 38,
    attempts: 40 + m.order * 26,
  }));

  const examColumns = [
    { key: 'title', label: 'Exam', render: (r: Record<string, unknown>) => <span className="text-sm font-medium text-content-secondary">{r.title as string}</span> },
    { key: 'moduleId', label: 'Module', render: (r: Record<string, unknown>) => <span className="text-sm text-content-soft">{moduleLabel(r.moduleId as string)}</span> },
    { key: 'questions', label: 'Questions', render: (r: Record<string, unknown>) => <span className="text-sm text-content-secondary">{r.questions as number}</span> },
    { key: 'status', label: 'Status', render: (r: Record<string, unknown>) => <Badge variant={(r.status === 'Published' ? 'success' : r.status === 'Draft' ? 'warning' : 'default') as 'success' | 'warning' | 'default'}>{r.status as string}</Badge> },
    { key: 'updated', label: 'Updated', render: (r: Record<string, unknown>) => <span className="text-sm text-content-soft">{r.updated as string}</span> },
    { key: 'actions', label: '', render: () => (
      <Dropdown trigger={<button className="p-1.5 hover:bg-accent rounded-[6px]"><Icon.MoreHorizontal className="w-4 h-4 text-content-soft" /></button>}
        items={[{ label: 'Edit', icon: <Icon.Edit />, onClick: () => onNavigate?.('exam-edit') }, { label: 'Preview', icon: <Icon.Eye /> }, { divider: true } as { label: string; divider: true }, { label: 'Delete', icon: <Icon.Trash />, danger: true }]} />
    )},
  ];

  const studentColumns = [
    { key: 'name', label: 'Student', render: (r: Record<string, unknown>) => <div className="flex items-center gap-2.5"><span className="w-7 h-7 rounded-full bg-primary-light flex items-center justify-center text-2xs font-bold text-brand-ink">{(r.name as string).split(' ').map(w => w[0]).join('')}</span><span className="text-sm font-medium text-content-secondary">{r.name as string}</span></div> },
    { key: 'progress', label: 'Progress', render: (r: Record<string, unknown>) => <div className="flex items-center gap-2 w-40"><Progress value={Number(r.progress)} size="sm" /><span className="text-xs font-medium text-content-secondary">{r.progress as number}%</span></div> },
    { key: 'exams', label: 'Exams Taken', render: (r: Record<string, unknown>) => <span className="text-sm text-content-secondary">{r.exams as number}</span> },
    { key: 'lastActive', label: 'Last Active', render: (r: Record<string, unknown>) => <span className="text-sm text-content-soft">{r.lastActive as string}</span> },
  ];

  return (
    <div className="p-8 space-y-5">
      <Breadcrumb items={[{ label: 'Courses', onClick: () => onNavigate?.('cm-courses') }, { label: courseLabel(courseId) }]} />

      <Tabs tabs={['Overview', 'Students', 'Analytics', 'Settings']} active={tab} onChange={setTab} />

      {tab !== 'Overview' && (
        <p className="text-xs text-content-subtle">{courseLabel(courseId)} <span className="text-content-faint">·</span> {tab}</p>
      )}

      {tab === 'Overview' && (
        <div className="space-y-5">
          <div>
            <SectionHeader title="Course Information" subtitle="Course details, quick stats, and shortcuts." />
            <div className="mt-3">
              <CourseOverviewPanel
                title={course.title}
                description={course.description}
                status="Published"
                manager={course.manager}
                updated={course.updated}
                stats={[
                  { label: 'Modules', value: modules.length, color: '#0D7C6C' },
                  { label: 'Lessons', value: totalLessons, color: '#7C3AED' },
                  { label: 'Exams', value: totalExams, color: '#059669' },
                  { label: 'Questions', value: totalQuestions, color: '#D97706' },
                  { label: 'Students', value: 1247, color: '#9CA3AF' },
                ]}
                onNavigate={onNavigate}
              />
            </div>
          </div>

          <div>
            <SectionHeader title="Course Structure" subtitle="Expand modules to manage their lessons." />
            <div className="mt-3">
              <CourseExplorer
                courseId={courseId}
                modules={modules}
                expanded={expanded}
                onToggleModule={toggleModule}
                onExpandAll={expandAll}
                onCollapseAll={collapseAll}
                onNavigate={onNavigate}
                onAddLesson={addLesson}
                onAddModule={() => setIsAddModuleOpen(true)}
                onEditModule={setEditingModuleId}
              />
            </div>
          </div>
        </div>
      )}

      {tab === 'Exams' && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line-soft">
            <p className="text-sm font-medium text-content-secondary">Exams for this course</p>
            <Button icon={<Icon.Plus className="w-4 h-4" />} onClick={() => onNavigate?.('exam-create')}>New Exam</Button>
          </div>
          <Table columns={examColumns} data={courseExams as Record<string, unknown>[]} />
        </div>
      )}

      {tab === 'Students' && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line-soft">
            <p className="text-sm font-medium text-content-secondary">Enrolled students</p>
            <Badge variant="default">1,247 students</Badge>
          </div>
          <Table columns={studentColumns} data={students as Record<string, unknown>[]} />
        </div>
      )}

      {tab === 'Analytics' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            {[{ label: 'Average Score', value: '71%', color: '#0D7C6C' }, { label: 'Pass Rate', value: '68%', color: '#16A34A' }, { label: 'Attempts', value: '1,842', color: '#7C3AED' }, { label: 'Completion', value: '64%', color: '#D97706' }].map(s => (
              <div key={s.label} className="card p-4 flex items-center gap-3">
                <span className="w-2 h-10 rounded-full flex-shrink-0" style={{ background: s.color }} />
                <div>
                  <p className="text-xl font-bold text-content">{s.value}</p>
                  <p className="text-xs text-content-subtle">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-line-soft">
              <p className="text-sm font-medium text-content-secondary">Module performance</p>
            </div>
            <div className="divide-y divide-line-faint">
              {modulePerformance.map(pm => (
                <div key={pm.module} className="flex items-center gap-4 px-4 py-3">
                  <span className="w-36 xl:w-44 max-w-[30%] text-sm font-medium text-content-secondary truncate" title={pm.module}>{pm.module}</span>
                  <div className="flex-1 max-w-xs"><Progress value={pm.avg} size="sm" /></div>
                  <span className="text-xs font-medium text-brand-ink">Avg {pm.avg}%</span>
                  <div className="flex-1 max-w-xs"><Progress value={pm.pass} size="sm" color="#16A34A" /></div>
                  <span className="text-xs font-medium text-success">Pass {pm.pass}%</span>
                  <span className="text-xs text-content-soft w-20 text-right">{pm.attempts} attempts</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'Settings' && (
        <WorkspaceSettings onNavigate={onNavigate} />
      )}

      <AddModuleModal open={isAddModuleOpen} courseId={courseId} onClose={() => setIsAddModuleOpen(false)} onCreated={handleModuleCreated} />

      <EditModuleModal
        open={!!editingModule}
        module={editingModule}
        onClose={() => setEditingModuleId(null)}
        onSaved={handleModuleUpdated}
      />

      {toast && (
        <div className="fixed top-4 right-4 z-[60]">
          <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />
        </div>
      )}
    </div>
  );
}

function WorkspaceSettings({ onNavigate }: { onNavigate?: (id: string) => void }) {
  const [saved, setSaved] = useState(false);
  return (
    <div className="max-w-3xl space-y-4">
      {saved && <Alert type="success" title="Settings saved" message="The course settings have been updated." />}
      <div className="card p-5 space-y-4">
        <h4 className="text-lg font-semibold text-content">Course Settings</h4>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Status" value="Published" options={[{ label: 'Draft', value: 'Draft' }, { label: 'Published', value: 'Published' }, { label: 'Archived', value: 'Archived' }]} />
          <Select label="Difficulty" value="Medium" options={[{ label: 'Easy', value: 'Easy' }, { label: 'Medium', value: 'Medium' }, { label: 'Hard', value: 'Hard' }]} />
        </div>
        <div className="space-y-3 pt-1">
          {[
            { label: 'Issue certificate on completion', desc: 'Award a certificate when students pass all exams', on: true },
            { label: 'Require completion order', desc: 'Students must finish lessons in sequence', on: false },
            { label: 'Public visibility', desc: 'Visible to enrolled students only', on: true },
          ].map(s => (
            <div key={s.label} className="flex items-start justify-between gap-4 py-3 border-t border-line-faint">
              <div>
                <p className="text-base font-medium text-content-secondary">{s.label}</p>
                <p className="text-xs text-content-subtle">{s.desc}</p>
              </div>
              <Switch checked={s.on} />
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-1">
          <Button variant="outline" onClick={() => onNavigate?.('cm-courses')}>Cancel</Button>
          <Button icon={<Icon.Check className="w-4 h-4" />} onClick={() => setSaved(true)}>Save Changes</Button>
        </div>
      </div>
    </div>
  );
}