import { Badge } from '@/components/ui/Badge';
import type { AdminUserRole, AdminUserSubscription } from '@/services/adminUser.service';

/** "Dec 17, 2026", or null when the value is missing or unreadable. */
export function formatPlanDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/** Only an active subscription counts; anything else leaves the student on the Free plan. */
export function activeSubscription(subscription: AdminUserSubscription | null | undefined): AdminUserSubscription | null {
  return subscription && subscription.status === 'ACTIVE' ? subscription : null;
}

/**
 * The user's plan: its name and end date for a student with an active paid plan, "Free" for any
 * other student, and a dash for staff accounts, which have no subscription.
 */
export function SubscriptionCell({ role, subscription }: { role: AdminUserRole; subscription?: AdminUserSubscription | null }) {
  if (role !== 'STUDENT') return <span className="text-content-faint">—</span>;
  const active = activeSubscription(subscription);
  if (!active) return <Badge variant="default">Free</Badge>;
  const until = formatPlanDate(active.endDate);
  return (
    <div className="min-w-0">
      <Badge variant="purple">{active.planName}</Badge>
      {until && <p className="text-2xs text-content-subtle mt-0.5 truncate">until {until}</p>}
    </div>
  );
}
