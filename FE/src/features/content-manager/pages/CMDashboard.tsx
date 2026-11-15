import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { StatCard } from '@/components/ui/StatCard';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { DashboardError } from '@/components/common/DashboardState';
import { Icon } from '@/assets/icons';
import { ROUTES } from '@/app/routes';
import type { CmDashboardSummary } from '@/services/cmDashboard.types';
import { CM_PASS_THRESHOLD_PERCENT } from '@/services/cmDashboard.types';
import { useCmDashboard } from '../hooks/useCmDashboard';
import { CmCoursePanel } from '../components/CmCoursePanel';
import { CmExamPanel } from '../components/CmExamPanel';
import { InfoTip, LabelWithInfo, fmtPct } from '../components/cmDashboardUi';

/**
 * CMDashboard (Course Manager) — v2
 *
 * Every figure comes from the DASH-05 endpoints (services/cmDashboard.service.ts), scoped
 * server-side to the courses this manager owns or co-manages and the course exams they created.
 *
 * KPI row, "Course của tôi" and "Hiệu suất bài thi" load and fail
 * independently. Clicking a course row and the course Select share one
 * filter state.
 */
export function CMDashboard() {
  const navigate = useNavigate();
  const { summary, courses, exams, loading, error, refresh } = useCmDashboard();
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);

  // Select options: the course list when loaded, otherwise whatever the exams reference.
  const courseOptions = useMemo(() => {
    if (courses) return courses.map((c) => ({ courseId: c.courseId, title: c.title }));
    const seen = new Map<number, string>();
    (exams ?? []).forEach((e) => seen.set(e.courseId, e.courseTitle));
    return [...seen].map(([courseId, title]) => ({ courseId, title }));
  }, [courses, exams]);

  return (
    <div className="p-8 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-content">Course Manager Dashboard</h2>
          </div>
          <p className="text-sm text-content-soft mt-0.5 flex items-center gap-1.5">
            Số liệu trực tiếp từ course và exam bạn quản lý
            <InfoTip side="bottom" label="Course dùng chung giữa nhiều CM; số liệu exam là của riêng bạn" />
          </p>
        </div>
        <Button
          variant="outline"
          icon={<Icon.RefreshCw className="w-4 h-4" />}
          onClick={() => refresh()}
          disabled={loading.summary || loading.courses || loading.exams}
        >
          Làm mới
        </Button>
      </div>

      {/* KPI row */}
      {loading.summary ? (
        <KpiSkeleton />
      ) : error.summary || !summary ? (
        <div className="card">
          <DashboardError bare message={error.summary ?? undefined} onRetry={() => refresh('summary')} />
        </div>
      ) : (
        <KpiRow summary={summary} />
      )}

      {/* Panels — 30 / 70 split on xl, stacked on smaller screens. */}
      <div className="grid grid-cols-1 xl:grid-cols-10 gap-6 items-start">
        <div className="min-w-0 xl:col-span-3">
          <CmCoursePanel
            courses={courses}
            loading={loading.courses}
            error={error.courses}
            onRetry={() => refresh('courses')}
            selectedCourseId={selectedCourseId}
            onSelectCourse={setSelectedCourseId}
            onViewAll={() => navigate(ROUTES.managerCourses)}
          />
        </div>
        <div className="min-w-0 xl:col-span-7">
          <CmExamPanel
            exams={exams}
            loading={loading.exams}
            error={error.exams}
            onRetry={() => refresh('exams')}
            courseOptions={courseOptions}
            selectedCourseId={selectedCourseId}
            onSelectCourse={setSelectedCourseId}
            onViewAll={() => navigate(ROUTES.managerExams)}
          />
        </div>
      </div>
    </div>
  );
}

const KPI_GRID = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4';

function KpiSkeleton() {
  return (
    <div className={KPI_GRID} aria-busy>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="card p-5 flex flex-col gap-4">
          <Skeleton className="h-4 w-24 rounded" />
          <Skeleton className="h-8 w-16 rounded" />
          <Skeleton className="h-3 w-28 rounded" />
        </div>
      ))}
    </div>
  );
}

function KpiRow({ summary: s }: { summary: CmDashboardSummary }) {
  return (
    <div className={KPI_GRID}>
      <StatCard title="Course đang quản lý" value={String(s.managedCourses)} icon={<Icon.Book />} />
      <StatCard
        title={<LabelWithInfo info="Chỉ tính enrollment ACTIVE">Học viên đang tham gia</LabelWithInfo>}
        value={s.activeStudents.toLocaleString()}
        icon={<Icon.Users />}
      />
      <StatCard
        title={<LabelWithInfo info="Exam do bạn tạo, trong các course bạn còn quản lý">Exam của tôi</LabelWithInfo>}
        value={String(s.myExams.total)}
        icon={<Icon.FileText />}
        footer={
          <p className="text-sm text-content-subtle">
            {s.myExams.published} published · {s.myExams.draft} draft · {s.myExams.archived} archived
          </p>
        }
      />
      <StatCard
        title={<LabelWithInfo info="Attempt đã nộp trong 7 ngày gần nhất, tính cả bài đang chờ chấm">Bài nộp (7 ngày)</LabelWithInfo>}
        value={s.submittedAttempts7d.toLocaleString()}
        icon={<Icon.Upload />}
      />
      <StatCard
        title={
          <LabelWithInfo info={`Điểm phần trăm trung bình của các attempt đã chấm; pass rate tính từ ${CM_PASS_THRESHOLD_PERCENT}% điểm tối đa trở lên`}>
            Điểm trung bình
          </LabelWithInfo>
        }
        value={fmtPct(s.avgScore)}
        icon={<Icon.BarChart />}
        footer={<p className="text-sm text-content-subtle">Pass rate {fmtPct(s.passRate)}</p>}
      />
      <StatCard
        title={<LabelWithInfo info="Attempt đã nộp nhưng chưa chấm xong (chờ AI hoặc đang chấm)">Chờ chấm</LabelWithInfo>}
        value={s.pendingGrading.toLocaleString()}
        icon={<Icon.Clock />}
      />
    </div>
  );
}
