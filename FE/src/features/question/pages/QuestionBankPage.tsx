import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Table } from '@/components/ui/Table';
import { Dropdown } from '@/components/ui/Dropdown';
import { SearchInput } from '@/components/common/SearchInput';
import { Icon } from '@/assets/icons';
import { MOCK_MODULES, MOCK_COURSES, modulesByCourse, courseLabel, moduleLabel } from '@/features/module/mockModules';

const questions = [
  { id: 'Q-1042', text: 'What is gradient descent and how does it work?', courseId: 'ml', moduleId: 'mod-3', type: 'MCQ', difficulty: 'Medium', status: 'Active', updated: '2h ago' },
  { id: 'Q-1041', text: 'Explain the bias-variance tradeoff in machine learning.', courseId: 'ml', moduleId: 'mod-1', type: 'Essay', difficulty: 'Hard', status: 'Active', updated: '4d ago' },
  { id: 'Q-1040', text: 'What is the purpose of the softmax function in classification?', courseId: 'dl', moduleId: 'mod-5', type: 'MCQ', difficulty: 'Medium', status: 'Draft', updated: '1d ago' },
  { id: 'Q-1039', text: 'How does cross-entropy loss differ from mean squared error?', courseId: 'ml', moduleId: 'mod-1', type: 'MCQ', difficulty: 'Hard', status: 'Active', updated: '1w ago' },
  { id: 'Q-1038', text: 'Is the statement "k-means is a supervised algorithm" true or false?', courseId: 'py', moduleId: 'mod-6', type: 'TrueFalse', difficulty: 'Easy', status: 'Active', updated: '3w ago' },
  { id: 'Q-1037', text: '\u201CThe p-value is the probability that the null hypothesis is true.\u201D True or false?', courseId: 'stats', moduleId: 'mod-8', type: 'TrueFalse', difficulty: 'Easy', status: 'Active', updated: '2w ago' },
  { id: 'Q-1036', text: 'How does batch normalization help training?', courseId: 'dl', moduleId: 'mod-5', type: 'Essay', difficulty: 'Hard', status: 'Draft', updated: '5h ago' },
  { id: 'Q-1035', text: 'What is regularization and why is it used in model training?', courseId: 'ml', moduleId: 'mod-2', type: 'MCQ', difficulty: 'Medium', status: 'Active', updated: '3h ago' },
  { id: 'Q-1034', text: 'Backpropagation computes gradients using the chain rule. True or false?', courseId: 'dl', moduleId: 'mod-4', type: 'TrueFalse', difficulty: 'Easy', status: 'Active', updated: '6h ago' },
  { id: 'Q-1033', text: 'Which plot is best for visualizing the distribution of a single variable?', courseId: 'stats', moduleId: 'mod-8', type: 'MCQ', difficulty: 'Medium', status: 'Active', updated: '9h ago' },
  { id: 'Q-1032', text: 'Write a Python list comprehension that squares the even numbers from 1 to 20.', courseId: 'py', moduleId: 'mod-6', type: 'Essay', difficulty: 'Easy', status: 'Draft', updated: '12h ago' },
  { id: 'Q-1031', text: 'How does L1 regularization promote sparsity compared to L2?', courseId: 'ml', moduleId: 'mod-3', type: 'MCQ', difficulty: 'Hard', status: 'Active', updated: '16h ago' },
  { id: 'Q-1030', text: 'What problem does dropout primarily mitigate in deep networks?', courseId: 'dl', moduleId: 'mod-5', type: 'MCQ', difficulty: 'Hard', status: 'Draft', updated: '20h ago' },
  { id: 'Q-1029', text: 'Is a Python tuple mutable? True or false.', courseId: 'py', moduleId: 'mod-7', type: 'TrueFalse', difficulty: 'Medium', status: 'Active', updated: '1d ago' },
  { id: 'Q-1028', text: 'The variance of a constant random variable is zero. True or false?', courseId: 'ml', moduleId: 'mod-1', type: 'TrueFalse', difficulty: 'Easy', status: 'Active', updated: '1d ago' },
  { id: 'Q-1027', text: 'Explain Type I and Type II errors with a concrete example.', courseId: 'stats', moduleId: 'mod-9', type: 'Essay', difficulty: 'Hard', status: 'Draft', updated: '2d ago' },
  { id: 'Q-1026', text: 'Describe how a decision tree selects the feature to split on at its root.', courseId: 'ml', moduleId: 'mod-2', type: 'Essay', difficulty: 'Medium', status: 'Active', updated: '2d ago' },
  { id: 'Q-1025', text: 'What happens to training when the learning rate is set too high?', courseId: 'dl', moduleId: 'mod-4', type: 'MCQ', difficulty: 'Medium', status: 'Active', updated: '3d ago' },
  { id: 'Q-1024', text: 'Which pandas method fills missing values with the previous row value?', courseId: 'py', moduleId: 'mod-6', type: 'MCQ', difficulty: 'Easy', status: 'Active', updated: '3d ago' },
  { id: 'Q-1023', text: 'The standard error of the mean decreases as sample size grows. True or false?', courseId: 'stats', moduleId: 'mod-8', type: 'TrueFalse', difficulty: 'Medium', status: 'Active', updated: '4d ago' },
  { id: 'Q-1022', text: 'Which metric is most appropriate for a highly imbalanced binary classifier?', courseId: 'ml', moduleId: 'mod-3', type: 'TrueFalse', difficulty: 'Medium', status: 'Draft', updated: '4d ago' },
  { id: 'Q-1021', text: 'Compare ResNet skip connections with a plain deep feedforward network.', courseId: 'dl', moduleId: 'mod-5', type: 'Essay', difficulty: 'Hard', status: 'Active', updated: '5d ago' },
  { id: 'Q-1020', text: 'How do you pivot a DataFrame from long format to wide format?', courseId: 'py', moduleId: 'mod-7', type: 'Essay', difficulty: 'Medium', status: 'Active', updated: '5d ago' },
  { id: 'Q-1019', text: 'What does overfitting look like on training versus validation curves?', courseId: 'ml', moduleId: 'mod-1', type: 'MCQ', difficulty: 'Easy', status: 'Active', updated: '6d ago' },
  { id: 'Q-1018', text: 'What does a 99% confidence interval communicate about an estimate?', courseId: 'stats', moduleId: 'mod-9', type: 'MCQ', difficulty: 'Medium', status: 'Draft', updated: '1w ago' },
  { id: 'Q-1017', text: 'Which Python structure is immutable: list, tuple, dict, or set?', courseId: 'ml', moduleId: 'mod-2', type: 'TrueFalse', difficulty: 'Easy', status: 'Active', updated: '1w ago' },
  { id: 'Q-1016', text: 'Explain how dropout is applied differently at train and inference time.', courseId: 'dl', moduleId: 'mod-4', type: 'Essay', difficulty: 'Medium', status: 'Active', updated: '2w ago' },
  { id: 'Q-1015', text: 'Which pandas join type keeps all rows from the left table?', courseId: 'py', moduleId: 'mod-6', type: 'TrueFalse', difficulty: 'Medium', status: 'Active', updated: '2w ago' },
];

