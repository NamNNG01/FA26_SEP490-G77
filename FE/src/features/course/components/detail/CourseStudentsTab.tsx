import React from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Progress } from "@/components/ui/Progress";
import { Select } from "@/components/ui/Select";
import { Table } from "@/components/ui/Table";
import { SearchInput } from "@/components/common/SearchInput";
import { Icon } from "@/assets/icons";
import type { CourseStudentItem } from "@/services/course.service";
import { exportStudentsToCsv, formatTimestamp } from "../../utils/courseCsv";

const studentColumns = [
  {
    key: "name",
    label: "Student",
    render: (r: Record<string, unknown>) => {
      const s = r as unknown as CourseStudentItem;
      return (
        <div className="flex items-center gap-2.5">
          <Avatar name={s.fullName} size="sm" src={s.avatarUrl || undefined} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-content truncate">{s.fullName}</p>
            <p className="text-2xs text-content-subtle truncate">{s.email}</p>
          </div>
        </div>
      );
    },
  },
  {
    key: "enrolledAt",
    label: "Enrolled At",
    render: (r: Record<string, unknown>) => (
      <span className="text-sm text-content-soft">{formatTimestamp(r.enrolledAt as string)}</span>
    ),
  },
  {
    key: "status",
    label: "Status",
    render: (r: Record<string, unknown>) => (
      <Badge variant={r.status === "ACTIVE" ? "success" : "default"}>{String(r.status)}</Badge>
    ),
  },
  {
    key: "progress",
    label: "Progress",
    render: (r: Record<string, unknown>) => (
      <div className="flex items-center gap-2 w-36">
        <Progress value={Number(r.progress)} size="sm" />
        <span className="text-xs font-medium text-content-secondary">{Number(r.progress)}%</span>
      </div>
    ),
  },
];

interface CourseStudentsTabProps {
  courseTitle: string;
  students: CourseStudentItem[];
  studentTotal: number;
  studentSearch: string;
  onSearchChange: (v: string) => void;
  studentStatus: string;
  onStatusChange: (v: string) => void;
  loadingStudents: boolean;
  studentsError: string | null;
  onRetry: () => void;
}

export function CourseStudentsTab({
  courseTitle,
  students,
  studentTotal,
  studentSearch,
  onSearchChange,
  studentStatus,
  onStatusChange,
  loadingStudents,
  studentsError,
  onRetry,
}: CourseStudentsTabProps) {
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-line-faint">
        <div className="flex items-center gap-3">
          <h4 className="text-lg font-semibold text-content">Enrolled Students</h4>
          <Badge variant="default">{studentTotal} students</Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          icon={<Icon.Download className="w-4 h-4" />}
          onClick={() => exportStudentsToCsv(students, courseTitle)}
          disabled={students.length === 0}
        >
          Export CSV
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 p-4 border-b border-line-faint bg-surface-alt">
        <SearchInput
          className="w-full sm:w-64"
          placeholder="Search by name or email…"
          value={studentSearch}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <Select
          value={studentStatus}
          onChange={onStatusChange}
          options={[
            { label: "All Status", value: "all" },
            { label: "Active", value: "ACTIVE" },
            { label: "Completed", value: "COMPLETED" },
          ]}
          className="w-full sm:w-36"
        />
      </div>

      {loadingStudents ? (
        <div className="p-12 text-center text-content-subtle">
          <div className="inline-block w-6 h-6 border-3 border-primary border-t-transparent rounded-full animate-spin mb-2" />
          <p className="text-sm">Loading enrolled students…</p>
        </div>
      ) : studentsError ? (
        <div className="p-6 text-center text-sm text-content-subtle">
          Student data could not be loaded. See the notification for details.
          <Button variant="outline" size="sm" className="mx-auto mt-3" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : students.length === 0 ? (
        <div className="p-12 text-center text-content-soft">
          <Icon.Users className="w-9 h-9 mx-auto text-content-subtle mb-2" />
          <p className="text-base font-medium text-content">No students enrolled yet</p>
          <p className="text-xs text-content-subtle mt-1 max-w-sm mx-auto">
            Students will appear here once they enroll in this course.
          </p>
        </div>
      ) : (
        <Table
          columns={studentColumns}
          data={students as unknown as Record<string, unknown>[]}
          unit="students"
        />
      )}
    </div>
  );
}
