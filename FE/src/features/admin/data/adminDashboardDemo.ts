/**
 * Demo data for the Admin Dashboard.
 *
 * The backend has no payments (PayOS) or AI-usage tables yet, so every number
 * here is generated on the client. Values are deterministic — seeded by date —
 * so the same filter always shows the same figures. Replace
 * `getAdminDashboardDemo` with an API call once
 * `GET /api/v1/dashboard/admin?granularity=&from=&to=&sortBy=` exists; the
 * returned shape is the contract the page renders.
 */

export type Granularity = 'day' | 'month' | 'year';
export type TopCourseSort = 'revenue' | 'enrollments';

export interface DashboardFilter {
  granularity: Granularity;
  /** Inclusive bounds: YYYY-MM-DD, YYYY-MM or YYYY depending on granularity. */
  from: string;
  to: string;
}

export interface RevenuePoint {
  period: string;
  courseSales: number;
  aiSubscription: number;
}

export interface PlanRevenue {
  plan: string;
  revenue: number;
}

export interface CourseRevenue {
  title: string;
  revenue: number;
}

export interface TopCourse {
  courseId: number;
  title: string;
  revenue: number;
  enrollments: number;
  status: 'PUBLISHED' | 'DRAFT';
}

export interface AiUsageLog {
  id: string;
  time: string;
  user: string;
  feature: string;
  tokens: number;
  success: boolean;
}

export interface AdminDashboardDemo {
  summary: {
    netRevenue: number;
    users: { total: number; students: number; courseManagers: number; admins: number };
    courses: { active: number; total: number };
    ai: { tokensUsed: number; providerQuota: number };
  };
  revenueSeries: RevenuePoint[];
  revenueBySource: {
    courseSales: number;
    aiSubscription: number;
    aiPlans: PlanRevenue[];
    /** Best-selling courses in the period (by course-sales revenue), top 3. */
    topSellingCourses: CourseRevenue[];
  };
  topCourses: TopCourse[];
  aiLogs: AiUsageLog[];
}

/** First day the demo platform has data. */
const DATA_START = '2023-01-01';

const AI_PLANS = [
  { plan: 'AI Basic', share: 0.45 },
  { plan: 'AI Pro', share: 0.38 },
  { plan: 'AI Premium', share: 0.17 },
];

const AI_FEATURES = ['AI Review', 'AI Hint', 'Question Generation', 'Answer Explanation'];

const DEMO_USERS = [
  'Nguyễn Văn An', 'Trần Thị Bình', 'Lê Minh Châu', 'Phạm Quốc Dũng', 'Hoàng Thu Hà',
  'Vũ Đức Huy', 'Đặng Ngọc Lan', 'Bùi Thanh Long', 'Đỗ Mai Phương', 'Ngô Gia Quân',
  'Dương Khánh Linh', 'Lý Hoài Nam',
];

const COURSES: Omit<TopCourse, 'revenue' | 'enrollments'>[] = [
  { courseId: 1, title: 'AWS Certified Cloud Practitioner', status: 'PUBLISHED' },
  { courseId: 2, title: 'AWS Certified Solutions Architect Associate', status: 'PUBLISHED' },
  { courseId: 3, title: 'Microsoft Azure Fundamentals (AZ-900)', status: 'PUBLISHED' },
  { courseId: 4, title: 'Microsoft Azure Administrator (AZ-104)', status: 'PUBLISHED' },
  { courseId: 5, title: 'Google Cloud Associate Cloud Engineer', status: 'PUBLISHED' },
  { courseId: 6, title: 'CompTIA Security+ (SY0-701)', status: 'PUBLISHED' },
  { courseId: 7, title: 'CompTIA Network+ (N10-009)', status: 'DRAFT' },
  { courseId: 8, title: 'Cisco CCNA (200-301)', status: 'PUBLISHED' },
];

const COURSE_PRICES = [499_000, 899_000, 449_000, 799_000, 749_000, 699_000, 649_000, 999_000];
const COURSE_ENROLLMENTS = [1_842, 1_126, 1_530, 612, 704, 958, 341, 487];

