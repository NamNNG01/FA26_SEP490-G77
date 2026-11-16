import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Skeleton } from '@/components/ui/Skeleton';
import { DashboardError } from '@/components/common/DashboardState';
import { Icon } from '@/assets/icons';
import { ROUTES } from '@/app/routes';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  adminDashboardService,
  type AdminDashboardReport,
  type DashboardFilter,
  type Granularity,
  type TopCourseSort,
} from '@/services/adminDashboard.service';
import { PeriodFilter } from '../components/PeriodFilter';
import { RevenueTrendChart, REVENUE_SERIES } from '../components/RevenueTrendChart';
import { RevenueSourceDonut } from '../components/RevenueSourceDonut';
import { AiUsageLogTable } from '../components/AiUsageLogTable';
import { SortHeader } from '../components/SortHeader';
import { defaultFilter, filterDayRange } from '../utils/dashboardPeriods';
import { formatCompact, formatInteger, formatPeriod, formatVnd } from '../utils/dashboardFormat';
import { exportAdminDashboard } from '../utils/exportAdminDashboard';
import { DASHBOARD_REFRESH_MS, useQuietRefresh } from '@/hooks/useAutoRefresh';

/** Until the first report arrives the picker offers any date; the API bounds the report itself. */
const FALLBACK_DATA_START = '2000-01-01';

/**
 * AdminDashboard
 *
 * Every figure comes from GET /dashboard/admin/report — collected payments (course sales and
 * subscription plans), accounts, courses and settled AI usage logs of the live database.
 *
 * Period filter (Day / Month / Year + range) drives net revenue, AI tokens, both revenue charts,
 * the AI log and the Excel export. Users, courses and top courses are all-time figures.
 */
export function AdminDashboard() {
  const [filter, setFilter] = useState<DashboardFilter>(() => defaultFilter('day'));
  const [sortBy, setSortBy] = useState<TopCourseSort>('revenue');
  const [data, setData] = useState<AdminDashboardReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const takeQuiet = useQuietRefresh(() => setReload(value => value + 1), true, DASHBOARD_REFRESH_MS);

  useEffect(() => {
    let cancelled = false;
    // A shared auto-refresh read keeps the report on screen and drops its own errors.
    const quiet = takeQuiet();
    if (!quiet) {
      setLoading(true);
      setError(null);
    }
    adminDashboardService
      .getReport(filter, sortBy)
      .then(report => {
        if (!cancelled) setData(report);
      })
      .catch(err => {
        if (!cancelled && !quiet) setError(getApiErrorMessage(err, 'Could not load the dashboard report.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter, sortBy, reload]);

  const retry = useCallback(() => setReload(value => value + 1), []);
  // A new period invalidates the AI table's own time window.
  const dayRange = useMemo(() => filterDayRange(filter), [filter]);
  const g = filter.granularity;

  return (
    <div className="p-8 space-y-6">
      {/* Header + filters */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-content">System Admin Dashboard</h2>
          <p className="text-sm text-content-soft mt-0.5">
            {formatPeriod(filter.from, g)} – {formatPeriod(filter.to, g)}
            {loading && <span className="ml-2 text-content-subtle">Updating…</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PeriodFilter value={filter} minDate={data?.dataStart ?? FALLBACK_DATA_START} onChange={setFilter} />
          <Button
            variant="outline"
            icon={<Icon.Download className="w-4 h-4" />}
            disabled={!data}
            onClick={() => data && exportAdminDashboard(data, filter, sortBy)}
          >
            Export Excel
          </Button>
        </div>
      </div>

      {!data ? (
        error ? (
          <div className="card">
            <DashboardError message={error} onRetry={retry} />
          </div>
        ) : (
          <AdminDashboardSkeleton />
        )
      ) : (
        <>
          {/* A failed refresh keeps the last report on screen; the banner explains the gap. */}
          {error && <Alert type="error" title="Could not refresh" message={error} />}
          <DashboardBody data={data} granularity={g} sortBy={sortBy} onSort={setSortBy} dayRange={dayRange} />
        </>
      )}
    </div>
  );
}

function DashboardBody({ data, granularity, sortBy, onSort, dayRange }: {
  data: AdminDashboardReport;
  granularity: Granularity;
  sortBy: TopCourseSort;
  onSort: (sort: TopCourseSort) => void;
  dayRange: { from: string; to: string };
}) {
  const navigate = useNavigate();
  const { summary, revenueSeries, revenueBySource, topCourses, aiLogs, aiLogTotals } = data;
  const hasRevenue = summary.netRevenue > 0;

  return (
    <>
      {/* KPI cards — grid rows stretch, so every card shares the tallest height. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Net Revenue"
          value={formatVnd(summary.netRevenue)}
          icon={<Icon.TrendingUp />}
          footer={<p className="text-xs text-content-subtle">Collected payments, after discounts</p>}
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
          value={formatCompact(summary.ai.tokensUsed)}
          icon={<Icon.Brain />}
          footer={
            <p className="text-xs text-content-subtle">
              {formatInteger(aiLogTotals.requests)} settled request{aiLogTotals.requests === 1 ? '' : 's'} in this period
              {aiLogTotals.failed > 0 && ` · ${formatInteger(aiLogTotals.failed)} failed`}
            </p>
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
          {hasRevenue ? <RevenueTrendChart data={revenueSeries} granularity={granularity} /> : <EmptyState />}
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
                <SortHeader label="Revenue" align="right" active={sortBy === 'revenue'} onClick={() => onSort('revenue')} />
                <SortHeader
                  label="Enrollments"
                  align="right"
                  active={sortBy === 'enrollments'}
                  onClick={() => onSort('enrollments')}
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
          {topCourses.length === 0 && <EmptyState />}
        </div>
      </div>

      <AiUsageLogTable logs={aiLogs} dayRange={dayRange} totals={aiLogTotals} />
    </>
  );
}

function AdminDashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-5 flex flex-col gap-4">
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton className="h-8 w-24 rounded" />
            <Skeleton className="h-3 w-32 rounded" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="card p-5 xl:col-span-2"><Skeleton className="h-60 w-full rounded-[10px]" /></div>
        <div className="card p-5"><Skeleton className="h-60 w-full rounded-[10px]" /></div>
      </div>
      <div className="card p-5"><Skeleton className="h-40 w-full rounded-[10px]" /></div>
    </div>
  );
}

function EmptyState() {
  return <p className="px-5 py-10 text-center text-sm text-content-soft">No data for this period.</p>;
}
