import React from "react";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import type { Discount } from "@/services/adminDiscount.service";

interface DiscountConfirmDialogsProps {
  working: boolean;
  changingStatus: Discount | null;
  onCloseStatus: () => void;
  onConfirmStatus: () => void;
  affected: { title: string; status: string; contestId: number }[] | null;
  onCloseAffected: () => void;
  deleting: Discount | null;
  onCloseDelete: () => void;
  onConfirmDelete: () => void;
}

export function DiscountConfirmDialogs({
  working,
  changingStatus,
  onCloseStatus,
  onConfirmStatus,
  affected,
  onCloseAffected,
  deleting,
  onCloseDelete,
  onConfirmDelete,
}: DiscountConfirmDialogsProps) {
  return (
    <>
      <ConfirmDialog
        open={!!changingStatus}
        onClose={onCloseStatus}
        onConfirm={onConfirmStatus}
        loading={working}
        tone={changingStatus?.isActive ? "danger" : "warning"}
        title={changingStatus?.isActive ? "Deactivate discount?" : "Activate discount?"}
        description={
          changingStatus?.isActive
            ? `Deactivating ${changingStatus?.code} will prevent redemption and block reward payments in contests that use it.`
            : `Activate ${changingStatus?.code} for future use?`
        }
        confirmLabel={changingStatus?.isActive ? "Deactivate" : "Activate"}
      />

      <Modal open={affected !== null} onClose={onCloseAffected} title="Discount status updated">
        {affected?.length ? (
          <div className="space-y-3">
            <p className="text-sm text-content-secondary">
              This discount is attached to contests that may be affected:
            </p>
            <ul className="space-y-2">
              {affected.map((c) => (
                <li
                  key={c.contestId}
                  className="flex items-center justify-between rounded-lg border border-line-soft px-3 py-2 text-sm"
                >
                  <span>{c.title}</span>
                  <Badge variant="warning">{c.status}</Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-content-secondary">No active contests are affected.</p>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={onCloseDelete}
        onConfirm={onConfirmDelete}
        loading={working}
        tone="danger"
        title="Delete discount?"
        description={
          <>
            Delete <strong>{deleting?.code}</strong>? Discounts with active contest usage or
            assigned vouchers cannot be deleted.
          </>
        }
        confirmLabel="Delete"
      />
    </>
  );
}
