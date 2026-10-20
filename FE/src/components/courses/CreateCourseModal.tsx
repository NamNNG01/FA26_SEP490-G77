import React, { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Alert } from "@/components/ui/Alert";
import { Icon } from "@/assets/icons";
import { useAuth } from "@/auth/authContext";
import { api } from "@/services/api";
import { MOCK_USERS } from "@/features/admin/mockUsers";
import {
  courseService,
  type CategoryResponse,
  type CourseDetailResponse,
} from "@/services/course.service";

interface ManagerOption {
  id: number;
  name: string;
  email: string;
}

export function CreateCourseModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (course: CourseDetailResponse) => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("0");
  const [managerId, setManagerId] = useState<string>("");
  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [loadingManagers, setLoadingManagers] = useState(false);
  const [errors, setErrors] = useState<{
    title?: string;
    categoryId?: string;
    managerId?: string;
    price?: string;
  }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;

    setTitle("");
    setDescription("");
    setPrice("0");
    setErrors({});
    setSubmitError(null);
    setSubmitting(false);

    setLoadingCategories(true);
    courseService
      .getCategories()
      .then((cats) => {
        setCategories(cats);
        if (cats.length > 0) {
          setCategoryId(String(cats[0].categoryId));
        }
      })
      .catch(() => {
        setCategories([]);
      })
      .finally(() => {
        setLoadingCategories(false);
      });

    const loadFallbackManagers = () => {
      const fallbackList: ManagerOption[] = MOCK_USERS.filter(
        (u) =>
          (u.role === "Content Manager" ||
            (u.role as string) === "COURSE_MANAGER") &&
          (u.status === "Active" || (u.status as string) === "ACTIVE"),
      ).map((u) => {
        const numId = parseInt(u.id.replace(/\D/g, ""), 10) || 1;
        return {
          id: numId,
          name: u.name,
          email: u.email,
        };
      });

      if (user?.userId && !fallbackList.some((m) => m.id === user.userId)) {
        fallbackList.unshift({
          id: user.userId,
          name: user.fullName || "Current User",
          email: user.email || "",
        });
      }

      setManagers(fallbackList);
      if (fallbackList.length > 0) {
        setManagerId(String(fallbackList[0].id));
      }
    };

    setLoadingManagers(true);
    api
      .get<{
        data?:
          | {
              content?: Array<{
                userId?: number;
                id?: number;
                fullName?: string;
                name?: string;
                email?: string;
              }>;
            }
          | Array<{
              userId?: number;
              id?: number;
              fullName?: string;
              name?: string;
              email?: string;
            }>;
      }>("/admin/users?role=COURSE_MANAGER&status=ACTIVE")
      .then((res) => {
        const payload = res.data;
        let rawList: Array<{
          userId?: number;
          id?: number;
          fullName?: string;
          name?: string;
          email?: string;
        }> = [];
        if (Array.isArray(payload)) {
          rawList = payload;
        } else if (
          payload &&
          typeof payload === "object" &&
          "content" in payload &&
          Array.isArray(payload.content)
        ) {
          rawList = payload.content;
        }

        if (rawList.length > 0) {
          const mapped: ManagerOption[] = rawList.map((m) => ({
            id: Number(m.userId ?? m.id),
            name: m.fullName || m.name || `Manager #${m.userId ?? m.id}`,
            email: m.email || "",
          }));
          setManagers(mapped);
          if (mapped.length > 0) {
            setManagerId(String(mapped[0].id));
          }
        } else {
          loadFallbackManagers();
        }
      })
      .catch(() => {
        loadFallbackManagers();
      })
      .finally(() => {
        setLoadingManagers(false);
      });
  }, [open]);

  const handleClose = () => {
    if (!submitting) onClose();
  };

  const handleSubmit = async () => {
    if (submitting) return;

    const nextErrors: {
      title?: string;
      categoryId?: string;
      managerId?: string;
      price?: string;
    } = {};
    if (!title.trim()) nextErrors.title = "Course title is required.";
    if (!categoryId) nextErrors.categoryId = "Please select a category.";
    const numPrice = Number(price);
    if (Number.isNaN(numPrice) || numPrice < 0) {
      nextErrors.price = "Price must be 0 or greater.";
    }
    const numManager = Number(managerId);
    if (!managerId || Number.isNaN(numManager) || numManager <= 0) {
      nextErrors.managerId = "Please select a valid course manager.";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitError(null);
    setSubmitting(true);
    try {
      const created = await courseService.createCourse({
        title: title.trim(),
        categoryId: Number(categoryId),
        description: description.trim() || undefined,
        price: numPrice,
        managerId: numManager,
      });
      onCreated(created);
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to create course. Please try again.";
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCategory = categories.find(
    (c) => String(c.categoryId) === String(categoryId),
  );
  const selectedManager = managers.find(
    (m) => String(m.id) === String(managerId),
  );

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Create New Course"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            loading={submitting}
            disabled={submitting}
            icon={<Icon.Check className="w-4 h-4" />}
          >
            {submitting ? "Creating…" : "Create Course"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[13px] text-[#6B7280]">
          Enter course details to set up a new course catalog entry. Newly
          created courses start as drafts.
        </p>

        <Input
          label="Course Title"
          required
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          placeholder="e.g. Python for Data Science"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[13px] font-medium text-[#374151] block mb-1.5">
              Category <span className="text-red-500">*</span>
            </label>
            <Dropdown
              search={true}
              searchPlaceholder="Search category..."
              value={categoryId}
              onSelect={(val) => {
                setCategoryId(String(val));
                if (errors.categoryId) {
                  setErrors((prev) => ({ ...prev, categoryId: undefined }));
                }
              }}
              trigger={
                <button
                  type="button"
                  disabled={loadingCategories || submitting}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-[10px] border bg-surface text-sm text-left transition-colors ${
                    errors.categoryId
                      ? "border-red-500 ring-1 ring-red-500"
                      : "border-[#E5E7EB] hover:border-[#9CA3AF]"
                  } ${loadingCategories ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  <span
                    className={
                      selectedCategory
                        ? "text-[#9CA3AF] truncate font-medium"
                        : "text-[#9CA3AF]"
                    }
                  >
                    {loadingCategories
                      ? "Loading categories…"
                      : selectedCategory
                        ? selectedCategory.name
                        : "Select category…"}
                  </span>
                  <Icon.ChevronDown className="w-4 h-4 text-[#9CA3AF] shrink-0 ml-2" />
                </button>
              }
              items={categories.map((cat) => ({
                label: cat.name,
                value: String(cat.categoryId),
                selected: String(cat.categoryId) === String(categoryId),
                onClick: () => {
                  setCategoryId(String(cat.categoryId));
                  if (errors.categoryId) {
                    setErrors((prev) => ({ ...prev, categoryId: undefined }));
                  }
                },
              }))}
            />
            {errors.categoryId && (
              <p className="text-[12px] text-red-500 mt-1">
                {errors.categoryId}
              </p>
            )}
          </div>

          <Input
            label="Price ($)"
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            error={errors.price}
            hint="Set 0 for free course"
          />
        </div>

        <div>
          <label className="text-[13px] font-medium text-[#374151] block mb-1.5">
            Course Manager <span className="text-red-500">*</span>
          </label>
          <Dropdown
            search={true}
            searchPlaceholder="Search course manager..."
            value={managerId}
            onSelect={(val) => {
              setManagerId(String(val));
              if (errors.managerId) {
                setErrors((prev) => ({ ...prev, managerId: undefined }));
              }
            }}
            trigger={
              <button
                type="button"
                disabled={loadingManagers || submitting}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-[10px] border bg-surface text-sm text-left transition-colors ${
                  errors.managerId
                    ? "border-red-500 ring-1 ring-red-500"
                    : "border-[#E5E7EB] hover:border-[#9CA3AF]"
                } ${loadingManagers ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                <span
                  className={
                    selectedManager
                      ? "text-[#9CA3AF] truncate font-medium"
                      : "text-[#9CA3AF]"
                  }
                >
                  {loadingManagers
                    ? "Loading managers…"
                    : selectedManager
                      ? `${selectedManager.name} (${selectedManager.email || `ID: ${selectedManager.id}`})`
                      : "Select course manager…"}
                </span>
                <Icon.ChevronDown className="w-4 h-4 text-[#9CA3AF] shrink-0 ml-2" />
              </button>
            }
            items={managers.map((m) => ({
              label: m.email ? `${m.name} (${m.email})` : m.name,
              value: String(m.id),
              selected: String(m.id) === String(managerId),
              onClick: () => {
                setManagerId(String(m.id));
                if (errors.managerId) {
                  setErrors((prev) => ({ ...prev, managerId: undefined }));
                }
              },
            }))}
          />
          <p className="text-[12px] text-[#6B7280] mt-1">
            Assign an active course manager to manage this course.
          </p>
          {errors.managerId && (
            <p className="text-[12px] text-red-500 mt-1">{errors.managerId}</p>
          )}
        </div>

        <div>
          <label className="text-[13px] font-medium text-[#374151] block mb-1.5">
            Course Description{" "}
            <span className="text-[#9CA3AF] font-normal">(optional)</span>
          </label>
          <textarea
            className="w-full h-24 px-3 py-2.5 rounded-[10px] border border-[#E5E7EB] text-[14px] text-[#111827] resize-none focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] transition-all"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the course curriculum, goals, and intended audience…"
          />
        </div>

        {submitError && (
          <Alert type="error" title="Creation failed" message={submitError} />
        )}
      </div>
    </Modal>
  );
}
