import { downloadXlsx } from '@/utils/xlsx';
import type { AdminDashboardDemo, DashboardFilter, TopCourseSort } from '../data/adminDashboardDemo';
import { formatDateTime, formatPeriod } from './dashboardFormat';

const GRANULARITY_LABEL = { day: 'Day', month: 'Month', year: 'Year' } as const;

/**
 * Exports the whole dashboard, for the active filter, as a 5-sheet workbook:
 * Overview, Revenue by period, Revenue by source, Top courses, AI usage log.
 */
export function exportAdminDashboard(data: AdminDashboardDemo, filter: DashboardFilter, sortBy: TopCourseSort): void {
  const { summary, revenueSeries, revenueBySource, topCourses, aiLogs } = data;
  const g = filter.granularity;
  const range = `${formatPeriod(filter.from, g)} – ${formatPeriod(filter.to, g)}`;
  const totalRevenue = revenueBySource.courseSales + revenueBySource.aiSubscription;
  const share = (value: number) => (totalRevenue ? Math.round((value / totalRevenue) * 1000) / 10 : 0);

  downloadXlsx(`admin-dashboard_${filter.from}_${filter.to}.xlsx`, [
    {
      name: 'Overview',
      header: ['Metric', 'Value', 'Note'],
      widths: [32, 18, 44],
      rows: [
        ['Report period', range, `Grouped by ${GRANULARITY_LABEL[g].toLowerCase()}`],
        ['Net revenue (VND)', summary.netRevenue, 'After discounts and PayOS fees'],
        ['Total users', summary.users.total, 'All time'],
        ['  Students', summary.users.students, ''],
        ['  Course managers', summary.users.courseManagers, ''],
        ['  Admins', summary.users.admins, ''],
        ['Active courses (published)', summary.courses.active, `of ${summary.courses.total} courses`],
        ['AI tokens used', summary.ai.tokensUsed, 'In report period'],
        ['AI provider token quota', summary.ai.providerQuota, 'From the AI provider'],
      ],
    },
    {
      name: 'Revenue by period',
      header: [GRANULARITY_LABEL[g], 'Course sales (VND)', 'AI subscription (VND)', 'Total (VND)'],
      widths: [14, 22, 24, 20],
      rows: revenueSeries.map((p) => [
        formatPeriod(p.period, g),
        p.courseSales,
        p.aiSubscription,
        p.courseSales + p.aiSubscription,
      ]),
    },
    {
      name: 'Revenue by source',
      header: ['Source', 'Plan / top course', 'Revenue (VND)', 'Share of total (%)'],
      widths: [20, 46, 20, 20],
      rows: [
        ['Course sales', '', revenueBySource.courseSales, share(revenueBySource.courseSales)],
        ...revenueBySource.topSellingCourses.map((c) => ['Course sales', c.title, c.revenue, share(c.revenue)]),
        ['AI subscription', '', revenueBySource.aiSubscription, share(revenueBySource.aiSubscription)],
        ...revenueBySource.aiPlans.map((p) => ['AI subscription', p.plan, p.revenue, share(p.revenue)]),
      ],
    },
    {
      name: 'Top courses',
      header: ['Rank', 'Course', 'Revenue (VND)', 'Enrollments', 'Status'],
      widths: [8, 46, 20, 14, 12],
      rows: [
        ...topCourses.map((c, i) => [i + 1, c.title, c.revenue, c.enrollments, c.status === 'PUBLISHED' ? 'Published' : 'Draft']),
        [],
        [`Sorted by ${sortBy === 'revenue' ? 'revenue' : 'enrollments'}, all time`],
      ],
    },
    {
      name: 'AI usage log',
      header: ['Time', 'User', 'AI feature', 'Tokens', 'Result'],
      widths: [18, 24, 22, 12, 10],
      rows: aiLogs.map((log) => [
        formatDateTime(log.time),
        log.user,
        log.feature,
        log.tokens,
        log.success ? 'Success' : 'Failed',
      ]),
    },
  ]);
}
