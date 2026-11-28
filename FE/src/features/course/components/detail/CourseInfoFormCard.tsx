import React from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { CourseThumbnailField } from "@/components/courses/CourseThumbnailField";
import { Icon } from "@/assets/icons";
import {
  COURSE_STATUS_LABELS,
  type CategoryResponse,
  type CourseDetailResponse,
} from "@/services/course.service";
import { formatStoredCoursePrice } from "../../coursePrice";
import type { ManagerOption } from "../../hooks/useCourseDetail";
import { CourseManagerList } from "./CourseManagerList";

interface CourseInfoFormCardProps {
  course: CourseDetailResponse;
  canManageCourse: boolean;
  title: string;
  onTitleChange: (v: string) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  isPublished: boolean;
  onIsPublishedChange: (v: boolean) => void;
  categoryId: string;
  onCategoryChange: (v: string) => void;
  categories: CategoryResponse[];
  price: string;
  priceMax: number;
  hasPriceChanges: boolean;
  onPriceChange: (v: string) => void;
  isPaidPublished: boolean;
  publishBlockedReason: string | null;
  uploadingThumbnail: boolean;
  onThumbnailError: (m: string) => void;
  onUploadThumbnail: (file: File) => void;
  onRemoveThumbnail: () => void;
  managerOptions: ManagerOption[];
  selectedManagerIds: string[];
  onSelectedManagerIdsChange: (ids: string[]) => void;
  loadingManagers: boolean;
  saving: boolean;
  hasAnyChanges: boolean;
  onSaveChanges: () => void;
  onOpenDeleteCourse: () => void;
}

export function CourseInfoFormCard({
  course,
  canManageCourse,
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  isPublished,
  onIsPublishedChange,
  categoryId,
  onCategoryChange,
  categories,
  price,
  priceMax,
  hasPriceChanges,
  onPriceChange,
  isPaidPublished,
  publishBlockedReason,
  uploadingThumbnail,
  onThumbnailError,
  onUploadThumbnail,
  onRemoveThumbnail,
  managerOptions,
  selectedManagerIds,
  onSelectedManagerIdsChange,
  loadingManagers,
  saving,
  hasAnyChanges,
  onSaveChanges,
  onOpenDeleteCourse,
}: CourseInfoFormCardProps) {
  const categoryOptions = categories.map((c) => ({
    label: c.name,
    value: String(c.categoryId),
  }));

  return (
    <div className="card p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-content">Course Details</h3>
        <div className="flex items-center gap-2">
          <Badge variant={course.status === "PUBLISHED" ? "success" : "warning"}>
            {COURSE_STATUS_LABELS[course.status]}
          </Badge>
          {canManageCourse && (
            <Button
              size="sm"
              icon={<Icon.Check className="w-4 h-4" />}
              onClick={onSaveChanges}
              loading={saving}
              disabled={saving || !hasAnyChanges}
            >
              Save Changes
            </Button>
          )}
          {canManageCourse && (
            <Button
              variant="ghost"
              size="sm"
              className="text-danger hover:bg-danger-light hover:text-danger"
              icon={<Icon.Trash className="w-4 h-4" />}
              onClick={onOpenDeleteCourse}
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
            onChange={(e) => onTitleChange(e.target.value)}
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
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Describe the course curriculum, learning outcomes, and prerequisites…"
            />
          </div>
        </div>

        <div className="space-y-4">
          <CourseThumbnailField
            url={course.thumbnailUrl}
            disabled={!canManageCourse}
            uploading={uploadingThumbnail}
            onError={onThumbnailError}
            onPick={onUploadThumbnail}
            onRemove={onRemoveThumbnail}
          />

          <Select
            label="Publication Status"
            value={isPublished ? "published" : "draft"}
            disabled={!canManageCourse || isPaidPublished}
            onChange={(val) => onIsPublishedChange(val === "published")}
            options={[
              { label: "Published", value: "published" },
              {
                label:
                  course.status === "READY_TO_PUBLISH"
                    ? COURSE_STATUS_LABELS.READY_TO_PUBLISH
                    : "Draft",
                value: "draft",
              },
            ]}
          />
          {isPaidPublished && (
            <p className="-mt-2 text-xs text-content-subtle">
              Cannot unpublish a course that students have already purchased.
            </p>
          )}
          {!course.isPublished && publishBlockedReason && (
            <p className="-mt-2 text-xs text-content-subtle">{publishBlockedReason}</p>
          )}

          <Select
            label="Category"
            value={categoryId}
            disabled={!canManageCourse}
            onChange={onCategoryChange}
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

          <MoneyInput
            label="Price (VND)"
            preserveNegativeSign
            max={priceMax}
            value={price}
            disabled={!canManageCourse || isPaidPublished}
            readOnly={!canManageCourse || isPaidPublished}
            onValueChange={onPriceChange}
            hint={
              isPaidPublished
                ? "Price cannot be changed after students have purchased the course."
                : !hasPriceChanges && !Number.isInteger(course.price)
                  ? `Stored price: ${formatStoredCoursePrice(course.price)}`
                  : canManageCourse
                    ? "0 = Free"
                    : undefined
            }
          />

          <CourseManagerList
            course={course}
            canEdit={canManageCourse}
            managerOptions={managerOptions}
            selectedManagerIds={selectedManagerIds}
            onSelectedManagerIdsChange={onSelectedManagerIdsChange}
            loadingManagers={loadingManagers}
            saving={saving}
          />
        </div>
      </div>
    </div>
  );
}
