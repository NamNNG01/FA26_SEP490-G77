import React, { useMemo, useState } from 'react';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { DashboardError } from '@/components/common/DashboardState';
import { useToast } from '@/components/ui/ToastHost';
import { Icon } from '@/assets/icons';
import type { CmDashboardSummary } from '@/services/cmDashboard.types';
import { useCmDashboard } from '../hooks/useCmDashboard';
import { CmCoursePanel } from '../components/CmCoursePanel';
import { CmExamPanel } from '../components/CmExamPanel';
import { InfoTip, LabelWithInfo } from '../components/cmDashboardUi';

/**
 * CMDashboard (Course Manager) — v2
 *
 * DEMO: every figure is mock data served by useCmDashboard
 * (mocks/cmDashboard.mock.ts) because the backend has no endpoints for this
 * layout yet; the planned contract is documented in
 * services/cmDashboard.types.ts. The old GET /dashboard/course-manager call
 * (dashboardService.getManagerDashboard) is no longer used by this page.
 *
 * KPI row, "Course của tôi" and "Hiệu suất bài thi" load and fail
 * independently. Clicking a course row and the course Select share one
 * filter state.
 */
export function CMDashboard() {
  const toast = useToast();
  const { summary, courses, exams, loading, error, refresh } = useCmDashboard();
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);

  // Select options: the course list when loaded, otherwise whatever the exams reference.
  const courseOptions = useMemo(() => {
    if (courses) return courses.map((c) => ({ courseId: c.courseId, title: c.title }));
    const seen = new Map<number, string>();
    (exams ?? []).forEach((e) => seen.set(e.courseId, e.courseTitle));
    return [...seen].map(([courseId, title]) => ({ courseId, title }));
  }, [courses, exams]);

  const notReady = (what: string) => {
    console.log('[CMDashboard] not implemented yet:', what);
    toast.info('Đang phát triển');
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-content">Course Manager Dashboard</h2>
            <Badge variant="warning">Demo data</Badge>
          </div>
          <p className="text-sm text-content-soft mt-0.5 flex items-center gap-1.5">
            Số liệu cập nhật theo thời gian thực
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
            onViewAll={() => notReady('all courses')}
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
            onViewAll={() => notReady('all exams')}
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
            {s.myExams.published} published · {s.myExams.draft} draft · {s.myExams.hidden} ẩn
          </p>
        }
      />
    </div>
  );
}
