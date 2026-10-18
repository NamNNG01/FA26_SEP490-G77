import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/Progress';
import { Icon } from '@/assets/icons';
import { ROUTES } from '@/app/routes';
import { PeriodFilter } from '../components/PeriodFilter';
import { RevenueTrendChart, REVENUE_SERIES } from '../components/RevenueTrendChart';
import { RevenueSourceDonut } from '../components/RevenueSourceDonut';
import { AiUsageLogTable } from '../components/AiUsageLogTable';
import { SortHeader } from '../components/SortHeader';
import {
  DEMO_DATA_START,
  defaultFilter,
  filterDayRange,
  getAdminDashboardDemo,
  type DashboardFilter,
  type TopCourseSort,
} from '../data/adminDashboardDemo';
import { formatCompact, formatInteger, formatPeriod, formatVnd } from '../utils/dashboardFormat';
import { exportAdminDashboard } from '../utils/exportAdminDashboard';

/**
 * AdminDashboard
 *
 * DEMO: every figure comes from `getAdminDashboardDemo` (client-side, seeded)
 * because the backend has no payments / AI-usage data yet. Swap that call for
 * the dashboard API when it lands — the page only depends on its return shape.
 *
 * Period filter (Day / Month / Year + range) drives net revenue, AI tokens,
 * both revenue charts, the AI log and the Excel export. Users, courses and
 * top courses are all-time figures.
 */
export function AdminDashboard() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<DashboardFilter>(() => defaultFilter('day'));
  const [sortBy, setSortBy] = useState<TopCourseSort>('revenue');

  const data = useMemo(() => getAdminDashboardDemo(filter, sortBy), [filter, sortBy]);
  const dayRange = useMemo(() => filterDayRange(filter), [filter]);
  const { summary, revenueSeries, revenueBySource, topCourses, aiLogs } = data;
  const g = filter.granularity;
  const hasRevenue = summary.netRevenue > 0;
  const quotaPct = summary.ai.providerQuota ? (summary.ai.tokensUsed / summary.ai.providerQuota) * 100 : 0;

  return (
    <div className="p-8 space-y-6">
      {/* Header + filters */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-content">System Admin Dashboard</h2>
            <Badge variant="warning">Demo data</Badge>
          </div>
          <p className="text-sm text-content-soft mt-0.5">
            {formatPeriod(filter.from, g)} – {formatPeriod(filter.to, g)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PeriodFilter value={filter} minDate={DEMO_DATA_START} onChange={setFilter} />
          <Button
            variant="outline"
            icon={<Icon.Download className="w-4 h-4" />}
            onClick={() => exportAdminDashboard(data, filter, sortBy)}
          >
            Export Excel
          </Button>
        </div>
      </div>

      {/* KPI cards — grid rows stretch, so every card shares the tallest height. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Net Revenue"
          value={formatVnd(summary.netRevenue)}
          icon={<Icon.TrendingUp />}
          footer={<p className="text-xs text-content-subtle">After discounts & PayOS fees</p>}
        />

        <div
          className="relative group h-full outline-none rounded-[10px] focus-visible:ring-2 focus-visible:ring-brand-600/30"
          tabIndex={0}
          aria-describedby="users-breakdown"
        >
          <StatCard
            title="Total Users"
            value={formatInteger(summary.users.total)}
            icon={<Icon.Users />}
            footer={<p className="text-xs text-content-subtle">Hover for accounts by role</p>}
          />
          <div
            id="users-breakdown"
            role="tooltip"
            className="absolute left-4 right-4 top-[calc(100%-12px)] z-20 hidden group-hover:block group-focus:block rounded-[10px] border border-line bg-surface p-3 shadow-lg"
          >
            {[
              ['Students', summary.users.students],
              ['Course Managers', summary.users.courseManagers],
              ['Admins', summary.users.admins],
            ].map(([label, count]) => (
              <div key={label} className="flex justify-between py-1 text-sm">
                <span className="text-content-soft">{label}</span>
                <span className="font-semibold text-content tabular-nums">{formatInteger(count as number)}</span>
              </div>
            ))}
          </div>
        </div>

        <StatCard
          title="Active Courses"
          value={`${summary.courses.active} / ${summary.courses.total}`}
          icon={<Icon.Book />}
          footer={<p className="text-xs text-content-subtle">Published / all courses</p>}
        />
        <StatCard
          title="AI Tokens"
          value={`${formatCompact(summary.ai.tokensUsed)} / ${formatCompact(summary.ai.providerQuota)}`}
          icon={<Icon.Brain />}
          footer={
            <div className="space-y-1">
              <Progress value={Math.min(quotaPct, 100)} size="sm" color="var(--chart-1)" />
              <p className="text-xs text-content-subtle">
                {quotaPct < 0.1 && quotaPct > 0 ? '<0,1' : quotaPct.toFixed(1).replace('.', ',')}% of provider quota
              </p>
            </div>
          }
        />
      </div>

      {/* Revenue */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="card p-5 xl:col-span-2 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h4 className="text-lg font-semibold text-content">Revenue Overview</h4>
            <div className="flex items-center gap-4 text-xs">
              {REVENUE_SERIES.map((s) => (
                <span key={s.key} className="flex items-center gap-1.5 text-content-soft">
                  <span className="w-3 h-0.5 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
              ))}
            </div>
          </div>
          {hasRevenue ? <RevenueTrendChart data={revenueSeries} granularity={g} /> : <EmptyState />}
        </div>

        <div className="card p-5 min-w-0">
          <h4 className="text-lg font-semibold text-content mb-4">Revenue by Source</h4>
          {hasRevenue ? (
            <RevenueSourceDonut
              courseSales={revenueBySource.courseSales}
              aiSubscription={revenueBySource.aiSubscription}
              aiPlans={revenueBySource.aiPlans}
              topSellingCourses={revenueBySource.topSellingCourses}
            />
          ) : (
            <EmptyState />
          )}
        </div>
      </div>

      {/* Top courses — click the Revenue / Enrollments header to re-rank. */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-line-soft flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-lg font-semibold text-content">Top Performing Courses</h4>
            <p className="text-xs text-content-subtle">All time · click Revenue or Enrollments to rank by it</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate(ROUTES.managerCourses)}>
            View All Courses
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-content-subtle border-b border-line-soft">
                <th className="px-5 py-2.5 font-medium w-12">#</th>
                <th className="px-5 py-2.5 font-medium">Course</th>
                <SortHeader label="Revenue" align="right" active={sortBy === 'revenue'} onClick={() => setSortBy('revenue')} />
                <SortHeader
                  label="Enrollments"
                  align="right"
                  active={sortBy === 'enrollments'}
                  onClick={() => setSortBy('enrollments')}
                />
                <th className="px-5 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-faint">
              {topCourses.map((c, i) => (
                <tr key={c.courseId} className="hover:bg-surface-hover">
                  <td className="px-5 py-3 text-content-subtle tabular-nums">{i + 1}</td>
                  <td className="px-5 py-3 font-medium text-content-secondary">{c.title}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-content whitespace-nowrap">{formatVnd(c.revenue)}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-content">{formatInteger(c.enrollments)}</td>
                  <td className="px-5 py-3">
                    <Badge variant={c.status === 'PUBLISHED' ? 'success' : 'default'}>
                      {c.status === 'PUBLISHED' ? 'Published' : 'Draft'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AiUsageLogTable logs={aiLogs} dayRange={dayRange} />
    </div>
  );
}

function EmptyState() {
  return <p className="px-5 py-10 text-center text-sm text-content-soft">No data for this period.</p>;
}
