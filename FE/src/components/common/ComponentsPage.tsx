import React, { useState } from 'react';
import {
  Button, Input, Badge, Chip, Checkbox, Radio, Switch, Select,
  Tabs, Breadcrumb, Toast, Alert, Progress, Skeleton, Modal, Avatar, StatCard,
  Table, Dropdown, Spinner, Pagination,
} from '@/components/ui';
import { SearchInput } from './SearchInput';
import { DEFAULT_PAGE_SIZE } from '@/components/ui/Pagination';
import { AnswerOption } from './QuestionPalette';
import { AIHintCard } from './AIHintCard';
import { QuestionPalette } from './QuestionPalette';
import { TimerDisplay } from './TimerDisplay';
import { CourseCard, ExamCard } from './CourseCard';
import { EditModuleModal } from '@/components/modules/EditModuleModal';
import { type CourseModule } from '@/features/module/mockModules';
import { Icon } from '@/assets/icons';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <h3 className="text-[13px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-5 pb-2 border-b border-[#F3F4F6]">{title}</h3>
    {children}
  </div>
);

const mockTableData = [
  { name: 'Alex Johnson', email: 'alex@example.com', role: 'Student', status: 'Active', score: 87 },
  { name: 'Maria Santos', email: 'maria@example.com', role: 'Student', status: 'Active', score: 92 },
  { name: 'James Kim', email: 'james@example.com', role: 'Content Manager', status: 'Active', score: null },
  { name: 'Priya Nair', email: 'priya@example.com', role: 'Student', status: 'Inactive', score: 45 },
  { name: 'Tom Williams', email: 'tom@example.com', role: 'Admin', status: 'Active', score: null },
];

