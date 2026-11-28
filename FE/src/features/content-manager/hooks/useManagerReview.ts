import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { apiClient } from "@/services/axios";
import {
  courseService,
  type CourseModuleResponse,
  type CourseSummaryItem,
} from "@/services/course.service";
import { useToast } from "@/components/ui/ToastHost";
import type { QuestionDraft } from "@/features/question/model";
import { useAuth } from "@/auth/authContext";
import {
  actionPath,
  apiStatus,
  collectionPath,
  contributionQuestionDraft,
  dateTimeLocal,
  decisionMessage,
  detailPath,
  errorDetails,
  errorMessage,
  findContributorName,
  idOf,
  isPending,
  statusOf,
  unwrap,
  type Kind,
  type Row,
} from "../utils/contentReviewHelpers";

export function useManagerReview() {
  const toast = useToast();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [kind, setKind] = useState<Kind>(
    params.get("kind") === "decks" ? "decks" : "contributions",
  );
  const [rows, setRows] = useState<Row[]>([]);
  const [detail, setDetail] = useState<Row | null>(null);
  const [questionDraft, setQuestionDraft] = useState<QuestionDraft | null>(null);
  const [pageData, setPageData] = useState<any>({ page: 0, totalPages: 0, totalElements: 0 });
  const [status, setStatus] = useState(() => {
    const value = params.get("status") || "PENDING";
    return apiStatus(params.get("kind") === "decks" ? "decks" : "contributions", value);
  });
  const [keyword, setKeyword] = useState(params.get("keyword") || "");
  const [courseId, setCourseId] = useState(params.get("courseId") || "");
  const [moduleId, setModuleId] = useState(params.get("moduleId") || "");
  const [contributorId, setContributorId] = useState(params.get("contributorId") || "");
  const [questionType, setQuestionType] = useState(params.get("questionType") || "");
  const [difficulty, setDifficulty] = useState(params.get("difficulty") || "");
  const [submittedFrom, setSubmittedFrom] = useState(dateTimeLocal(params.get("submittedFrom")));
  const [submittedTo, setSubmittedTo] = useState(dateTimeLocal(params.get("submittedTo"), 60_000));
  const [courses, setCourses] = useState<CourseSummaryItem[]>([]);
  const [modules, setModules] = useState<CourseModuleResponse[]>([]);
  const [students, setStudents] = useState<{ userId: number; fullName: string }[]>([]);
  const [courseNameOverrides, setCourseNameOverrides] = useState<Record<string, string>>({});
  const [contributorSearch, setContributorSearch] = useState("");
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [openingId, setOpeningId] = useState<number | string | null>(null);
  const [reason, setReason] = useState("");
  const [approveNote, setApproveNote] = useState("");
  const [confirmingApproval, setConfirmingApproval] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [deckCardPage, setDeckCardPage] = useState(0);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  /** Last query the user applied — what the shared auto-refresh reads again. */
  const lastQueryUrl = useRef<string | null>(null);
  const keywordMountedRef = useRef(false);

  const load = useCallback(
    async (nextPage = Number(params.get("page") || 0), quiet = false) => {
      if (quiet && !lastQueryUrl.current) return [];
      if (!quiet) {
        setBusy(true);
        setError("");
      }
      try {
        const query = new URLSearchParams({
          page: String(nextPage),
          size: "20",
          status: apiStatus(kind, status),
          sort: "submittedAt,asc",
        });
        if (keyword.trim()) query.set("keyword", keyword.trim());
        if (courseId) query.set("courseId", courseId);
        if (moduleId) query.set("moduleId", moduleId);
        if (contributorId) query.set("contributorId", contributorId);
        if (kind === "contributions" && questionType) query.set("questionType", questionType);
        if (kind === "contributions" && difficulty) query.set("difficulty", difficulty);
        if (submittedFrom) query.set("submittedFrom", new Date(submittedFrom).toISOString());
        if (submittedTo) {
          query.set(
            "submittedTo",
            new Date(new Date(submittedTo).getTime() + 60_000).toISOString(),
          );
        }
        const url = quiet ? lastQueryUrl.current! : `${collectionPath(kind)}?${query}`;
        if (!quiet) lastQueryUrl.current = url;
        const data = unwrap((await apiClient.get(url)).data);
        if (quiet && url !== lastQueryUrl.current) return [];
        setRows(data.content || []);
        setPageData(data);
        if (!quiet) setDetail(null);
        return data.content || [];
      } catch (e: any) {
        if (!quiet) setError(errorMessage(e) || "Could not load review queue");
        return [];
      } finally {
        if (!quiet) setBusy(false);
      }
    },
    [
      kind,
      status,
      keyword,
      courseId,
      moduleId,
      contributorId,
      questionType,
      difficulty,
      submittedFrom,
      submittedTo,
      params,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    courseService
      .getCourses({ size: 100, sort: "title,asc" })
      .then((result) => {
        if (!cancelled) setCourses(result.content);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!courseId) {
      setModules([]);
      setModuleId("");
      return;
    }
    setModules([]);
    courseService
      .getCourseModules(courseId)
      .then((result) => {
        if (!cancelled) setModules(result);
      })
      .catch(() => {
        if (!cancelled) setModules([]);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const activeContributorSearch = courseId ? contributorSearch.trim() : "";

  useEffect(() => {
    if (courses.length === 0) return;
    let cancelled = false;
    const timeout = window.setTimeout(
      async () => {
        setStudentsLoading(true);
        try {
          const relevantCourses = courseId
            ? courses.filter((course) => String(course.courseId) === courseId)
            : courses;
          const pages = await Promise.all(
            relevantCourses.map((course) =>
              courseService.getCourseStudents(course.courseId, {
                search: activeContributorSearch || undefined,
                page: 0,
                size: 100,
              }),
            ),
          );
          if (!cancelled) {
            const unique = new Map<number, { userId: number; fullName: string }>();
            pages
              .flatMap((result) => result.content)
              .forEach((student) =>
                unique.set(student.userId, { userId: student.userId, fullName: student.fullName }),
              );
            setStudents([...unique.values()].sort((a, b) => a.fullName.localeCompare(b.fullName)));
          }
        } catch {
          if (!cancelled) setStudents([]);
        } finally {
          if (!cancelled) setStudentsLoading(false);
        }
      },
      activeContributorSearch ? 300 : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [courses, courseId, activeContributorSearch]);

  useEffect(() => {
    let cancelled = false;
    const knownNames = new Set(courses.map((course) => String(course.courseId)));
    const unresolvedIds = [
      ...new Set(
        rows
          .map((row) => row.courseId ?? row.course?.courseId ?? row.course?.id)
          .filter((id): id is number | string => id != null)
          .map(String),
      ),
    ].filter((id) => !knownNames.has(id) && !courseNameOverrides[id]);
    if (!unresolvedIds.length) return;
    Promise.all(
      unresolvedIds.map(async (id) => {
        try {
          const course = await courseService.getCourseById(id);
          return [id, course.title] as const;
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      const resolved = Object.fromEntries(
        results.filter((item): item is readonly [string, string] => !!item && !!item[1]),
      );
      if (Object.keys(resolved).length) {
        setCourseNameOverrides((current) => ({ ...current, ...resolved }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [rows, courses, courseNameOverrides]);

  const syncUrl = (pageNumber = 0) => {
    const next: Record<string, string> = {
      kind,
      status: apiStatus(kind, status),
      page: String(pageNumber),
    };
    if (keyword.trim()) next.keyword = keyword.trim();
    if (courseId) next.courseId = courseId;
    if (moduleId) next.moduleId = moduleId;
    if (contributorId) next.contributorId = contributorId;
    if (kind === "contributions" && questionType) next.questionType = questionType;
    if (kind === "contributions" && difficulty) next.difficulty = difficulty;
    if (submittedFrom) next.submittedFrom = new Date(submittedFrom).toISOString();
    if (submittedTo) {
      next.submittedTo = new Date(new Date(submittedTo).getTime() + 60_000).toISOString();
    }
    setParams(next, { replace: true });
  };

  useEffect(() => {
    syncUrl(0);
    load(0);
  }, [kind, status]);

  useEffect(() => {
    if (!keywordMountedRef.current) {
      keywordMountedRef.current = true;
      return;
    }
    const timer = window.setTimeout(() => {
      syncUrl(0);
      void load(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  useAutoRefresh(() => void load(0, true));

  const switchKind = (tab: Kind) => {
    setKind(tab);
    setStatus((current) =>
      current === "ALL" || current === "REJECTED"
        ? current
        : current === "APPROVED" || current === "ACCEPTED"
          ? apiStatus(tab, current)
          : tab === "decks"
            ? "PENDING_REVIEW"
            : "PENDING",
    );
    if (tab === "decks") {
      setQuestionType("");
      setDifficulty("");
    }
  };

  const open = async (row: Row, cardPage = 0) => {
    if (kind === "decks" && detail?.deckId === idOf(row, kind)) setCardsLoading(true);
    else setDetailLoading(true);
    setOpeningId(idOf(row, kind));
    if (kind !== "decks" || detail?.deckId !== idOf(row, kind)) setDetail(null);
    setQuestionDraft(null);
    setError("");
    try {
      const query = kind === "decks" ? `?cardPage=${cardPage}&cardSize=50` : "";
      let data = unwrap((await apiClient.get(`${detailPath(kind, idOf(row, kind))}${query}`)).data);
      if (kind === "contributions") {
        const contribId =
          data.contributorId ??
          data.contributor?.userId ??
          data.contributor?.id ??
          row.contributor?.userId ??
          row.contributor?.id ??
          row.contributorId;
        const knownName =
          data.owner?.fullName ||
          data.contributor?.fullName ||
          data.contributor?.displayName ||
          data.contributor?.name ||
          data.contributorName ||
          students.find((student) => String(student.userId) === String(contribId))?.fullName;
        const fetchedName =
          !knownName && data.courseId && contribId
            ? await findContributorName(data.courseId, contribId).catch(() => undefined)
            : undefined;
        data = {
          ...data,
          contributorName:
            knownName ||
            fetchedName ||
            (contribId ? `Contributor #${contribId}` : "Unknown contributor"),
        };
        setQuestionDraft(contributionQuestionDraft(data));
      } else {
        setQuestionDraft(null);
        setDeckCardPage(data.cards?.page ?? cardPage);
      }
      setDetail(data);
      setRejecting(false);
      setConfirmingApproval(false);
      setReason("");
      setApproveNote("");
    } catch (e: any) {
      setError(errorMessage(e) || "Could not load item");
    } finally {
      setDetailLoading(false);
      setCardsLoading(false);
      setOpeningId(null);
    }
  };

  const closeDetail = () => {
    setDetail(null);
    setRejecting(false);
    setConfirmingApproval(false);
    setReason("");
    setApproveNote("");
    setError("");
  };

  const review = async (decision: "approve" | "reject") => {
    if (!detail) return;
    if (decision === "reject" && reason.trim().length < 5) {
      setError("Please enter a reason of at least 5 characters.");
      return;
    }
    if (decision === "approve" && !confirmingApproval) {
      setConfirmingApproval(true);
      setRejecting(false);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const id = idOf(detail, kind);
      const payload =
        decision === "approve"
          ? { version: detail.version, note: approveNote.trim() }
          : { version: detail.version, reason: reason.trim() };
      unwrap((await apiClient.post(actionPath(kind, id, decision), payload)).data);
      toast.success(decisionMessage(decision, kind));
      setRejecting(false);
      setConfirmingApproval(false);
      setReason("");
      setApproveNote("");
      setNotice(decisionMessage(decision, kind));
      const currentIndex = rows.findIndex((row) => idOf(row, kind) === id);
      const remainingRows = await load(Number(params.get("page") || 0));
      const nextRow = remainingRows[Math.min(Math.max(currentIndex, 0), remainingRows.length - 1)];
      if (nextRow) void open(nextRow);
    } catch (e: any) {
      const details = errorDetails(e);
      const subCode = details.subCode;
      const code = details.code;
      if (subCode === "VERSION_CONFLICT") {
        setError(
          "This submission changed while you were reviewing it. Reload the item to see the latest version.",
        );
      } else if (subCode === "ALREADY_REVIEWED") {
        setDetail(null);
        await load(Number(params.get("page") || 0));
        setError("This submission has already been reviewed. The queue has been refreshed.");
      } else if (subCode === "INVALID_CONTENT") {
        const reasons = details.details?.reasons ?? details.reasons;
        setError(
          Array.isArray(reasons) && reasons.length
            ? `This submission cannot be approved: ${reasons.join("; ")}`
            : errorMessage(e),
        );
      } else if (subCode === "REASON_REQUIRED") {
        setRejecting(true);
        setError("Enter a rejection reason of at least 5 characters.");
      } else if (subCode === "CANNOT_REVIEW_OWN") {
        setDetail((current) => (current ? { ...current, canReview: false } : current));
        setError("You cannot review your own submission.");
      } else if (code === "RESOURCE_NOT_FOUND") {
        setDetail(null);
        await load(Number(params.get("page") || 0));
        setError(
          "This item was not found or is outside your course access. The queue has been refreshed.",
        );
      } else if (code === "VALIDATION_ERROR" && details.details?.fieldErrors) {
        const fields = Object.entries(details.details.fieldErrors as Record<string, unknown>)
          .map(([field, message]) => `${field}: ${message}`)
          .join("; ");
        setError(fields || errorMessage(e));
      } else {
        setError(errorMessage(e) || "Review action failed. You can retry manually.");
      }
    } finally {
      setBusy(false);
    }
  };

  const clearFilters = async () => {
    setKeyword("");
    setCourseId("");
    setModuleId("");
    setContributorId("");
    setQuestionType("");
    setDifficulty("");
    setSubmittedFrom("");
    setSubmittedTo("");
    setParams({ kind, status, page: "0" }, { replace: true });
    setBusy(true);
    setError("");
    try {
      const query = new URLSearchParams({
        page: "0",
        size: "20",
        status: apiStatus(kind, status),
        sort: "submittedAt,asc",
      });
      const data = unwrap((await apiClient.get(`${collectionPath(kind)}?${query}`)).data);
      setRows(data.content || []);
      setPageData(data);
      setDetail(null);
    } catch (e: any) {
      setError(e.message || "Could not load review queue");
    } finally {
      setBusy(false);
    }
  };

  const refreshQueue = async () => {
    setRefreshing(true);
    try {
      await load(Number(params.get("page") || 0));
    } finally {
      setRefreshing(false);
    }
  };

  const page = Number(pageData.page || 0);
  const detailStatus = detail && statusOf(detail, kind);
  const detailContributorId =
    detail?.contributor?.userId ??
    detail?.contributor?.id ??
    detail?.contributorId ??
    detail?.owner?.userId ??
    detail?.owner?.id ??
    detail?.userId;
  const isOwnSubmission =
    !!detail && detailContributorId != null && String(detailContributorId) === String(user?.userId);
  const canReviewDetail = !!detail?.canReview && !isOwnSubmission && isPending(kind, detailStatus);

  const courseOptions = [
    { label: "All courses", value: "" },
    ...courses.map((course) => ({ label: course.title, value: String(course.courseId) })),
  ];
  const moduleOptions = [
    { label: "All modules", value: "" },
    ...modules.map((module) => ({ label: module.title, value: String(module.moduleId) })),
  ];
  const contributorOptions = [
    { label: "Any contributor", value: "" },
    ...students.map((student) => ({
      label: `${student.fullName} (#${student.userId})`,
      value: String(student.userId),
    })),
  ];
  if (contributorId && !contributorOptions.some((option) => option.value === contributorId)) {
    contributorOptions.push({ label: `Contributor #${contributorId}`, value: contributorId });
  }

  const studentNames = new Map(
    students.map((student) => [String(student.userId), student.fullName]),
  );
  const courseNames = new Map(courses.map((course) => [String(course.courseId), course.title]));

  const courseNameOf = (row: Row) => {
    const rawId = row.courseId ?? row.course?.courseId ?? row.course?.id;
    const id = String(rawId);
    return (
      row.course?.title ||
      row.course?.name ||
      row.courseName ||
      row.courseTitle ||
      courseNames.get(id) ||
      courseNameOverrides[id] ||
      (rawId != null ? `Course #${rawId}` : "—")
    );
  };

  const moduleNameOf = (row: Row) => {
    const rawId = row.moduleId ?? row.module?.moduleId ?? row.module?.id;
    const knownModule =
      rawId == null
        ? undefined
        : modules.find((module) => String(module.moduleId) === String(rawId));
    return (
      row.module?.title ||
      row.module?.name ||
      row.moduleName ||
      row.moduleTitle ||
      knownModule?.title ||
      (rawId != null ? `Module #${rawId}` : "No module assigned")
    );
  };

  return {
    kind,
    switchKind,
    rows,
    detail,
    questionDraft,
    pageData,
    page,
    status,
    setStatus,
    keyword,
    setKeyword,
    courseId,
    setCourseId,
    moduleId,
    setModuleId,
    contributorId,
    setContributorId,
    questionType,
    setQuestionType,
    difficulty,
    setDifficulty,
    submittedFrom,
    setSubmittedFrom,
    submittedTo,
    setSubmittedTo,
    setContributorSearch,
    studentsLoading,
    busy,
    detailLoading,
    openingId,
    reason,
    setReason,
    approveNote,
    setApproveNote,
    confirmingApproval,
    setConfirmingApproval,
    rejecting,
    setRejecting,
    deckCardPage,
    cardsLoading,
    refreshing,
    error,
    setError,
    notice,
    detailStatus,
    isOwnSubmission,
    canReviewDetail,
    courseOptions,
    moduleOptions,
    contributorOptions,
    studentNames,
    courseNameOf,
    moduleNameOf,
    load,
    syncUrl,
    open,
    closeDetail,
    review,
    clearFilters,
    refreshQueue,
  };
}
