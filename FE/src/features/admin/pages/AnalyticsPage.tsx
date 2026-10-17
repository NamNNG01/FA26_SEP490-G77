import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { StatCard } from '@/components/ui/StatCard';
import { Select } from '@/components/ui/Select';
import { Tabs } from '@/components/ui/Tabs';
import { Icon } from '@/assets/icons';

/** Pass-rate target drawn as a marker on every subject bar. */
const PASS_TARGET = 70;

export function AnalyticsPage() {
  const [tab, setTab] = useState('Overview');
  const passRates = [{ subject: 'Python Basics', rate: 91, exams: 1247 }, { subject: 'ML Fundamentals', rate: 73, exams: 892 }, { subject: 'Deep Learning', rate: 58, exams: 634 }, { subject: 'Statistics', rate: 79, exams: 712 }, { subject: 'SQL', rate: 88, exams: 1054 }];

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-content">Analytics & Reports</h2>
        <div className="flex gap-2">
          <Select value="30d" options={[{ label: 'Last 30 days', value: '30d' }, { label: 'Last 90 days', value: '90d' }, { label: 'This year', value: 'year' }]} />
          <Button variant="outline" icon={<Icon.Download className="w-4 h-4" />}>Export</Button>
        </div>
      </div>
      <Tabs tabs={['Overview', 'Students', 'Exams', 'AI Performance']} active={tab} onChange={setTab} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Total Exam Attempts" value="18,291" change={12.1} changeLabel="vs prev period" icon={<Icon.ClipboardList />} />
        <StatCard title="Overall Pass Rate" value="73.4%" change={-2.1} changeLabel="vs prev period" icon={<Icon.TrendingUp />} />
        <StatCard title="Avg Completion Time" value="71m" change={-5.2} changeLabel="vs prev period" icon={<Icon.Clock />} direction="neutral" />
        <StatCard title="AI Hint Usage" value="34.2%" change={8.7} changeLabel="vs prev period" icon={<Icon.Brain />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <div className="flex items-baseline justify-between gap-3 mb-5">
            <h2 className="text-lg font-semibold text-content">Pass Rate by Subject</h2>
            <span className="inline-flex items-center gap-1.5 text-xs text-content-soft">
              <span aria-hidden className="h-3 w-px bg-fill-inverse" />
              {PASS_TARGET}% target
            </span>
          </div>
          <div className="space-y-4">
            {passRates.map(p => {
              const below = p.rate < PASS_TARGET;
              return (
                <div key={p.subject} className="flex items-center gap-3">
                  <span className="text-sm text-content-secondary w-32 flex-shrink-0">{p.subject}</span>
                  {/* One hue for every bar; only subjects under target get the warning tint. */}
                  <div className="relative flex-1 h-6 bg-surface-muted rounded-[6px] overflow-hidden">
                    <div className="h-full rounded-[6px] flex items-center pl-2"
                      style={{ width: `${p.rate}%`, background: below ? '#D97706' : '#0D7C6C' }}>
                      <span className="text-2xs font-bold text-white">{p.rate}%</span>
                    </div>
                    <span aria-hidden className="absolute inset-y-0 w-px bg-fill-inverse" style={{ left: `${PASS_TARGET}%` }} />
                  </div>
                  <span className="text-xs text-content-soft whitespace-nowrap tabular-nums w-[72px] text-right">
                    {p.exams.toLocaleString('en-US')} exams
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-baseline justify-between gap-3 mb-5">
            <h2 className="text-lg font-semibold text-content">Score Distribution</h2>
            <div className="flex items-center gap-3 text-xs text-content-soft">
              <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-[3px] bg-brand-600" />Passed (71+)</span>
              <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-[3px] bg-brand-line" />Below pass</span>
            </div>
          </div>
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
                <span className="text-2xs text-content-soft">{d.pct}%</span>
                <div className="w-full rounded-t-[4px]" style={{ height: `${d.pct * 4}px`, background: d.range.startsWith('7') || d.range.startsWith('8') || d.range.startsWith('9') ? '#0D7C6C' : '#A7DCCF' }} />
                <span className="text-2xs text-content-soft leading-tight text-center">{d.range}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-center text-content-subtle">Score range distribution across 18,291 attempts</p>
        </div>
      </div>
    </div>
  );
}
