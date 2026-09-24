import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { StatCard } from '@/components/ui/StatCard';
import { Progress } from '@/components/ui/Progress';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/assets/icons';

const usageData = [
  { model: 'certifyai-v3.2', type: 'Question review', tokens: '48.2M', requests: 124301, cost: '$1,204', quota: 78, color: '#2563EB', status: 'Healthy' },
  { model: 'certifyai-v3.2', type: 'AI hints', tokens: '22.1M', requests: 89342, cost: '$553', quota: 41, color: '#7C3AED', status: 'Healthy' },
  { model: 'certifyai-v3.2', type: 'Answer generation', tokens: '15.4M', requests: 62311, cost: '$386', quota: 26, color: '#059669', status: 'Healthy' },
  { model: 'certifyai-v2.8', type: 'Fallback inferences', tokens: '3.8M', requests: 12412, cost: '$95', quota: 12, color: '#D97706', status: 'Deprecated' },
  { model: 'embed-v2', type: 'Embeddings', tokens: '1.2M', requests: 384207, cost: '$18', quota: 8, color: '#DC2626', status: 'Healthy' },
];

const dailyData = [
  { day: 'Mon', tokens: 42 }, { day: 'Tue', tokens: 55 }, { day: 'Wed', tokens: 48 },
  { day: 'Thu', tokens: 61 }, { day: 'Fri', tokens: 74 }, { day: 'Sat', tokens: 38 }, { day: 'Sun', tokens: 51 },
];
const maxTokens = Math.max(...dailyData.map(d => d.tokens));

export function AIUsagePage() {
  const [period, setPeriod] = useState('30d');
  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-wrap justify-end gap-2">
        <Select value={period} onChange={setPeriod} options={[{ label: 'Last 30 days', value: '30d' }, { label: 'Last 90 days', value: '90d' }, { label: 'This year', value: 'year' }]} />
        <Button variant="outline" icon={<Icon.Download className="w-4 h-4" />}>Export</Button>
      </div>

      <Alert type="warning" title="Quota warning" message="Usage grew 12% this week. If growth holds, the monthly token quota will be exceeded in ~6 days. Consider raising the quota or optimizing hint generation." />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Total Tokens" value="90.7M" change={12.3} changeLabel="vs prev period" icon={<Icon.Brain />} color="#7C3AED" />
        <StatCard title="Total Requests" value="652K" change={8.1} changeLabel="vs prev period" icon={<Icon.Zap />} color="#2563EB" />
        <StatCard title="Total Cost" value="$2,256" change={9.4} changeLabel="vs prev period" icon={<Icon.TrendingUp />} color="#059669" />
        <StatCard title="Error Rate" value="0.42%" change={-0.3} changeLabel="vs prev period" icon={<Icon.AlertCircle />} color="#D97706" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-5">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-5">
              <h4 className="text-[15px] font-semibold text-[#111827]">Daily Token Usage (Millions)</h4>
              <div className="text-[12px] text-[#9CA3AF]">Last 7 days</div>
            </div>
            <div className="flex items-end gap-3 h-40">
              {dailyData.map(d => (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="w-full h-32 flex items-end">
                    <div className="w-full rounded-t-[4px] chart-bar" style={{ height: `${(d.tokens / maxTokens) * 100}%`, background: '#7C3AED', minHeight: 4 }} />
                  </div>
                  <span className="text-[11px] text-[#9CA3AF]">{d.day}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <h4 className="text-[14px] font-semibold text-[#111827] mb-4">Monthly Quota Utilization</h4>
            <Progress value={78} label="Token quota" color="#7C3AED" />
            <p className="text-[12px] text-[#9CA3AF] mt-3">78.2M of 100M tokens used. Resets in 6 days.</p>
          </div>
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-[#F3F4F6]"><h4 className="text-[14px] font-semibold text-[#111827]">Model Health</h4></div>
            <div className="divide-y divide-[#F9FAFB]">
              {['certifyai-v3.2', 'embed-v2'].map(model => (
                <div key={model} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-2 h-2 rounded-full bg-[#16A34A] flex-shrink-0" />
                  <p className="text-[13px] font-medium text-[#374151] flex-1">{model}</p>
                  <span className="text-[12px] text-[#9CA3AF]">Operational</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[#F3F4F6]"><h4 className="text-[15px] font-semibold text-[#111827]">Usage by Feature</h4></div>
        <div className="divide-y divide-[#F9FAFB]">
          {usageData.map((u, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#F9FAFB]">
              <div className="w-2 h-8 rounded-full flex-shrink-0" style={{ background: u.color }} />
              <div className="w-44">
                <p className="text-[13.5px] font-medium text-[#374151]">{u.type}</p>
                <p className="text-[11px] text-[#9CA3AF]">{u.model}</p>
              </div>
              <div className="flex-1"><Progress value={u.quota} size="sm" /></div>
              <div className="w-24 text-right">
                <p className="text-[13px] font-semibold text-[#374151]">{u.tokens}</p>
                <p className="text-[11px] text-[#9CA3AF]">{u.requests.toLocaleString()} calls</p>
              </div>
              <span className="text-[13px] font-medium text-[#059669] w-20 text-right">{u.cost}</span>
              <Badge variant={u.status === 'Healthy' ? 'success' : 'warning'}>{u.status}</Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}