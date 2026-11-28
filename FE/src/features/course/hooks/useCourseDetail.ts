import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useToast } from "@/components/ui/ToastHost";
import {
  courseService,
  type CategoryResponse,
  type CourseDetailResponse,
  type CourseModuleResponse,
  type CourseStudentItem,
  type UpdateCourseRequest,
} from "@/services/course.service";
import { COURSE_PRICE_MAX, coursePriceError } from "../coursePrice";
import { moneyToDigits } from "@/components/ui/MoneyInput";
import { useAuth } from "@/auth/authContext";
import { Role } from "@/utils/permissions";
import { api } from "@/services/api";
import { getApiErrorMessage } from "@/utils/apiError";
import { uploadService } from "@/services/upload.service";

export interface ManagerOption {
  id: number;
  name: string;
  email?: string;
}

const publicContentOf = (m: CourseModuleResponse) =>
  m.publicContentCount ?? m.questionCount + m.examCount + m.deckCount;

export function useCourseDetail({
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
  const notification = useToast();
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
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
  const [priceEdited, setPriceEdited] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasPriceChanges =
    course !== null && priceEdited && (price === "" || Number(price) !== course.price);
  const hasCourseChanges = Boolean(
    course &&
      (title.trim() !== course.title.trim() ||
        description.trim() !== (course.description ?? "").trim() ||
        categoryId !== String(course.categoryId) ||
        hasPriceChanges ||
        isPublished !== course.isPublished),
  );

  const [managerOptions, setManagerOptions] = useState<ManagerOption[]>([]);
  const [selectedManagerIds, setSelectedManagerIds] = useState<string[]>([]);
  const [loadingManagers, setLoadingManagers] = useState(false);
  const savedManagerIds = course
    ? (course.managers?.length
        ? course.managers.map((manager) => manager.userId)
        : [course.managerId]
      ).map(String)
    : [];
  const hasManagerChanges =
    canManageCourse && savedManagerIds.join(",") !== selectedManagerIds.join(",");
  const hasAnyChanges = hasCourseChanges || hasManagerChanges;

  const [categories, setCategories] = useState<CategoryResponse[]>([]);
  const [modules, setModules] = useState<CourseModuleResponse[]>([]);
  const isPaidPublished = Boolean(course?.isPublished && course?.hasPaidPurchases);
  const hasVisibleModule = modules.some((m) => m.status === "VISIBLE");
  const hasEmptyModule = modules.some((m) => publicContentOf(m) === 0);
  const hasDraftQuestions = (course?.draftQuestionCount ?? 0) > 0;
  const publishBlockedReason = !hasVisibleModule
    ? "Add at least one visible module before publishing the course."
    : hasEmptyModule
      ? "Every module in the course must contain at least one active question, published exam, or public flashcard deck before publishing."
      : hasDraftQuestions
        ? "All questions in the course must be published before publishing the course."
        : null;
  const canPublish = publishBlockedReason === null;

  const [isAddModuleOpen, setIsAddModuleOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<CourseModuleResponse | null>(null);
  const [moduleToDelete, setModuleToDelete] = useState<CourseModuleResponse | null>(null);
  const [deletingModule, setDeletingModule] = useState(false);
  const [reorderingModuleId, setReorderingModuleId] = useState<number | null>(null);

  const [isDeleteCourseOpen, setIsDeleteCourseOpen] = useState(false);
  const [deletingCourse, setDeletingCourse] = useState(false);

  const [students, setStudents] = useState<CourseStudentItem[]>([]);
  const [studentTotal, setStudentTotal] = useState(0);
  const [studentPage, setStudentPage] = useState(1);
  const studentPageSize = 10;
  const [studentSearch, setStudentSearch] = useState("");
  const [studentStatus, setStudentStatus] = useState("all");
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentsError, setStudentsError] = useState<string | null>(null);

  const setToast = (value: { type: "success" | "error"; message: string } | null) => {
    if (value) notification[value.type](value.message);
  };

  useEffect(() => {
    courseService
      .getCategories()
      .then((items) => setCategories(items))
      .catch((err) => {
        setCategories([]);
        notification.error(getApiErrorMessage(err, "Failed to load categories."), {
          title: "Could not load categories",
          duration: null,
        });
      });
  }, [notification]);

  useEffect(() => {
    if (!isAdmin) return;
    setLoadingManagers(true);
    api
      .get<{
        data?:
          | Array<{
              userId?: number;
              id?: number;
              fullName?: string;
              name?: string;
              email?: string;
            }>
          | {
              content?: Array<{
                userId?: number;
                id?: number;
                fullName?: string;
                name?: string;
                email?: string;
              }>;
            };
      }>("/admin/users?role=COURSE_MANAGER&status=ACTIVE")
      .then((res) => {
        const payload = res.data;
        const users = Array.isArray(payload)
          ? payload
          : payload && typeof payload === "object" && Array.isArray(payload.content)
            ? payload.content
            : [];
        setManagerOptions(
          users
            .map((manager) => ({
              id: Number(manager.userId ?? manager.id),
              name: manager.fullName || manager.name || `Manager #${manager.userId ?? manager.id}`,
              email: manager.email,
            }))
            .filter((manager) => Number.isFinite(manager.id) && manager.id > 0),
        );
      })
      .catch((err) => {
        setManagerOptions([]);
        notification.error(getApiErrorMessage(err, "Failed to load course managers."), {
          title: "Could not load course managers",
          duration: null,
        });
      })
      .finally(() => setLoadingManagers(false));
  }, [isAdmin, notification]);

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
      setPrice(moneyToDigits(data.price ?? 0));
      setPriceEdited(false);
      setModules([...(data.modules ?? [])].sort((a, b) => a.orderIndex - b.orderIndex));
      setSelectedManagerIds(
        (data.managers?.length
          ? data.managers.map((manager) => manager.userId)
          : [data.managerId]
        ).map(String),
      );
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, "Failed to load course details.");
      setError(msg);
      notification.error(msg, {
        title: "Course details could not be loaded",
        duration: null,
      });
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
    setStudentsError(null);
    try {
      const res = await courseService.getCourseStudents(courseId, {
        search: studentSearch.trim() || undefined,
        status: studentStatus !== "all" ? studentStatus : undefined,
        page: studentPage - 1,
        size: studentPageSize,
      });
      setStudents(res.content);
      setStudentTotal(res.totalElements);
    } catch (err) {
      setStudents([]);
      setStudentTotal(0);
      setStudentsError(getApiErrorMessage(err, "Failed to load enrolled students."));
      notification.error(getApiErrorMessage(err, "Failed to load enrolled students."), {
        title: "Could not load enrolled students",
        duration: null,
      });
    } finally {
      setLoadingStudents(false);
    }
  }, [courseId, studentSearch, studentStatus, studentPage, studentPageSize, notification]);

  useEffect(() => {
    if (tab === "Enrolled Students") {
      loadStudents();
    }
  }, [tab, loadStudents]);

  const handleSaveChanges = async () => {
    if (!course || !hasAnyChanges) return;
    if (hasCourseChanges && !title.trim()) {
      setToast({ type: "error", message: "Course title cannot be empty." });
      return;
    }
    const priceError = hasCourseChanges ? coursePriceError(price) : null;
    if (priceError) {
      setToast({ type: "error", message: priceError });
      return;
    }
    const managerIds = selectedManagerIds.map(Number).filter((id) => Number.isFinite(id) && id > 0);
    if (hasManagerChanges && managerIds.length === 0) {
      setToast({ type: "error", message: "Assign at least one course manager." });
      return;
    }
    setSaving(true);
    try {
      const updatePayload: UpdateCourseRequest = {};
      if (hasCourseChanges) {
        updatePayload.title = title.trim();
        updatePayload.description = description.trim() || undefined;
        updatePayload.categoryId = categoryId ? Number(categoryId) : undefined;
        if (hasPriceChanges) updatePayload.price = Number(price);
      }
      if (hasManagerChanges) {
        updatePayload.managerId = managerIds[0];
        updatePayload.managerIds = managerIds.slice(1);
      }

      let updated = course;
      if (Object.keys(updatePayload).length > 0) {
        updated = await courseService.updateCourse(course.courseId, updatePayload);
      }

      if (isPublished !== course.isPublished) {
        if (isPublished && !canPublish) {
          throw new Error(publishBlockedReason ?? "Course does not meet publishing requirements.");
        }
        updated = await courseService.publishCourse(course.courseId, isPublished);
      }

      let savedManagers = updated.managers ?? course.managers;
      let savedManagerId = updated.managerId;
      let savedManagerName = updated.managerName;
      if (hasManagerChanges) {
        savedManagers = managerIds.map((userId, index) => {
          const option = managerOptions.find((manager) => manager.id === userId);
          const previous = course.managers?.find((manager) => manager.userId === userId);
          return {
            userId,
            fullName: option?.name || previous?.fullName || `Manager #${userId}`,
            email: option?.email || previous?.email,
            primary: index === 0,
          };
        });
        savedManagerId = managerIds[0];
        savedManagerName = savedManagers[0].fullName;
      }

      setCourse({
        ...updated,
        managerId: savedManagerId,
        managerName: savedManagerName,
        managers: savedManagers,
        isPublished,
        modules,
      });
      setPriceEdited(false);
      setSelectedManagerIds(hasManagerChanges ? managerIds.map(String) : savedManagerIds);
      setToast({ type: "success", message: "Course changes saved successfully." });
    } catch (err: unknown) {
      setToast({ type: "error", message: getApiErrorMessage(err, "Failed to save changes.") });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (onNavigate) onNavigate("course-list");
    else navigate("/manager/courses");
  };

  const handleUploadThumbnail = async (file: File) => {
    if (!course) return;
    setUploadingThumbnail(true);
    try {
      const updated = await uploadService.uploadCourseThumbnail(course.courseId, file);
      setCourse((prev) => (prev ? { ...prev, thumbnailUrl: updated.thumbnailUrl } : prev));
      notification.success("Thumbnail updated.");
    } catch (err) {
      notification.error(getApiErrorMessage(err, "Could not upload the thumbnail."));
    } finally {
      setUploadingThumbnail(false);
    }
  };

  const handleRemoveThumbnail = async () => {
    if (!course) return;
    setUploadingThumbnail(true);
    try {
      await courseService.updateCourse(course.courseId, { thumbnailUrl: "" });
      setCourse((prev) => (prev ? { ...prev, thumbnailUrl: null } : prev));
    } catch (err) {
      notification.error(getApiErrorMessage(err, "Could not remove the thumbnail."));
    } finally {
      setUploadingThumbnail(false);
    }
  };

  const handleModuleCreated = (newMod: CourseModuleResponse) => {
    setModules((prev) => [...prev, newMod].sort((a, b) => a.orderIndex - b.orderIndex));
    setToast({ type: "success", message: `Module "${newMod.title}" added successfully.` });
    courseService
      .getCourseModules(courseId)
      .then(setModules)
      .catch((err) => {
        setToast({
          type: "error",
          message: getApiErrorMessage(
            err,
            "Module was added, but the module list could not be refreshed.",
          ),
        });
      });
  };

  const handleModuleUpdated = (updatedMod: CourseModuleResponse | unknown) => {
    const mod = updatedMod as CourseModuleResponse;
    setModules((prev) =>
      prev
        .map((m) => (m.moduleId === mod.moduleId ? mod : m))
        .sort((a, b) => a.orderIndex - b.orderIndex),
    );
    setToast({ type: "success", message: `Module "${mod.title}" updated successfully.` });
    courseService
      .getCourseModules(courseId)
      .then(setModules)
      .catch((err) => {
        setToast({
          type: "error",
          message: getApiErrorMessage(
            err,
            "Module was updated, but the module list could not be refreshed.",
          ),
        });
      });
  };

  const handleMoveModule = async (moduleId: number, direction: -1 | 1) => {
    if (reorderingModuleId !== null) return;
    const orderedModules = [...modules].sort(
      (a, b) => a.orderIndex - b.orderIndex || a.moduleId - b.moduleId,
    );
    const currentIndex = orderedModules.findIndex((module) => module.moduleId === moduleId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= orderedModules.length) return;

    const currentModule = orderedModules[currentIndex];
    const reordered = [...orderedModules];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    const updates = reordered
      .map((mod, idx) => ({ mod, nextOrder: idx + 1 }))
      .filter(({ mod, nextOrder }) => mod.orderIndex !== nextOrder);
    if (updates.length === 0) return;

    setReorderingModuleId(moduleId);
    try {
      for (const { mod, nextOrder } of updates) {
        await courseService.updateModule(mod.moduleId, { orderIndex: nextOrder });
      }
      const refreshedModules = await courseService.getCourseModules(courseId);
      setModules(
        [...refreshedModules].sort(
          (a, b) => a.orderIndex - b.orderIndex || a.moduleId - b.moduleId,
        ),
      );
      setToast({
        type: "success",
        message: `Moved "${currentModule.title}" ${direction === -1 ? "up" : "down"}.`,
      });
    } catch (err: unknown) {
      try {
        const refreshedModules = await courseService.getCourseModules(courseId);
        setModules(
          [...refreshedModules].sort(
            (a, b) => a.orderIndex - b.orderIndex || a.moduleId - b.moduleId,
          ),
        );
      } catch {
        // Keep the current list if refreshing after a failed reorder also fails.
      }
      setToast({
        type: "error",
        message: getApiErrorMessage(err, "Could not reorder modules. Please try again."),
      });
    } finally {
      setReorderingModuleId(null);
    }
  };

  const handleRemoveModule = async () => {
    if (!moduleToDelete) return;
    setDeletingModule(true);
    try {
      await courseService.deleteModule(moduleToDelete.moduleId);
      setModules((prev) => prev.filter((m) => m.moduleId !== moduleToDelete.moduleId));
      setToast({ type: "success", message: `Module "${moduleToDelete.title}" removed.` });
      setModuleToDelete(null);
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, "Failed to delete module.");
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
      notification.success(`Course “${course.title}” deleted successfully.`);
      if (onNavigate) onNavigate("course-list");
      else navigate("/manager/courses");
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, "Failed to delete course.");
      setToast({ type: "error", message: msg });
    } finally {
      setDeletingCourse(false);
    }
  };

  return {
    course,
    loading,
    error,
    tab,
    setTab,
    canManageCourse,
    canCreateModule,
    title,
    setTitle,
    description,
    setDescription,
    categoryId,
    setCategoryId,
    isPublished,
    setIsPublished,
    price,
    setPrice,
    setPriceEdited,
    saving,
    hasPriceChanges,
    hasAnyChanges,
    uploadingThumbnail,
    isPaidPublished,
    publishBlockedReason,
    categories,
    managerOptions,
    selectedManagerIds,
    setSelectedManagerIds,
    loadingManagers,
    modules,
    isAddModuleOpen,
    setIsAddModuleOpen,
    editingModule,
    setEditingModule,
    moduleToDelete,
    setModuleToDelete,
    deletingModule,
    reorderingModuleId,
    isDeleteCourseOpen,
    setIsDeleteCourseOpen,
    deletingCourse,
    students,
    studentTotal,
    studentSearch,
    setStudentSearch,
    studentStatus,
    setStudentStatus,
    setStudentPage,
    loadingStudents,
    studentsError,
    priceMax: COURSE_PRICE_MAX,
    onThumbnailError: (m: string) => notification.error(m),
    loadStudents,
    handleSaveChanges,
    handleCancel,
    handleUploadThumbnail,
    handleRemoveThumbnail,
    handleModuleCreated,
    handleModuleUpdated,
    handleMoveModule,
    handleRemoveModule,
    handleDeleteCourse,
  };
}
