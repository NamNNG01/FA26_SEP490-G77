import React from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/assets/icons";

interface ArchiveCloneModalProps {
  open: boolean;
  saveDescriptionOnly: boolean;
  saving: boolean;
  archiveCloning: boolean;
  onClose: () => void;
  onEnableDescriptionOnly: () => void;
  onSaveDescriptionOnly: () => void;
  onArchiveAndClone: () => void;
}

export function ArchiveCloneModal({
  open,
  saveDescriptionOnly,
  saving,
  archiveCloning,
  onClose,
  onEnableDescriptionOnly,
  onSaveDescriptionOnly,
  onArchiveAndClone,
}: ArchiveCloneModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Exam Already Has Student Attempts (409)"
      size="lg"
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {saveDescriptionOnly ? (
            <Button onClick={onSaveDescriptionOnly} loading={saving}>
              Save Description
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={onEnableDescriptionOnly}>
                Edit Description Only
              </Button>
              <Button
                onClick={onArchiveAndClone}
                loading={archiveCloning}
                icon={<Icon.Copy className="w-4 h-4" />}
              >
                Archive and Clone
              </Button>
            </>
          )}
        </div>
      }
    >
      <div className="space-y-3 text-sm text-content">
        <p className="text-danger font-medium">
          This exam already has student submission attempts. Structure, duration, and question
          matrix cannot be directly modified.
        </p>
        <p className="text-xs text-content-subtle leading-relaxed">
          You can either update only the description, or execute{" "}
          <strong>Archive and Clone</strong> to archive the current exam (preserving score records)
          and generate a new editable draft copy.
        </p>
      </div>
    </Modal>
  );
}
