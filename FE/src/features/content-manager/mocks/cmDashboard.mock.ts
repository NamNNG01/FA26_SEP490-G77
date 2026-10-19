import {
  CM_MIN_ATTEMPTS,
  type CmCourseStat,
  type CmDashboardSummary,
  type CmExamStat,
} from '@/services/cmDashboard.types';

/**
 * DEMO data for the Course Manager dashboard — the backend has no endpoints
 * for it yet (see services/cmDashboard.types.ts for the planned contract).
 * Delete this file once useCmDashboard calls the real API.
 *
 * Built to cover every display case: a course with no exams, a course with
 * a low pass rate (~35%), HIDDEN / DRAFT exams, exams under 5 attempts,
 * exams with pending grading, and positive / negative / null deltas.
 * Course figures are derived from the exam rows so the panels agree.
 *
 * Append `?cmMockError=summary|courses|exams` to the URL to make that
 * section fail and preview its error + retry state.
 */

const COURSES: { courseId: number; title: string; activeStudents: number }[] = [
  { courseId: 1, title: 'Lập trình Java cơ bản', activeStudents: 128 },
  { courseId: 2, title: 'Cấu trúc dữ liệu & Giải thuật', activeStudents: 96 },
  { courseId: 3, title: 'Cơ sở dữ liệu', activeStudents: 110 },
  { courseId: 4, title: 'Mạng máy tính', activeStudents: 74 },
  { courseId: 5, title: 'Kỹ thuật phần mềm', activeStudents: 58 },
  { courseId: 6, title: 'Nhập môn Trí tuệ nhân tạo', activeStudents: 35 },
];

type ExamRow = Omit<CmExamStat, 'courseTitle'>;

const EXAMS: ExamRow[] = [
  { examId: 101, courseId: 1, title: 'Midterm Java', status: 'PUBLISHED', submittedAttempts: 86, avgScore: 72.4, passRate: 78, avgDurationMinutes: 42, pendingGrading: 0 },
  { examId: 102, courseId: 1, title: 'Final Java', status: 'PUBLISHED', submittedAttempts: 64, avgScore: 68.1, passRate: 70, avgDurationMinutes: 58, pendingGrading: 3 },
  { examId: 103, courseId: 1, title: 'Quiz OOP', status: 'HIDDEN', submittedAttempts: 41, avgScore: 74.5, passRate: 83, avgDurationMinutes: 15, pendingGrading: 0 },
  { examId: 104, courseId: 1, title: 'Bài tập Collections', status: 'PUBLISHED', submittedAttempts: 22, avgScore: 79, passRate: 86, avgDurationMinutes: 25, pendingGrading: 0 },
  { examId: 201, courseId: 2, title: 'Midterm DSA', status: 'PUBLISHED', submittedAttempts: 72, avgScore: 48.2, passRate: 33, avgDurationMinutes: 55, pendingGrading: 0 },
  { examId: 202, courseId: 2, title: 'Quiz Đồ thị', status: 'PUBLISHED', submittedAttempts: 38, avgScore: 51, passRate: 39, avgDurationMinutes: 20, pendingGrading: 0 },
  { examId: 203, courseId: 2, title: 'Final DSA', status: 'DRAFT', submittedAttempts: 0, avgScore: null, passRate: null, avgDurationMinutes: null, pendingGrading: 0 },
  { examId: 301, courseId: 3, title: 'SQL cơ bản', status: 'PUBLISHED', submittedAttempts: 95, avgScore: 76.8, passRate: 85, avgDurationMinutes: 30, pendingGrading: 0 },
  { examId: 302, courseId: 3, title: 'Thiết kế CSDL', status: 'PUBLISHED', submittedAttempts: 52, avgScore: 63.5, passRate: 61, avgDurationMinutes: 45, pendingGrading: 5 },
  { examId: 401, courseId: 4, title: 'Quiz TCP/IP', status: 'PUBLISHED', submittedAttempts: 3, avgScore: 58.3, passRate: 33.3, avgDurationMinutes: 18, pendingGrading: 0 },
  { examId: 402, courseId: 4, title: 'Midterm Mạng', status: 'PUBLISHED', submittedAttempts: 47, avgScore: 66, passRate: 64, avgDurationMinutes: 50, pendingGrading: 0 },
  { examId: 501, courseId: 5, title: 'Quiz Agile', status: 'PUBLISHED', submittedAttempts: 4, avgScore: 81, passRate: 100, avgDurationMinutes: 12, pendingGrading: 0 },
  { examId: 502, courseId: 5, title: 'UML & Thiết kế', status: 'PUBLISHED', submittedAttempts: 29, avgScore: 70.2, passRate: 72, avgDurationMinutes: 35, pendingGrading: 0 },
  { examId: 503, courseId: 5, title: 'Final SE', status: 'PUBLISHED', submittedAttempts: 18, avgScore: 44.5, passRate: 44, avgDurationMinutes: 60, pendingGrading: 0 },
];

