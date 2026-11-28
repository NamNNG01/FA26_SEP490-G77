import React from "react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/assets/icons";
import { ROUTES } from "@/app/routes";
import { QuestionBankSelectModal } from "../components/QuestionBankSelectModal";
import { QuestionGroupModal } from "../components/QuestionGroupModal";
import { RubricDetailModal } from "../components/RubricDetailModal";
import { ImportQuestionsModal } from "../components/ImportQuestionsModal";
import { ImportPdfModal } from "@/features/question/components/ImportPdfModal";
import { ExamAiGenerateTab } from "../components/ExamAiGenerateTab";
import { useExamForm } from "../hooks/useExamForm";
import { ExamSettingsSection } from "../components/form/ExamSettingsSection";
import { ExamQuestionsSection } from "../components/form/ExamQuestionsSection";
import { ExamSummarySidebar } from "../components/form/ExamSummarySidebar";
import { EditExamQuestionModal } from "../components/form/EditExamQuestionModal";
import { ArchiveCloneModal } from "../components/form/ArchiveCloneModal";

export function ExamFormPage({
  formKind,
  mode,
}: {
  formKind?: "QUIZ" | "ESSAY" | "DIAGRAM" | "CODE";
  mode?: "create" | "edit";
}) {
  const form = useExamForm({ formKind, mode });

  return (
    <div className="p-8 space-y-5">
      <Breadcrumb
        items={[
          { label: "Exams", onClick: () => form.navigate(ROUTES.managerExams) },
          {
            label: form.isEdit ? `Edit ${form.formLabel} Exam` : `New ${form.formLabel} Exam`,
          },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-content">
            {form.isEdit ? `Edit ${form.formLabel} Exam` : `Create ${form.formLabel} Exam`}
          </h2>
          <Badge
            variant={
              form.status === "PUBLISHED"
                ? "success"
                : form.status === "ARCHIVED"
                  ? "default"
                  : "warning"
            }
          >
            {form.status}
          </Badge>
          <Badge variant="purple">{form.formLabel}</Badge>
        </div>

        <div className="flex items-center gap-2">
          {form.isEdit && (
            <>
              {form.status === "DRAFT" && (
                <Button
                  variant="outline"
                  icon={<Icon.CheckCircle className="w-4 h-4" />}
                  onClick={() => form.handlePublishStatusChange("PUBLISHED")}
                  disabled={
                    form.saving ||
                    form.loading ||
                    (form.generationType === "STATIC" && form.totalQuestionCount === 0)
                  }
                >
                  Publish Exam
                </Button>
              )}

              {form.status !== "ARCHIVED" && (
                <Button
                  variant="outline"
                  icon={<Icon.Archive className="w-4 h-4" />}
                  onClick={() => form.handlePublishStatusChange("ARCHIVED")}
                  disabled={form.saving || form.loading}
                >
                  Archive
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {form.isPublished && (
        <div className="p-4 bg-info-light/40 border border-brand-line/60 rounded-[12px] flex items-center gap-2.5">
          <Icon.Info className="w-5 h-5 text-brand-ink flex-shrink-0" />
          <span className="text-sm font-medium text-foreground">
            This exam is published. Exam settings and published question contents are locked, but
            you can add or remove questions from the bank.
          </span>
        </div>
      )}

      {form.isArchived && (
        <div className="p-4 bg-surface-muted border border-line rounded-[12px] flex items-center gap-2.5">
          <Icon.Archive className="w-5 h-5 text-content-subtle flex-shrink-0" />
          <span className="text-sm font-medium text-content-secondary">
            This exam is archived and read-only.
          </span>
        </div>
      )}

      {!form.isEdit && (
        <div className="flex border-b border-line">
          <button
            type="button"
            onClick={() => form.setActiveTab("manual")}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer ${
              form.activeTab === "manual"
                ? "border-brand-ink text-brand-ink"
                : "border-transparent text-content-subtle hover:text-content"
            }`}
          >
            Manual Exam Setup
          </button>
          <button
            type="button"
            onClick={() => form.setActiveTab("ai")}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors cursor-pointer flex items-center gap-1.5 ${
              form.activeTab === "ai"
                ? "border-brand-ink text-brand-ink"
                : "border-transparent text-content-subtle hover:text-content"
            }`}
          >
            <Icon.Zap className="w-4 h-4" />
            AI Generate
          </button>
        </div>
      )}

      {!form.isEdit && form.activeTab === "ai" ? (
        <ExamAiGenerateTab
          formKind={form.formKind}
          onCreated={(created) => {
            const targetRoute =
              form.formKind === "QUIZ"
                ? `/manager/exams/quiz/${created.examId}`
                : `/manager/exams/${form.examPathKind}/${created.examId}`;
            form.navigate(targetRoute, { replace: true });
          }}
          onCancel={() => form.setActiveTab("manual")}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 space-y-6">
            <ExamSettingsSection
              courses={form.courses}
              modules={form.modules}
              courseId={form.courseId}
              onCourseChange={(v) => {
                form.setCourseId(v);
                form.setModuleId("");
                form.setModules([]);
                form.setIsDirty(true);
                form.setFieldErrors((p) => ({ ...p, courseId: "", moduleId: "" }));
              }}
              moduleId={form.moduleId}
              onModuleChange={(v) => {
                form.setModuleId(v);
                form.setIsDirty(true);
                if (form.fieldErrors.moduleId) {
                  form.setFieldErrors((p) => ({ ...p, moduleId: "" }));
                }
              }}
              title={form.title}
              onTitleChange={(v) => {
                form.setTitle(v);
                form.setIsDirty(true);
                if (form.fieldErrors.title) form.setFieldErrors((p) => ({ ...p, title: "" }));
              }}
              description={form.description}
              onDescriptionChange={(v) => {
                form.setDescription(v);
                form.setIsDirty(true);
              }}
              durationMinutes={form.durationMinutes}
              onDurationChange={(v) => {
                form.setDurationMinutes(v);
                form.setIsDirty(true);
              }}
              maxScore={form.maxScore}
              onMaxScoreChange={(v) => {
                form.setMaxScore(v);
                form.setIsDirty(true);
              }}
              mode={form.mode}
              onModeChange={(v) => {
                form.setMode(v);
                form.setIsDirty(true);
              }}
              questionOrder={form.questionOrder}
              onQuestionOrderChange={(v) => {
                form.setQuestionOrder(v);
                form.setIsDirty(true);
              }}
              isReadOnly={form.isReadOnly}
              hasAddedQuestions={form.hasAddedQuestions}
              fieldErrors={form.fieldErrors}
            />

            <ExamQuestionsSection
              unifiedItems={form.unifiedItems}
              questionOrder={form.questionOrder}
              courseId={form.courseId}
              moduleId={form.moduleId}
              formKind={form.formKind}
              isEdit={form.isEdit}
              isReadOnly={form.isReadOnly}
              isPublished={form.isPublished}
              isAssessment={form.isAssessment}
              canManageExamQuestions={form.canManageExamQuestions}
              loading={form.loading}
              orderSaving={form.orderSaving}
              hasAnyItems={
                form.questions.length > 0 ||
                form.groups.length > 0 ||
                form.importedQuestionDrafts.length > 0
              }
              totalQuestionCount={form.totalQuestionCount}
              fieldError={form.fieldErrors.questions}
              allowedQuestionTypes={form.allowedQuestionTypes}
              importedQuestionsSubmitted={form.importedQuestionsSubmitted}
              expandedGroupIds={form.expandedGroupIds}
              onToggleGroup={form.toggleGroupExpanded}
              scoreForWeight={form.scoreForWeight}
              formatScore={form.formatScore}
              onRemoveAll={form.handleRemoveAllQuestions}
              onOpenImportModal={() => form.setImportModalOpen(true)}
              onOpenImportPreview={() => form.setImportPreviewOpen(true)}
              onOpenGroupModal={() => form.setGroupModalOpen(true)}
              onOpenBankModal={() => form.setBankModalOpen(true)}
              onMoveUnifiedItem={form.moveUnifiedItem}
              onMoveGroupQuestion={form.moveGroupQuestion}
              onQuestionWeightChange={form.handleQuestionWeightChange}
              onQuestionWeightBlur={form.handleQuestionWeightBlur}
              onOpenRubricModal={form.setRubricModalQuestion}
              onEditQuestion={form.setQuestionEditTarget}
              onRequestRemove={form.setRemoveConfirmTarget}
              onUpdateImportedDraft={form.updateImportedDraft}
              onRemoveImportedDraft={form.removeImportedDraft}
              onImportedWeightChange={form.updateImportedWeight}
            />
          </div>

          <ExamSummarySidebar
            formLabel={form.formLabel}
            status={form.status}
            mode={form.mode}
            questionOrder={form.questionOrder}
            durationMinutes={form.durationMinutes}
            totalQuestionCount={form.totalQuestionCount}
            totalWeight={form.totalWeight}
            maxScore={form.maxScore}
            formatScore={form.formatScore}
            isEdit={form.isEdit}
            isReadOnly={form.isReadOnly}
            isDirty={form.isDirty}
            saving={form.saving}
            loading={form.loading}
            onSave={form.handleSaveExam}
            onCancel={form.handleCancelClick}
          />
        </div>
      )}

      <QuestionBankSelectModal
        open={form.bankModalOpen}
        onClose={() => form.setBankModalOpen(false)}
        onSelect={form.handleAddQuestionsFromBank}
        allowedQuestionTypes={form.allowedQuestionTypes}
        existingQuestionIds={form.existingQuestionIds}
        courseId={Number(form.courseId)}
        initialModuleId={form.moduleId ? Number(form.moduleId) : undefined}
        courseName={
          form.courses.find((course) => String(course.courseId) === form.courseId)?.title ?? ""
        }
        modules={form.modules.map((module) => ({
          moduleId: module.moduleId,
          title: module.title,
        }))}
        loading={form.loading}
      />

      <QuestionGroupModal
        open={form.groupModalOpen}
        onClose={() => form.setGroupModalOpen(false)}
        onSelectGroup={form.handleAddGroup}
        existingGroupIds={form.existingGroupIds}
        courseId={form.courseId ? Number(form.courseId) : undefined}
        moduleId={form.moduleId ? Number(form.moduleId) : undefined}
        questionType={form.formKind}
        loading={form.loading}
      />

      <EditExamQuestionModal
        target={form.questionEditTarget}
        allowedQuestionTypes={form.allowedQuestionTypes}
        onClose={() => form.setQuestionEditTarget(null)}
        onUpdated={form.handleQuestionUpdated}
      />

      <RubricDetailModal
        open={form.rubricModalQuestion !== null}
        questionId={form.rubricModalQuestion?.id || null}
        questionContent={form.rubricModalQuestion?.content}
        questionPoints={form.scoreForWeight(
          form.questions.find((q) => q.questionId === form.rubricModalQuestion?.id)?.weight ??
            form.questions.find((q) => q.questionId === form.rubricModalQuestion?.id)?.points ??
            1,
        )}
        onClose={() => form.setRubricModalQuestion(null)}
        onSaved={(qid) => {
          form.setQuestions((prev) =>
            prev.map((q) => (q.questionId === qid ? { ...q, hasRubric: true } : q)),
          );
        }}
      />

      {!form.isEdit && (
        <ImportPdfModal
          open={form.importPreviewOpen}
          onClose={() => form.setImportPreviewOpen(false)}
          onImported={form.handleImportedDrafts}
          courseId={form.courseId}
          moduleId={form.moduleId}
          lockLocation
        />
      )}

      {form.isEdit && form.id && (
        <ImportQuestionsModal
          open={form.importModalOpen}
          examId={Number(form.id)}
          onClose={() => form.setImportModalOpen(false)}
          onSuccess={() => form.loadExamDetail(Number(form.id))}
        />
      )}

      <ConfirmDialog
        open={form.removeConfirmTarget !== null}
        onClose={() => form.setRemoveConfirmTarget(null)}
        onConfirm={() => {
          if (form.removeConfirmTarget?.type === "question") {
            form.handleRemoveQuestion(form.removeConfirmTarget.examQuestionId);
          } else if (form.removeConfirmTarget?.type === "group") {
            form.handleRemoveGroup(form.removeConfirmTarget.examGroupId);
          }
        }}
        tone="danger"
        title="Remove from this exam?"
        description={
          <>
            <strong className="text-content">"{form.removeConfirmTarget?.title}"</strong> is only
            unlinked from this exam. The original item in the Question Bank is preserved.
          </>
        }
        confirmLabel="Remove"
      />

      <ArchiveCloneModal
        open={form.archiveCloneModalOpen}
        saveDescriptionOnly={form.saveDescriptionOnly}
        saving={form.saving}
        archiveCloning={form.archiveCloning}
        onClose={() => form.setArchiveCloneModalOpen(false)}
        onEnableDescriptionOnly={() => form.setSaveDescriptionOnly(true)}
        onSaveDescriptionOnly={form.handleSaveDescriptionOnly}
        onArchiveAndClone={form.handleArchiveAndClone}
      />

      <ConfirmDialog
        open={form.leaveConfirmOpen}
        onClose={() => form.setLeaveConfirmOpen(false)}
        onConfirm={() => form.navigate(ROUTES.managerExams)}
        tone="danger"
        title="Discard unsaved changes?"
        description="You have unsaved changes in this exam form. If you leave now, they will be lost."
        cancelLabel="Keep editing"
        confirmLabel="Discard"
      />
    </div>
  );
}
