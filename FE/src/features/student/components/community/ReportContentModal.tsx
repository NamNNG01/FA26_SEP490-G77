import React, { type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

export function ReportContentModal({
  open,
  busy,
  reason,
  onReasonChange,
  onClose,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  reason: string;
  onReasonChange: (v: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Report inappropriate content"
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            form="report-community-form"
            type="submit"
            variant="danger"
            disabled={busy || reason.trim().length < 5}
            loading={busy}
          >
            Submit report
          </Button>
        </>
      }
    >
      <form id="report-community-form" onSubmit={onSubmit} className="space-y-3">
        <label className="grid gap-1.5 text-sm font-medium text-content-secondary">
          Reason for reporting
          <textarea
            required
            maxLength={500}
            rows={3}
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            className="w-full rounded-lg border border-line bg-surface p-3 text-sm text-content"
            placeholder="Describe the issue (at least 5 characters)..."
          />
        </label>
      </form>
    </Modal>
  );
}
