import React, { type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import type { DeleteTarget } from "../../hooks/useManagerDiscussion";

interface DiscussionActionModalsProps {
  busy: boolean;
  templates: string[];
  selectedCount: number;
  bulkRejectOpen: boolean;
  bulkRejectReason: string;
  onCloseBulkReject: () => void;
  onBulkRejectReasonChange: (v: string) => void;
  onConfirmBulkReject: () => void;
  muteTarget: { userId: number; displayName: string } | null;
  muteDays: string;
  muteReason: string;
  onCloseMute: () => void;
  onMuteDaysChange: (v: string) => void;
  onMuteReasonChange: (v: string) => void;
  onSubmitMute: (event: FormEvent) => void;
  deleteTarget: DeleteTarget | null;
  onCloseDelete: () => void;
  onConfirmDelete: () => void;
}

export function DiscussionActionModals({
  busy,
  templates,
  selectedCount,
  bulkRejectOpen,
  bulkRejectReason,
  onCloseBulkReject,
  onBulkRejectReasonChange,
  onConfirmBulkReject,
  muteTarget,
  muteDays,
  muteReason,
  onCloseMute,
  onMuteDaysChange,
  onMuteReasonChange,
  onSubmitMute,
  deleteTarget,
  onCloseDelete,
  onConfirmDelete,
}: DiscussionActionModalsProps) {
  return (
    <>
      <Modal
        open={bulkRejectOpen}
        onClose={() => {
          if (!busy) onCloseBulkReject();
        }}
        title={`Reject ${selectedCount} selected posts`}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={onCloseBulkReject} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={onConfirmBulkReject}
              disabled={busy || bulkRejectReason.trim().length < 5}
              loading={busy}
            >
              Confirm reject
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {templates.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {templates.map((tpl) => (
                <button
                  key={tpl}
                  type="button"
                  onClick={() => onBulkRejectReasonChange(tpl)}
                  className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-content hover:border-brand-500"
                >
                  {tpl}
                </button>
              ))}
            </div>
          )}
          <textarea
            maxLength={1000}
            rows={3}
            value={bulkRejectReason}
            onChange={(event) => onBulkRejectReasonChange(event.target.value)}
            className="w-full rounded-lg border border-line bg-surface p-3 text-sm text-content"
            placeholder="Enter rejection reason (at least 5 characters)..."
          />
        </div>
      </Modal>

      <Modal
        open={!!muteTarget}
        onClose={() => {
          if (!busy) onCloseMute();
        }}
        title={`Mute ${muteTarget?.displayName ?? "user"}`}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={onCloseMute} disabled={busy}>
              Cancel
            </Button>
            <Button
              form="mute-user-form"
              type="submit"
              variant="danger"
              disabled={busy || muteReason.trim().length < 5}
              loading={busy}
            >
              Mute user
            </Button>
          </>
        }
      >
        <form id="mute-user-form" onSubmit={onSubmitMute} className="space-y-4">
          <Select
            label="Duration"
            value={muteDays}
            options={[
              { label: "1 day", value: "1" },
              { label: "3 days", value: "3" },
              { label: "7 days", value: "7" },
              { label: "30 days", value: "30" },
            ]}
            onChange={onMuteDaysChange}
          />
          <label className="grid gap-1.5 text-sm font-medium text-content">
            Reason
            <textarea
              maxLength={500}
              rows={3}
              value={muteReason}
              onChange={(event) => onMuteReasonChange(event.target.value)}
              className="rounded-lg border border-line bg-surface p-3 text-sm font-normal text-content"
              placeholder="Explain why this user is muted (at least 5 characters)..."
            />
          </label>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={onCloseDelete}
        onConfirm={onConfirmDelete}
        loading={busy}
        tone="danger"
        confirmLabel="Delete"
        title="Delete this reply?"
        description="This permanently removes the reply and cannot be undone."
      />
    </>
  );
}
