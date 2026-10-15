import React from 'react';
import { Icon } from '@/assets/icons';

/**
 * PublicStatCard
 *
 * One of the four headline metrics on the Public Exam page: coloured accent
 * bar across the top, icon tile, label, oversized value and a supporting line
 * that optionally leads with a positive trend.
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
  accent,
  trend,
}: {
  title: string;
  value: string;
  description: string;
  icon: React.ReactNode;
  /** Brand colour driving the accent bar, icon tile and trend chip. */
  accent: string;
  /** Optional positive delta rendered before the description. */
  trend?: number;
}) {
  return (
    <div
      className="group relative flex flex-col gap-4 overflow-hidden rounded-[14px] border border-line bg-surface p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
    >
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />

      <div className="flex items-start justify-between gap-3 pt-1">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-muted-foreground">{title}</p>
          <p className="mt-1.5 text-[28px] font-bold leading-none tracking-tight text-foreground">{value}</p>
        </div>
        <div
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[12px] transition-transform duration-200 group-hover:scale-105"
          style={{ background: `${accent}1A`, color: accent }}
        >
          <div className="h-5 w-5">{icon}</div>
        </div>
      </div>

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
