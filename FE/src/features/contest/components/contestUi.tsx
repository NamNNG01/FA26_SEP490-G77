import React from 'react';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Icon } from '@/assets/icons';
import { formatVnd } from '@/services/payment.service';
import type { ContestStatus, PrizeDiscountType, PrizeIssue, RankingStatus } from '@/services/managerContest.service';

export const STATUS_LABEL: Record<ContestStatus, string> = {
  DRAFT: 'Draft',
  UPCOMING: 'Upcoming',
  ONGOING: 'Ongoing',
  PENDING_REWARD: 'Pending reward',
  REWARDED: 'Rewarded',
  CANCELLED: 'Cancelled',
};

const STATUS_VARIANT: Record<ContestStatus, BadgeVariant> = {
  DRAFT: 'default',
  UPCOMING: 'info',
  ONGOING: 'success',
  PENDING_REWARD: 'warning',
  REWARDED: 'purple',
  CANCELLED: 'danger',
};

export function ContestStatusBadge({ status }: { status: ContestStatus }) {
  return <Badge variant={STATUS_VARIANT[status] ?? 'default'}>{STATUS_LABEL[status] ?? status}</Badge>;
}

/** Gold / silver / bronze for ranks 1–3: ring, medal colour and a light fill (alpha keeps it readable in dark mode). */
const MEDAL: Record<number, { name: string; color: string; fill: string }> = {
  1: { name: 'Gold', color: '#D4A017', fill: 'rgba(212, 160, 23, 0.14)' },
  2: { name: 'Silver', color: '#9CA3AF', fill: 'rgba(156, 163, 175, 0.16)' },
  3: { name: 'Bronze', color: '#CD7F32', fill: 'rgba(205, 127, 50, 0.14)' },
};

/** Leaderboard rank cell: a medal with a gold/silver/bronze ring for ranks 1–3, plain "#n" from rank 4. */
export function RankMedal({ rank }: { rank: number | null | undefined }) {
  if (rank == null) return <span className="font-semibold text-content-soft">—</span>;
  const medal = MEDAL[rank];
  if (!medal) return <span className="font-semibold text-content">#{rank}</span>;
  return <span className="inline-flex items-center gap-1.5" title={`${medal.name} — rank ${rank}`}>
    <span className="flex h-8 w-8 items-center justify-center rounded-full border-2" style={{ borderColor: medal.color, backgroundColor: medal.fill }}>
      <Icon.Award className="h-4 w-4" style={{ color: medal.color }} aria-hidden />
    </span>
    <span className="font-semibold tabular-nums" style={{ color: medal.color }}>{rank}</span>
    <span className="sr-only">{medal.name} medal</span>
  </span>;
}

/** Shown next to the status once the contest ended; nothing before that. */
export function RankingBadge({ ranking }: { ranking: RankingStatus }) {
  if (!ranking) return null;
  return ranking === 'READY'
    ? <Badge variant="success"><Icon.CheckCircle className="h-3 w-3" /> Ranked</Badge>
    : <Badge variant="warning"><Icon.Clock className="h-3 w-3" /> Calculating ranks</Badge>;
}

export function prizeValue(discountType: PrizeDiscountType, value: number | null | undefined): string {
  if (value == null) return '—';
  return discountType === 'PERCENT' ? `${value}% off` : `${formatVnd(value)} off`;
}

const ISSUE_REASON: Record<string, string> = {
  DISCOUNT_INACTIVE: 'Discount is inactive',
  DISCOUNT_EXPIRED: 'Discount has expired',
  DISCOUNT_NOT_STARTED: 'Discount has not started yet',
  DISCOUNT_DELETED: 'Discount was deleted',
  DISCOUNT_NOT_APPLICABLE: 'Discount does not apply to courses',
  DISCOUNT_QUOTA_NOT_ENOUGH: 'Not enough uses left',
};

export function issueText(issue: PrizeIssue): string {
  const reason = ISSUE_REASON[issue.reason] ?? issue.reason;
  const quota = issue.reason === 'DISCOUNT_QUOTA_NOT_ENOUGH' && issue.required != null
    ? ` (needs ${issue.required}, ${issue.remaining ?? 0} left)`
    : '';
  return `Rank ${issue.rankPosition} · ${issue.code}: ${reason}${quota}`;
}

/** Prize problems of API 9 / 10 (and the publish checks), one line per rank. */
export function IssueList({ issues }: { issues: PrizeIssue[] }) {
  if (!issues.length) return null;
  return (
    <ul className="space-y-1.5">
      {issues.map(issue => (
        <li key={`${issue.rankPosition}-${issue.discountId}-${issue.reason}`} className="flex items-start gap-2 text-sm text-content-secondary">
          <Icon.AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" />
          <span>{issueText(issue)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Messages for the contest `data.code`s the screens react to; the BE message is used otherwise. */
export const CONTEST_ERROR_TEXT: Record<string, string> = {
  CONTEST_NOT_FOUND: 'This contest no longer exists or is not in one of your courses.',
  CONTEST_LOCKED: 'This contest can no longer be changed in its current status.',
  CONTEST_NOT_PENDING_REWARD: 'This contest is not waiting for its rewards (it may already be paid).',
  RANKING_NOT_READY: 'Ranks are still being calculated — some attempts are not submitted or graded yet.',
  REWARD_PAYMENT_BLOCKED: 'Some prize discounts cannot be granted. Nothing was paid.',
  EXAM_NOT_ELIGIBLE: 'The exam must be a published, non-practice exam of a course you manage.',
  EXAM_ALREADY_IN_ACTIVE_CONTEST: 'This exam is already used by another contest that is not cancelled or rewarded.',
  REWARD_RANK_INVALID: 'Prize ranks must run 1, 2, 3, … and each needs an existing discount.',
  REWARD_RANK_LOCKED: 'Prize ranks cannot be added or removed after the contest ended.',
  REWARDS_REQUIRED: 'Add at least one prize before publishing.',
  DISCOUNT_NOT_AVAILABLE: 'Some prize discounts cannot be used.',
  DISCOUNT_QUOTA_NOT_ENOUGH: 'A discount has fewer uses left than the ranks that use it.',
  FORBIDDEN_COURSE: 'You do not manage this course.',
  BATCH_TOO_LARGE: 'Pay at most 20 contests at a time.',
};

// ------------------------------------------------------------- dates (Ho Chi Minh City time, like Discounts)

const HCM = 'Asia/Ho_Chi_Minh';

/** ISO → value of a datetime-local input in HCM time. */
export function toHcmInput(value?: string | null): string {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: HCM, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

/** datetime-local value read as HCM time → ISO; null when empty. */
export function hcmInputToIso(value: string): string | null {
  if (!value) return null;
  const [date, time] = value.split('T');
  const parsed = new Date(`${date}T${time}:00+07:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function formatDateTime(value?: string | null): string {
  return value ? new Date(value).toLocaleString('en-GB', { timeZone: HCM, dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

export function formatDuration(seconds?: number | null): string {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${String(s).padStart(2, '0')}s`;
}

export function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-content-soft">{label}</p>
      <div className="mt-1 break-words text-sm font-medium text-content">{children}</div>
    </div>
  );
}
