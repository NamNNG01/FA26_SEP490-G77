import React, { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { Table } from '@/components/ui/Table';
import { Progress } from '@/components/ui/Progress';
import { Icon } from '@/assets/icons';

const passColor = (p: number) => p >= 70 ? 'text-[#16A34A]' : p >= 55 ? 'text-[#D97706]' : 'text-[#DC2626]';

type SortState = { key: string; dir: 'asc' | 'desc' };
const makeOnSort = (set: (fn: (prev: SortState) => SortState) => void) => (key: string) =>
  set(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
function sortRows<T extends Record<string, unknown>>(rows: T[], s: SortState): T[] {
  return [...rows].sort((a, b) => {
    const av = a[s.key]; const bv = b[s.key];
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av ?? '').localeCompare(String(bv ?? ''));
    return s.dir === 'asc' ? cmp : -cmp;
  });
}

const scoreTrend = [{ x: 'Feb', y: 58 }, { x: 'Mar', y: 61 }, { x: 'Apr', y: 64 }, { x: 'May', y: 62 }, { x: 'Jun', y: 67 }, { x: 'Jul', y: 69 }, { x: 'Aug', y: 72 }, { x: 'Sep', y: 71 }];
const passTrend = [{ x: 'Feb', y: 48 }, { x: 'Mar', y: 52 }, { x: 'Apr', y: 55 }, { x: 'May', y: 53 }, { x: 'Jun', y: 60 }, { x: 'Jul', y: 63 }, { x: 'Aug', y: 66 }, { x: 'Sep', y: 64 }];
const attemptsTrend = [{ x: 'Feb', y: 96 }, { x: 'Mar', y: 140 }, { x: 'Apr', y: 128 }, { x: 'May', y: 152 }, { x: 'Jun', y: 164 }, { x: 'Jul', y: 188 }, { x: 'Aug', y: 205 }, { x: 'Sep', y: 176 }];

function MiniChart({ title, data, color, suffix = '' }: { title: string; data: { x: string; y: number }[]; color: string; suffix?: string }) {
  const max = Math.max(...data.map(d => d.y));
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12.5px] font-medium text-[#374151]">{title}</span>
        <span className="text-[11px] text-[#9CA3AF]">Feb – Sep</span>
      </div>
      <div className="flex items-end gap-2 h-40">
        {data.map(d => (
          <div key={d.x} className="flex-1 flex flex-col items-center gap-1.5">
            <span className="text-[10px] text-[#9CA3AF]">{d.y}{suffix}</span>
            <div className="w-full flex items-end h-24">
              <div className="w-full rounded-t-[4px] chart-bar" style={{ height: `${(d.y / max) * 100}%`, background: color, minHeight: 4 }} />
            </div>
            <span className="text-[11px] text-[#9CA3AF]">{d.x}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CMDashboard({ onNavigate }: { onNavigate?: (id: string) => void }) {
  const [examSort, setExamSort] = useState<SortState>({ key: 'attempts', dir: 'desc' });
  const [diffSort, setDiffSort] = useState<SortState>({ key: 'wrongRate', dir: 'desc' });

  const exams = [
    { name: 'Midterm — Deep Learning', attempts: 240, avgScore: 71, passRate: 68, duration: 38, lastAttempt: '2h ago' },
    { name: 'Quiz 3 — Regularization', attempts: 180, avgScore: 62, passRate: 54, duration: 26, lastAttempt: '1d ago' },
    { name: 'Final — Data Structures', attempts: 310, avgScore: 74, passRate: 71, duration: 52, lastAttempt: '3d ago' },
    { name: 'Quiz 1 — Linear Models', attempts: 150, avgScore: 78, passRate: 75, duration: 24, lastAttempt: '1w ago' },
    { name: 'Practice Set — ML (Auto)', attempts: 90, avgScore: 58, passRate: 47, duration: 19, lastAttempt: '2w ago' },
    { name: 'Quiz 5 — CNNs', attempts: 120, avgScore: 66, passRate: 60, duration: 29, lastAttempt: '3w ago' },
  ];

  const difficult = [
    { q: 'Describe the vanishing gradient problem and how batch normalization addresses it.', wrongRate: 74, attempts: 142, lastUsed: '1d ago' },
    { q: 'Given the following array, trace the quicksort partition step.', wrongRate: 68, attempts: 98, lastUsed: '2d ago' },
    { q: 'Explain the difference between L1 and L2 regularization techniques.', wrongRate: 63, attempts: 121, lastUsed: '1w ago' },
    { q: 'What is the primary advantage of using dropout regularization in neural networks?', wrongRate: 58, attempts: 200, lastUsed: '1w ago' },
    { q: 'Which activation function is most commonly used in hidden layers of modern networks?', wrongRate: 54, attempts: 200, lastUsed: '3w ago' },
  ];

  const quality = [
    { label: 'Total Questions', value: 2431, pct: 100, color: '#2563EB' },
    { label: 'Published', value: 1873, pct: 77, color: '#16A34A' },
    { label: 'Draft', value: 312, pct: 13, color: '#6B7280' },
    { label: 'Never Used', value: 620, pct: 25, color: '#D97706' },
    { label: 'Frequently Incorrect', value: 89, pct: 4, color: '#EA580C' },
    { label: 'Need Review', value: 45, pct: 2, color: '#DC2626' },
  ];

  const courses = [
    { course: 'Deep Learning', lessons: 24, exams: 7, questions: 612, students: 148, avgScore: 71 },
    { course: 'Machine Learning', lessons: 30, exams: 6, questions: 840, students: 205, avgScore: 74 },
    { course: 'Data Structures', lessons: 18, exams: 5, questions: 452, students: 112, avgScore: 69 },
  ];

  return (
    <div className="p-8 space-y-7">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <StatCard title="My Courses" value="6" icon={<Icon.Book className="w-5 h-5" />} color="#2563EB" />
        <StatCard title="My Modules" value="14" icon={<Icon.Grid className="w-5 h-5" />} color="#7C3AED" />
        <StatCard title="My Lessons" value="124" icon={<Icon.Layers className="w-5 h-5" />} color="#0891B2" />
        <StatCard title="My Questions" value="2,431" icon={<Icon.Database className="w-5 h-5" />} color="#D97706" />
        <StatCard title="My Exams" value="18" icon={<Icon.ClipboardList className="w-5 h-5" />} color="#059669" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <div className="px-5 py-4 border-b border-[#F3F4F6] flex items-center justify-between">
            <h4 className="text-[15px] font-semibold text-[#111827]">Exam Performance</h4>
            <Badge variant="default">6 exams</Badge>
          </div>
          <Table
            columns={[
              { key: 'name', label: 'Exam Name' },
              { key: 'attempts', label: 'Attempts', sortable: true },
              { key: 'avgScore', label: 'Average Score', sortable: true, render: r => <span className="font-medium">{String(r.avgScore)}%</span> },
              { key: 'passRate', label: 'Pass Rate', sortable: true, render: r => <span className={`font-medium ${passColor(Number(r.passRate))}`}>{String(r.passRate)}%</span> },
              { key: 'duration', label: 'Avg Completion Time', sortable: true, render: r => `${String(r.duration)} min` },
              { key: 'lastAttempt', label: 'Last Attempt' },
            ]}
            data={sortRows(exams, examSort)}
            sortKey={examSort.key}
            sortDir={examSort.dir}
            onSort={makeOnSort(setExamSort)} />
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-[14px] font-semibold text-[#111827]">Question Quality</h4>
            <Badge variant="default">2,431 total</Badge>
          </div>
          <div className="space-y-3">
            {quality.map(m => (
              <div key={m.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: m.color }} />
                  <span className="text-[13px] text-[#374151] truncate">{m.label}</span>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="text-[13px] font-semibold text-[#111827]">{m.value.toLocaleString()}</span>
                  <span className="text-[11px] text-[#9CA3AF] ml-1.5">{m.pct}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-[15px] font-semibold text-[#111827]">Learning Analytics</h4>
          <Badge variant="info">Last 8 months</Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <MiniChart title="Average Score Trend" data={scoreTrend} color="#2563EB" suffix="%" />
          <MiniChart title="Pass Rate Trend" data={passTrend} color="#16A34A" suffix="%" />
          <MiniChart title="Number of Attempts" data={attemptsTrend} color="#7C3AED" />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[#F3F4F6] flex items-center justify-between">
          <h4 className="text-[15px] font-semibold text-[#111827]">Difficult Questions</h4>
          <Badge variant="danger">5 flagged</Badge>
        </div>
        <Table
          columns={[
            { key: 'q', label: 'Question' },
            { key: 'wrongRate', label: 'Wrong Rate', sortable: true, render: r => (
              <div className="flex items-center gap-2">
                <div className="w-16 max-w-[25%] min-w-[64px]"><Progress value={Number(r.wrongRate)} size="sm" color="#DC2626" /></div>
                <span className="font-medium text-[#DC2626]">{String(r.wrongRate)}%</span>
              </div>
            ) },
            { key: 'attempts', label: 'Attempts', sortable: true },
            { key: 'lastUsed', label: 'Last Used' },
          ]}
          data={sortRows(difficult, diffSort)}
          sortKey={diffSort.key}
          sortDir={diffSort.dir}
          onSort={makeOnSort(setDiffSort)} />
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[#F3F4F6] flex items-center justify-between">
          <h4 className="text-[15px] font-semibold text-[#111827]">Course Overview</h4>
          <Badge variant="default">3 assigned courses</Badge>
        </div>
        <Table
          columns={[
            { key: 'course', label: 'Course', render: r => <span className="font-medium text-[#111827]">{String(r.course)}</span> },
            { key: 'lessons', label: 'Lessons' },
            { key: 'exams', label: 'Exams' },
            { key: 'questions', label: 'Questions' },
            { key: 'students', label: 'Students' },
            { key: 'avgScore', label: 'Average Score', render: r => (
              <div className="flex items-center gap-2">
                <div className="w-20 max-w-[30%] min-w-[64px]"><Progress value={Number(r.avgScore)} size="sm" /></div>
                <span className="font-medium">{String(r.avgScore)}%</span>
              </div>
            ) },
          ]}
          data={courses} />
      </div>
    </div>
  );
}
