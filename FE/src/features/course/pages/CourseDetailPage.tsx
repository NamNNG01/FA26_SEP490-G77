import React from "react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Tabs } from "@/components/ui/Tabs";
import { AddModuleModal } from "@/components/modules/AddModuleModal";
import { EditModuleModal } from "@/components/modules/EditModuleModal";
import { useCourseDetail } from "../hooks/useCourseDetail";
import { CourseInfoFormCard } from "../components/detail/CourseInfoFormCard";
import { CourseModulesCard } from "../components/detail/CourseModulesCard";
import { CourseStudentsTab } from "../components/detail/CourseStudentsTab";

export function CourseDetailPage({
  onNavigate,
  params,
}: {
  onNavigate?: (id: string, params?: Record<string, string>) => void;
  params?: Record<string, string>;
}) {
  const detail = useCourseDetail({ onNavigate, params });

  if (detail.loading) {
    return (
      <div className="p-8 py-24 text-center text-content-subtle">
        <div className="inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-base">Loading course details…</p>
      </div>
    );
  }

  if (detail.error || !detail.course) {
    return (
      <div className="p-8 space-y-4">
        <Breadcrumb
          items={[{ label: "Courses", onClick: detail.handleCancel }, { label: "Course Detail" }]}
        />
        <p className="text-sm text-content-subtle">
          Course details could not be loaded. See the notification for details.
        </p>
        <Button variant="outline" onClick={detail.handleCancel}>
          Back to Courses
        </Button>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Breadcrumb
            items={[
              { label: "Courses", onClick: detail.handleCancel },
              { label: detail.course.title },
            ]}
          />
          <h2 className="text-xl font-bold text-content mt-1">Course Detail</h2>
        </div>
      </div>

      <Tabs
        tabs={["Course Details & Modules", "Enrolled Students"]}
        active={detail.tab}
        onChange={detail.setTab}
      />

      {detail.tab === "Course Details & Modules" && (
        <div className="space-y-6">
          <CourseInfoFormCard
            course={detail.course}
            canManageCourse={detail.canManageCourse}
            title={detail.title}
            onTitleChange={detail.setTitle}
            description={detail.description}
            onDescriptionChange={detail.setDescription}
            isPublished={detail.isPublished}
            onIsPublishedChange={detail.setIsPublished}
            categoryId={detail.categoryId}
            onCategoryChange={detail.setCategoryId}
            categories={detail.categories}
            price={detail.price}
            priceMax={detail.priceMax}
            hasPriceChanges={detail.hasPriceChanges}
            onPriceChange={(value) => {
              detail.setPrice(value);
              detail.setPriceEdited(true);
            }}
            isPaidPublished={detail.isPaidPublished}
            publishBlockedReason={detail.publishBlockedReason}
            uploadingThumbnail={detail.uploadingThumbnail}
            onThumbnailError={detail.onThumbnailError}
            onUploadThumbnail={(file) => void detail.handleUploadThumbnail(file)}
            onRemoveThumbnail={() => void detail.handleRemoveThumbnail()}
            managerOptions={detail.managerOptions}
            selectedManagerIds={detail.selectedManagerIds}
            onSelectedManagerIdsChange={detail.setSelectedManagerIds}
            loadingManagers={detail.loadingManagers}
            saving={detail.saving}
            hasAnyChanges={detail.hasAnyChanges}
            onSaveChanges={() => void detail.handleSaveChanges()}
            onOpenDeleteCourse={() => detail.setIsDeleteCourseOpen(true)}
          />

          <CourseModulesCard
            modules={detail.modules}
            canCreateModule={detail.canCreateModule}
            reorderingModuleId={detail.reorderingModuleId}
            onAddModule={() => detail.setIsAddModuleOpen(true)}
            onMoveModule={(moduleId, direction) => void detail.handleMoveModule(moduleId, direction)}
            onEditModule={detail.setEditingModule}
            onRemoveModule={detail.setModuleToDelete}
          />
        </div>
      )}

      {detail.tab === "Enrolled Students" && (
        <CourseStudentsTab
          courseTitle={detail.course.title}
          students={detail.students}
          studentTotal={detail.studentTotal}
          studentSearch={detail.studentSearch}
          onSearchChange={(val) => {
            detail.setStudentSearch(val);
            detail.setStudentPage(1);
          }}
          studentStatus={detail.studentStatus}
          onStatusChange={(val) => {
            detail.setStudentStatus(val);
            detail.setStudentPage(1);
          }}
          loadingStudents={detail.loadingStudents}
          studentsError={detail.studentsError}
          onRetry={() => void detail.loadStudents()}
        />
      )}

      <AddModuleModal
        open={detail.isAddModuleOpen}
        courseId={detail.course.courseId}
        onClose={() => detail.setIsAddModuleOpen(false)}
        onCreated={detail.handleModuleCreated}
      />

      <EditModuleModal
        open={!!detail.editingModule}
        module={detail.editingModule}
        onClose={() => detail.setEditingModule(null)}
        onSaved={detail.handleModuleUpdated}
      />

      <ConfirmDialog
        open={!!detail.moduleToDelete}
        onClose={() => detail.setModuleToDelete(null)}
        onConfirm={() => void detail.handleRemoveModule()}
        loading={detail.deletingModule}
        tone="danger"
        title="Remove this module?"
        description={
          <>
            <span className="font-semibold text-content">"{detail.moduleToDelete?.title}"</span> will
            be removed. Its questions and exams are not deleted — they become unassigned so you can
            reassign them later.
          </>
        }
        confirmLabel="Remove"
      />

      <ConfirmDialog
        open={detail.isDeleteCourseOpen}
        onClose={() => detail.setIsDeleteCourseOpen(false)}
        onConfirm={() => void detail.handleDeleteCourse()}
        loading={detail.deletingCourse}
        tone="danger"
        title="Delete this course?"
        description={
          <>
            <span className="font-semibold text-content">"{detail.course.title}"</span> will be
            permanently deleted. This action cannot be undone. Courses with enrolled students cannot
            be deleted; unpublish the course instead.
          </>
        }
        confirmLabel="Delete"
      />
    </div>
  );
}
