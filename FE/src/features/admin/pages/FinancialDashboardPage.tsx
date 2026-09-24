import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { StatCard } from '@/components/ui/StatCard';
import { Icon } from '@/assets/icons';

const revenueData = [
  { month: 'Apr', revenue: 8200, subs: 940 },
  { month: 'May', revenue: 10100, subs: 1120 },
  { month: 'Jun', revenue: 12400, subs: 1340 },
  { month: 'Jul', revenue: 11300, subs: 1280 },
  { month: 'Aug', revenue: 15900, subs: 1730 },
  { month: 'Sep', revenue: 21400, subs: 2210 },
];
const maxRevenue = Math.max(...revenueData.map(d => d.revenue));

const transactions = [
  { id: 'INV-4821', customer: 'Alexandra Chen', plan: 'Pro Monthly', amount: '$29.00', date: '2026-09-21', status: 'Paid' },
  { id: 'INV-4820', customer: 'FPT University', plan: 'Enterprise', amount: '$1,200.00', date: '2026-09-21', status: 'Paid' },
  { id: 'INV-4819', customer: 'Marcus Johnson', plan: 'Pro Monthly', amount: '$29.00', date: '2026-09-20', status: 'Paid' },
  { id: 'INV-4818', customer: 'DataCamp Vietnam', plan: 'Team', amount: '$320.00', date: '2026-09-19', status: 'Failed' },
  { id: 'INV-4817', customer: 'Priya Nair', plan: 'Pro Annual', amount: '$240.00', date: '2026-09-18', status: 'Paid' },
];

export function FinancialDashboardPage() {
  const [period, setPeriod] = useState('30d');
  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-wrap justify-end gap-2">
        <Select value={period} onChange={setPeriod} options={[{ label: 'Last 30 days', value: '30d' }, { label: 'Last 90 days', value: '90d' }, { label: 'This year', value: 'year' }]} />
        <Button variant="outline" icon={<Icon.Download className="w-4 h-4" />}>Export</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Total Revenue" value="$92,400" change={14.2} changeLabel="vs prev period" icon={<Icon.TrendingUp />} color="#16A34A" />
        <StatCard title="MRR" value="$21,400" change={8.6} changeLabel="vs prev period" icon={<Icon.BarChart />} color="#2563EB" />
        <StatCard title="Active Subscriptions" value="2,210" change={9.1} changeLabel="vs prev period" icon={<Icon.Users />} color="#7C3AED" />
        <StatCard title="Refunds" value="$640" change={-12.4} changeLabel="vs prev period" icon={<Icon.AlertCircle />} color="#DC2626" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-5">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-5">
              <h4 className="text-[15px] font-semibold text-[#111827]">Revenue Trend</h4>
              <div className="flex items-center gap-4 text-[12px]">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-[3px] bg-[#16A34A]" /><span className="text-[#6B7280]">Revenue ($)</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-[3px] bg-[#BFDBFE]" /><span className="text-[#6B7280]">Subscriptions</span></div>
              </div>
            </div>
            <div className="flex items-end gap-3 h-40">
              {revenueData.map(d => (
                <div key={d.month} className="flex-1 flex flex-col items-center gap-1.5">
                  <span className="text-[10px] text-[#9CA3AF]">{Math.round(d.revenue / 1000)}k</span>
                  <div className="w-full flex items-end gap-1 h-28">
                    <div className="flex-1 rounded-t-[4px] chart-bar" style={{ height: `${(d.revenue / maxRevenue) * 100}%`, background: '#16A34A', minHeight: 4 }} />
                    <div className="flex-1 rounded-t-[4px] chart-bar" style={{ height: `${(d.subs / 2210) * 100}%`, background: '#BFDBFE', minHeight: 4 }} />
                  </div>
                  <span className="text-[11px] text-[#9CA3AF]">{d.month}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-[#F3F4F6] flex items-center justify-between">
              <h4 className="text-[15px] font-semibold text-[#111827]">Recent Transactions</h4>
              <Button variant="ghost" size="sm">View All</Button>
            </div>
            <div className="divide-y divide-[#F9FAFB]">
              {transactions.map(t => (
                <div key={t.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#F9FAFB]">
                  <div className="w-9 h-9 rounded-[10px] bg-[#F3F4F6] flex items-center justify-center flex-shrink-0">
                    <Icon.FileText className="w-4 h-4 text-[#6B7280]" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[13.5px] font-medium text-[#374151]">{t.customer}</p>
                    <p className="text-[12px] text-[#9CA3AF]">{t.id} · {t.plan}</p>
                  </div>
                  <Badge variant={t.status === 'Paid' ? 'success' : 'danger'}>{t.status}</Badge>
                  <span className="text-[13px] font-semibold text-[#111827] w-20 text-right">{t.amount}</span>
                  <span className="text-[12px] text-[#9CA3AF] font-mono flex-shrink-0">{t.date}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <h4 className="text-[14px] font-semibold text-[#111827] mb-4">Revenue by Plan</h4>
            <div className="space-y-3">
              {[
                { plan: 'Enterprise', pct: 48, color: '#2563EB' },
                { plan: 'Team', pct: 22, color: '#7C3AED' },
                { plan: 'Pro Annual', pct: 18, color: '#059669' },
                { plan: 'Pro Monthly', pct: 8, color: '#D97706' },
                { plan: 'Free', pct: 4, color: '#9CA3AF' },
              ].map(p => (
                <div key={p.plan} className="flex items-center gap-3">
                  <span className="text-[13px] text-[#374151] w-24 flex-shrink-0">{p.plan}</span>
                  <div className="flex-1 h-2 bg-[#F3F4F6] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${p.pct}%`, background: p.color }} />
                  </div>
                  <span className="text-[12px] font-semibold text-[#374151] w-10 text-right">{p.pct}%</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card p-5">
            <h4 className="text-[14px] font-semibold text-[#111827] mb-3">Billing Highlights</h4>
            <div className="space-y-2">
              {[['Payment success rate', '98.2%'], ['Avg revenue / active', '$9.68'], ['Churn rate', '3.1%'], ['Active trials', '214']].map(([k, v]) => (
                <div key={k} className="flex justify-between py-2 border-b border-[#F9FAFB] last:border-0">
                  <span className="text-[12px] text-[#9CA3AF]">{k}</span>
                  <span className="text-[12px] font-semibold text-[#374151]">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}