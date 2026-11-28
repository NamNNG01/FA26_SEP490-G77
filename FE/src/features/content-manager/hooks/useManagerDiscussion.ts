import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useToast } from "@/components/ui/ToastHost";
import {
  managerDiscussionService,
  type AdminReportStatus,
  type DiscussionReportItem,
  type ManagerDiscussionStatus,
  type ManagerPostStatus,
  type ModerationSummary,
} from "@/services/managerDiscussion.service";
import type {
  DiscussionDetail,
  DiscussionDetailComment,
  DiscussionItem,
  DiscussionTag,
} from "@/services/studentCommunity.service";
import { getApiErrorMessage } from "@/utils/apiError";
import { PAGE_SIZE } from "../components/discussion/discussionHelpers";

export type DeleteTarget = { kind: "comment"; id: number };

export function useManagerDiscussion() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<"Posts" | "Reports">("Posts");
  const [summary, setSummary] = useState<ModerationSummary | null>(null);

  const [approvalStatus, setApprovalStatus] = useState<ManagerDiscussionStatus>("PENDING");
  const [postStatus, setPostStatus] = useState<ManagerPostStatus>("ALL");
  const [tagFilter, setTagFilter] = useState<DiscussionTag | "ALL">("ALL");
  const [imageFilter, setImageFilter] = useState<"ALL" | "WITH_IMAGE" | "NO_IMAGE">("ALL");
  const [sortOrder, setSortOrder] = useState<"oldest" | "latest">("latest");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<DiscussionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState("");

  const [detail, setDetail] = useState<DiscussionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [moderationReason, setModerationReason] = useState("");
  const [hidingCommentId, setHidingCommentId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const [muteTarget, setMuteTarget] = useState<{ userId: number; displayName: string } | null>(
    null,
  );
  const [muteDays, setMuteDays] = useState("3");
  const [muteReason, setMuteReason] = useState("");

  const [reportStatus, setReportStatus] = useState<AdminReportStatus>("PENDING");
  const [reportPage, setReportPage] = useState(0);
  const [reports, setReports] = useState<DiscussionReportItem[]>([]);
  const [reportTotal, setReportTotal] = useState(0);
  const [reportLoading, setReportLoading] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      const data = await managerDiscussionService.getSummary();
      setSummary(data);
    } catch {
      // Keep existing summary silently
    }
  }, []);

  const load = useCallback(
    async (mode?: "quiet") => {
      const quiet = mode === "quiet";
      if (!quiet) {
        setLoading(true);
        setError("");
      }
      try {
        const hasImage = imageFilter === "ALL" ? undefined : imageFilter === "WITH_IMAGE";
        const result = await managerDiscussionService.list({
          approvalStatus,
          status: postStatus,
          tag: tagFilter,
          hasImage,
          search: appliedSearch || undefined,
          sort: sortOrder,
          page,
          size: PAGE_SIZE,
        });
        setItems(result.content);
        setTotal(result.totalElements);
        setSelectedIds(new Set());
      } catch (err) {
        if (!quiet) setError(getApiErrorMessage(err, "Could not load discussions."));
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [approvalStatus, postStatus, tagFilter, imageFilter, appliedSearch, sortOrder, page],
  );

  const loadReports = useCallback(
    async (mode?: "quiet") => {
      const quiet = mode === "quiet";
      if (!quiet) setReportLoading(true);
      try {
        const result = await managerDiscussionService.listReports({
          status: reportStatus,
          page: reportPage,
          size: PAGE_SIZE,
        });
        setReports(result.content);
        setReportTotal(result.totalElements);
      } catch (err) {
        if (!quiet) toast.error(getApiErrorMessage(err, "Could not load reports."));
      } finally {
        if (!quiet) setReportLoading(false);
      }
    },
    [reportStatus, reportPage, toast],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const trimmed = search.trim();
      setAppliedSearch((prev) => {
        if (prev !== trimmed) setPage(0);
        return trimmed;
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary, reload]);

  useEffect(() => {
    if (activeTab === "Posts") void load();
    else void loadReports();
  }, [activeTab, load, loadReports, reload]);

  useAutoRefresh(() => {
    void loadSummary();
    if (activeTab === "Posts") void load("quiet");
    else void loadReports("quiet");
  });

  const refreshDetail = async (discussionId: number) => {
    const fresh = await managerDiscussionService.getDetail(discussionId);
    setDetail(fresh);
  };

  const runAction = async (successMessage: string, action: () => Promise<unknown>) => {
    if (!detail) return false;
    setBusy(true);
    try {
      await action();
      toast.success(successMessage);
      await Promise.all([load(), loadSummary(), refreshDetail(detail.discussionId)]);
      return true;
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not update this discussion."));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const approve = () =>
    void runAction("Discussion approved.", () =>
      managerDiscussionService.approve(detail!.discussionId),
    );

  const reject = async () => {
    if (!detail || rejectReason.trim().length < 5) return;
    const succeeded = await runAction("Discussion rejected.", () =>
      managerDiscussionService.reject(detail.discussionId, rejectReason.trim()),
    );
    if (succeeded) {
      setRejecting(false);
      setRejectReason("");
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;
    setBusy(true);
    try {
      const res = await managerDiscussionService.bulkApprove(Array.from(selectedIds));
      toast.success(`Approved ${res.updatedCount} discussions.`);
      await Promise.all([load(), loadSummary()]);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Bulk approve failed."));
    } finally {
      setBusy(false);
    }
  };

  const handleBulkReject = async () => {
    if (selectedIds.size === 0 || bulkRejectReason.trim().length < 5) return;
    setBusy(true);
    try {
      const res = await managerDiscussionService.bulkReject(
        Array.from(selectedIds),
        bulkRejectReason.trim(),
      );
      toast.success(`Rejected ${res.updatedCount} discussions.`);
      setBulkRejectOpen(false);
      setBulkRejectReason("");
      await Promise.all([load(), loadSummary()]);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Bulk reject failed."));
    } finally {
      setBusy(false);
    }
  };

  const handleResolveReport = async (reportId: number, action: "HIDE_AND_RESOLVE" | "DISMISS") => {
    setBusy(true);
    try {
      await managerDiscussionService.resolveReport(reportId, action);
      toast.success(
        action === "HIDE_AND_RESOLVE" ? "Content hidden and report resolved." : "Report dismissed.",
      );
      await Promise.all([loadReports(), loadSummary()]);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not process report."));
    } finally {
      setBusy(false);
    }
  };

  const handleMuteUser = async (event: FormEvent) => {
    event.preventDefault();
    if (!muteTarget || muteReason.trim().length < 5) return;
    setBusy(true);
    try {
      await managerDiscussionService.muteUser(
        muteTarget.userId,
        Number(muteDays),
        muteReason.trim(),
      );
      toast.success(`Muted ${muteTarget.displayName} for ${muteDays} days.`);
      setMuteTarget(null);
      setMuteReason("");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not mute user."));
    } finally {
      setBusy(false);
    }
  };

  const togglePin = () =>
    void runAction(detail?.isPinned ? "Discussion unpinned." : "Discussion pinned.", () =>
      managerDiscussionService.setPinned(detail!.discussionId, !detail!.isPinned),
    );

  const hideDiscussion = () =>
    void runAction("Discussion hidden from students.", async () => {
      await managerDiscussionService.hide(detail!.discussionId);
      setDetail((current) =>
        current ? { ...current, status: "HIDDEN", isClosed: false, isPinned: false } : current,
      );
    });

  const restoreDiscussion = () =>
    void runAction("Discussion restored for students.", async () => {
      await managerDiscussionService.restore(detail!.discussionId);
      setDetail((current) =>
        current ? { ...current, status: "OPEN", isClosed: false } : current,
      );
    });

  const cancelReject = () => {
    setRejecting(false);
    setRejectReason("");
  };

  const restoreComment = async (comment: DiscussionDetailComment) => {
    const succeeded = await runAction("Reply restored for students.", () =>
      managerDiscussionService.setCommentStatus(comment.commentId, "VISIBLE"),
    );
    if (succeeded) setHidingCommentId(null);
  };

  const hideComment = async (comment: DiscussionDetailComment) => {
    const reason = moderationReason.trim();
    if (reason.length < 5) return;
    const succeeded = await runAction("Reply hidden from students.", () =>
      managerDiscussionService.setCommentStatus(comment.commentId, "HIDDEN", reason),
    );
    if (succeeded) {
      setHidingCommentId(null);
      setModerationReason("");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      if (detail) {
        await managerDiscussionService.deleteComment(deleteTarget.id);
        toast.success("Reply deleted.");
        await Promise.all([load(), refreshDetail(detail.discussionId)]);
      }
      setDeleteTarget(null);
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not delete this item."));
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (item: DiscussionItem) => {
    setDetail(null);
    setDetailLoading(true);
    setRejecting(false);
    setRejectReason("");
    setModerationReason("");
    setHidingCommentId(null);
    try {
      setDetail(await managerDiscussionService.getDetail(item.discussionId));
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not load discussion details."));
    } finally {
      setDetailLoading(false);
    }
  };

  const submitCreate = async (payload: {
    title: string;
    content: string;
    tag: DiscussionTag;
    imageUrl?: string | null;
    isPinned: boolean;
  }) => {
    const created = await managerDiscussionService.create(payload);
    setCreateOpen(false);
    toast.success("Discussion published.");
    await Promise.all([load(), loadSummary()]);
    setDetail(created);
  };

  return {
    activeTab,
    setActiveTab,
    summary,
    approvalStatus,
    setApprovalStatus,
    postStatus,
    setPostStatus,
    tagFilter,
    setTagFilter,
    imageFilter,
    setImageFilter,
    sortOrder,
    setSortOrder,
    search,
    setSearch,
    setAppliedSearch,
    page,
    setPage,
    items,
    total,
    loading,
    error,
    triggerReload: () => setReload((value) => value + 1),
    selectedIds,
    toggleSelect,
    bulkRejectOpen,
    setBulkRejectOpen,
    bulkRejectReason,
    setBulkRejectReason,
    detail,
    setDetail,
    detailLoading,
    busy,
    rejectReason,
    setRejectReason,
    rejecting,
    setRejecting,
    moderationReason,
    setModerationReason,
    hidingCommentId,
    setHidingCommentId,
    createOpen,
    setCreateOpen,
    deleteTarget,
    setDeleteTarget,
    muteTarget,
    setMuteTarget,
    muteDays,
    setMuteDays,
    muteReason,
    setMuteReason,
    reportStatus,
    setReportStatus,
    reportPage,
    setReportPage,
    reports,
    reportTotal,
    reportLoading,
    templates: summary?.rejectionTemplates ?? [],
    approve,
    reject,
    handleBulkApprove,
    handleBulkReject,
    handleResolveReport,
    handleMuteUser,
    togglePin,
    hideDiscussion,
    restoreDiscussion,
    cancelReject,
    restoreComment,
    hideComment,
    confirmDelete,
    openDetail,
    submitCreate,
  };
}
