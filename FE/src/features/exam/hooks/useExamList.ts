import { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useToast } from "@/components/ui/ToastHost";
import { getApiErrorMessage } from "@/utils/apiError";
import { examService, type ExamListItem, type ExamStatus } from "@/services/exam.service";
import {
  courseService,
  type CourseSummaryItem,
  type CourseModuleResponse,
} from "@/services/course.service";
import { exportExamsToCsv } from "../utils/examCsv";

export type ExamListTab = "all" | "QUIZ" | "ASSESSMENT" | "CODE";

export interface StatusDialogTarget {
  exam: ExamListItem;
  targetStatus: ExamStatus;
}

export interface BulkDeleteSummary {
  success: number;
  failed: number;
  errors: string[];
}

export function useExamList() {
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

  const [selectedExamIds, setSelectedExamIds] = useState<Set<number>>(new Set());

  const [statusDialogTarget, setStatusDialogTarget] = useState<StatusDialogTarget | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [statusWarnings, setStatusWarnings] = useState<string[]>([]);

  const [deleteDialogTarget, setDeleteDialogTarget] = useState<ExamListItem | null>(null);
  const [deleteConflict409, setDeleteConflict409] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [bulkDeleteSummary, setBulkDeleteSummary] = useState<BulkDeleteSummary | null>(null);

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
          toast.error(getApiErrorMessage(err, "Failed to load course modules."), {
            title: "Could not load course modules",
            duration: null,
          });
        });
    } else {
      setModules([]);
      setSelectedModule("");
    }
  }, [selectedCourse, toast]);

  const updateUrlParams = (updates: Record<string, string | number | undefined>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(updates).forEach(([key, val]) => {
        if (val === undefined || val === "" || val === "all" || (key === "page" && val === 0)) {
          next.delete(key);
        } else {
          next.set(key, String(val));
        }
      });
      return next;
    });
  };

  /** `'quiet'` = shared auto-refresh: no loader; a failure keeps the list and shows no toast. */
  const fetchExams = async (mode?: "quiet") => {
    const quiet = mode === "quiet";
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortCtrl = new AbortController();
    abortControllerRef.current = abortCtrl;

    if (!quiet) {
      setLoading(true);
      setError(null);
    }

    const filters = {
      search: searchTerm.trim() || undefined,
      courseId: selectedCourse ? Number(selectedCourse) : undefined,
      moduleId: selectedModule ? Number(selectedModule) : undefined,
      status: selectedStatus !== "all" ? (selectedStatus as ExamStatus) : undefined,
    };

    try {
      if (activeTab === "ASSESSMENT") {
        const allAssessments: ExamListItem[] = [];
        let currentPage = 0;
        let hasMore = true;
        while (hasMore) {
          if (abortCtrl.signal.aborted) return;
          const response = await examService.getExams({
            ...filters,
            page: currentPage,
            size: 100,
          });
          if (abortCtrl.signal.aborted) return;
          allAssessments.push(
            ...(response.content || []).filter(
              (exam) => exam.examKind !== "QUIZ" && exam.examKind !== "CODE",
            ),
          );
          hasMore = !response.last && response.content.length > 0;
          currentPage += 1;
        }
        allAssessments.sort(
          (a, b) => b.createdAt.localeCompare(a.createdAt) || b.examId - a.examId,
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
        if (abortCtrl.signal.aborted) return;
        setExams(response.content || []);
        setTotalElements(response.totalElements || 0);
        setTotalPages(response.totalPages || 1);
      }
      setSelectedExamIds(new Set());
    } catch (err: unknown) {
      if (abortCtrl.signal.aborted) return;
      const errorObj = err as {
        name?: string;
        response?: { status?: number; data?: { message?: string } };
      };
      if (errorObj?.name === "CanceledError" || errorObj?.name === "AbortError") return;
      if (quiet) return;
      if (errorObj?.response?.status === 403) {
        const message = "You do not have permission to view exams for this course.";
        setError(message);
        toast.error(message, { title: "Could not load exams", duration: null });
      } else {
        const message = getApiErrorMessage(err, "Failed to load exams.");
        setError(message);
        toast.error(message, { title: "Could not load exams", duration: null });
      }
    } finally {
      if (!abortCtrl.signal.aborted) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchExams();
    }, 400);

    return () => clearTimeout(handler);
  }, [activeTab, searchTerm, selectedCourse, selectedModule, selectedStatus, page]);

  useAutoRefresh(() => void fetchExams("quiet"));

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

  const handlePageChange = (value: number) => {
    const nextPage = value - 1;
    setPage(nextPage);
    updateUrlParams({ page: nextPage });
  };

  const filtersActive = Boolean(
    searchTerm || selectedCourse || selectedModule || selectedStatus !== "all",
  );

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedCourse("");
    setSelectedModule("");
    setSelectedStatus("all");
    setPage(0);
    updateUrlParams({
      search: "",
      courseId: "",
      moduleId: "",
      status: "all",
      page: 0,
    });
  };

  const handleExportCsv = () => {
    if (!exportExamsToCsv(exams)) {
      toast.warning("No exam rows to export.");
      return;
    }
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
          e.examId === statusDialogTarget.exam.examId ? { ...e, status: res.status } : e,
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
        toast.error(getApiErrorMessage(err, "Exam has 0 questions and cannot be published."));
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

  const handleArchiveAfterConflict = async () => {
    if (!deleteDialogTarget) return;
    try {
      await examService.patchPublishExam(deleteDialogTarget.examId, "ARCHIVED");
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, "Failed to archive exam."));
      return;
    }
    toast.success("Exam archived successfully.");
    setDeleteDialogTarget(null);
    setDeleteConflict409(false);
    fetchExams();
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
        errors.push(getApiErrorMessage(err, "Failed to delete exam #" + examId + "."));
      }
    }

    setBulkDeleteConfirmOpen(false);
    setBulkDeleteSummary({ success, failed, errors });
    setBulkDeleting(false);
    setSelectedExamIds(new Set());
    fetchExams();
  };

  return {
    activeTab,
    searchTerm,
    selectedCourse,
    selectedModule,
    selectedStatus,
    page,
    courses,
    modules,
    exams,
    totalElements,
    totalPages,
    loading,
    error,
    selectedExamIds,
    setSelectedExamIds,
    statusDialogTarget,
    setStatusDialogTarget,
    statusUpdating,
    statusWarnings,
    setStatusWarnings,
    deleteDialogTarget,
    setDeleteDialogTarget,
    deleteConflict409,
    setDeleteConflict409,
    deleting,
    bulkDeleting,
    bulkDeleteConfirmOpen,
    setBulkDeleteConfirmOpen,
    bulkDeleteSummary,
    setBulkDeleteSummary,
    filtersActive,
    fetchExams,
    handleTabChange,
    handleNewExam,
    handleSearchChange,
    handleCourseChange,
    handleModuleChange,
    handleStatusChange,
    handlePageChange,
    clearFilters,
    handleExportCsv,
    handleEditExam,
    handleApplyStatusChange,
    handleDeleteExam,
    handleArchiveAfterConflict,
    handleBulkDelete,
  };
}
