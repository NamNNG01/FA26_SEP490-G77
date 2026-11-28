import { useCallback, useEffect, useRef, useState } from "react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useToast } from "@/components/ui/ToastHost";
import { getApiErrorMessage } from "@/utils/apiError";
import {
  adminDiscountService,
  type Discount,
  type DiscountAccessType,
  type DiscountAssignment,
  type Page,
} from "@/services/adminDiscount.service";
import {
  blankForm,
  EMPTY_PAGE,
  formFromDiscount,
  PAGE_SIZE,
  toPayload,
  type FormState,
} from "../utils/discountHelpers";

export function useDiscounts() {
  const toast = useToast();
  const [page, setPage] = useState<Page<Discount>>(EMPTY_PAGE);
  const [pageIndex, setPageIndex] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [validityFilter, setValidityFilter] = useState("");
  const [accessTypeFilter, setAccessTypeFilter] = useState<DiscountAccessType | "">("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Discount | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(blankForm);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<Discount | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Page<DiscountAssignment> | null>(null);
  const [assignmentPage, setAssignmentPage] = useState(0);
  const [assignmentKeyword, setAssignmentKeyword] = useState("");
  const [debouncedAssignmentKeyword, setDebouncedAssignmentKeyword] = useState("");
  const [assignmentUsed, setAssignmentUsed] = useState("");
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [changingStatus, setChangingStatus] = useState<Discount | null>(null);
  const [deleting, setDeleting] = useState<Discount | null>(null);
  const [working, setWorking] = useState(false);
  const [affected, setAffected] = useState<
    { title: string; status: string; contestId: number }[] | null
  >(null);

  const listRequestId = useRef(0);
  const detailRequestId = useRef(0);
  const assignmentRequestId = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedKeyword(keyword.trim());
      setPageIndex(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedAssignmentKeyword(assignmentKeyword.trim());
      setAssignmentPage(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [assignmentKeyword]);

  /** `'quiet'` = shared auto-refresh: no loader, no error toast. */
  const load = useCallback(
    async (mode?: "quiet") => {
      const requestId = ++listRequestId.current;
      const quiet = mode === "quiet";
      if (!quiet) {
        setLoading(true);
        setListError(null);
      }
      try {
        const result = await adminDiscountService.list({
          keyword: debouncedKeyword,
          discountType: typeFilter,
          isActive: activeFilter,
          validity: validityFilter,
          accessType: accessTypeFilter,
          page: pageIndex - 1,
          size: PAGE_SIZE,
        });
        if (requestId === listRequestId.current) setPage(result);
      } catch (error) {
        if (requestId === listRequestId.current && !quiet) {
          setListError(getApiErrorMessage(error, "Could not load discounts."));
        }
      } finally {
        if (requestId === listRequestId.current) setLoading(false);
      }
    },
    [accessTypeFilter, activeFilter, debouncedKeyword, pageIndex, typeFilter, validityFilter],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useAutoRefresh(() => void load("quiet"));

  const loadAssignments = useCallback(
    async (discountId: number) => {
      const requestId = ++assignmentRequestId.current;
      setAssignmentLoading(true);
      setAssignmentError(null);
      try {
        const result = await adminDiscountService.assignments(discountId, {
          isUsed: assignmentUsed,
          keyword: debouncedAssignmentKeyword,
          page: assignmentPage,
          size: PAGE_SIZE,
        });
        if (!result || !Array.isArray(result.content)) {
          throw new Error("The server returned an invalid assignment list.");
        }
        if (requestId === assignmentRequestId.current) setAssignments(result);
      } catch (error) {
        if (requestId === assignmentRequestId.current) {
          setAssignments(null);
          setAssignmentError(getApiErrorMessage(error, "Could not load assigned users."));
        }
      } finally {
        if (requestId === assignmentRequestId.current) setAssignmentLoading(false);
      }
    },
    [assignmentPage, assignmentUsed, debouncedAssignmentKeyword],
  );

  useEffect(() => {
    if (detail) void loadAssignments(detail.discountId);
  }, [detail, loadAssignments]);

  const openCreate = () => {
    setEditing(null);
    setForm(blankForm());
    setFormOpen(true);
  };

  const openEdit = async (discount: Discount) => {
    try {
      const full = await adminDiscountService.get(discount.discountId);
      setEditing(full);
      setForm(formFromDiscount(full));
      setFormOpen(true);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not load discount details."));
    }
  };

  const openDetail = async (discount: Discount) => {
    const requestId = ++detailRequestId.current;
    assignmentRequestId.current++;
    setDetail(null);
    setDetailLoading(true);
    setAssignments(null);
    setAssignmentError(null);
    setAssignmentPage(0);
    setAssignmentKeyword("");
    setDebouncedAssignmentKeyword("");
    setAssignmentUsed("");
    try {
      const result = await adminDiscountService.get(discount.discountId);
      if (requestId === detailRequestId.current) setDetail(result);
    } catch (error) {
      if (requestId === detailRequestId.current) {
        toast.error(getApiErrorMessage(error, "Could not load discount details."));
      }
    } finally {
      if (requestId === detailRequestId.current) setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    detailRequestId.current++;
    assignmentRequestId.current++;
    setDetail(null);
    setDetailLoading(false);
    setAssignmentLoading(false);
    setAssignmentError(null);
  };

  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const lockedFields = Boolean(
    editing &&
      ((editing.stats?.assignedCount ?? 0) > 0 ||
        (editing.stats?.usedCount ?? editing.usedCount) > 0),
  );
  const minimumUsageLimit = editing
    ? (editing.stats?.usedCount ?? editing.usedCount) + (editing.stats?.unusedAssignedCount ?? 0)
    : 1;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = toPayload(form);
    if (
      !payload.code ||
      payload.code.length < 4 ||
      payload.code.length > 30 ||
      !/^[A-Za-z0-9_-]+$/.test(payload.code)
    ) {
      toast.error("Code must be 4–30 characters using letters, numbers, _ or -.");
      return;
    }
    if (!payload.name) {
      toast.error("Name is required.");
      return;
    }
    if (
      payload.discountType === "PERCENT"
        ? payload.value < 1 || payload.value > 100
        : payload.value <= 0
    ) {
      toast.error(
        payload.discountType === "PERCENT"
          ? "Percent value must be from 1 to 100."
          : "Discount amount must be greater than zero.",
      );
      return;
    }
    if (payload.usageLimit < minimumUsageLimit) {
      toast.error(
        `Usage limit cannot be lower than ${minimumUsageLimit} used or assigned vouchers.`,
      );
      return;
    }
    if (
      payload.startAt &&
      payload.expiredAt &&
      new Date(payload.expiredAt) <= new Date(payload.startAt)
    ) {
      toast.error("Expiry must be after the start date.");
      return;
    }
    setSaving(true);
    try {
      if (editing) await adminDiscountService.update(editing.discountId, payload);
      else await adminDiscountService.create(payload);
      toast.success(editing ? "Discount updated." : "Discount created.");
      setFormOpen(false);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not save discount."));
    } finally {
      setSaving(false);
    }
  };

  const confirmStatus = async () => {
    if (!changingStatus) return;
    setWorking(true);
    try {
      const result = await adminDiscountService.setStatus(
        changingStatus.discountId,
        !changingStatus.isActive,
      );
      setChangingStatus(null);
      setAffected(result.affectedContests ?? []);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not change discount status."));
    } finally {
      setWorking(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setWorking(true);
    try {
      await adminDiscountService.remove(deleting.discountId);
      toast.success("Discount deleted.");
      setDeleting(null);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not delete discount."));
    } finally {
      setWorking(false);
    }
  };

  const filtersActive =
    keyword !== "" ||
    typeFilter !== "" ||
    activeFilter !== "" ||
    validityFilter !== "" ||
    accessTypeFilter !== "";

  const resetFilters = () => {
    setKeyword("");
    setDebouncedKeyword("");
    setTypeFilter("");
    setActiveFilter("");
    setValidityFilter("");
    setAccessTypeFilter("");
    setPageIndex(1);
  };

  return {
    page,
    pageIndex,
    setPageIndex,
    keyword,
    setKeyword,
    typeFilter,
    setTypeFilter,
    activeFilter,
    setActiveFilter,
    validityFilter,
    setValidityFilter,
    accessTypeFilter,
    setAccessTypeFilter,
    loading,
    editing,
    formOpen,
    setFormOpen,
    form,
    updateForm,
    saving,
    lockedFields,
    minimumUsageLimit,
    detail,
    detailLoading,
    listError,
    assignments,
    assignmentPage,
    setAssignmentPage,
    assignmentKeyword,
    setAssignmentKeyword,
    assignmentUsed,
    setAssignmentUsed,
    assignmentLoading,
    assignmentError,
    changingStatus,
    setChangingStatus,
    deleting,
    setDeleting,
    working,
    affected,
    setAffected,
    filtersActive,
    resetFilters,
    load,
    loadAssignments,
    openCreate,
    openEdit,
    openDetail,
    closeDetail,
    save,
    confirmStatus,
    confirmDelete,
  };
}
