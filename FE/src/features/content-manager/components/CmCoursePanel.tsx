import React, { useState } from 'react';
import { Table, type TableColumn } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DashboardError } from '@/components/common/DashboardState';
import { SearchInput } from '@/components/common/SearchInput';
import { Icon } from '@/assets/icons';
import type { CmCourseStat } from '@/services/cmDashboard.types';
import { LabelWithInfo, Panel, PanelEmpty, PanelSkeleton } from './cmDashboardUi';

/** Case- and accent-insensitive, so "cau truc" finds "Cấu trúc". */
const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

/** "Course của tôi" — click a row to filter the exam panel by that course. */
export function CmCoursePanel({ courses, loading, error, onRetry, selectedCourseId, onSelectCourse, onViewAll }: {
  courses: CmCourseStat[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  selectedCourseId: number | null;
  /** Called with null when the selected row is clicked again. */
  onSelectCourse: (courseId: number | null) => void;
  onViewAll: () => void;
}) {
  const [query, setQuery] = useState('');
  const of = (row: Record<string, unknown>) => row.stat as CmCourseStat;

  // One stacked column: the panel is only a quarter of the width on xl.
  const columns: TableColumn[] = [
    {
      key: 'course',
      label: 'Course',
      render: (row) => {
        const c = of(row);
        return (
          <div className="min-w-0">
            <p className="line-clamp-2 font-medium text-foreground" title={c.title}>{c.title}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Icon.Users className="w-3.5 h-3.5" />
                {c.activeStudents} học viên
              </span>
              <span aria-hidden>·</span>
              {c.myExamCount === 0 ? (
                <span className="italic">Chưa có exam</span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Icon.FileText className="w-3.5 h-3.5" />
                  {c.myExamCount} exam
                </span>
              )}
            </p>
          </div>
        );
      },
    },
  ];

  const q = normalize(query.trim());
  const rows = (courses ?? [])
    .filter((c) => !q || normalize(c.title).includes(q))
    .map((c) => ({ id: c.courseId, stat: c }));

  return (
    <Panel
      title={<LabelWithInfo side="bottom" info="Course dùng chung giữa nhiều CM; số liệu exam là của riêng bạn">Course của tôi</LabelWithInfo>}
      count={courses && <Badge variant="default">{courses.length} course</Badge>}
      actions={
        <Button variant="outline" size="sm" onClick={onViewAll}>
          Xem tất cả
        </Button>
      }
    >
      {loading ? (
        <PanelSkeleton />
      ) : error ? (
        <DashboardError bare message={error} onRetry={onRetry} />
      ) : !courses || courses.length === 0 ? (
        <PanelEmpty message="Bạn chưa được giao quản lý course nào." />
      ) : (
        <>
          <div className="px-5 pt-4">
            <SearchInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm course…"
              aria-label="Tìm course"
            />
            <p className="mt-2 text-xs text-muted-foreground">Chọn một course để lọc bảng hiệu suất bài thi.</p>
          </div>
          {rows.length === 0 ? (
            <PanelEmpty message={`Không tìm thấy course nào khớp “${query.trim()}”.`} />
          ) : (
          <Table
            columns={columns}
            data={rows}
            unit="course"
            resetKey={q}
            onRowClick={(row) => {
              const id = of(row).courseId;
              onSelectCourse(id === selectedCourseId ? null : id);
            }}
            isRowActive={(row) => of(row).courseId === selectedCourseId}
          />
          )}
        </>
      )}
    </Panel>
  );
}
