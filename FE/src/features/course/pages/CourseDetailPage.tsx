import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Table } from "@/components/ui/Table";
import { Tabs } from "@/components/ui/Tabs";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Progress } from "@/components/ui/Progress";
import { Alert } from "@/components/ui/Alert";
import { ToastNotification } from "@/components/ui/ToastNotification";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { SearchInput } from "@/components/common/SearchInput";
import { Pagination } from "@/components/ui/Pagination";
import { Icon } from "@/assets/icons";
import {
  courseService,
  type CourseDetailResponse,
  type CourseManagerItem,
  type CourseModuleResponse,
  type CategoryResponse,
  type CourseStudentItem,
} from "@/services/course.service";
import { AddModuleModal } from "@/components/modules/AddModuleModal";
import { EditModuleModal } from "@/components/modules/EditModuleModal";
import { useAuth } from "@/auth/authContext";
import { Role } from "@/utils/permissions";

function formatTimestamp(isoString: string | null | undefined): string {
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

function exportStudentsToCsv(
  students: CourseStudentItem[],
  courseTitle: string,
) {
  if (!students.length) return;
  const headers = [
    "User ID",
    "Full Name",
    "Email",
    "Enrolled At",
    "Status",
    "Progress (%)",
  ];
  const rows = students.map((s) => [
    s.userId,
    `"${s.fullName.replace(/"/g, '""')}"`,
    `"${s.email.replace(/"/g, '""')}"`,
    `"${s.enrolledAt}"`,
    s.status,
    s.progress,
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
    `${courseTitle.replace(/\s+/g, "_")}_students_${new Date().toISOString().slice(0, 10)}.csv`,
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function CourseDetailPage({
  onNavigate,
  params: paramsProp,
}: {
  onNavigate?: (id: string, params?: Record<string, string>) => void;
  params?: Record<string, string>;
}) {
  const navigate = useNavigate();
  const routeParams = useParams();
  const rawId = paramsProp?.courseId ?? routeParams.courseId ?? "1";
  const courseId = rawId;
  const { user } = useAuth();
  const isAdmin = user?.role === Role.ADMIN;
  const canManageCourse = isAdmin;
  const canCreateModule = !isAdmin;

  const [tab, setTab] = useState("Course Details & Modules");

  const [course, setCourse] = useState<CourseDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [price, setPrice] = useState("0");
  const [saving, setSaving] = useState(false);

  const [categories, setCategories] = useState<CategoryResponse[]>([]);

  const [modules, setModules] = useState<CourseModuleResponse[]>([]);
  const [isAddModuleOpen, setIsAddModuleOpen] = useState(false);
  const [editingModule, setEditingModule] =
    useState<CourseModuleResponse | null>(null);
  const [moduleToDelete, setModuleToDelete] =
    useState<CourseModuleResponse | null>(null);
  const [deletingModule, setDeletingModule] = useState(false);

  const [isDeleteCourseOpen, setIsDeleteCourseOpen] = useState(false);
  const [deletingCourse, setDeletingCourse] = useState(false);

  const [students, setStudents] = useState<CourseStudentItem[]>([]);
  const [studentTotal, setStudentTotal] = useState(0);
  const [studentPage, setStudentPage] = useState(1);
  const studentPageSize = 10;
  const [studentSearch, setStudentSearch] = useState("");
  const [studentStatus, setStudentStatus] = useState("all");
  const [loadingStudents, setLoadingStudents] = useState(false);

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    courseService
      .getCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  const loadCourseData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await courseService.getCourseById(courseId);
      setCourse(data);
      setTitle(data.title);
      setDescription(data.description ?? "");
      setCategoryId(String(data.categoryId));
      setIsPublished(data.isPublished);
      setPrice(String(data.price ?? 0));
      setModules(data.modules ?? []);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to load course details.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    loadCourseData();
  }, [loadCourseData]);

  const loadStudents = useCallback(async () => {
    if (!courseId) return;
    setLoadingStudents(true);
    try {
      const res = await courseService.getCourseStudents(courseId, {
        search: studentSearch.trim() || undefined,
        status: studentStatus !== "all" ? studentStatus : undefined,
        page: studentPage - 1,
        size: studentPageSize,
      });
      setStudents(res.content);
      setStudentTotal(res.totalElements);
    } catch {
      setStudents([]);
      setStudentTotal(0);
    } finally {
      setLoadingStudents(false);
    }
  }, [courseId, studentSearch, studentStatus, studentPage, studentPageSize]);

  useEffect(() => {
    if (tab === "Enrolled Students") {
      loadStudents();
    }
  }, [tab, loadStudents]);

  const handleSaveChanges = async () => {
    if (!course) return;
    if (!title.trim()) {
      setToast({ type: "error", message: "Course title cannot be empty." });
      return;
    }
    setSaving(true);
    try {
      const updated = await courseService.updateCourse(course.courseId, {
        title: title.trim(),
        description: description.trim() || undefined,
        categoryId: categoryId ? Number(categoryId) : undefined,
        price: Number(price) >= 0 ? Number(price) : 0,
      });

      if (isPublished !== course.isPublished) {
        if (isPublished && modules.length === 0) {
          throw new Error(
            "Course must have at least 1 module to be published.",
          );
        }
        await courseService.publishCourse(course.courseId, isPublished);
      }

      setCourse({
        ...updated,
        isPublished,
        modules,
      });
      setToast({
        type: "success",
        message: "Course details successfully updated.",
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to save changes.";
      setToast({ type: "error", message: msg });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (onNavigate) {
      onNavigate("course-list");
    } else {
      navigate("/manager/courses");
    }
  };

  const handleModuleCreated = (newMod: CourseModuleResponse) => {
    setModules((prev) =>
      [...prev, newMod].sort((a, b) => a.orderIndex - b.orderIndex),
    );
    setToast({
      type: "success",
      message: `Module "${newMod.title}" added successfully.`,
    });
    courseService
      .getCourseModules(courseId)
      .then(setModules)
      .catch(() => {});
  };

  const handleModuleUpdated = (updatedMod: CourseModuleResponse | unknown) => {
    const mod = updatedMod as CourseModuleResponse;
    setModules((prev) =>
      prev
        .map((m) => (m.moduleId === mod.moduleId ? mod : m))
        .sort((a, b) => a.orderIndex - b.orderIndex),
    );
    setToast({
      type: "success",
      message: `Module "${mod.title}" updated successfully.`,
    });
    courseService
      .getCourseModules(courseId)
      .then(setModules)
      .catch(() => {});
  };

  const handleRemoveModule = async () => {
    if (!moduleToDelete) return;
    setDeletingModule(true);
    try {
      await courseService.deleteModule(moduleToDelete.moduleId);
      setModules((prev) =>
        prev.filter((m) => m.moduleId !== moduleToDelete.moduleId),
      );
      setToast({
        type: "success",
        message: `Module "${moduleToDelete.title}" removed.`,
      });
      setModuleToDelete(null);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to delete module.";
      setToast({ type: "error", message: msg });
    } finally {
      setDeletingModule(false);
    }
  };

  const handleDeleteCourse = async () => {
    if (!course) return;
    setDeletingCourse(true);
    try {
      await courseService.deleteCourse(course.courseId);
      setIsDeleteCourseOpen(false);
      if (onNavigate) {
        onNavigate("course-list");
      } else {
        navigate("/manager/courses");
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to delete course.";
      setToast({ type: "error", message: msg });
    } finally {
      setDeletingCourse(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 py-24 text-center text-content-subtle">
        <div className="inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-base">Loading course details…</p>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="p-8 space-y-4">
        <Breadcrumb
          items={[
            { label: "Courses", onClick: handleCancel },
            { label: "Course Detail" },
          ]}
        />
        <Alert
          type="error"
          title="Course Not Found"
          message={error || "Unable to retrieve course details."}
        />
        <Button variant="outline" onClick={handleCancel}>
          Back to Courses
        </Button>
      </div>
    );
  }

  const categoryOptions = categories.map((c) => ({
    label: c.name,
    value: String(c.categoryId),
  }));

  const studentColumns = [
    {
      key: "name",
      label: "Student",
      render: (r: Record<string, unknown>) => {
        const s = r as unknown as CourseStudentItem;
        return (
          <div className="flex items-center gap-2.5">
            <Avatar
              name={s.fullName}
              size="sm"
              src={s.avatarUrl || undefined}
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-content truncate">
                {s.fullName}
              </p>
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
        <span className="text-sm text-content-soft">
          {formatTimestamp(r.enrolledAt as string)}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (r: Record<string, unknown>) => (
        <Badge variant={r.status === "ACTIVE" ? "success" : "default"}>
          {String(r.status)}
        </Badge>
      ),
    },
    {
      key: "progress",
      label: "Progress",
      render: (r: Record<string, unknown>) => (
        <div className="flex items-center gap-2 w-36">
          <Progress value={Number(r.progress)} size="sm" />
          <span className="text-xs font-medium text-content-secondary">
            {Number(r.progress)}%
          </span>
        </div>
      ),
    },
  ];

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Breadcrumb
            items={[
              { label: "Courses", onClick: handleCancel },
              { label: course.title },
            ]}
          />
          <h2 className="text-xl font-bold text-content mt-1">Course Detail</h2>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleCancel} disabled={saving}>
            {canManageCourse ? "Cancel" : "Back"}
          </Button>
          {canManageCourse && (
            <Button
              icon={<Icon.Check className="w-4 h-4" />}
              onClick={handleSaveChanges}
              loading={saving}
              disabled={saving}
            >
              Save Changes
            </Button>
          )}
        </div>
      </div>

      <Tabs
        tabs={["Course Details & Modules", "Enrolled Students"]}
        active={tab}
        onChange={setTab}
      />

      {tab === "Course Details & Modules" && (
        <div className="space-y-6">
          <div className="card p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-content">Course Details</h3>
              <div className="flex items-center gap-2">
                <Badge variant={isPublished ? "success" : "warning"}>
                  {isPublished ? "Published" : "Draft"}
                </Badge>
                {canManageCourse && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger hover:bg-danger-light hover:text-danger"
                    icon={<Icon.Trash className="w-4 h-4" />}
                    onClick={() => setIsDeleteCourseOpen(true)}
                    title="Delete Course"
                  >
                    Delete
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <Input
                  label="Course Title"
                  required
                  value={title}
                  disabled={!canManageCourse}
                  readOnly={!canManageCourse}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Machine Learning Fundamentals"
                />

                <div>
                  <label className="text-sm font-medium text-content-secondary block mb-1.5">
                    Course Description
                  </label>
                  <textarea
                    className="w-full h-32 px-3.5 py-2.5 rounded-[10px] border border-line text-base text-content resize-none focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600 transition-all disabled:opacity-60 disabled:bg-surface-alt"
                    value={description}
                    disabled={!canManageCourse}
                    readOnly={!canManageCourse}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the course curriculum, learning outcomes, and prerequisites…"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <Select
                  label="Publication Status"
                  value={isPublished ? "published" : "draft"}
                  disabled={!canManageCourse}
                  onChange={(val) => setIsPublished(val === "published")}
                  options={[
                    { label: "Published", value: "published" },
                    { label: "Draft", value: "draft" },
                  ]}
                />

                <Select
                  label="Category"
                  value={categoryId}
                  disabled={!canManageCourse}
                  onChange={setCategoryId}
                  options={
                    categoryOptions.length > 0
                      ? categoryOptions
                      : [{ label: "Select Category", value: "" }]
                  }
                />

                <Input
                  label="URL Slug"
                  value={course.slug}
                  readOnly
                  disabled
                  hint="Slug is auto-generated by the server"
                />

                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Price ($)"
                    type="number"
                    min={0}
                    value={price}
                    disabled={!canManageCourse}
                    readOnly={!canManageCourse}
                    onChange={(e) => setPrice(e.target.value)}
                    hint={canManageCourse ? "0 = Free" : undefined}
                  />
                  <div>
                    <label className="text-sm font-medium text-content-secondary block mb-1.5">
                      Primary Manager
                    </label>
                    <p className="h-9 px-3 flex items-center text-sm font-medium text-content-secondary bg-surface-alt rounded-[10px] border border-line truncate">
                      {course.managerName || `ID: ${course.managerId}`}
                    </p>
                  </div>
                </div>

                <CourseManagerList course={course} />
              </div>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-line-faint">
              <div>
                <h4 className="text-lg font-semibold text-content">Modules</h4>
                <p className="text-xs text-content-subtle mt-0.5">
                  Manage curriculum modules, their display order, and associated
                  exams.
                </p>
              </div>

              {canCreateModule && (
                <Button
                  icon={<Icon.Plus className="w-4 h-4" />}
                  onClick={() => setIsAddModuleOpen(true)}
                >
                  Add Module
                </Button>
              )}
            </div>

            {modules.length === 0 ? (
              <div className="p-10 text-center text-content-soft">
                <Icon.Folder className="w-9 h-9 mx-auto text-content-subtle mb-2" />
                <p className="text-base font-medium text-content">
                  No modules added yet
                </p>
                <p className="text-xs text-content-subtle mt-1 max-w-sm mx-auto">
                  {canCreateModule
                    ? 'Click the "Add Module" button to create the first curriculum module for this course.'
                    : "No modules have been created for this course yet."}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-line-faint">
                <div className="hidden sm:grid grid-cols-12 gap-4 px-6 py-3 bg-surface-alt text-xs font-semibold text-content-soft">
                  <span className="col-span-1">Order</span>
                  <span
                    className={canCreateModule ? "col-span-4" : "col-span-5"}
                  >
                    Module Name
                  </span>
                  <span
                    className={canCreateModule ? "col-span-4" : "col-span-5"}
                  >
                    Description
                  </span>
                  <span className="col-span-1 text-center">Exams</span>
                  {canCreateModule && (
                    <span className="col-span-2 text-right">Actions</span>
                  )}
                </div>

                {modules.map((mod) => (
                  <div
                    key={mod.moduleId}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 px-6 py-3.5 items-center hover:bg-surface-alt transition-colors"
                  >
                    <div className="col-span-1 flex items-center gap-1.5">
                      <span className="w-6 h-6 rounded-full bg-primary-light text-brand-ink text-xs font-bold flex items-center justify-center">
                        {mod.orderIndex}
                      </span>
                    </div>

                    <div
                      className={
                        canCreateModule
                          ? "col-span-4 min-w-0"
                          : "col-span-5 min-w-0"
                      }
                    >
                      <p className="text-base font-semibold text-content truncate">
                        {mod.title}
                      </p>
                      <p className="text-2xs text-content-subtle sm:hidden">
                        {mod.examCount} exam{mod.examCount === 1 ? "" : "s"} ·{" "}
                        {mod.questionCount} questions
                      </p>
                    </div>

                    <div
                      className={
                        canCreateModule
                          ? "col-span-4 min-w-0"
                          : "col-span-5 min-w-0"
                      }
                    >
                      <p className="text-sm text-content-soft truncate">
                        {mod.description || (
                          <span className="italic text-content-subtle">
                            No description
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="col-span-1 text-center hidden sm:block">
                      <Badge variant="default">{mod.examCount}</Badge>
                    </div>

                    {canCreateModule && (
                      <div className="col-span-2 flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Icon.Edit className="w-3.5 h-3.5" />}
                          onClick={() => setEditingModule(mod)}
                          title="Edit Module"
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger hover:bg-danger-light hover:text-danger"
                          icon={<Icon.Trash className="w-3.5 h-3.5" />}
                          onClick={() => setModuleToDelete(mod)}
                          title="Remove Module"
                        >
                          Remove
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "Enrolled Students" && (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-line-faint">
            <div className="flex items-center gap-3">
              <h4 className="text-lg font-semibold text-content">
                Enrolled Students
              </h4>
              <Badge variant="default">{studentTotal} students</Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              icon={<Icon.Download className="w-4 h-4" />}
              onClick={() => exportStudentsToCsv(students, course.title)}
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
              onChange={(e) => {
                setStudentSearch(e.target.value);
                setStudentPage(1);
              }}
            />
            <Select
              value={studentStatus}
              onChange={(v) => {
                setStudentStatus(v);
                setStudentPage(1);
              }}
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
          ) : students.length === 0 ? (
            <div className="p-12 text-center text-content-soft">
              <Icon.Users className="w-9 h-9 mx-auto text-content-subtle mb-2" />
              <p className="text-base font-medium text-content">
                No students enrolled yet
              </p>
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
      )}

      <AddModuleModal
        open={isAddModuleOpen}
        courseId={course.courseId}
        onClose={() => setIsAddModuleOpen(false)}
        onCreated={handleModuleCreated}
      />

      <EditModuleModal
        open={!!editingModule}
        module={editingModule}
        onClose={() => setEditingModule(null)}
        onSaved={handleModuleUpdated}
      />

      <Modal
        open={!!moduleToDelete}
        onClose={() => setModuleToDelete(null)}
        title="Remove Module"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setModuleToDelete(null)}
              disabled={deletingModule}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleRemoveModule}
              loading={deletingModule}
              disabled={deletingModule}
            >
              {deletingModule ? "Removing…" : "Remove Module"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-base text-content-secondary">
            Are you sure you want to remove the module{" "}
            <span className="font-semibold text-content">
              "{moduleToDelete?.title}"
            </span>
            ?
          </p>
          <Alert
            type="warning"
            message="Questions and exams belonging to this module will not be deleted; they will become unassigned so you can reassign them later."
          />
        </div>
      </Modal>

      <Modal
        open={isDeleteCourseOpen}
        onClose={() => setIsDeleteCourseOpen(false)}
        title="Delete Course"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setIsDeleteCourseOpen(false)}
              disabled={deletingCourse}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteCourse}
              loading={deletingCourse}
              disabled={deletingCourse}
            >
              {deletingCourse ? "Deleting…" : "Delete Course"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-base text-content-secondary">
            Are you sure you want to permanently delete{" "}
            <span className="font-semibold text-content">"{course.title}"</span>
            ?
          </p>
          <Alert
            type="error"
            title="Destructive Action"
            message="This action cannot be undone. Courses with enrolled students cannot be deleted; unpublish the course instead."
          />
        </div>
      </Modal>

      {toast && (
        <ToastNotification
          variant={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

function CourseManagerList({
  course,
}: {
  course: CourseDetailResponse & { managers?: CourseManagerItem[] };
}) {
  const [expanded, setExpanded] = useState(false);

  const managerList: CourseManagerItem[] =
    course.managers && course.managers.length > 0
      ? course.managers
      : [
          {
            userId: course.managerId,
            fullName: course.managerName || `Manager #${course.managerId}`,
            email: undefined,
          },
        ];

  const INITIAL_SHOW = 3;
  const hasMore = managerList.length > INITIAL_SHOW;
  const visible = expanded ? managerList : managerList.slice(0, INITIAL_SHOW);

  return (
    <div>
      <label className="text-sm font-medium text-content-secondary block mb-2">
        Course Managers
        <span className="ml-1.5 text-xs font-normal text-content-soft">
          ({managerList.length})
        </span>
      </label>
      <div className="rounded-[10px] border border-line overflow-hidden">
        {visible.map((m, idx) => (
          <div
            key={m.userId}
            className={`flex items-center gap-3 px-3 py-2.5 text-sm ${idx > 0 ? "border-t border-line-faint" : ""} bg-surface-alt`}
          >
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-primary">
                {m.fullName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-content truncate">
                {m.fullName}
              </p>
              {m.email && (
                <p className="text-xs text-content-soft truncate">{m.email}</p>
              )}
            </div>
            {idx === 0 && (
              <span className="shrink-0 text-[11px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                Primary
              </span>
            )}
          </div>
        ))}
        {hasMore && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-content-soft hover:text-primary hover:bg-primary/5 border-t border-line-faint transition-colors"
          >
            {expanded ? (
              <>
                <Icon.ChevronDown className="w-3.5 h-3.5 rotate-180" />
                Show less
              </>
            ) : (
              <>
                <Icon.ChevronDown className="w-3.5 h-3.5" />
                Show {managerList.length - INITIAL_SHOW} more manager
                {managerList.length - INITIAL_SHOW !== 1 ? "s" : ""}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
