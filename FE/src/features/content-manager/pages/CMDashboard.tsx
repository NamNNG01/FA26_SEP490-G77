import React from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { Dropdown } from '@/components/ui/Dropdown';
import { Progress } from '@/components/ui/Progress';
import { Icon } from '@/assets/icons';

export function CMDashboard() {
  return (
    <div className="p-8 space-y-7">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[22px] font-bold text-[#111827]">Content Dashboard</h2>
          <p className="text-[14px] text-[#6B7280] mt-1">Manage questions, exams, and content quality.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" icon={<Icon.Scan className="w-4 h-4" />}>OCR Import</Button>
          <Button icon={<Icon.Plus className="w-4 h-4" />}>Add Question</Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard title="Total Questions" value="4,827" change={5.2} changeLabel="this week" icon={<Icon.Database />} color="#2563EB" />
        <StatCard title="Pending Review" value="143" change={-12} changeLabel="vs last week" icon={<Icon.AlertCircle />} color="#D97706" />
        <StatCard title="Active Exams" value="38" change={8.1} changeLabel="vs last month" icon={<Icon.ClipboardList />} color="#7C3AED" />
        <StatCard title="AI Accuracy" value="94.6%" change={1.2} changeLabel="vs last month" icon={<Icon.Brain />} color="#059669" />
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-5">
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-[#F3F4F6] flex items-center justify-between">
              <h4 className="text-[15px] font-semibold text-[#111827]">Pending AI Review</h4>
              <Badge variant="warning">143 items</Badge>
            </div>
            <div className="divide-y divide-[#F9FAFB]">
              {[
                { q: 'What is the primary advantage of using dropout regularization in neural networks?', topic: 'Deep Learning', diff: 'Medium', ai: 'Approved' },
                { q: 'Explain the difference between L1 and L2 regularization techniques.', topic: 'ML Theory', diff: 'Hard', ai: 'Flagged' },
                { q: 'Which activation function is most commonly used in hidden layers of modern networks?', topic: 'Neural Nets', diff: 'Easy', ai: 'Pending' },
                { q: 'Describe the vanishing gradient problem and how batch normalization addresses it.', topic: 'Deep Learning', diff: 'Hard', ai: 'Pending' },
              ].map((q, i) => (
                <div key={i} className="px-5 py-4 flex items-start gap-3 hover:bg-[#F9FAFB]">
                  <div className="flex-1">
                    <p className="text-[13.5px] text-[#374151] line-clamp-2">{q.q}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant="info">{q.topic}</Badge>
                      <Badge variant={q.diff === 'Hard' ? 'danger' : q.diff === 'Medium' ? 'warning' : 'success'}>{q.diff}</Badge>
                    </div>
                  </div>
                  <Badge variant={q.ai === 'Approved' ? 'success' : q.ai === 'Flagged' ? 'danger' : 'default'}>{q.ai}</Badge>
                  <Dropdown trigger={<button className="p-1.5 hover:bg-[#F3F4F6] rounded-[6px]"><Icon.MoreVertical className="w-4 h-4 text-[#9CA3AF]" /></button>}
                    items={[{ label: 'Review', icon: <Icon.Eye /> }, { label: 'Approve', icon: <Icon.Check /> }, { label: 'Reject', icon: <Icon.X />, danger: true }]} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <h4 className="text-[14px] font-semibold text-[#111827] mb-4">Question Bank Stats</h4>
            <div className="space-y-3">
              {[
                { label: 'Machine Learning', count: 1247, pct: 78 },
                { label: 'Deep Learning', count: 892, pct: 56 },
                { label: 'Statistics', count: 634, pct: 40 },
                { label: 'Python', count: 1054, pct: 66 },
              ].map(s => (
                <div key={s.label}>
                  <div className="flex justify-between mb-1">
                    <span className="text-[12px] text-[#6B7280]">{s.label}</span>
                    <span className="text-[12px] font-medium text-[#374151]">{s.count}</span>
                  </div>
                  <Progress value={s.pct} size="sm" />
                </div>
              ))}
            </div>
          </div>
          <div className="card p-5">
            <h4 className="text-[14px] font-semibold text-[#111827] mb-3">Quick Actions</h4>
            <div className="space-y-2">
              <Button variant="outline" className="w-full justify-start" size="sm" icon={<Icon.Plus className="w-4 h-4" />}>New Question</Button>
              <Button variant="outline" className="w-full justify-start" size="sm" icon={<Icon.Scan className="w-4 h-4" />}>OCR Import</Button>
              <Button variant="outline" className="w-full justify-start" size="sm" icon={<Icon.RefreshCw className="w-4 h-4" />}>Bulk AI Review</Button>
              <Button variant="outline" className="w-full justify-start" size="sm" icon={<Icon.BarChart className="w-4 h-4" />}>Generate Report</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
