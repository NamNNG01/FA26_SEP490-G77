import React from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/assets/icons";
import type { ContestResult, ContestReward } from "@/services/studentContest.service";

export function ContestResultCard({
  result,
  reward,
  busy,
  onClaim,
  certificate,
}: {
  result: ContestResult;
  reward: ContestReward | null;
  busy: "register" | "start" | number | null;
  onClaim: (rewardId: number) => void;
  certificate: string | null;
}) {
  return (
    <section className="card space-y-4 p-4">
      <h2 className="font-semibold text-content">Your result</h2>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl bg-surface-muted/60 p-3">
          <p className="text-xs text-content-subtle">Rank</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-content">
            {result.rank != null ? `#${result.rank}` : "—"}
          </p>
        </div>
        <div className="rounded-xl bg-surface-muted/60 p-3">
          <p className="text-xs text-content-subtle">Players</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-content">
            {result.totalParticipants}
          </p>
        </div>
      </div>

      {reward ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
          <div className="flex min-w-0 items-center gap-2">
            <Icon.Award className="h-5 w-5 flex-shrink-0 text-warning" />
            <span className="truncate text-sm font-medium text-content">
              {typeof reward.value === "string" || typeof reward.value === "number"
                ? String(reward.value)
                : "Reward"}
            </span>
          </div>
          {reward.claimed ? (
            <Badge variant="success">Claimed</Badge>
          ) : reward.claimable === false ? (
            <span className="text-xs text-content-soft">Not available yet</span>
          ) : (
            <Button
              size="sm"
              onClick={() => onClaim(reward.rewardId)}
              loading={busy === reward.rewardId}
              disabled={busy !== null}
            >
              Claim
            </Button>
          )}
        </div>
      ) : (
        <p className="text-xs text-content-subtle">No reward for your rank this time.</p>
      )}

      {certificate && (
        <a
          href={certificate}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium text-primary hover:bg-surface-muted"
        >
          <Icon.Award className="h-4 w-4" /> View certificate
        </a>
      )}
    </section>
  );
}
