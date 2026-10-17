import React from 'react';
import { Icon } from '@/assets/icons';

/**
 * PublicStatCard
 *
 * One of the four headline metrics on the Public Exam page: a small neutral
 * icon beside the label, the value in the display face, and a supporting
 * line that optionally leads with a positive trend. Same quiet treatment as
 * the shared `StatCard` — no coloured accent bar or icon tile.
 *
 * Deliberately does NOT reuse the shared `StatCard`: that one renders
 * `changeLabel` only when a delta exists, whereas every card here needs a
 * description regardless. Borders/radii are written out instead of the `.card`
 * helper because `.card` is unlayered CSS and would win over Tailwind's
 * rounded-* utilities.
 */
export function PublicStatCard({
  title,
  value,
  description,
  icon,
  trend,
}: {
  title: string;
  value: string;
  description: string;
  icon: React.ReactNode;
  /** Optional positive delta rendered before the description. */
  trend?: number;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-line bg-surface p-5 shadow-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span aria-hidden className="h-4 w-4 flex-shrink-0 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <p className="text-[13px] font-medium">{title}</p>
      </div>
      <p className="font-[family-name:var(--font-display)] text-[30px] font-bold leading-none tracking-tight text-foreground">{value}</p>

      <p className="flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted-foreground">
        {trend !== undefined && (
          <span className="inline-flex items-center gap-0.5 font-semibold text-[#15803D] dark:text-[#4ADE80]">
            <Icon.TrendingUp className="h-3.5 w-3.5" />+{trend}%
          </span>
        )}
        {description}
      </p>
    </div>
  );
}