/** Platform-wide token quota reported by the AI provider (demo value). */
const PROVIDER_TOKEN_QUOTA = 500_000_000;

// ---- Seeded randomness -------------------------------------------------

function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom(seed: string): () => number {
  let a = hashSeed(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Date helpers (local calendar dates, no time zone shifts) ----------

export function toIsoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** Every calendar day from `from` to `to`, inclusive, clipped to the data window. */
function daysBetween(from: Date, to: Date): string[] {
  const start = from < parseIsoDate(DATA_START) ? parseIsoDate(DATA_START) : from;
  const days: string[] = [];
  for (let d = start; d <= to; d = addDays(d, 1)) days.push(toIsoDate(d));
  return days;
}

/** Converts a filter into its first and last calendar day. */
function filterBounds(filter: DashboardFilter): { start: Date; end: Date } {
  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let start: Date;
  let end: Date;
  if (filter.granularity === 'day') {
    start = parseIsoDate(filter.from);
    end = parseIsoDate(filter.to);
  } else if (filter.granularity === 'month') {
    start = parseIsoDate(`${filter.from}-01`);
    const [y, m] = filter.to.split('-').map(Number);
    end = new Date(y, m, 0);
  } else {
    start = new Date(Number(filter.from), 0, 1);
    end = new Date(Number(filter.to), 11, 31);
  }
  return { start, end: end > todayDate ? todayDate : end };
}

function periodKey(isoDay: string, granularity: Granularity): string {
  if (granularity === 'month') return isoDay.slice(0, 7);
  if (granularity === 'year') return isoDay.slice(0, 4);
  return isoDay;
}

/** Every period label in the filter, so empty periods still appear on the chart. */
function periodsInFilter(filter: DashboardFilter): string[] {
  const periods: string[] = [];
  if (filter.granularity === 'day') {
    const { start, end } = filterBounds(filter);
    for (let d = start; d <= end; d = addDays(d, 1)) periods.push(toIsoDate(d));
  } else if (filter.granularity === 'month') {
    const [fy, fm] = filter.from.split('-').map(Number);
    const [ty, tm] = filter.to.split('-').map(Number);
    for (let y = fy, m = fm; y < ty || (y === ty && m <= tm); m === 12 ? (y++, (m = 1)) : m++) {
      periods.push(`${y}-${String(m).padStart(2, '0')}`);
    }
  } else {
    for (let y = Number(filter.from); y <= Number(filter.to); y++) periods.push(String(y));
  }
  return periods;
}

// ---- Daily generators --------------------------------------------------

/** Business grows ~35% a year from the data start, with a weekend dip. */
function growthFactor(isoDay: string): number {
  const days = (parseIsoDate(isoDay).getTime() - parseIsoDate(DATA_START).getTime()) / 86_400_000;
  const weekday = parseIsoDate(isoDay).getDay();
  const weekend = weekday === 0 || weekday === 6 ? 0.78 : 1;
  return (1 + (days / 365) * 0.35) * weekend;
}

function dailyRevenue(isoDay: string): { courseSales: number; aiSubscription: number } {
  const rand = seededRandom(`revenue-${isoDay}`);
  const g = growthFactor(isoDay);
  const round = (n: number) => Math.round(n / 1000) * 1000;
  return {
    courseSales: round((2_400_000 + rand() * 3_600_000) * g),
    aiSubscription: round((1_100_000 + rand() * 2_200_000) * g),
  };
}

function dailyAiLogs(isoDay: string): AiUsageLog[] {
  const rand = seededRandom(`ai-${isoDay}`);
  const count = Math.round((6 + rand() * 10) * growthFactor(isoDay));
  const logs: AiUsageLog[] = [];
  for (let i = 0; i < count; i++) {
    const minutes = Math.floor(rand() * 24 * 60);
    const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    const success = rand() > 0.05;
    logs.push({
      id: `${isoDay}-${i}`,
      time: `${isoDay}T${hh}:${mm}:00`,
      user: DEMO_USERS[Math.floor(rand() * DEMO_USERS.length)],
      feature: AI_FEATURES[Math.floor(rand() * AI_FEATURES.length)],
      tokens: success ? Math.round(1_500 + rand() * 10_500) : Math.round(200 + rand() * 600),
      success,
    });
  }
  return logs;
}

// ---- Public API --------------------------------------------------------

export function defaultFilter(granularity: Granularity, today = new Date()): DashboardFilter {
  if (granularity === 'month') {
    const from = new Date(today.getFullYear(), today.getMonth() - 5, 1);
    return { granularity, from: toIsoDate(from).slice(0, 7), to: toIsoDate(today).slice(0, 7) };
  }
  if (granularity === 'year') {
    return { granularity, from: String(today.getFullYear() - 2), to: String(today.getFullYear()) };
  }
  return { granularity, from: toIsoDate(addDays(today, -6)), to: toIsoDate(today) };
}

export const DEMO_DATA_START = DATA_START;

/** First and last calendar day (YYYY-MM-DD) covered by a filter. */
export function filterDayRange(filter: DashboardFilter): { from: string; to: string } {
  const { start, end } = filterBounds(filter);
  return { from: toIsoDate(start), to: toIsoDate(end) };
}

export function getAdminDashboardDemo(filter: DashboardFilter, sortBy: TopCourseSort): AdminDashboardDemo {
  const { start, end } = filterBounds(filter);
  const days = daysBetween(start, end);

  const byPeriod = new Map<string, RevenuePoint>(
    periodsInFilter(filter).map((period) => [period, { period, courseSales: 0, aiSubscription: 0 }]),
  );
  let tokensUsed = 0;
  const aiLogs: AiUsageLog[] = [];

  // Today's log only runs up to the current minute.
  const now = new Date();
  const nowIso = `${toIsoDate(now)}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;

  for (const day of days) {
    const revenue = dailyRevenue(day);
    const point = byPeriod.get(periodKey(day, filter.granularity));
    if (point) {
      point.courseSales += revenue.courseSales;
      point.aiSubscription += revenue.aiSubscription;
    }
    for (const log of dailyAiLogs(day)) {
      if (log.time > nowIso) continue;
      tokensUsed += log.tokens;
      aiLogs.push(log);
    }
  }

  const revenueSeries = [...byPeriod.values()];
  const courseSales = revenueSeries.reduce((sum, p) => sum + p.courseSales, 0);
  const aiSubscription = revenueSeries.reduce((sum, p) => sum + p.aiSubscription, 0);
  const aiPlans = AI_PLANS.map(({ plan, share }) => ({ plan, revenue: Math.round(aiSubscription * share) }));

  // Split the period's course sales across published courses by their sales
  // weight, with a seeded wobble so different periods rank a little differently.
  const jitter = seededRandom(`course-split-${filter.granularity}-${filter.from}-${filter.to}`);
  const weights = COURSES.map((c, i) =>
    c.status === 'PUBLISHED' ? COURSE_ENROLLMENTS[i] * COURSE_PRICES[i] * (0.75 + jitter() * 0.5) : 0,
  );
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const topSellingCourses = COURSES.map((c, i) => ({
    title: c.title,
    revenue: weightSum ? Math.round((courseSales * weights[i]) / weightSum / 1000) * 1000 : 0,
  }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 3);

  const topCourses = COURSES.map((course, i) => ({
    ...course,
    enrollments: COURSE_ENROLLMENTS[i],
    revenue: COURSE_ENROLLMENTS[i] * COURSE_PRICES[i],
  }))
    .sort((a, b) => (sortBy === 'revenue' ? b.revenue - a.revenue : b.enrollments - a.enrollments))
    .slice(0, 5);

  aiLogs.sort((a, b) => b.time.localeCompare(a.time));

  return {
    summary: {
      netRevenue: courseSales + aiSubscription,
      users: { total: 1_299, students: 1_284, courseManagers: 12, admins: 3 },
      courses: { active: 12, total: 15 },
      ai: { tokensUsed, providerQuota: PROVIDER_TOKEN_QUOTA },
    },
    revenueSeries,
    revenueBySource: { courseSales, aiSubscription, aiPlans, topSellingCourses },
    topCourses,
    aiLogs,
  };
}
