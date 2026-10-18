import React, { useMemo } from 'react';
import { Table, type TableColumn } from '@/components/ui/Table';
import { Badge, Chip } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DashboardError } from '@/components/common/DashboardState';
import type { CmExamStat } from '@/services/cmDashboard.types';
import {
  MetricCell,
  Panel,
  PanelEmpty,
  PanelSkeleton,
  fmtMinutes,
  fmtPct,
  fmtScore,
  passRateTone,
} from './cmDashboardUi';

/**
 * "Hiệu suất bài thi". Rows arrive already sorted by the (mock) API:
 * lowest pass rate first, exams under 5 attempts last — filtering by
 * course keeps that order.
 */
export function CmExamPanel({ exams, loading, error, onRetry, courseOptions, selectedCourseId, onSelectCourse, onViewAll }: {
  exams: CmExamStat[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  courseOptions: { courseId: number; title: string }[];
  selectedCourseId: number | null;
  onSelectCourse: (courseId: number | null) => void;
  onViewAll: () => void;
}) {
  const visible = useMemo(
    () => (exams ?? []).filter((e) => selectedCourseId == null || e.courseId === selectedCourseId),
    [exams, selectedCourseId],
  );

  const of = (row: Record<string, unknown>) => row.stat as CmExamStat;

  const columns: TableColumn[] = [
    {
      key: 'title',
      label: 'Tên exam',
      render: (row) => {
        const e = of(row);
        return (
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate font-medium text-foreground" title={e.title}>{e.title}</span>
            {e.status === 'HIDDEN' && <Badge variant="default" className="flex-shrink-0">Đã ẩn</Badge>}
            {e.status === 'DRAFT' && <Badge variant="warning" className="flex-shrink-0">Draft</Badge>}
          </div>
        );
      },
    },
    {
      key: 'courseTitle',
      label: 'Course',
      render: (row) => <span className="block truncate max-w-[160px]" title={of(row).courseTitle}>{of(row).courseTitle}</span>,
    },
    { key: 'submittedAttempts', label: 'Bài nộp', render: (row) => of(row).submittedAttempts },
    {
      key: 'avgScore',
      label: 'Điểm TB',
      overflowVisible: true,
      render: (row) => <MetricCell text={fmtScore(of(row).avgScore)} attempts={of(row).submittedAttempts} />,
    },
    {
      key: 'passRate',
      label: 'Pass rate',
      overflowVisible: true,
      render: (row) => {
        const e = of(row);
        return <MetricCell text={fmtPct(e.passRate)} attempts={e.submittedAttempts} tone={passRateTone(e.passRate)} />;
      },
    },
    {
      key: 'avgDurationMinutes',
      label: 'Thời gian TB',
      render: (row) => <span className="whitespace-nowrap">{fmtMinutes(of(row).avgDurationMinutes)}</span>,
    },
  ];

  const rows = visible.map((e) => ({ id: e.examId, stat: e }));
  const selectedTitle = courseOptions.find((c) => c.courseId === selectedCourseId)?.title;

  return (
    <Panel
      title="Hiệu suất bài thi"
      count={exams && <Badge variant="default">{visible.length} exam</Badge>}
      actions={
        <>
          {/* The filter is set by clicking a course in the left panel; this chip shows / clears it. */}
          {selectedTitle && (
            <Chip active onRemove={() => onSelectCourse(null)}>
              <span className="max-w-[200px] truncate">Course: {selectedTitle}</span>
            </Chip>
          )}
          <Button variant="outline" size="sm" onClick={onViewAll}>
            Xem tất cả
          </Button>
        </>
      }
    >
      {loading ? (
        <PanelSkeleton />
      ) : error ? (
        <DashboardError bare message={error} onRetry={onRetry} />
      ) : rows.length === 0 ? (
        <PanelEmpty
          message={selectedTitle ? `Bạn chưa có exam nào trong “${selectedTitle}”.` : 'Bạn chưa tạo exam nào.'}
        />
      ) : (
        <>
          <p className="px-5 pt-3 text-xs text-muted-foreground">
            Pass rate thấp nhất lên đầu · exam dưới 5 bài nộp xếp cuối.
          </p>
          <Table columns={columns} data={rows} unit="exam" resetKey={selectedCourseId ?? 'all'} />
        </>
      )}
    </Panel>
  );
}
