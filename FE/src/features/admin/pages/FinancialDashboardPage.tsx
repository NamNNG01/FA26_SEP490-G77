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
        <StatCard title="Total Revenue" value="$92,400" change={14.2} changeLabel="vs prev period" icon={<Icon.TrendingUp />} />
        <StatCard title="MRR" value="$21,400" change={8.6} changeLabel="vs prev period" icon={<Icon.BarChart />} />
        <StatCard title="Active Subscriptions" value="2,210" change={9.1} changeLabel="vs prev period" icon={<Icon.Users />} />
        <StatCard title="Refunds" value="$640" change={-12.4} changeLabel="vs prev period" icon={<Icon.AlertCircle />} direction="down" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-5">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-5">
              <h4 className="text-lg font-semibold text-content">Revenue Trend</h4>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-[3px] bg-success-solid" /><span className="text-content-soft">Revenue ($)</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-[3px] bg-brand-line" /><span className="text-content-soft">Subscriptions</span></div>
              </div>
            </div>
            <div className="flex items-end gap-3 h-40">
              {revenueData.map(d => (
                <div key={d.month} className="flex-1 flex flex-col items-center gap-1.5">
                  <span className="text-2xs text-content-subtle">{Math.round(d.revenue / 1000)}k</span>
                  <div className="w-full flex items-end gap-1 h-28">
                    <div className="flex-1 rounded-t-[4px] chart-bar" style={{ height: `${(d.revenue / maxRevenue) * 100}%`, background: '#16A34A', minHeight: 4 }} />
                    <div className="flex-1 rounded-t-[4px] chart-bar" style={{ height: `${(d.subs / 2210) * 100}%`, background: '#A7DCCF', minHeight: 4 }} />
                  </div>
                  <span className="text-2xs text-content-subtle">{d.month}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-line-soft flex items-center justify-between">
              <h4 className="text-lg font-semibold text-content">Recent Transactions</h4>
              <Button variant="ghost" size="sm">View All</Button>
            </div>
            <div className="divide-y divide-line-faint">
              {transactions.map(t => (
                <div key={t.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-surface-hover">
                  <div className="w-9 h-9 rounded-[10px] bg-surface-muted flex items-center justify-center flex-shrink-0">
                    <Icon.FileText className="w-4 h-4 text-content-soft" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-content-secondary">{t.customer}</p>
                    <p className="text-xs text-content-subtle">{t.id} · {t.plan}</p>
                  </div>
                  <Badge variant={t.status === 'Paid' ? 'success' : 'danger'}>{t.status}</Badge>
                  <span className="text-sm font-semibold text-content w-20 text-right">{t.amount}</span>
                  <span className="text-xs text-content-subtle font-mono flex-shrink-0">{t.date}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <h4 className="text-base font-semibold text-content mb-4">Revenue by Plan</h4>
            <div className="space-y-3">
              {[
                { plan: 'Enterprise', pct: 48, color: '#0D7C6C' },
                { plan: 'Team', pct: 22, color: '#7C3AED' },
                { plan: 'Pro Annual', pct: 18, color: '#059669' },
                { plan: 'Pro Monthly', pct: 8, color: '#D97706' },
                { plan: 'Free', pct: 4, color: '#9CA3AF' },
              ].map(p => (
                <div key={p.plan} className="flex items-center gap-3">
                  <span className="text-sm text-content-secondary w-24 flex-shrink-0">{p.plan}</span>
                  <div className="flex-1 h-2 bg-surface-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${p.pct}%`, background: p.color }} />
                  </div>
                  <span className="text-xs font-semibold text-content-secondary w-10 text-right">{p.pct}%</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card p-5">
            <h4 className="text-base font-semibold text-content mb-3">Billing Highlights</h4>
            <div className="space-y-2">
              {[['Payment success rate', '98.2%'], ['Avg revenue / active', '$9.68'], ['Churn rate', '3.1%'], ['Active trials', '214']].map(([k, v]) => (
                <div key={k} className="flex justify-between py-2 border-b border-line-faint last:border-0">
                  <span className="text-xs text-content-subtle">{k}</span>
                  <span className="text-xs font-semibold text-content-secondary">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}