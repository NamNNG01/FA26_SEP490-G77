import { Badge } from "@/components/ui/Badge";
import type { AdminUserRole, AdminUserSubscription } from "@/services/adminUser.service";

/** "Dec 17, 2026", or null when the value is missing or unreadable. */
export function formatPlanDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

/** Only an active subscription counts; anything else leaves the student on the Free plan. */
export function activeSubscription(
  subscription: AdminUserSubscription | null | undefined,
): AdminUserSubscription | null {
  return subscription && subscription.status === "ACTIVE" ? subscription : null;
}

/**
 * The user's plan: its name and end date for a student with an active paid plan, "Free" for any
 * other student, custom/default AI token quota for Content Managers, and a dash for Admins.
 */
export function SubscriptionCell({
  role,
  subscription,
  managerMonthlyAiTokenLimit,
}: {
  role: AdminUserRole;
  subscription?: AdminUserSubscription | null;
  managerMonthlyAiTokenLimit?: number | null;
}) {
  if (role === "COURSE_MANAGER") {
    if (managerMonthlyAiTokenLimit != null) {
      return (
        <div className="min-w-0">
          <Badge variant="info">Custom AI quota</Badge>
          <p className="text-2xs text-content-subtle mt-0.5 truncate">
            {managerMonthlyAiTokenLimit.toLocaleString()} tok/mo
          </p>
        </div>
      );
    }
    return <span className="text-xs text-content-subtle">Default AI quota</span>;
  }
  if (role !== "STUDENT") return <span className="text-content-faint">—</span>;
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
