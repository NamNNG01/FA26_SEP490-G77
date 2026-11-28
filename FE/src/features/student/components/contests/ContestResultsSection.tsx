import React from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Card";
import { Icon } from "@/assets/icons";
import type {
  ContestLeaderboard,
  ContestResult,
  StudentContest,
} from "@/services/studentContest.service";
import { RankMedal } from "@/features/contest/components/contestUi";
import { formatDate, ownReward, prizeText } from "./contestHelpers";

export function ContestResultsSection({
  contest,
  leaderboard,
  result,
  busy,
  onClaim,
}: {
  contest: StudentContest;
  leaderboard: ContestLeaderboard | null;
  result: ContestResult | null;
  busy: "register" | "start" | number | null;
  onClaim: (rewardId: number) => void;
}) {
  const reward = ownReward(result);
  const rows = leaderboard?.rows ?? [];
  const ownInTable = rows.some((row) => row.isCurrentUser);

  const action = (isMine: boolean) => {
    if (!isMine || !reward) return <span className="text-content-soft">—</span>;
    if (reward.claimed) return <Badge variant="success">Claimed</Badge>;
    if (reward.claimable === false) {
      return <span className="text-xs text-content-soft">Not available yet</span>;
    }
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => onClaim(reward.rewardId)}
        loading={busy === reward.rewardId}
        disabled={busy !== null}
      >
        Claim
      </Button>
    );
  };

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-4">
        <h2 className="font-semibold text-content">Leaderboard</h2>
        <p className="text-xs text-content-subtle">
          Updated {leaderboard?.generatedAt ? formatDate(leaderboard.generatedAt) : "—"}
          <span className="hidden sm:inline"> · refreshes every 30 seconds</span>
        </p>
      </div>
      {!rows.length && !result ? (
        <EmptyState
          icon={<Icon.Trophy className="h-7 w-7" />}
          title={
            !leaderboard
              ? "Leaderboard unavailable"
              : contest.status === "CANCELLED"
                ? "Contest cancelled"
                : !["ENDED", "PENDING_REWARD", "REWARDED"].includes(contest.status)
                  ? "Leaderboard opens after the contest"
                  : "No entries yet"
          }
          message={
            !leaderboard
              ? "We couldn’t load it right now. It will retry automatically."
              : contest.status === "CANCELLED"
                ? "There are no results for this contest."
                : !["ENDED", "PENDING_REWARD", "REWARDED"].includes(contest.status)
                  ? "Rankings appear here once the contest ends."
                  : "Nobody has a score for this contest."
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-surface-muted text-xs text-content-subtle">
              <tr>
                <th className="w-20 px-4 py-3 font-medium">Rank</th>
                <th className="px-4 py-3 font-medium">Student</th>
                <th className="px-4 py-3 text-right font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Prize</th>
                <th className="px-4 py-3 text-right font-medium">Reward</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => {
                const mine = row.isCurrentUser;
                const prize = prizeText(row.reward) ?? (mine && reward ? reward.value : null);
                return (
                  <tr
                    key={`${row.rank}-${row.userId}`}
                    className={
                      mine
                        ? "bg-primary-light/50 shadow-[inset_3px_0_0_0_var(--color-primary,theme(colors.primary.DEFAULT))]"
                        : "hover:bg-surface-muted/40"
                    }
                  >
                    <td className="px-4 py-3">
                      <RankMedal rank={row.rank} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar
                          name={row.studentName || "?"}
                          src={row.avatarUrl ?? undefined}
                          size="sm"
                        />
                        <span className={mine ? "font-semibold" : ""}>{row.studentName}</span>
                        {mine && <Badge variant="info">You</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{row.score}</td>
                    <td className="px-4 py-3">
                      {prize ?? <span className="text-content-soft">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">{action(mine)}</td>
                  </tr>
                );
              })}
              {result && !ownInTable && (
                <tr className="bg-primary-light/50">
                  <td className="px-4 py-3">
                    <RankMedal rank={result.rank} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="font-semibold">You</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">
                    {result.score ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {reward?.value ?? <span className="text-content-soft">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">{action(true)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