export function QuestionBankPage({ onNavigate }: { onNavigate?: (id: string) => void }) {
  const [sortKey, setSortKey] = useState('updated');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [course, setCourse] = useState('all');
  const [module, setModule] = useState('all');
  const [type, setType] = useState('all');
  const [difficulty, setDifficulty] = useState('all');
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const moduleOptions = course === 'all'
    ? MOCK_MODULES.map(m => ({ label: m.title, value: m.id }))
    : modulesByCourse(course).map(m => ({ label: m.title, value: m.id }));

  const filtered = questions.filter(x =>
    (course === 'all' || x.courseId === course) &&
    (module === 'all' || x.moduleId === module) &&
    (type === 'all' || x.type === type) &&
    (difficulty === 'all' || x.difficulty === difficulty) &&
    (status === 'all' || x.status === status) &&
    (!q || x.text.toLowerCase().includes(q)));

  const columns = [
    { key: 'text', label: 'Question', render: (r: Record<string, unknown>) => <p className="text-[13.5px] text-[#374151] line-clamp-2">{r.text as string}</p> },
    { key: 'moduleId', label: 'Module', render: (r: Record<string, unknown>) => (
      <div>
        <Badge variant="info">{moduleLabel(r.moduleId as string)}</Badge>
        <p className="text-[11px] text-[#9CA3AF] mt-1">{courseLabel(r.courseId as string)}</p>
      </div>
    ) },
    { key: 'type', label: 'Type', sortable: true, render: (r: Record<string, unknown>) => <Badge variant={(r.type === 'Essay' ? 'purple' : r.type === 'TrueFalse' ? 'success' : 'info') as 'purple' | 'success' | 'info'}>{r.type as string}</Badge> },
    { key: 'difficulty', label: 'Difficulty', sortable: true, render: (r: Record<string, unknown>) => <Badge variant={(r.difficulty === 'Hard' ? 'danger' : r.difficulty === 'Medium' ? 'warning' : 'success') as 'danger' | 'warning' | 'success'}>{r.difficulty as string}</Badge> },
    { key: 'status', label: 'Status', sortable: true, render: (r: Record<string, unknown>) => <Badge variant={(r.status === 'Active' ? 'success' : 'default') as 'success' | 'default'}>{r.status as string}</Badge> },
    { key: 'updated', label: 'Updated', render: (r: Record<string, unknown>) => <span className="text-[13px] text-[#6B7280]">{r.updated as string}</span> },
    { key: 'actions', label: '', render: () => (
      <Dropdown trigger={<button className="p-1.5 hover:bg-[#F3F4F6] rounded-[6px]"><Icon.MoreHorizontal className="w-4 h-4 text-[#6B7280]" /></button>}
        items={[{ label: 'Edit', icon: <Icon.Edit />, onClick: () => onNavigate?.('question-edit') }, { label: 'Preview', icon: <Icon.Eye /> }, { label: 'Duplicate', icon: <Icon.Copy /> }, { divider: true } as {label: string; divider: true}, { label: 'Delete', icon: <Icon.Trash />, danger: true }]} />
    )},
  ];

  return (
    <div className="p-8 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[22px] font-bold text-[#111827]">Question</h2>
        <Button icon={<Icon.Plus className="w-4 h-4" />} onClick={() => onNavigate?.('question-create')}>Add Question</Button>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-[#F3F4F6]">
          <SearchInput className="w-full sm:w-60" placeholder="Search questions…" value={query} onChange={e => setQuery(e.target.value)} />
          <Select value={course} onChange={v => { setCourse(v); setModule('all'); }} options={[{ label: 'All Courses', value: 'all' }, ...MOCK_COURSES.map(c => ({ label: c.title, value: c.id }))]} className="w-full sm:w-52" />
          <Select value={module} onChange={setModule} options={[{ label: 'All Modules', value: 'all' }, ...moduleOptions]} className="w-full sm:w-52" />
          <Select value={type} onChange={setType} options={[{ label: 'All Types', value: 'all' }, { label: 'MCQ', value: 'MCQ' }, { label: 'True-False', value: 'TrueFalse' }, { label: 'Essay', value: 'Essay' }]} className="w-full sm:w-32" />
          <Select value={difficulty} onChange={setDifficulty} options={[{ label: 'All Difficulty', value: 'all' }, { label: 'Easy', value: 'Easy' }, { label: 'Medium', value: 'Medium' }, { label: 'Hard', value: 'Hard' }]} className="w-full sm:w-36" />
          <Select value={status} onChange={setStatus} options={[{ label: 'All Status', value: 'all' }, { label: 'Active', value: 'Active' }, { label: 'Draft', value: 'Draft' }]} className="w-full sm:w-32" />
          <div className="flex-1" />
          <Badge variant="default">{filtered.length} questions</Badge>
        </div>
        <Table columns={columns} data={filtered as Record<string, unknown>[]} selectable resetKey={[course, module, type, difficulty, status, query].join('|')} unit="questions" onSort={k => { sortKey === k ? setSortDir(d => d === 'asc' ? 'desc' : 'asc') : setSortKey(k); }} sortKey={sortKey} sortDir={sortDir} />
      </div>
    </div>
  );
}