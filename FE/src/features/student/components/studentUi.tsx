import React from 'react';
import { Icon } from '@/assets/icons';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';

/** Course thumbnail, or the brand placeholder when the course has none. */
export function CourseThumb({ url, title, className = '' }: { url: string | null; title: string; className?: string }) {
  return url ? (
    <img src={url} alt={title} width={640} height={360} className={`w-full aspect-video object-cover ${className}`} />
  ) : (
    <div className={`w-full aspect-video bg-primary-light flex items-center justify-center ${className}`}>
      <Icon.Book className="w-8 h-8 text-primary" />
    </div>
  );
}

/** "7.5 / 10", "— / 10" or "—". */
export function formatScore(score: number | null | undefined, max: number | null | undefined): string {
  const s = score == null ? '—' : String(Number(score));
  return max == null ? s : `${s} / ${Number(max)}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** "Oct 26, 2026, 14:05" or "—". */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[clamp(1.25rem,1.1rem+0.6vw,1.5rem)] font-bold text-content">{title}</h1>
        {subtitle && <p className="text-sm text-content-soft mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Grid of card-shaped skeletons while a list loads. */
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-[clamp(1rem,2vw,1.25rem)]">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card p-4 space-y-3">
          <Skeleton className="w-full aspect-video" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card divide-y divide-line">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <Skeleton className="w-9 h-9 rounded-[10px]" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Inline error block with a retry button. */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="card px-5 py-10 flex flex-col items-center text-center gap-3">
      <Icon.AlertCircle className="w-8 h-8 text-content-subtle" />
      <p className="text-sm text-content-soft max-w-md">{message}</p>
      <Button variant="outline" size="sm" icon={<Icon.RefreshCw className="w-4 h-4" />} onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