const courseTitleOf = (courseId: number) => COURSES.find((c) => c.courseId === courseId)?.title ?? '';

/** Weighted by graded attempts — score / pass rate only count GRADED. */
function weightedAvg(rows: ExamRow[], pick: (r: ExamRow) => number | null): number | null {
  let sum = 0;
  let weight = 0;
  for (const r of rows) {
    const v = pick(r);
    const graded = r.submittedAttempts - r.pendingGrading;
    if (v == null || graded <= 0) continue;
    sum += v * graded;
    weight += graded;
  }
  return weight === 0 ? null : Math.round((sum / weight) * 10) / 10;
}

function buildCourses(): CmCourseStat[] {
  return COURSES.map((c) => {
    const rows = EXAMS.filter((e) => e.courseId === c.courseId);
    return {
      ...c,
      myExamCount: rows.length,
      submittedAttempts: rows.reduce((n, e) => n + e.submittedAttempts, 0),
      avgScore: weightedAvg(rows, (e) => e.avgScore),
      passRate: weightedAvg(rows, (e) => e.passRate),
    };
  });
}

function buildSummary(): CmDashboardSummary {
  const count = (status: CmExamStat['status']) => EXAMS.filter((e) => e.status === status).length;
  return {
    managedCourses: COURSES.length,
    // Students overlap across courses, so the distinct count is below the sum (501).
    activeStudents: 412,
    myExams: { total: EXAMS.length, published: count('PUBLISHED'), draft: count('DRAFT'), hidden: count('HIDDEN') },
    // 7-day window: a slice of the all-time attempts above.
    submittedAttempts7d: 138,
    avgScore: 64.8,
    passRate: 62.5,
    pendingGrading: EXAMS.reduce((n, e) => n + e.pendingGrading, 0),
    deltas: { submittedAttempts: 12.5, avgScore: -3.2, passRate: null },
  };
}

/** Server-side sort the exams endpoint will apply: lowest pass rate first, thin data last. */
function sortExamsByPassRate(rows: CmExamStat[], minAttempts: number): CmExamStat[] {
  const rank = (e: CmExamStat) => (e.submittedAttempts < minAttempts || e.passRate == null ? 1 : 0);
  return [...rows].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.passRate ?? Infinity) - (b.passRate ?? Infinity) ||
      b.submittedAttempts - a.submittedAttempts,
  );
}

// ---- Fake transport --------------------------------------------------------

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function respond<T>(section: string, ms: number, build: () => T): Promise<T> {
  await delay(ms);
  const failing = new URLSearchParams(window.location.search).get('cmMockError');
  if (failing === section || failing === 'all') {
    throw new Error(`Không tải được dữ liệu (${section}).`);
  }
  return build();
}

/** Mock of GET /dashboard/course-manager/summary?range=7d */
export function mockFetchCmSummary(_params: { range: '7d' }): Promise<CmDashboardSummary> {
  return respond('summary', 350, buildSummary);
}

/** Mock of GET /dashboard/course-manager/courses?sort=passRate — lowest pass rate first, no-data last. */
export function mockFetchCmCourses(_params: { sort: 'passRate' }): Promise<CmCourseStat[]> {
  return respond('courses', 400, () =>
    buildCourses().sort((a, b) => (a.passRate ?? Infinity) - (b.passRate ?? Infinity)),
  );
}

/** Mock of GET /dashboard/course-manager/exams?courseId=&sort=passRate&minAttempts=5 */
export function mockFetchCmExams(params: {
  courseId?: number;
  sort: 'passRate';
  minAttempts?: number;
}): Promise<CmExamStat[]> {
  return respond('exams', 450, () => {
    const rows = EXAMS.filter((e) => params.courseId == null || e.courseId === params.courseId).map(
      (e) => ({ ...e, courseTitle: courseTitleOf(e.courseId) }),
    );
    return sortExamsByPassRate(rows, params.minAttempts ?? CM_MIN_ATTEMPTS);
  });
}
