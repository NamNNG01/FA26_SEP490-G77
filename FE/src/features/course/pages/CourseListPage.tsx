import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Pagination } from "@/components/ui/Pagination";
import { Alert } from "@/components/ui/Alert";
import { CourseCard } from "@/components/common/CourseCard";
import { SearchInput } from "@/components/common/SearchInput";
import { Icon } from "@/assets/icons";
import {
  courseService,
  type CourseSummaryItem,
  type CategoryResponse,
  type CourseDetailResponse,
} from "@/services/course.service";
import { dashboardService } from "@/services/dashboard.service";
import { CreateCourseModal } from "@/components/courses/CreateCourseModal";
import { useAuth } from "@/auth/authContext";
import { Role } from "@/utils/permissions";

function formatTimestamp(isoString: string): string {
  if (!isoString) return "—";
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return isoString;
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return isoString;
  }
}

function exportCoursesToCsv(items: CourseSummaryItem[]) {
  if (!items.length) return;
  const headers = [
    "Course ID",
    "Title",
    "Category",
    "Status",
    "Modules",
    "Exams",
    "Students",
    "Price",
    "Manager",
    "Updated At",
  ];
  const rows = items.map((c) => [
    c.courseId,
    `"${c.title.replace(/"/g, '""')}"`,
    `"${(c.categoryName || "").replace(/"/g, '""')}"`,
    c.isPublished ? "Published" : "Draft",
    c.moduleCount,
    c.examCount,
    c.studentCount,
    c.price,
    `"${(c.managerName || "").replace(/"/g, '""')}"`,
    `"${c.updatedAt || ""}"`,
  ]);
  const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join(
    "\n",
  );
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute(
    "download",
    `courses_export_${new Date().toISOString().slice(0, 10)}.csv`,
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function CourseListPage({
  onNavigate,
  readonly,
}: {
  onNavigate?: (id: string, params?: Record<string, string>) => void;
  readonly?: boolean;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  // Only administrators create courses; Course Managers manage their content.
  const canCreate = user?.role === Role.ADMIN;

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const [courses, setCourses] = useState<CourseSummaryItem[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [categories, setCategories] = useState<CategoryResponse[]>([]);

  const [summaryStats, setSummaryStats] = useState({
    total: 0,
    published: 0,
    drafts: 0,
  });

  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useEffect(() => {
    courseService
      .getCategories()
      .then((res) => setCategories(res))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    dashboardService
      .getManagerDashboard()
      .then((data) => {
        setSummaryStats({
          total: data.summary.totalCourses,
          published: data.summary.publishedCourses,
          drafts: data.summary.draftCourses,
        });
      })
      .catch(() => {});
  }, []);

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const isPublishedParam =
        selectedStatus === "published"
          ? true
          : selectedStatus === "draft"
            ? false
            : undefined;

      const categoryIdParam =
        selectedCategory !== "all" && !Number.isNaN(Number(selectedCategory))
          ? Number(selectedCategory)
          : undefined;

      const data = await courseService.getCourses({
        search: search.trim() || undefined,
        categoryId: categoryIdParam,
        isPublished: isPublishedParam,
        page: page - 1,
        size: pageSize,
      });

      setCourses(data.content);
      setTotalElements(data.totalElements);

      setSummaryStats((prev) => {
        if (prev.total > 0) return prev;
        const pub = data.content.filter((c) => c.isPublished).length;
        const dft = data.content.filter((c) => !c.isPublished).length;
        return {
          total: data.totalElements,
          published: pub,
          drafts: dft,
        };
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to load courses. Please try again.";
      setError(msg);
      setCourses([]);
      setTotalElements(0);
    } finally {
      setLoading(false);
    }
  }, [search, selectedCategory, selectedStatus, page, pageSize]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleCategoryChange = (val: string) => {
    setSelectedCategory(val);
    setPage(1);
  };

  const handleStatusChange = (val: string) => {
    setSelectedStatus(val);
    setPage(1);
  };

  const handleCourseClick = (course: CourseSummaryItem) => {
    if (onNavigate) {
      onNavigate("course-detail", { courseId: String(course.courseId) });
    } else {
      navigate(`/manager/courses/${course.courseId}`);
    }
  };

  const handleCourseCreated = (newCourse: CourseDetailResponse) => {
    setIsCreateOpen(false);
    fetchCourses();
    if (onNavigate) {
      onNavigate("course-detail", { courseId: String(newCourse.courseId) });
    } else {
      navigate(`/manager/courses/${newCourse.courseId}`);
    }
  };

  const subjectOptions = [
    { label: "All Categories", value: "all" },
    ...categories.map((c) => ({ label: c.name, value: String(c.categoryId) })),
  ];

  const statusOptions = [
    { label: "All Status", value: "all" },
    { label: "Published", value: "published" },
    { label: "Draft", value: "draft" },
  ];

  return (
    <div className="p-8 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-content">Courses</h2>
          {readonly && (
            <p className="text-sm text-content-soft mt-0.5">
              Read-only access — courses are created by administrators.
            </p>
          )}
        </div>
        {!readonly && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              icon={<Icon.Download className="w-4 h-4" />}
              onClick={() => exportCoursesToCsv(courses)}
              disabled={courses.length === 0}
            >
              Export
            </Button>
            {canCreate && (
              <Button
                icon={<Icon.Plus className="w-4 h-4" />}
                onClick={() => {
                  if (onNavigate) {
                    onNavigate("course-create");
                  } else {
                    setIsCreateOpen(true);
                  }
                }}
              >
                New Course
              </Button>
            )}
          </div>
        )}
      </div>

      {readonly && (
        <Alert
          type="info"
          message="You can open a course to manage its modules, questions, and exams."
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          {
            label: "Total Courses",
            value: summaryStats.total,
            color: "#0D7C6C",
          },
          {
            label: "Published",
            value: summaryStats.published,
            color: "#16A34A",
          },
          { label: "Drafts", value: summaryStats.drafts, color: "#D97706" },
        ].map((s) => (
          <div key={s.label} className="card p-4 flex items-center gap-3">
            <div
              className="w-2 h-10 rounded-full flex-shrink-0"
              style={{ background: s.color }}
            />
            <div>
              <p className="text-xl font-bold text-content">{s.value}</p>
              <p className="text-xs text-content-subtle">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          className="w-full sm:w-64"
          placeholder="Search courses…"
          value={search}
          onChange={handleSearchChange}
        />
        <Select
          value={selectedCategory}
          onChange={handleCategoryChange}
          options={subjectOptions}
          className="w-full sm:w-48"
        />
        <Select
          value={selectedStatus}
          onChange={handleStatusChange}
          options={statusOptions}
          className="w-full sm:w-36"
        />
      </div>

      {error && (
        <Alert type="error" title="Could not load courses" message={error} />
      )}

      {loading && (
        <div className="py-16 text-center text-[#9CA3AF]">
          <div className="inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-[14px]">Loading courses…</p>
        </div>
      )}

      {!loading && courses.length === 0 && !error && (
        <div className="card p-12 text-center text-[#6B7280]">
          <Icon.Book className="w-10 h-10 mx-auto text-[#9CA3AF] mb-3" />
          <h3 className="text-[16px] font-semibold text-[#111827]">
            No courses found
          </h3>
          <p className="text-[13px] text-[#9CA3AF] mt-1 max-w-sm mx-auto">
            Try adjusting your search keywords or filters to find what you are
            looking for.
          </p>
        </div>
      )}

      {!loading && courses.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {courses.map((c) => (
            <CourseCard
              key={c.courseId}
              title={c.title}
              subject={c.categoryName || "Uncategorized"}
              status={c.isPublished ? "Published" : "Draft"}
              customMetrics={[
                { label: "Modules", value: c.moduleCount, color: "#2563EB" },
                { label: "Exams", value: c.examCount, color: "#059669" },
                { label: "Students", value: c.studentCount, color: "#7C3AED" },
                {
                  label: "Price",
                  value: c.price === 0 ? "Free" : `$${c.price}`,
                  color: "#D97706",
                },
              ]}
              managerName={c.managerName}
              updated={formatTimestamp(c.updatedAt)}
              onClick={() => handleCourseClick(c)}
            />
          ))}
        </div>
      )}

      {!loading && totalElements > 0 && (
        <div className="card overflow-hidden">
          <Pagination
            page={page}
            total={totalElements}
            perPage={pageSize}
            onChange={(newPage) => setPage(newPage)}
            unit="courses"
          />
        </div>
      )}

      <CreateCourseModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={handleCourseCreated}
      />
    </div>
  );
}
