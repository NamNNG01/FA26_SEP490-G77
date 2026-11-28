import React from "react";
import { Badge } from "@/components/ui/Badge";
import { Dropdown } from "@/components/ui/Dropdown";
import { Switch } from "@/components/ui/Switch";
import type { TableColumn } from "@/components/ui/Table";
import { Icon } from "@/assets/icons";
import type { Discount } from "@/services/adminDiscount.service";
import { formatVnd } from "../../utils/dashboardFormat";
import { badgeVariant, validityLabels } from "../../utils/discountHelpers";

export function buildDiscountColumns({
  onToggleStatus,
  onOpenDetail,
  onOpenEdit,
  onDelete,
}: {
  onToggleStatus: (d: Discount) => void;
  onOpenDetail: (d: Discount) => void;
  onOpenEdit: (d: Discount) => void;
  onDelete: (d: Discount) => void;
}): TableColumn[] {
  return [
    {
      key: "code",
      label: "Code / name",
      width: "24%",
      render: (row) => (
        <div>
          <p className="font-semibold text-content">{String(row.code)}</p>
          <p className="text-xs text-content-soft">{String(row.name)}</p>
        </div>
      ),
    },
    {
      key: "value",
      label: "Discount",
      render: (row) => {
        const d = row as unknown as Discount;
        return (
          <span className="font-medium text-content-secondary">
            {d.discountType === "PERCENT" ? `${d.value}%` : formatVnd(d.value)}
          </span>
        );
      },
    },
    {
      key: "appliesTo",
      label: "Applies to",
      render: (row) => <Badge variant="info">{String(row.appliesTo)}</Badge>,
    },
    {
      key: "accessType",
      label: "Access",
      render: (row) => (
        <Badge variant={row.accessType === "CLAIM_REQUIRED" ? "warning" : "default"}>
          {row.accessType === "CLAIM_REQUIRED" ? "Claim required" : "Public"}
        </Badge>
      ),
    },
    {
      key: "usageLimit",
      label: "Usage",
      render: (row) => {
        const d = row as unknown as Discount;
        return (
          <div className="whitespace-nowrap tabular-nums">
            <span className="font-medium text-content-secondary">
              {d.usedCount.toLocaleString()} / {d.usageLimit.toLocaleString()}
            </span>
            <p className="mt-1 text-xs text-content-soft">
              {d.remaining.toLocaleString()} remaining
            </p>
          </div>
        );
      },
    },
    {
      key: "validity",
      label: "Validity",
      render: (row) => (
        <Badge variant={badgeVariant(String(row.validity))}>
          {validityLabels[String(row.validity)] ?? String(row.validity)}
        </Badge>
      ),
    },
    {
      key: "isActive",
      label: "Status",
      render: (row) => {
        const d = row as unknown as Discount;
        return (
          <div onClick={(event) => event.stopPropagation()}>
            <Switch
              checked={d.isActive}
              onChange={() => onToggleStatus(d)}
              size="sm"
              label={d.isActive ? "On" : "Off"}
            />
          </div>
        );
      },
    },
    {
      key: "actions",
      label: "",
      width: "48px",
      render: (row) => {
        const d = row as unknown as Discount;
        return (
          <div onClick={(event) => event.stopPropagation()}>
            <Dropdown
              trigger={
                <button
                  type="button"
                  aria-label={`Actions for ${d.code}`}
                  className="rounded-[6px] p-1.5 hover:bg-accent"
                >
                  <Icon.MoreHorizontal className="h-4 w-4 text-content-soft" />
                </button>
              }
              items={[
                {
                  label: "Details and assignments",
                  icon: <Icon.Eye className="h-4 w-4" />,
                  onClick: () => onOpenDetail(d),
                },
                {
                  label: "Edit",
                  icon: <Icon.Edit className="h-4 w-4" />,
                  onClick: () => onOpenEdit(d),
                },
                {
                  label: "Delete",
                  icon: <Icon.Trash className="h-4 w-4" />,
                  danger: true,
                  onClick: () => onDelete(d),
                },
              ]}
            />
          </div>
        );
      },
    },
  ];
}
