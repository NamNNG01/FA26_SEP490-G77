import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/assets/icons';
import type { AiError, AiPriority, AiQuotaLeft, AiTrend } from '@/services/studentAi.service';

/** Shared bits of the AI personalization screens (AI-01..04). */

const TREND: Record<AiTrend, { label: string; className: string; arrow: string }> = {
  IMPROVING: { label: 'Improving', className: 'text-success', arrow: '↑' },
  STABLE: { label: 'Stable', className: 'text-content-subtle', arrow: '→' },
  DECLINING: { label: 'Declining', className: 'text-danger', arrow: '↓' },
};

export function TrendIcon({ trend, withLabel = false }: { trend: AiTrend | null | undefined; withLabel?: boolean }) {
  const t = TREND[trend ?? 'STABLE'] ?? TREND.STABLE;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${t.className}`} title={t.label} aria-label={t.label}>
      <span aria-hidden>{t.arrow}</span>
      {withLabel && <span className="font-medium">{t.label}</span>}
    </span>
  );
}

const PRIORITY_VARIANT: Record<AiPriority, BadgeVariant> = { HIGH: 'danger', MEDIUM: 'warning', LOW: 'default' };

export function PriorityBadge({ priority }: { priority: AiPriority | null | undefined }) {
  if (!priority) return null;
  return (
    <Badge size="sm" variant={PRIORITY_VARIANT[priority] ?? 'default'}>
      {priority.charAt(0) + priority.slice(1).toLowerCase()}
    </Badge>
  );
}

/** Accuracy colour: red below 50 %, amber below 75 %, green above. */
export function accuracyTone(accuracy: number): { bar: string; text: string } {
  if (accuracy < 50) return { bar: 'bg-danger-solid', text: 'text-danger' };
  if (accuracy < 75) return { bar: 'bg-warning', text: 'text-warning' };
  return { bar: 'bg-success', text: 'text-success' };
}

export function AccuracyBar({ accuracy, label }: { accuracy: number; label?: string }) {
  const value = Math.max(0, Math.min(100, Math.round(accuracy)));
  const tone = accuracyTone(value);
  return (
    <div
      className="h-2 w-full rounded-full bg-surface-muted overflow-hidden"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${value}%` }} />
    </div>
  );
}

export function SourceBadge({ source }: { source: string | null | undefined }) {
  if (source !== 'CACHED') return null;
  return (
    <Badge size="sm" variant="default">
      Cached
    </Badge>
  );
}

export function QuotaLine({ quota }: { quota: AiQuotaLeft | null | undefined }) {
  if (!quota) return null;
  return (
    <p className="text-2xs text-content-subtle">
      AI tokens left: {quota.freeRemaining.toLocaleString()} free · {quota.planRemaining.toLocaleString()} plan
    </p>
  );
}

/** 429 → the token numbers, 422 → "do more exams", anything else → the message. */
export function AiErrorAlert({ error }: { error: AiError }) {
  if (error.kind === 'QUOTA_EXCEEDED') {
    const detail =
      error.estimatedTokens != null && error.availableTokens != null
        ? ` This needs about ${error.estimatedTokens.toLocaleString()} tokens; you have ${error.availableTokens.toLocaleString()} left.`
        : '';
    return <Alert type="warning" title="Not enough AI quota" message={`${error.message}${detail}`} />;
  }
  if (error.kind === 'INSUFFICIENT_DATA') {
    return <Alert type="info" title="Not enough data yet" message={error.message} />;
  }
  return <Alert type="error" message={error.message} />;
}

export function AiSparkle({ className = 'w-4 h-4' }: { className?: string }) {
  return <Icon.Lightbulb className={className} />;
}
