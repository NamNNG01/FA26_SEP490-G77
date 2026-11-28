import React, { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { formatVnd } from "@/services/payment.service";
import type { StudentPage } from "@/services/studentLearning.service";
import type {
  ContestPrize,
  ContestResult,
  ContestReward,
  ContestStatus,
  StudentContest,
} from "@/services/studentContest.service";
import { hcmInputToIso } from "@/features/contest/components/contestUi";

export const PAGE_SIZE = 9;
export const LIST_TABS = ["Contests", "History"];
export const REFRESH_MS = 30_000;

export const STATUS_LABEL: Record<ContestStatus, string> = {
  UPCOMING: "Upcoming",
  ONGOING: "Live now",
  ENDED: "Ended",
  REWARDED: "Rewards available",
  CANCELLED: "Cancelled",
};

export const STATUS_OPTIONS = [
  { label: "Any status", value: "" },
  ...(["UPCOMING", "ONGOING", "ENDED", "REWARDED", "CANCELLED"] as ContestStatus[]).map((s) => ({
    label: STATUS_LABEL[s],
    value: s,
  })),
];

export const STATUS_ACCENT: Record<ContestStatus, string> = {
  UPCOMING: "bg-primary",
  ONGOING: "bg-success",
  ENDED: "bg-line",
  REWARDED: "bg-warning",
  CANCELLED: "bg-danger",
};

export const EMPTY_PAGE = <T,>(): StudentPage<T> => ({
  content: [],
  page: 0,
  size: PAGE_SIZE,
  totalElements: 0,
  totalPages: 0,
  first: true,
  last: true,
});

export function dateFilter(value: string, endOfDay = false) {
  if (!value) return undefined;
  const iso = hcmInputToIso(`${value}T${endOfDay ? "23:59" : "00:00"}`);
  if (!iso || !endOfDay) return iso ?? undefined;
  return new Date(new Date(iso).getTime() + 59_999).toISOString();
}

export function startLabel(status: ContestStatus) {
  return status === "UPCOMING" ? "Starts" : "Started";
}

export function ctaFor(contest: StudentContest): {
  label: string;
  variant: "primary" | "outline";
} {
  if (contest.status === "ONGOING") {
    return contest.isRegistered
      ? { label: "Open contest", variant: "primary" }
      : { label: "View details", variant: "outline" };
  }
  if (contest.status === "UPCOMING") {
    return contest.isRegistered
      ? { label: "View contest", variant: "outline" }
      : { label: "View & register", variant: "primary" };
  }
  if (contest.status === "CANCELLED") return { label: "View details", variant: "outline" };
  return {
    label: contest.isRegistered ? "View results" : "View leaderboard",
    variant: "outline",
  };
}

export function ownReward(result: ContestResult | null): ContestReward | null {
  if (!result?.rank || !result.rewards.length) return null;
  if (result.rewards.some((r) => r.rankPosition != null)) {
    return result.rewards.find((r) => r.rankPosition === result.rank) ?? null;
  }
  return result.rewards[result.rank - 1] ?? null;
}

export function prizeText(prize: ContestPrize | null | undefined) {
  if (!prize) return null;
  if (prize.value == null) return prize.discountCode || prize.name || null;
  if (!prize.discountCode) {
    return prize.name || `${prize.value}${prize.discountType === "PERCENT" ? "% off" : " off"}`;
  }
  return `${prize.discountCode} · ${prize.discountType === "PERCENT" ? `${prize.value}% off` : `${formatVnd(prize.value)} off`}`;
}

export function useCountdown(target: string | undefined, enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, [enabled]);
  if (!enabled || !target) return null;
  return Math.max(0, new Date(target).getTime() - now);
}

export function formatCountdown(ms: number) {
  const mins = Math.floor(ms / 60_000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(m, 1)}m`;
}

export function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function StatusBadge({ status }: { status: ContestStatus }) {
  const variant =
    status === "UPCOMING"
      ? "info"
      : status === "ONGOING"
        ? "success"
        : status === "CANCELLED"
          ? "danger"
          : status === "REWARDED"
            ? "purple"
            : "default";
  return <Badge variant={variant}>{STATUS_LABEL[status] ?? status}</Badge>;
}

export function Fact({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-2xl border border-line-soft bg-surface p-5 shadow-sm">
      <span className="text-brand-ink">{icon}</span>
      <p className="mt-3 truncate text-xl font-bold text-content" title={value}>
        {value}
      </p>
      <p className="mt-1 text-xs text-content-subtle">{label}</p>
    </div>
  );
}
