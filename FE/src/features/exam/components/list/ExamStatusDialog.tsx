import React from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { StatusDialogTarget } from "../../hooks/useExamList";

interface ExamStatusDialogProps {
  target: StatusDialogTarget | null;
  updating: boolean;
  warnings: string[];
  onClose: () => void;
  onConfirm: () => void;
  onCloseWarnings: () => void;
}

export function ExamStatusDialog({
  target,
  updating,
  warnings,
  onClose,
  onConfirm,
  onCloseWarnings,
}: ExamStatusDialogProps) {
  return (
    <>
      <ConfirmDialog
        open={target !== null && warnings.length === 0}
        onClose={onClose}
        onConfirm={onConfirm}
        loading={updating}
        title={`Change status to ${target?.targetStatus}?`}
        description={
          <>
            <strong className="text-content">"{target?.exam.title}"</strong> will be moved to{" "}
            <strong className="text-brand-ink">{target?.targetStatus}</strong>.
          </>
        }
        confirmLabel="Confirm"
      />

      {/* After a publish that went through with warnings — information only. */}
      <Modal
        open={target !== null && warnings.length > 0}
        onClose={onCloseWarnings}
        title={`Confirm ${target?.targetStatus}`}
        size="sm"
        footer={
          <Button variant="outline" onClick={onCloseWarnings}>
            Close
          </Button>
        }
      >
        <div className="p-3 bg-warning-light/40 border border-warning-line rounded-[8px] space-y-1 text-xs text-warning-strong">
          <p className="font-semibold">Published successfully with warnings:</p>
          {warnings.map((w, idx) => (
            <p key={idx}>• {w}</p>
          ))}
        </div>
      </Modal>
    </>
  );
}
