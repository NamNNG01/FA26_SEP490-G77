import React from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { MoneyInput, moneyToDigits } from "@/components/ui/MoneyInput";
import { Select } from "@/components/ui/Select";
import type { Discount, DiscountAccessType } from "@/services/adminDiscount.service";
import type { FormState } from "../../utils/discountHelpers";

interface DiscountFormModalProps {
  open: boolean;
  editing: Discount | null;
  form: FormState;
  saving: boolean;
  lockedFields: boolean;
  minimumUsageLimit: number;
  onClose: () => void;
  onUpdateForm: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  onSave: (event: React.FormEvent) => void;
}

export function DiscountFormModal({
  open,
  editing,
  form,
  saving,
  lockedFields,
  minimumUsageLimit,
  onClose,
  onUpdateForm,
  onSave,
}: DiscountFormModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${editing.code}` : "Create discount"}
      size="xl"
      footer={
        <>
          <Button variant="outline" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button
            form="discount-form"
            type="submit"
            loading={saving}
            disabled={saving}
          >
            {editing ? "Save changes" : "Create discount"}
          </Button>
        </>
      }
    >
      <form id="discount-form" onSubmit={onSave} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Code"
            required
            minLength={4}
            maxLength={30}
            disabled={lockedFields}
            value={form.code}
            onChange={(e) => onUpdateForm("code", e.target.value)}
            hint={
              lockedFields
                ? "Locked because this discount has been assigned."
                : "4–30 letters, numbers, underscores, or hyphens."
            }
          />
          <Input
            label="Name"
            required
            maxLength={255}
            value={form.name}
            onChange={(e) => onUpdateForm("name", e.target.value)}
          />
          <Select
            label="Discount type"
            disabled={lockedFields}
            value={form.discountType}
            onChange={(v) => {
              if (v === "PERCENT" || v === "FIXED_AMOUNT") {
                onUpdateForm("discountType", v);
                if (v === "FIXED_AMOUNT") {
                  onUpdateForm("maxDiscountAmount", "");
                  onUpdateForm("value", moneyToDigits(form.value));
                }
              }
            }}
            options={[
              { label: "Percent", value: "PERCENT" },
              { label: "Fixed amount", value: "FIXED_AMOUNT" },
            ]}
          />
          {form.discountType === "PERCENT" ? (
            <Input
              label="Value (%)"
              type="number"
              min={1}
              max={100}
              required
              disabled={lockedFields}
              value={form.value}
              onChange={(e) => onUpdateForm("value", e.target.value)}
            />
          ) : (
            <MoneyInput
              label="Value (VND)"
              required
              disabled={lockedFields}
              value={form.value}
              onValueChange={(v) => onUpdateForm("value", v)}
            />
          )}
          {form.discountType === "PERCENT" && (
            <MoneyInput
              label="Maximum discount (VND)"
              value={form.maxDiscountAmount}
              onValueChange={(v) => onUpdateForm("maxDiscountAmount", v)}
            />
          )}
          <MoneyInput
            label="Minimum order (VND)"
            value={form.minOrderAmount}
            onValueChange={(v) => onUpdateForm("minOrderAmount", v)}
          />
          <Select
            label="Applies to"
            disabled={lockedFields}
            value={form.appliesTo}
            onChange={(v) => {
              if (v === "COURSE" || v === "SUBSCRIPTION" || v === "ALL") {
                onUpdateForm("appliesTo", v);
              }
            }}
            options={[
              { label: "All", value: "ALL" },
              { label: "Courses", value: "COURSE" },
              { label: "Subscriptions", value: "SUBSCRIPTION" },
            ]}
          />
          <Select
            label="Access type"
            value={form.accessType}
            onChange={(v) => onUpdateForm("accessType", v as DiscountAccessType)}
            options={[
              { label: "Public", value: "PUBLIC" },
              { label: "Claim required", value: "CLAIM_REQUIRED" },
            ]}
          />
          <Input
            label="Total usage limit"
            type="number"
            min={minimumUsageLimit}
            required
            value={form.usageLimit}
            onChange={(e) => onUpdateForm("usageLimit", e.target.value)}
            hint={
              editing?.stats?.assignedCount
                ? `Must be at least ${minimumUsageLimit} for used and assigned vouchers.`
                : undefined
            }
          />
          <Input
            label="Starts at (Ho Chi Minh City time)"
            type="datetime-local"
            value={form.startAt}
            onChange={(e) => onUpdateForm("startAt", e.target.value)}
          />
          <Input
            label="Expires at (Ho Chi Minh City time)"
            type="datetime-local"
            value={form.expiredAt}
            onChange={(e) => onUpdateForm("expiredAt", e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-content-secondary">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => onUpdateForm("isActive", e.target.checked)}
          />{" "}
          Active
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-content-secondary">
          Description
          <textarea
            className="min-h-20 rounded-[10px] border border-line bg-surface px-3 py-2 text-sm font-normal text-content focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
            maxLength={2000}
            value={form.description}
            onChange={(e) => onUpdateForm("description", e.target.value)}
          />
        </label>
      </form>
    </Modal>
  );
}