export default function ComponentsPage() {
  const [tab, setTab] = useState('Overview');
  const [checked, setChecked] = useState(false);
  const [radio, setRadio] = useState('a');
  const [sw, setSw] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editModuleOpen, setEditModuleOpen] = useState(false);
  const sampleModule: CourseModule = {
    id: 'mod-sample',
    title: 'Supervised Learning',
    courseId: 'ml',
    order: 2,
    description: 'Regression and classification algorithms from first principles.',
    status: 'Active',
    updated: '2d ago',
  };
  const [answer, setAnswer] = useState<string | null>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [answered] = useState(new Set([1, 3, 5, 7, 8]));
  const [flagged] = useState(new Set([4, 6]));
  const [chips, setChips] = useState(['Machine Learning', 'Python', 'Statistics']);

  const handleSort = (key: string) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const tableColumns = [
    { key: 'name', label: 'Name', sortable: true, render: (r: Record<string, unknown>) => (
      <div className="flex items-center gap-2.5">
        <Avatar name={r.name as string} size="sm" />
        <span className="font-medium text-[#111827]">{r.name as string}</span>
      </div>
    )},
    { key: 'email', label: 'Email', sortable: true },
    { key: 'role', label: 'Role', render: (r: Record<string, unknown>) => <Badge variant={r.role === 'Admin' ? 'danger' : r.role === 'Content Manager' ? 'purple' : 'info'}>{r.role as string}</Badge> },
    { key: 'status', label: 'Status', render: (r: Record<string, unknown>) => <Badge variant={r.status === 'Active' ? 'success' : 'default'}>{r.status as string}</Badge> },
    { key: 'score', label: 'Score', sortable: true, render: (r: Record<string, unknown>) => r.score !== null ? <span className={(r.score as number) >= 80 ? 'text-[#16A34A] font-semibold' : 'text-[#DC2626] font-semibold'}>{r.score as number}%</span> : <span className="text-[#9CA3AF]">—</span> },
    { key: 'actions', label: '', width: '60px', render: () => (
      <Dropdown trigger={<button className="p-1.5 hover:bg-[#F3F4F6] rounded-[6px]"><Icon.MoreHorizontal className="w-4 h-4 text-[#6B7280]" /></button>}
        items={[
          { label: 'View Profile', icon: <Icon.Eye /> },
          { label: 'Edit', icon: <Icon.Edit /> },
          { label: 'Reset Password', icon: <Icon.Lock /> },
          { divider: true } as { label: string; divider: true },
          { label: 'Delete', icon: <Icon.Trash />, danger: true },
        ]} />
    )},
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-14">
      {/* Buttons */}
      <Section title="Buttons">
        <div className="flex flex-wrap gap-3 mb-4">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
        </div>
        <div className="flex flex-wrap gap-3 mb-4">
          <Button size="sm" icon={<Icon.Plus className="w-3.5 h-3.5" />}>Small</Button>
          <Button size="md" icon={<Icon.Plus className="w-4 h-4" />}>Medium</Button>
          <Button size="lg" icon={<Icon.Plus className="w-4.5 h-4.5" />}>Large</Button>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
          <Button variant="outline" icon={<Icon.Download className="w-4 h-4" />}>Export</Button>
          <Button variant="primary" icon={<Icon.Plus className="w-4 h-4" />}>Add Question</Button>
        </div>
      </Section>

      {/* Inputs */}
      <Section title="Inputs & Forms">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <Input label="Full Name" placeholder="John Doe" />
          <Input label="Email" placeholder="user@example.com" icon={<Icon.Mail className="w-4 h-4" />} />
          <Input label="Password" type="password" placeholder="••••••••" icon={<Icon.Lock className="w-4 h-4" />} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <Input label="With Error" placeholder="Enter value" error="This field is required" />
          <Input label="With Hint" placeholder="Enter value" hint="Must be at least 8 characters" />
          <SearchInput placeholder="Search questions…" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Select label="Difficulty" value="medium" options={[
            { label: 'Easy', value: 'easy' },
            { label: 'Medium', value: 'medium' },
            { label: 'Hard', value: 'hard' },
          ]} />
          <Select label="Subject" value="ml" options={[
            { label: 'Machine Learning', value: 'ml' },
            { label: 'Deep Learning', value: 'dl' },
            { label: 'Statistics', value: 'stat' },
          ]} />
          <Select label="Status" value="active" options={[
            { label: 'Active', value: 'active' },
            { label: 'Draft', value: 'draft' },
            { label: 'Archived', value: 'archived' },
          ]} />
        </div>
      </Section>

      {/* Checkbox / Radio / Switch */}
      <Section title="Selection Controls">
        <div className="flex flex-wrap gap-8">
          <div className="flex flex-col gap-3">
            <p className="text-[13px] font-medium text-[#374151] mb-1">Checkbox</p>
            <Checkbox label="I agree to terms" checked={checked} onChange={setChecked} />
            <Checkbox label="Checked state" checked />
            <Checkbox label="Indeterminate" indeterminate />
            <Checkbox label="Unchecked" />
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-[13px] font-medium text-[#374151] mb-1">Radio</p>
            <Radio label="Option A" checked={radio === 'a'} onChange={() => setRadio('a')} />
            <Radio label="Option B" checked={radio === 'b'} onChange={() => setRadio('b')} />
            <Radio label="Option C" checked={radio === 'c'} onChange={() => setRadio('c')} />
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-[13px] font-medium text-[#374151] mb-1">Toggle Switch</p>
            <Switch label="Enable AI hints" checked={sw} onChange={setSw} />
            <Switch label="Email notifications" checked={true} />
            <Switch label="Two-factor auth" checked={false} size="sm" />
          </div>
        </div>
      </Section>

      {/* Badges & Chips */}
      <Section title="Badges & Chips">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="info">Active</Badge>
            <Badge variant="success">Passed</Badge>
            <Badge variant="warning">Pending</Badge>
            <Badge variant="danger">Failed</Badge>
            <Badge variant="purple">AI Review</Badge>
            <Badge>Draft</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {chips.map(c => <Chip key={c} active={c === 'Machine Learning'} onRemove={() => setChips(ch => ch.filter(x => x !== c))}>{c}</Chip>)}
            <Chip onClick={() => setChips(c => [...c, 'Neural Nets'])}>+ Add Topic</Chip>
          </div>
        </div>
      </Section>

      {/* Tabs & Breadcrumb */}
      <Section title="Navigation Components">
        <div className="space-y-4">
          <Tabs tabs={['Overview', 'Questions', 'Students', 'Analytics']} active={tab} onChange={setTab} />
          <Breadcrumb items={[
            { label: 'Admin', onClick: () => {} },
            { label: 'Question', onClick: () => {} },
            { label: 'ML Fundamentals', onClick: () => {} },
            { label: 'Question #142' },
          ]} />
        </div>
      </Section>

      {/* Alerts & Toasts */}
      <Section title="Alerts & Notifications">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <Alert type="success" title="Exam Submitted" message="Your exam has been submitted successfully. Results will be available within 24 hours." />
          <Alert type="warning" title="Time Warning" message="You have 5 minutes remaining to complete this exam section." />
          <Alert type="error" title="Connection Error" message="Unable to save your answer. Please check your connection and try again." />
          <Alert type="info" title="AI Hint Available" message="An AI-generated hint is available for this question. Click to reveal." />
        </div>
        <div className="flex flex-wrap gap-3">
          <Toast type="success" message="Question saved successfully." />
          <Toast type="error" message="Failed to upload file." />
          <Toast type="warning" message="Session expires in 5 minutes." />
          <Toast type="info" message="3 new questions pending review." />
        </div>
      </Section>

      {/* Progress */}
      <Section title="Progress Indicators">
        <div className="grid grid-cols-2 gap-6">
          <div className="card p-5 space-y-4">
            <p className="text-[14px] font-semibold text-[#374151]">Linear Progress</p>
            <Progress value={92} label="AI Accuracy" color="#16A34A" size="lg" />
            <Progress value={67} label="Course Completion" color="#2563EB" />
            <Progress value={34} label="Exam Progress" color="#D97706" size="sm" />
          </div>
          <div className="card p-5 space-y-4">
            <p className="text-[14px] font-semibold text-[#374151]">Skeleton Loading</p>
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <div className="flex gap-2 mt-2">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-6 items-center mt-4 p-5 card">
          <p className="text-[14px] font-semibold text-[#374151]">Spinners</p>
          <Spinner size="sm" />
          <Spinner size="md" />
          <Spinner size="lg" />
          <Spinner size="md" color="#16A34A" />
          <Spinner size="md" color="#DC2626" />
        </div>
      </Section>

      {/* Table */}
      <Section title="Data Table">
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#F3F4F6]">
            <SearchInput className="w-full sm:w-56" placeholder="Search users…" />
            <Select value="all" options={[{ label: 'All Roles', value: 'all' }, { label: 'Student', value: 'student' }, { label: 'Admin', value: 'admin' }]} className="w-full sm:w-36" />
            <div className="flex-1" />
            <Button variant="outline" size="sm" icon={<Icon.Download className="w-3.5 h-3.5" />}>Export</Button>
            <Button size="sm" icon={<Icon.Plus className="w-3.5 h-3.5" />}>Add User</Button>
          </div>
          <Table columns={tableColumns} data={mockTableData} selectable onSort={handleSort} sortKey={sortKey} sortDir={sortDir} />
        </div>

        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-[#F3F4F6]">
            <p className="text-[13.5px] font-medium text-[#374151]">Pagination</p>
          </div>
          <Pagination page={page} total={48} perPage={DEFAULT_PAGE_SIZE} onChange={setPage} />
        </div>
      </Section>

      {/* Modal */}
      <Section title="Modal">
        <Button onClick={() => setModalOpen(true)}>Open Modal</Button>
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add New Question"
          footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button>Save Question</Button></>}>
          <div className="space-y-4">
            <Input label="Question Text" placeholder="Enter the question..." />
            <Select label="Subject" value="ml" options={[{ label: 'Machine Learning', value: 'ml' }, { label: 'Deep Learning', value: 'dl' }]} />
            <div className="grid grid-cols-2 gap-3">
              <Select label="Difficulty" value="medium" options={[{ label: 'Easy', value: 'easy' }, { label: 'Medium', value: 'medium' }, { label: 'Hard', value: 'hard' }]} />
              <Select label="Type" value="mcq" options={[{ label: 'Multiple Choice', value: 'mcq' }, { label: 'True/False', value: 'tf' }]} />
            </div>
            <Alert type="info" message="Questions will be reviewed by AI before publishing." />
          </div>
        </Modal>

        <Button variant="outline" icon={<Icon.Edit className="w-4 h-4" />} onClick={() => setEditModuleOpen(true)}>Edit Module Modal</Button>
        <EditModuleModal open={editModuleOpen} module={sampleModule} onClose={() => setEditModuleOpen(false)} onSaved={() => setEditModuleOpen(false)} />
      </Section>

      {/* Exam UI Components */}
      <Section title="Exam UI Components">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="card p-4">
              <p className="text-[13px] font-semibold text-[#374151] mb-3">Timer Display</p>
              <div className="flex gap-6">
                <TimerDisplay seconds={3725} />
                <TimerDisplay seconds={284} warning />
              </div>
            </div>
            <div className="card p-4">
              <p className="text-[13px] font-semibold text-[#374151] mb-3">Question Palette</p>
              <QuestionPalette total={15} current={3} answered={answered} flagged={flagged} onSelect={() => {}} />
            </div>
          </div>
          <div className="space-y-3">
            <div className="card p-4">
              <p className="text-[13px] font-semibold text-[#374151] mb-3">Answer Options</p>
              <div className="space-y-2">
                {[
                  { letter: 'A', text: 'Gradient descent with momentum optimization' },
                  { letter: 'B', text: 'Backpropagation with sigmoid activation' },
                  { letter: 'C', text: 'Stochastic gradient descent with L2 regularization' },
                  { letter: 'D', text: 'Adam optimizer with batch normalization' },
                ].map(opt => (
                  <AnswerOption key={opt.letter} {...opt} selected={answer === opt.letter} correct={answer === 'D' && opt.letter === 'D'} incorrect={answer === 'D' && opt.letter === 'A' && false} onChange={() => setAnswer(opt.letter)} />
                ))}
              </div>
            </div>
            <AIHintCard hint="Consider which optimization algorithm adapts the learning rate for each parameter individually, making it particularly effective for sparse gradients." expanded={hintOpen} onToggle={() => setHintOpen(o => !o)} />
          </div>
        </div>
      </Section>

      {/* Course & Exam Cards */}
      <Section title="Content Cards">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <CourseCard title="Machine Learning Fundamentals" subject="Artificial Intelligence" progress={67} examCount={8} difficulty="Medium" />
          <CourseCard title="Deep Neural Networks" subject="AI & Deep Learning" progress={23} examCount={5} difficulty="Hard" />
          <CourseCard title="Python for Data Science" subject="Programming" progress={91} examCount={12} difficulty="Easy" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ExamCard title="ML Fundamentals — Mid Exam" duration={90} questions={45} passMark={70} status="upcoming" />
          <ExamCard title="Python Basics Final" duration={60} questions={30} passMark={60} status="completed" score={87} />
          <ExamCard title="Neural Networks Quiz" duration={45} questions={20} passMark={75} status="ongoing" />
        </div>
      </Section>

      {/* Avatars */}
      <Section title="Avatars">
        <div className="flex items-center gap-4 flex-wrap">
          {['Alex Johnson', 'Maria Santos', 'James Kim', 'Priya Nair', 'Tom Williams'].map(n => (
            <div key={n} className="flex flex-col items-center gap-2">
              <Avatar name={n} size="xl" />
              <p className="text-[11px] text-[#9CA3AF]">{n.split(' ')[0]}</p>
            </div>
          ))}
          <div className="ml-4 flex -space-x-2">
            {['Alex Johnson', 'Maria Santos', 'James Kim', 'Priya Nair'].map(n => (
              <Avatar key={n} name={n} size="md" />
            ))}
            <div className="w-9 h-9 rounded-full bg-[#F3F4F6] border-2 border-white flex items-center justify-center text-[12px] font-semibold text-[#6B7280]">+8</div>
          </div>
        </div>
      </Section>

      {/* Stat Cards */}
      <Section title="Statistic Cards">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard title="Total Students" value="2,847" change={12.5} changeLabel="vs last month" icon={<Icon.Users />} color="#2563EB" />
          <StatCard title="Exams Completed" value="18,291" change={8.3} changeLabel="vs last month" icon={<Icon.ClipboardList />} color="#7C3AED" />
          <StatCard title="Avg Pass Rate" value="73.4%" change={-2.1} changeLabel="vs last month" icon={<Icon.TrendingUp />} color="#D97706" />
          <StatCard title="Certificates Issued" value="1,204" change={21.8} changeLabel="vs last month" icon={<Icon.Award />} color="#059669" />
        </div>
      </Section>
    </div>
  );
}
