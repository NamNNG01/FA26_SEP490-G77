import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { StatCard } from '@/components/ui/StatCard';
import { Select } from '@/components/ui/Select';
import { Tabs } from '@/components/ui/Tabs';
import { Icon } from '@/assets/icons';

export function AnalyticsPage() {
  const [tab, setTab] = useState('Overview');
  const passRates = [{ subject: 'Python Basics', rate: 91, exams: 1247 }, { subject: 'ML Fundamentals', rate: 73, exams: 892 }, { subject: 'Deep Learning', rate: 58, exams: 634 }, { subject: 'Statistics', rate: 79, exams: 712 }, { subject: 'SQL', rate: 88, exams: 1054 }];

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[22px] font-bold text-[#111827]">Analytics & Reports</h2>
        <div className="flex gap-2">
          <Select value="30d" options={[{ label: 'Last 30 days', value: '30d' }, { label: 'Last 90 days', value: '90d' }, { label: 'This year', value: 'year' }]} />
          <Button variant="outline" icon={<Icon.Download className="w-4 h-4" />}>Export</Button>
        </div>
      </div>
      <Tabs tabs={['Overview', 'Students', 'Exams', 'AI Performance']} active={tab} onChange={setTab} />

      <div className="grid grid-cols-4 gap-4">
        <StatCard title="Total Exam Attempts" value="18,291" change={12.1} changeLabel="vs prev period" icon={<Icon.ClipboardList />} color="#2563EB" />
        <StatCard title="Overall Pass Rate" value="73.4%" change={-2.1} changeLabel="vs prev period" icon={<Icon.TrendingUp />} color="#D97706" />
        <StatCard title="Avg Completion Time" value="71m" change={-5.2} changeLabel="vs prev period" icon={<Icon.Clock />} color="#7C3AED" />
        <StatCard title="AI Hint Usage" value="34.2%" change={8.7} changeLabel="vs prev period" icon={<Icon.Brain />} color="#059669" />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="card p-5">
          <h4 className="text-[15px] font-semibold text-[#111827] mb-5">Pass Rate by Subject</h4>
          <div className="space-y-4">
            {passRates.map(p => (
              <div key={p.subject} className="flex items-center gap-3">
                <span className="text-[13px] text-[#374151] w-32 flex-shrink-0">{p.subject}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-6 bg-[#F3F4F6] rounded-[6px] overflow-hidden">
                      <div className="h-full rounded-[6px] flex items-center pl-2 transition-all"
                        style={{ width: `${p.rate}%`, background: p.rate >= 80 ? '#16A34A' : p.rate >= 70 ? '#2563EB' : '#D97706' }}>
                        <span className="text-[11px] font-bold text-white">{p.rate}%</span>
                      </div>
                    </div>
                    <span className="text-[11px] text-[#9CA3AF] w-14 text-right">{p.exams} exams</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h4 className="text-[15px] font-semibold text-[#111827] mb-5">Score Distribution</h4>
          <div className="flex items-end gap-2 h-40 mb-3">
            {[
              { range: '0–40', pct: 8, count: 1463 },
              { range: '41–50', pct: 11, count: 2012 },
              { range: '51–60', pct: 15, count: 2743 },
              { range: '61–70', pct: 22, count: 4024 },
              { range: '71–80', pct: 26, count: 4755 },
              { range: '81–90', pct: 13, count: 2378 },
              { range: '91–100', pct: 5, count: 916 },
            ].map(d => (
              <div key={d.range} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] text-[#9CA3AF]">{d.pct}%</span>
                <div className="w-full rounded-t-[4px]" style={{ height: `${d.pct * 4}px`, background: d.range.startsWith('7') || d.range.startsWith('8') || d.range.startsWith('9') ? '#2563EB' : '#BFDBFE' }} />
                <span className="text-[9px] text-[#9CA3AF] leading-tight text-center">{d.range}</span>
              </div>
            ))}
          </div>
          <p className="text-[12px] text-center text-[#9CA3AF]">Score range distribution across 18,291 attempts</p>
        </div>
      </div>
    </div>
  );
}
