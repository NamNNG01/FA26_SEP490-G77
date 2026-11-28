import React from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table } from "@/components/ui/Table";
import { Icon } from "@/assets/icons";
import type { Discount, DiscountAccessType } from "@/services/adminDiscount.service";
import { useDiscounts } from "../hooks/useDiscounts";
import { PAGE_SIZE, validityLabels } from "../utils/discountHelpers";
import { buildDiscountColumns } from "../components/discounts/discountColumns";
import { DiscountFormModal } from "../components/discounts/DiscountFormModal";
import { DiscountDetailModal } from "../components/discounts/DiscountDetailModal";
import { DiscountConfirmDialogs } from "../components/discounts/DiscountConfirmDialogs";

export function DiscountsPage() {
  const d = useDiscounts();

  const rows = d.page.content.map((discount) => ({
    ...discount,
    id: discount.discountId,
  }));

  const columns = buildDiscountColumns({
    onToggleStatus: d.setChangingStatus,
    onOpenDetail: (item) => void d.openDetail(item),
    onOpenEdit: (item) => void d.openEdit(item),
    onDelete: d.setDeleting,
  });

  return (
    <div className="space-y-5 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-content">Discounts</h1>
          <p className="mt-1 text-sm text-content-soft">
            Create and manage discount codes, eligibility, and assigned vouchers.
          </p>
        </div>
        <Button icon={<Icon.Plus className="h-4 w-4" />} onClick={d.openCreate}>
          New discount
        </Button>
      </header>

      <section className="card p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Input
            aria-label="Search discounts"
            placeholder="Search code or name"
            icon={<Icon.Search className="h-4 w-4" />}
            value={d.keyword}
            onChange={(e) => d.setKeyword(e.target.value)}
          />
          <Select
            aria-label="Discount type"
            value={d.typeFilter}
            onChange={(v) => {
              d.setTypeFilter(v);
              d.setPageIndex(1);
            }}
            options={[
              { label: "All types", value: "" },
              { label: "Percent", value: "PERCENT" },
              { label: "Fixed amount", value: "FIXED_AMOUNT" },
            ]}
          />
          <Select
            aria-label="Active status"
            value={d.activeFilter}
            onChange={(v) => {
              d.setActiveFilter(v);
              d.setPageIndex(1);
            }}
            options={[
              { label: "Any status", value: "" },
              { label: "Active", value: "true" },
              { label: "Inactive", value: "false" },
            ]}
          />
          <Select
            aria-label="Validity"
            value={d.validityFilter}
            onChange={(v) => {
              d.setValidityFilter(v);
              d.setPageIndex(1);
            }}
            options={[
              { label: "Any validity", value: "" },
              ...Object.entries(validityLabels).map(([value, label]) => ({ value, label })),
            ]}
          />
          <Select
            aria-label="Discount access"
            value={d.accessTypeFilter}
            onChange={(v) => {
              d.setAccessTypeFilter(v as DiscountAccessType | "");
              d.setPageIndex(1);
            }}
            options={[
              { label: "Any access", value: "" },
              { label: "Public", value: "PUBLIC" },
              { label: "Claim required", value: "CLAIM_REQUIRED" },
            ]}
          />
          {d.filtersActive ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={d.resetFilters}
                className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-brand-ink hover:underline"
              >
                <Icon.X className="h-3.5 w-3.5" /> Clear filters
              </button>
            </div>
          ) : (
            <span />
          )}
        </div>
      </section>

      <div
        className={`card overflow-hidden transition-opacity ${d.loading && d.page.content.length ? "opacity-60" : ""}`}
        aria-busy={d.loading}
      >
        {d.listError ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm text-danger"
          >
            <span>{d.listError}</span>
            <Button size="sm" variant="outline" onClick={() => void d.load()}>
              Retry
            </Button>
          </div>
        ) : (
          <Table
            columns={columns}
            data={rows as unknown as Record<string, unknown>[]}
            perPage={PAGE_SIZE}
            unit="discounts"
            serverPagination={{
              page: d.pageIndex,
              total: d.page.totalElements,
              onChange: d.setPageIndex,
            }}
            onRowClick={(row) => void d.openDetail(row as unknown as Discount)}
            emptyState={
              d.loading
                ? "Loading discounts…"
                : d.filtersActive
                  ? "No discounts match your filters."
                  : "No discounts yet. Click “New discount” to add one."
            }
          />
        )}
      </div>

      <DiscountFormModal
        open={d.formOpen}
        editing={d.editing}
        form={d.form}
        saving={d.saving}
        lockedFields={d.lockedFields}
        minimumUsageLimit={d.minimumUsageLimit}
        onClose={() => d.setFormOpen(false)}
        onUpdateForm={d.updateForm}
        onSave={(e) => void d.save(e)}
      />

      <DiscountDetailModal
        detail={d.detail}
        detailLoading={d.detailLoading}
        assignments={d.assignments}
        assignmentPage={d.assignmentPage}
        assignmentKeyword={d.assignmentKeyword}
        assignmentUsed={d.assignmentUsed}
        assignmentLoading={d.assignmentLoading}
        assignmentError={d.assignmentError}
        onClose={d.closeDetail}
        onAssignmentKeywordChange={d.setAssignmentKeyword}
        onAssignmentUsedChange={(v) => {
          d.setAssignmentUsed(v);
          d.setAssignmentPage(0);
        }}
        onAssignmentPageChange={d.setAssignmentPage}
        onRetryAssignments={(discountId) => void d.loadAssignments(discountId)}
      />

      <DiscountConfirmDialogs
        working={d.working}
        changingStatus={d.changingStatus}
        onCloseStatus={() => d.setChangingStatus(null)}
        onConfirmStatus={() => void d.confirmStatus()}
        affected={d.affected}
        onCloseAffected={() => d.setAffected(null)}
        deleting={d.deleting}
        onCloseDelete={() => d.setDeleting(null)}
        onConfirmDelete={() => void d.confirmDelete()}
      />
    </div>
  );
}
