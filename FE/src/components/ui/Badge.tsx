import React from "react";
import { Icon } from "@/assets/icons";

export type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "purple";

export type ComponentSize = "sm" | "md" | "lg";

/**
 * Light values are unchanged; the `dark:` pair is the matching Tailwind shade so
 * the chip stops rendering near-white on a dark surface. The centralized
 * `.dark` remaps in styles/index.css only cover a handful of legacy hexes and
 * none of these chip backgrounds, so the variants have to carry their own.
 * Every dark pair clears 4.5:1.
 */
const badgeVariants: Record<BadgeVariant, string> = {
  default: "bg-surface-muted text-content-secondary",
  success: "bg-success-light text-success",
  warning: "bg-warning-light text-warning",
  danger: "bg-danger-light text-danger",
  info: "bg-primary-light text-brand-ink",
  purple: "bg-purple-light text-purple",
};

const badgeSizes: Record<ComponentSize, string> = {
  sm: "gap-1 px-2 py-0.5 text-xs",
  md: "gap-1 px-2.5 py-0.5 text-xs",
  lg: "gap-1.5 px-3 py-1 text-sm",
};

const chipSizes: Record<ComponentSize, string> = {
  sm: "gap-1 px-2 py-0.5 text-xs",
  md: "gap-1.5 px-3 py-1 text-sm",
  lg: "gap-2 px-4 py-1.5 text-base",
};

export function Badge({
  variant = "default",
  size = "md",
  children,
  className = "",
}: {
  variant?: BadgeVariant;
  size?: ComponentSize;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${badgeSizes[size]} ${badgeVariants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Chip({
  children,
  onRemove,
  active,
  onClick,
  size = "md",
}: {
  children: React.ReactNode;
  onRemove?: () => void;
  active?: boolean;
  onClick?: () => void;
  size?: ComponentSize;
}) {
  const iconSizes: Record<ComponentSize, string> = {
    sm: "w-2.5 h-2.5",
    md: "w-3 h-3",
    lg: "w-4 h-4",
  };

  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center rounded-full border font-medium transition-all cursor-pointer ${chipSizes[size]}
        ${
          active
            ? "bg-primary-light text-brand-ink border-brand-line"
            : "bg-surface text-content-secondary border-line hover:bg-surface-hover"
        }`}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="text-content-subtle hover:text-content-secondary"
          aria-label="Remove"
        >
          <Icon.X className={iconSizes[size]} />
        </button>
      )}
    </span>
  );
}
