import React from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { ExamListItem } from "@/services/exam.service";
import type { BulkDeleteSummary } from "../../hooks/useExamList";

interface ExamDeleteDialogsProps {
  deleteTarget: ExamListItem | null;
  deleteConflict409: boolean;
  deleting: boolean;
  onCloseDelete: () => void;
  onConfirmDelete: () => void;
  onCloseConflict: () => void;
  onArchiveInstead: () => void;
  bulkDeleteConfirmOpen: boolean;
  bulkDeleting: boolean;
  selectedCount: number;
  onCloseBulkDelete: () => void;
  onConfirmBulkDelete: () => void;
  bulkDeleteSummary: BulkDeleteSummary | null;
  onCloseBulkSummary: () => void;
}

export function ExamDeleteDialogs({
  deleteTarget,
  deleteConflict409,
  deleting,
  onCloseDelete,
  onConfirmDelete,
  onCloseConflict,
  onArchiveInstead,
  bulkDeleteConfirmOpen,
  bulkDeleting,
  selectedCount,
  onCloseBulkDelete,
  onConfirmBulkDelete,
  bulkDeleteSummary,
  onCloseBulkSummary,
}: ExamDeleteDialogsProps) {
  return (
    <>
      <ConfirmDialog
        open={deleteTarget !== null && !deleteConflict409}
        onClose={onCloseDelete}
        onConfirm={onConfirmDelete}
        loading={deleting}
        tone="danger"
        title="Delete this exam?"
        description={
          <>
            <strong className="text-content">"{deleteTarget?.title}"</strong> will be permanently
            deleted. Only drafts with no submissions can be deleted — archive an exam to keep its
            attempt history.
          </>
        }
        confirmLabel="Delete"
      />

      <ConfirmDialog
        open={deleteTarget !== null && deleteConflict409}
        onClose={onCloseConflict}
        onConfirm={onArchiveInstead}
        title="This exam can't be deleted"
        description="Students have already submitted attempts for it. Archive the exam instead to preserve their grading history."
        confirmLabel="Archive instead"
      />

      <ConfirmDialog
        open={bulkDeleteConfirmOpen}
        onClose={onCloseBulkDelete}
        onConfirm={onConfirmBulkDelete}
        loading={bulkDeleting}
        confirmDisabled={selectedCount === 0}
        tone="danger"
        title={`Delete ${selectedCount} exam${selectedCount === 1 ? "" : "s"}?`}
        description="This action cannot be undone. Exams with student attempts may fail to delete."
        confirmLabel="Delete"
      />

      <Modal
        open={bulkDeleteSummary !== null}
        onClose={onCloseBulkSummary}
        title="Bulk Delete Summary"
        size="sm"
        footer={<Button onClick={onCloseBulkSummary}>Done</Button>}
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
    </>
  );
}
