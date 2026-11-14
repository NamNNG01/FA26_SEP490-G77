import React, { useEffect, useRef, useState, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { Dropdown } from "@/components/ui/Dropdown";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { SearchInput } from "@/components/common/SearchInput";
import { Table, type TableColumn } from "@/components/ui/Table";
import { Icon } from "@/assets/icons";
import { useToast } from "@/components/ui/ToastHost";
import { getApiErrorMessage } from "@/utils/apiError";
import {
  examService,
  type ExamListItem,
  type ExamStatus,
} from "@/services/exam.service";
import {
  courseService,
  type CourseSummaryItem,
  type CourseModuleResponse,
} from "@/services/course.service";

type ExamListTab = "all" | "QUIZ" | "ASSESSMENT" | "CODE";
const asExam = (row: Record<string, unknown>) => row as unknown as ExamListItem;

export function ExamListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const rawTabParam = searchParams.get("tab") || "all";
  const tabParam: ExamListTab =
    rawTabParam === "all"
      ? "all"
      : rawTabParam === "QUIZ" || rawTabParam === "CODE"
        ? rawTabParam
        : "ASSESSMENT";
  const searchParam = searchParams.get("search") || "";
  const courseParam = searchParams.get("courseId") || "";
  const moduleParam = searchParams.get("moduleId") || "";
  const statusParam = searchParams.get("status") || "all";
  const pageParam = parseInt(searchParams.get("page") || "0", 10);

  const [activeTab, setActiveTab] = useState<ExamListTab>(tabParam);
  const [searchTerm, setSearchTerm] = useState(searchParam);
  const [selectedCourse, setSelectedCourse] = useState(courseParam);
  const [selectedModule, setSelectedModule] = useState(moduleParam);
  const [selectedStatus, setSelectedStatus] = useState(statusParam);
  const [page, setPage] = useState(isNaN(pageParam) ? 0 : pageParam);

  const [courses, setCourses] = useState<CourseSummaryItem[]>([]);
  const [modules, setModules] = useState<CourseModuleResponse[]>([]);
  const [exams, setExams] = useState<ExamListItem[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedExamIds, setSelectedExamIds] = useState<Set<number>>(
    new Set(),
  );

  const [statusDialogTarget, setStatusDialogTarget] = useState<{
    exam: ExamListItem;
    targetStatus: ExamStatus;
  } | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusWarnings, setStatusWarnings] = useState<string[]>([]);

  const [deleteDialogTarget, setDeleteDialogTarget] =
    useState<ExamListItem | null>(null);
  const [deleteConflict409, setDeleteConflict409] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [bulkDeleteSummary, setBulkDeleteSummary] = useState<{
    success: number;
    failed: number;
    errors: string[];
  } | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    courseService
      .getCourses()
      .then((res) => {
        setCourses(res.content || []);
      })
      .catch((err) => {
        setCourses([]);
        toast.error(getApiErrorMessage(err, "Failed to load courses."), {
          title: "Could not load courses",
          duration: null,
        });
      });
  }, [toast]);

  useEffect(() => {
    if (selectedCourse) {
      courseService
        .getCourseModules(selectedCourse)
        .then((mods) => {
          setModules(mods || []);
        })
        .catch((err) => {
          setModules([]);
          toast.error(
            getApiErrorMessage(err, "Failed to load course modules."),
            {
              title: "Could not load course modules",
              duration: null,
            },
          );
        });
    } else {
      setModules([]);
      setSelectedModule("");
    }
  }, [selectedCourse, toast]);

  const updateUrlParams = (
    updates: Record<string, string | number | undefined>,
  ) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(updates).forEach(([key, val]) => {
        if (
          val === undefined ||
          val === "" ||
          val === "all" ||
          (key === "page" && val === 0)
        ) {
          next.delete(key);
        } else {
          next.set(key, String(val));
        }
      });
      return next;
    });
  };

  const fetchExams = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    setLoading(true);
    setError(null);

    const filters = {
      search: searchTerm.trim() || undefined,
      courseId: selectedCourse ? Number(selectedCourse) : undefined,
      moduleId: selectedModule ? Number(selectedModule) : undefined,
      status:
        selectedStatus !== "all" ? (selectedStatus as ExamStatus) : undefined,
    };

    try {
      if (activeTab === "ASSESSMENT") {
        const allAssessments: ExamListItem[] = [];
        let currentPage = 0;
        let hasMore = true;
        while (hasMore) {
          const response = await examService.getExams({
            ...filters,
            page: currentPage,
            size: 100,
          });
          allAssessments.push(
            ...(response.content || []).filter(
              (exam) => exam.examKind !== "QUIZ" && exam.examKind !== "CODE",
            ),
          );
          hasMore = !response.last && response.content.length > 0;
          currentPage += 1;
        }
        allAssessments.sort(
          (a, b) =>
            b.createdAt.localeCompare(a.createdAt) || b.examId - a.examId,
        );
        setExams(allAssessments.slice(page * 15, page * 15 + 15));
        setTotalElements(allAssessments.length);
        setTotalPages(Math.max(1, Math.ceil(allAssessments.length / 15)));
      } else {
        const response = await examService.getExams({
          ...filters,
          examKind: activeTab === "all" ? undefined : activeTab,
          page,
          size: 15,
        });
        setExams(response.content || []);
        setTotalElements(response.totalElements || 0);
        setTotalPages(response.totalPages || 1);
      }
      setSelectedExamIds(new Set());
    } catch (err: unknown) {
      const errorObj = err as {
        name?: string;
        response?: { status?: number; data?: { message?: string } };
      };
      if (errorObj?.name === "CanceledError" || errorObj?.name === "AbortError")
        return;
      if (errorObj?.response?.status === 403) {
        const message =
          "You do not have permission to view exams for this course.";
        setError(message);
        toast.error(message, { title: "Could not load exams", duration: null });
      } else {
        const message = getApiErrorMessage(err, "Failed to load exams.");
        setError(message);
        toast.error(message, { title: "Could not load exams", duration: null });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchExams();
    }, 400);

    return () => clearTimeout(handler);
  }, [
    activeTab,
    searchTerm,
    selectedCourse,
    selectedModule,
    selectedStatus,
    page,
  ]);

  const handleTabChange = (tab: ExamListTab) => {
    setActiveTab(tab);
    setPage(0);
    updateUrlParams({ tab, page: 0 });
  };

  const handleNewExam = (kind: "QUIZ" | "ESSAY" | "CODE") => {
    navigate(`/manager/exams/${kind.toLowerCase()}/new`);
  };

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setPage(0);
    updateUrlParams({ search: val, page: 0 });
  };

  const handleCourseChange = (val: string) => {
    setSelectedCourse(val);
    setSelectedModule("");
    setPage(0);
    updateUrlParams({ courseId: val, moduleId: "", page: 0 });
  };

  const handleModuleChange = (val: string) => {
    setSelectedModule(val);
    setPage(0);
    updateUrlParams({ moduleId: val, page: 0 });
  };

  const handleStatusChange = (val: string) => {
    setSelectedStatus(val);
    setPage(0);
    updateUrlParams({ status: val, page: 0 });
  };

  const handleExportCsv = () => {
    if (exams.length === 0) {
      toast.warning("No exam rows to export.");
      return;
    }

    const headers = [
      "ID",
      "Title",
      "Exam Kind",
      "Course",
      "Module",
      "Questions",
      "Max Score",
      "Duration (min)",
      "Status",
      "Generation Type",
      "Mode",
      "Created At",
    ];

    const rows = exams.map((e) => [
      e.examId,
      `"${(e.title || "").replace(/"/g, '""')}"`,
      e.examKind,
      `"${(e.courseName || "").replace(/"/g, '""')}"`,
      `"${(e.moduleName || "").replace(/"/g, '""')}"`,
      e.questionCount,
      e.maxScore ?? e.totalPoints ?? 0,
      e.durationMinutes,
      e.status,
      e.generationType,
      e.mode ?? "EXAM",
      `"${new Date(e.createdAt).toLocaleString()}"`,
    ]);

    const csvContent =
      "\uFEFF" +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `exams_export_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Exams exported to CSV.");
  };

  const handleEditExam = (exam: ExamListItem) => {
    if (exam.examKind === "QUIZ") {
      navigate(`/manager/exams/quiz/${exam.examId}`);
    } else if (exam.examKind === "CODE") {
      navigate(`/manager/exams/code/${exam.examId}`);
    } else {
      navigate(`/manager/exams/essay/${exam.examId}`);
    }
  };

  const handleApplyStatusChange = async () => {
    if (!statusDialogTarget) return;
    setStatusUpdating(true);
    setStatusWarnings([]);

    try {
      const res = await examService.patchPublishExam(
        statusDialogTarget.exam.examId,
        statusDialogTarget.targetStatus,
      );

      setExams((prev) =>
        prev.map((e) =>
          e.examId === statusDialogTarget.exam.examId
            ? { ...e, status: res.status }
            : e,
        ),
      );

      if (res.warnings && res.warnings.length > 0) {
        setStatusWarnings(res.warnings);
        toast.warning(`Exam updated to ${res.status} with warnings.`);
      } else {
        toast.success(`Exam successfully updated to ${res.status}.`);
        setStatusDialogTarget(null);
      }
    } catch (err: unknown) {
      const errorObj = err as { response?: { status?: number } };
      if (errorObj?.response?.status === 400) {
        toast.error(
          getApiErrorMessage(
            err,
            "Exam has 0 questions and cannot be published.",
          ),
        );
      } else {
        toast.error(getApiErrorMessage(err, "Failed to update exam status."));
      }
      setStatusDialogTarget(null);
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleDeleteExam = async () => {
    if (!deleteDialogTarget) return;
    setDeleting(true);

    try {
      await examService.deleteExam(deleteDialogTarget.examId);
      toast.success("Exam deleted successfully.");
      setDeleteDialogTarget(null);
      setDeleteConflict409(false);
      fetchExams();
    } catch (err: unknown) {
      const errorObj = err as { response?: { status?: number } };
      if (errorObj?.response?.status === 409) {
        setDeleteConflict409(true);
      } else {
        toast.error(getApiErrorMessage(err, "Failed to delete exam."));
        setDeleteDialogTarget(null);
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedExamIds.size === 0) return;
    setBulkDeleting(true);
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const examId of selectedExamIds) {
      try {
        await examService.deleteExam(examId);
        success++;
      } catch (err) {
        failed++;
        errors.push(
          getApiErrorMessage(err, "Failed to delete exam #" + examId + "."),
        );
      }
    }

    setBulkDeleteConfirmOpen(false);
    setBulkDeleteSummary({ success, failed, errors });
    setBulkDeleting(false);
    setSelectedExamIds(new Set());
    fetchExams();
  };

  const columns: TableColumn[] = [
    { key: 'title', label: 'Exam title', render: value => <span className="line-clamp-2 whitespace-normal font-medium text-content" title={asExam(value).title}>{asExam(value).title}</span> },
    { key: 'courseName', label: 'Course', render: value => <span className="block truncate" title={asExam(value).courseName}>{asExam(value).courseName}</span> },
    { key: 'moduleName', label: 'Module', render: value => asExam(value).moduleName || '—' },
    { key: 'examKind', label: 'Kind', render: value => {
      const kind = asExam(value).examKind;
      return <Badge variant={kind === 'QUIZ' ? 'purple' : kind === 'CODE' ? 'warning' : 'default'} className="whitespace-nowrap text-2xs">{kind === 'DIAGRAM' || !kind ? 'ESSAY' : kind}</Badge>;
    } },
    { key: 'questionCount', label: 'Questions', className: 'whitespace-nowrap', render: value => asExam(value).questionCount },
    { key: 'maxScore', label: 'Max score', className: 'whitespace-nowrap', render: value => {
      const exam = asExam(value);
      return exam.maxScore ?? exam.totalPoints ?? 0;
    } },
    { key: 'durationMinutes', label: 'Duration', className: 'whitespace-nowrap', render: value => `${asExam(value).durationMinutes}m` },
    { key: 'status', label: 'Status', render: value => {
      const status = asExam(value).status;
      return <Badge variant={status === 'PUBLISHED' ? 'success' : status === 'ARCHIVED' ? 'default' : 'warning'} className="whitespace-nowrap text-2xs">{status.charAt(0) + status.slice(1).toLowerCase()}</Badge>;
    } },
    { key: 'createdAt', label: 'Created', className: 'whitespace-nowrap', render: value => new Date(asExam(value).createdAt).toLocaleDateString() },
    { key: 'actions', label: 'Actions', className: 'whitespace-nowrap', render: value => {
      const exam = asExam(value);
      return <div onClick={event => event.stopPropagation()}><Dropdown
        trigger={<button type="button" aria-label={`Actions for ${exam.title}`} className="rounded-[6px] p-1.5 text-content-subtle hover:bg-surface-hover hover:text-content"><Icon.MoreHorizontal className="h-4 w-4" /></button>}
        items={[
          { label: 'Edit', icon: <Icon.Edit className="h-4 w-4" />, onClick: () => handleEditExam(exam) },
          { label: exam.status === 'PUBLISHED' ? 'Unpublish to Draft' : 'Publish', icon: exam.status === 'PUBLISHED' ? <Icon.EyeOff className="h-4 w-4" /> : <Icon.CheckCircle className="h-4 w-4" />, disabled: exam.status !== 'PUBLISHED' && exam.questionCount === 0 && exam.generationType === 'STATIC', onClick: () => setStatusDialogTarget({ exam, targetStatus: exam.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED' }) },
          { label: 'Archive', icon: <Icon.Archive className="h-4 w-4" />, disabled: exam.status === 'ARCHIVED', onClick: () => setStatusDialogTarget({ exam, targetStatus: 'ARCHIVED' }) },
          { divider: true } as { label: string; divider: true },
          { label: 'Delete', icon: <Icon.Trash className="h-4 w-4" />, danger: true, onClick: () => { setDeleteConflict409(false); setDeleteDialogTarget(exam); } },
        ]}
      /></div>;
    } },
  ];
  const tableRows = exams.map(exam => ({ ...exam, id: exam.examId }));
  const filtersActive = Boolean(searchTerm || selectedCourse || selectedModule || selectedStatus !== 'all');
  const clearFilters = () => {
    setSearchTerm('');
    setSelectedCourse('');
    setSelectedModule('');
    setSelectedStatus('all');
    setPage(0);
    updateUrlParams({ search: '', courseId: '', moduleId: '', status: 'all', page: 0 });
  };

  return (
    <div className="p-8 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-content">Exams</h2>
          <p className="text-xs text-content-subtle mt-0.5">
            Manage quizzes and assessments, including essays, diagrams, and
            other response types.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {selectedExamIds.size > 0 && (
            <Button
              variant="danger"
              size="sm"
              loading={bulkDeleting}
              icon={<Icon.Trash className="w-4 h-4" />}
              onClick={() => setBulkDeleteConfirmOpen(true)}
            >
              Bulk Delete ({selectedExamIds.size})
            </Button>
          )}

          <Button
            variant="outline"
            icon={<Icon.Download className="w-4 h-4" />}
            onClick={handleExportCsv}
          >
            Export CSV
          </Button>

          <Dropdown
            trigger={
              <Button icon={<Icon.Plus className="w-4 h-4" />}>
                New Exam <Icon.ChevronDown className="w-4 h-4 ml-1" />
              </Button>
            }
            items={[
              {
                label: "Quiz Exam",
                icon: <Icon.HelpCircle className="w-4 h-4" />,
                onClick: () => navigate("/manager/exams/quiz/new"),
              },
              {
                label: "Assessment Exam",
                icon: <Icon.FileText className="w-4 h-4" />,
                onClick: () => handleNewExam("ESSAY"),
              },
              {
                label: "Code Exam",
                icon: <Icon.Code className="w-4 h-4" />,
                onClick: () => handleNewExam("CODE"),
              },
            ]}
          />
        </div>
      </div>

      <div className="flex border-b border-line">
        <button
          type="button"
          onClick={() => handleTabChange("all")}
          className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer ${
            activeTab === "all"
              ? "border-brand-ink text-brand-ink"
              : "border-transparent text-content-subtle hover:text-content"
          }`}
        >
          All Exams
        </button>
        <button
          type="button"
          onClick={() => handleTabChange("QUIZ")}
          className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === "QUIZ"
              ? "border-brand-ink text-brand-ink"
              : "border-transparent text-content-subtle hover:text-content"
          }`}
        >
          <Icon.HelpCircle className="w-4 h-4" />
          Quiz
        </button>
        <button
          type="button"
          onClick={() => handleTabChange("ASSESSMENT")}
          className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === "ASSESSMENT"
              ? "border-brand-ink text-brand-ink"
              : "border-transparent text-content-subtle hover:text-content"
          }`}
        >
          <Icon.FileText className="w-4 h-4" />
          Assessments
        </button>
        <button
          type="button"
          onClick={() => handleTabChange("CODE")}
          className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === "CODE"
              ? "border-brand-ink text-brand-ink"
              : "border-transparent text-content-subtle hover:text-content"
          }`}
        >
          <Icon.Code className="w-4 h-4" />
          Code
        </button>
      </div>

      <div className="card space-y-3 px-4 py-4">
        <SearchInput
          className="w-full"
          placeholder="Search exams…"
          value={searchTerm}
          onChange={e => handleSearchChange(e.target.value)}
          aria-label="Search exams"
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Select
            label="Course"
            value={selectedCourse}
            onChange={handleCourseChange}
            options={[{ label: 'All courses', value: '' }, ...courses.map(course => ({ label: course.title, value: String(course.courseId) }))]}
          />
          <Select
            label="Module"
            value={selectedModule}
            disabled={!selectedCourse}
            onChange={handleModuleChange}
            options={[{ label: selectedCourse ? 'All modules' : 'Select a course first', value: '' }, ...modules.map(module => ({ label: module.title, value: String(module.moduleId) }))]}
          />
          <Select
            label="Status"
            value={selectedStatus}
            onChange={handleStatusChange}
            options={[{ label: 'All statuses', value: 'all' }, { label: 'Draft', value: 'DRAFT' }, { label: 'Published', value: 'PUBLISHED' }, { label: 'Archived', value: 'ARCHIVED' }]}
          />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {filtersActive && <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-brand-ink hover:underline"><Icon.X className="h-3.5 w-3.5" />Clear filters</button>}
          <Badge variant="default" className="font-semibold text-xs">{totalElements} exams</Badge>
        </div>
      </div>

      <div className="card overflow-hidden">
        {error ? (
          <div className="space-y-3 p-12 text-center">
            <p className="text-sm font-medium text-danger">Exam list could not be loaded. See the notification for details.</p>
            <Button size="sm" variant="outline" onClick={fetchExams}>Retry</Button>
          </div>
        ) : loading ? (
          <div className="space-y-4 p-6">
            <Skeleton className="h-8 w-full rounded" />
            <Skeleton className="h-8 w-full rounded" />
            <Skeleton className="h-8 w-full rounded" />
            <Skeleton className="h-8 w-full rounded" />
          </div>
        ) : exams.length === 0 ? (
          <div className="space-y-3 p-16 text-center">
            <Icon.ClipboardList className="mx-auto h-10 w-10 text-content-subtle" />
            <h4 className="text-base font-semibold text-content">No exams found</h4>
            <p className="mx-auto max-w-sm text-xs text-content-subtle">There are no exams matching your search criteria. Create a quiz or assessment to get started.</p>
            <div className="flex justify-center pt-2">
              {activeTab === 'ASSESSMENT' ? <Button onClick={() => handleNewExam('ESSAY')} icon={<Icon.Plus className="h-4 w-4" />}>New Assessment</Button>
                : activeTab === 'CODE' ? <Button onClick={() => handleNewExam('CODE')} icon={<Icon.Plus className="h-4 w-4" />}>New Code Exam</Button>
                  : <Button onClick={() => handleNewExam('QUIZ')} icon={<Icon.Plus className="h-4 w-4" />}>New Exam</Button>}
            </div>
          </div>
        ) : (
          <Table
            columns={columns}
            data={tableRows}
            selectable
            selectedKeys={new Set([...selectedExamIds].map(String))}
            onSelectionChange={keys => setSelectedExamIds(new Set([...keys].map(Number)))}
            onRowClick={row => handleEditExam(row as unknown as ExamListItem)}
            isRowActive={row => selectedExamIds.has(Number(row.examId))}
            perPage={15}
            unit="exams"
            serverPagination={{ page: page + 1, total: totalElements, onChange: value => { const nextPage = value - 1; setPage(nextPage); updateUrlParams({ page: nextPage }); } }}
          />
        )}
      </div>
      <ConfirmDialog
        open={statusDialogTarget !== null && statusWarnings.length === 0}
        onClose={() => setStatusDialogTarget(null)}
        onConfirm={handleApplyStatusChange}
        loading={statusUpdating}
        title={`Change status to ${statusDialogTarget?.targetStatus}?`}
        description={
          <>
            <strong className="text-content">"{statusDialogTarget?.exam.title}"</strong>{" "}
            will be moved to{" "}
            <strong className="text-brand-ink">{statusDialogTarget?.targetStatus}</strong>.
          </>
        }
        confirmLabel="Confirm"
      />

      {/* After a publish that went through with warnings — information only. */}
      <Modal
        open={statusDialogTarget !== null && statusWarnings.length > 0}
        onClose={() => {
          setStatusDialogTarget(null);
          setStatusWarnings([]);
        }}
        title={`Confirm ${statusDialogTarget?.targetStatus}`}
        size="sm"
        footer={
          <Button
            variant="outline"
            onClick={() => {
              setStatusDialogTarget(null);
              setStatusWarnings([]);
            }}
          >
            Close
          </Button>
        }
      >
        <div className="p-3 bg-warning-light/40 border border-warning-line rounded-[8px] space-y-1 text-xs text-warning-strong">
          <p className="font-semibold">
            Published successfully with warnings:
          </p>
          {statusWarnings.map((w, idx) => (
            <p key={idx}>• {w}</p>
          ))}
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteDialogTarget !== null && !deleteConflict409}
        onClose={() => setDeleteDialogTarget(null)}
        onConfirm={handleDeleteExam}
        loading={deleting}
        tone="danger"
        title="Delete this exam?"
        description={
          <>
            <strong className="text-content">"{deleteDialogTarget?.title}"</strong>{" "}
            will be permanently deleted. Only drafts with no submissions can be
            deleted — archive an exam to keep its attempt history.
          </>
        }
        confirmLabel="Delete"
      />

      <ConfirmDialog
        open={deleteDialogTarget !== null && deleteConflict409}
        onClose={() => {
          setDeleteDialogTarget(null);
          setDeleteConflict409(false);
        }}
        onConfirm={async () => {
          if (!deleteDialogTarget) return;
          try {
            await examService.patchPublishExam(
              deleteDialogTarget.examId,
              "ARCHIVED",
            );
          } catch (err: unknown) {
            toast.error(getApiErrorMessage(err, "Failed to archive exam."));
            return;
          }
          toast.success("Exam archived successfully.");
          setDeleteDialogTarget(null);
          setDeleteConflict409(false);
          fetchExams();
        }}
        title="This exam can't be deleted"
        description="Students have already submitted attempts for it. Archive the exam instead to preserve their grading history."
        confirmLabel="Archive instead"
      />

      <ConfirmDialog
        open={bulkDeleteConfirmOpen}
        onClose={() => setBulkDeleteConfirmOpen(false)}
        onConfirm={handleBulkDelete}
        loading={bulkDeleting}
        confirmDisabled={selectedExamIds.size === 0}
        tone="danger"
        title={`Delete ${selectedExamIds.size} exam${selectedExamIds.size === 1 ? "" : "s"}?`}
        description="This action cannot be undone. Exams with student attempts may fail to delete."
        confirmLabel="Delete"
      />

      <Modal
        open={bulkDeleteSummary !== null}
        onClose={() => setBulkDeleteSummary(null)}
        title="Bulk Delete Summary"
        size="sm"
        footer={
          <Button onClick={() => setBulkDeleteSummary(null)}>Done</Button>
        }
      >
        <div className="space-y-2 text-sm text-content">
          {bulkDeleteSummary && bulkDeleteSummary.success > 0 && (
            <p className="text-success font-medium">
              Successfully deleted: {bulkDeleteSummary.success} exam(s).
            </p>
          )}
          {bulkDeleteSummary && bulkDeleteSummary.failed > 0 && (
            <div className="text-danger font-medium">
              <p>Failed to delete {bulkDeleteSummary.failed} exam(s).</p>
              {bulkDeleteSummary.errors.slice(0, 3).map((message, index) => (
                <p key={index} className="mt-1 text-xs font-normal">
                  {message}
                </p>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
