import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastHost";
import { Icon } from "@/assets/icons";
import { ROUTES } from "@/app/routes";
import {
  studentContestService,
  type ContestLeaderboard,
  type ContestResult,
  type StudentContest,
} from "@/services/studentContest.service";
import { getApiErrorMessage } from "@/utils/apiError";
import { LoadError, STUDENT_PAGE_CLASS } from "../studentUi";
import {
  Fact,
  formatDate,
  ownReward,
  REFRESH_MS,
  startLabel,
  StatusBadge,
} from "./contestHelpers";
import { ContestActionPanel } from "./ContestActionPanel";
import { ContestPrizesCard } from "./ContestPrizesCard";
import { ContestResultCard } from "./ContestResultCard";
import { ContestResultsSection } from "./ContestResultsSection";

export function ContestDetailView({ contestId }: { contestId: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [contest, setContest] = useState<StudentContest | null>(null);
  const [leaderboard, setLeaderboard] = useState<ContestLeaderboard | null>(null);
  const [result, setResult] = useState<ContestResult | null>(null);
  const [attemptScore, setAttemptScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"register" | "start" | number | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setError(null);
      try {
        const next = await studentContestService.getContestDetail(contestId);
        const [leaderboardData, resultData] = await Promise.all([
          studentContestService.getLeaderboard(contestId).catch(() => null),
          (next.status === "ENDED" || next.status === "REWARDED") && next.isRegistered
            ? studentContestService.getResult(contestId).catch(() => null)
            : Promise.resolve(null),
        ]);
        setContest(next);
        setLeaderboard(leaderboardData);
        setResult(resultData);
        setAttemptScore(next.score ?? resultData?.score ?? null);
      } catch (err) {
        if (!silent) {
          const message = getApiErrorMessage(err, "Failed to load this contest.");
          setError(message);
          toast.error(message);
        }
      } finally {
        setLoading(false);
      }
    },
    [contestId, toast],
  );

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    if (busy !== null) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [busy, load]);

  const register = async () => {
    setBusy("register");
    try {
      const response = await studentContestService.register(contestId);
      setContest((current) =>
        current
          ? {
              ...current,
              isRegistered: true,
              registeredCount: response.registeredCount,
            }
          : current,
      );
      toast.success("You are registered for this contest.");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not register for this contest."));
    } finally {
      setBusy(null);
    }
  };

  const start = async () => {
    setBusy("start");
    try {
      const attempt = await studentContestService.start(contestId);
      navigate(`${ROUTES.studentExam}?attemptId=${encodeURIComponent(String(attempt.attemptId))}`, {
        state: { contestId: Number(contestId), endsAt: attempt.endsAt },
      });
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not start the contest."));
      setBusy(null);
    }
  };

  const claim = async (rewardId: number) => {
    setBusy(rewardId);
    try {
      const claimed = await studentContestService.claimReward(contestId, rewardId);
      setResult((current) =>
        current
          ? {
              ...current,
              rewards: current.rewards.map((reward) =>
                reward.rewardId === rewardId ? { ...reward, ...claimed, claimed: true } : reward,
              ),
            }
          : current,
      );
      setContest((current) =>
        current?.rewardInfo
          ? { ...current, rewardInfo: { ...current.rewardInfo, claimed: true, claimable: false } }
          : current,
      );
      toast.success("Reward claimed.");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not claim this reward."));
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className={`${STUDENT_PAGE_CLASS} space-y-6`} aria-busy="true">
        <div className="h-9 w-28 animate-pulse rounded-lg bg-surface-muted" />
        <div className="card overflow-hidden">
          <div className="h-48 animate-pulse bg-surface-muted" />
          <div className="space-y-3 p-6">
            <div className="h-5 w-24 animate-pulse rounded bg-surface-muted" />
            <div className="h-8 w-2/3 animate-pulse rounded bg-surface-muted" />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-muted" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !contest) {
    return (
      <div className={`${STUDENT_PAGE_CLASS} space-y-4`}>
        <Button variant="ghost" onClick={() => navigate(ROUTES.studentContests)}>
          ← Contests
        </Button>
        <LoadError
          message={error ?? "Contest not found."}
          onRetry={() => {
            setLoading(true);
            void load();
          }}
        />
      </div>
    );
  }

  const prizes = contest.rewards ?? [];
  const showPrizes =
    (contest.status === "UPCOMING" || contest.status === "ONGOING") && prizes.length > 0;
  const resultReward = ownReward(result);
  const reward =
    resultReward && contest.rewardInfo
      ? {
          ...resultReward,
          claimed: contest.rewardInfo.claimed,
          claimable: contest.rewardInfo.claimable,
        }
      : (resultReward ??
        (contest.rewardInfo
          ? {
              rewardId: contest.rewardInfo.rewardId,
              rewardType: contest.rewardInfo.rewardType,
              value: contest.rewardInfo.valueText,
              description: contest.rewardInfo.name,
              claimed: contest.rewardInfo.claimed,
              rankPosition: contest.rewardInfo.rankPosition,
              claimable: contest.rewardInfo.claimable,
            }
          : null));
  const score = attemptScore ?? result?.score ?? null;
  const certificate =
    result?.certificateUrl ??
    result?.rewards.find((r) => r.rewardType === "CERTIFICATE")?.certificateUrl ??
    null;

  const hasLimit = Boolean(contest.maxParticipants);
  const fillPct = hasLimit
    ? Math.min(100, Math.round((contest.registeredCount / contest.maxParticipants!) * 100))
    : 0;
  const isFull = hasLimit && contest.registeredCount >= contest.maxParticipants!;

  return (
    <div className="space-y-7 pb-8">
      <section className="relative isolate overflow-hidden border-b border-line-soft bg-gradient-to-br from-primary-light via-surface-alt to-surface-alt">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[url('/images/exam_taking.png')] bg-cover bg-center opacity-50" />
          {contest.bannerUrl && (
            <div
              className="absolute inset-0 bg-cover bg-center opacity-25"
              style={{
                backgroundImage: `url("${contest.bannerUrl.replace(/["\\()\r\n]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`)}")`,
              }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-surface-alt via-surface-alt/75 to-transparent" />
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at 18% 85%, rgba(242, 113, 36, 0.12), transparent 62%)",
            }}
          />
        </div>
        <div className={`${STUDENT_PAGE_CLASS} relative py-8 sm:py-10`}>
          <button
            type="button"
            onClick={() => navigate(ROUTES.studentContests)}
            className="inline-flex items-center gap-2 text-sm font-medium text-content-soft hover:text-brand-ink"
          >
            <Icon.ChevronLeft className="h-4 w-4" /> Contests
          </button>
          <div className="mt-6 grid gap-7 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-center">
            <div className="max-w-3xl py-2">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={contest.status} />
                {contest.isRegistered && (
                  <Badge variant="success">
                    <Icon.Check className="mr-1 inline h-3 w-3" /> Registered
                  </Badge>
                )}
                <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-ink/10 bg-surface/70 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-brand-ink shadow-sm backdrop-blur-sm">
                  <Icon.Trophy className="h-4 w-4" /> Student contest
                </span>
              </div>
              <h1 className="mt-4 text-4xl font-bold tracking-tight text-content sm:text-5xl sm:leading-[1.1]">
                {contest.title}
              </h1>
              {contest.course && (
                <p className="mt-3 text-sm font-medium text-primary">{contest.course.title}</p>
              )}
              <p className="mt-4 max-w-2xl whitespace-pre-line text-base leading-relaxed text-content-secondary sm:text-lg">
                {contest.description ||
                  "Take on the challenge, put your knowledge to work, and see where you place."}
              </p>
              {score !== null && (
                <div className="mt-6 inline-flex items-center gap-4 rounded-2xl border border-line-soft bg-surface/90 px-5 py-3 shadow-sm backdrop-blur-sm">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-light text-brand-ink">
                    <Icon.Trophy className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-xs font-medium text-content-subtle">Your attempt score</p>
                    <p className="mt-0.5 text-2xl font-bold tabular-nums text-brand-ink">{score}</p>
                  </div>
                  {result?.rank != null && (
                    <div className="ml-2 border-l border-line pl-4">
                      <p className="text-xs text-content-subtle">Placement</p>
                      <p className="mt-0.5 text-xl font-bold tabular-nums text-content">
                        #{result.rank}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
            <ContestActionPanel
              contest={contest}
              busy={busy}
              onRegister={register}
              onStart={start}
            />
          </div>
        </div>
      </section>
      <div className={`${STUDENT_PAGE_CLASS} space-y-6`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Fact
            icon={<Icon.Calendar className="h-5 w-5" />}
            value={formatDate(contest.startTime)}
            label={startLabel(contest.status)}
          />
          <Fact
            icon={<Icon.Clock className="h-5 w-5" />}
            value={`${contest.durationMinutes} min`}
            label="Time limit"
          />
          <Fact
            icon={<Icon.ClipboardList className="h-5 w-5" />}
            value={String(contest.questionCount)}
            label="Questions"
          />
          <Fact
            icon={<Icon.Users className="h-5 w-5" />}
            value={
              hasLimit
                ? `${contest.registeredCount} / ${contest.maxParticipants}`
                : String(contest.registeredCount)
            }
            label={hasLimit ? "Spots filled" : "Participants"}
          />
        </div>
        {hasLimit && (
          <div
            className="-mt-3 h-1.5 overflow-hidden rounded-full bg-line-soft"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={fillPct}
            aria-label="Registration capacity"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-300 ${isFull ? "bg-danger" : "bg-primary"}`}
              style={{ width: `${fillPct}%` }}
            />
          </div>
        )}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <aside className="space-y-4 lg:order-2 lg:sticky lg:top-6">
            {result && (
              <ContestResultCard
                result={result}
                reward={reward}
                busy={busy}
                onClaim={claim}
                certificate={certificate}
              />
            )}
            {contest.rewardInfo && !result && (
              <section className="card space-y-3 p-4">
                <h2 className="font-semibold text-content">Your reward</h2>
                <p className="text-sm text-content-secondary">
                  {contest.rewardInfo.name || contest.rewardInfo.valueText}
                </p>
                <p className="text-xs text-content-subtle">
                  Rank #{contest.rewardInfo.rankPosition}
                  {contest.rewardInfo.valueText ? ` · ${contest.rewardInfo.valueText}` : ""}
                </p>
                {contest.rewardInfo.claimed ? (
                  <Badge variant="success">Claimed</Badge>
                ) : contest.rewardInfo.claimable ? (
                  <Button
                    className="w-full"
                    onClick={() => claim(contest.rewardInfo!.rewardId)}
                    loading={busy === contest.rewardInfo.rewardId}
                    disabled={busy !== null}
                  >
                    Claim reward
                  </Button>
                ) : (
                  <p className="text-xs text-content-soft">
                    Your reward will be available after the contest is finalized.
                  </p>
                )}
              </section>
            )}
            {showPrizes && <ContestPrizesCard prizes={prizes} ownRank={result?.rank} />}
          </aside>

          <div className="min-w-0 lg:order-1">
            <ContestResultsSection
              contest={contest}
              leaderboard={leaderboard}
              result={result}
              busy={busy}
              onClaim={claim}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
