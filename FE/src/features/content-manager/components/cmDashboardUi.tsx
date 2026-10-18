import React from 'react';
import { Tooltip } from '@/components/ui/Tooltip';
import { Skeleton } from '@/components/ui/Skeleton';
import { Icon } from '@/assets/icons';
import { CM_MIN_ATTEMPTS } from '@/services/cmDashboard.types';

/**
 * Small building blocks shared by the Course Manager dashboard panels.
 * Rule of thumb for every figure: `null` renders "—", never 0.
 */

export const EMPTY = '—';
export const NOT_ENOUGH_DATA = `Chưa đủ dữ liệu (cần ≥ ${CM_MIN_ATTEMPTS} bài nộp)`;

export const fmtScore = (v: number | null) => (v == null ? EMPTY : (Math.round(v * 10) / 10).toFixed(1));
export const fmtPct = (v: number | null) => (v == null ? EMPTY : `${Math.round(v * 10) / 10}%`);
export const fmtMinutes = (v: number | null) => (v == null ? EMPTY : `${v} phút`);

/** Pass rate under 50% is flagged: warning below 50, danger below 40. */
export function passRateTone(v: number | null): string {
  if (v == null) return '';
  if (v < 40) return 'text-danger font-medium';
  if (v < 50) return 'text-warning font-medium';
  return '';
}

/** Info icon with a definition tooltip, placed next to a label. */
export function InfoTip({ label, side }: { label: string; side?: 'top' | 'bottom' }) {
  return (
    <Tooltip label={label} side={side}>
      <Icon.Info className="w-3.5 h-3.5 text-content-subtle cursor-help" aria-label={label} />
    </Tooltip>
  );
}

/** Label + definition tooltip, e.g. for a StatCard title. */
export function LabelWithInfo({ children, info, side }: { children: React.ReactNode; info: string; side?: 'top' | 'bottom' }) {
  return (
    <span className="inline-flex items-center gap-1">
      {children}
      <InfoTip label={info} side={side} />
    </span>
  );
}

/**
 * A score / pass-rate cell. Under CM_MIN_ATTEMPTS attempts the value is
 * shown faded with an explanation instead of being hidden.
 */
export function MetricCell({ text, attempts, tone = '' }: { text: string; attempts: number; tone?: string }) {
  if (attempts < CM_MIN_ATTEMPTS) {
    return (
      <Tooltip label={NOT_ENOUGH_DATA}>
        <span className="text-content-subtle cursor-help">{text}</span>
      </Tooltip>
    );
  }
  return <span className={tone}>{text}</span>;
}

export function Panel({ title, count, actions, children }: {
  title: React.ReactNode;
  count?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card overflow-hidden min-w-0 flex flex-col">
      <div className="px-5 py-4 border-b border-line-soft flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <h4 className="text-lg font-semibold text-foreground">{title}</h4>
          {count}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function PanelSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line" aria-busy>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-3.5">
          <Skeleton className="h-4 flex-1 rounded" />
          <Skeleton className="h-4 w-12 rounded" />
          <Skeleton className="h-4 w-12 rounded" />
          <Skeleton className="h-4 w-16 rounded" />
        </div>
      ))}
    </div>
  );
}

export function PanelEmpty({ message }: { message: string }) {
  return <p className="px-5 py-8 text-sm text-muted-foreground text-center">{message}</p>;
}
