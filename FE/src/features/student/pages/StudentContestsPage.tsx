import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/ToastHost";
import { Icon } from "@/assets/icons";
import { ROUTES } from "@/app/routes";
import { formatVnd } from "@/services/payment.service";
import {
  studentContestService,
  type ContestHistoryItem,
  type ContestLeaderboard,
  type ContestPrize,
  type ContestResult,
  type ContestReward,
  type ContestStatus,
  type StudentContest,
} from "@/services/studentContest.service";
import { getApiErrorMessage } from "@/utils/apiError";
import {
  LoadError,
  PageTitle,
  STUDENT_PAGE_CLASS,
} from "../components/studentUi";
import { RankMedal } from "@/features/contest/components/contestUi";

const PAGE_SIZE = 9;
const LIST_TABS = ["Contests", "History"];
const REFRESH_MS = 30_000;

const STATUS_LABEL: Record<ContestStatus, string> = {
  UPCOMING: "Upcoming",
  ONGOING: "Live now",
  ENDED: "Ended",
  CANCELLED: "Cancelled",
};
const STATUS_OPTIONS = [
  { label: "Any status", value: "" },
  ...(["UPCOMING", "ONGOING", "ENDED", "CANCELLED"] as ContestStatus[]).map(
    (s) => ({ label: STATUS_LABEL[s], value: s }),
  ),
];

export function StudentContestsPage() {
  const { contestId } = useParams<{ contestId: string }>();
  return contestId ? <ContestDetail contestId={contestId} /> : <ContestList />;
}

type Course = { courseId: number; title: string };

function inDateRange(value: string | undefined, from: string, to: string) {
  if (!from && !to) return true;
  if (!value) return false;
  const t = new Date(value).getTime();
  if (from && t < new Date(`${from}T00:00:00`).getTime()) return false;
  if (to && t > new Date(`${to}T23:59:59.999`).getTime()) return false;
  return true;
}

function coursesOf(items: { course?: Course | null }[]): Course[] {
  const map = new Map<number, Course>();
  items.forEach((item) => {
    if (item.course) map.set(item.course.courseId, item.course);
  });
  return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
}

function ContestList() {
  const navigate = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState(LIST_TABS[0]);
  const [page, setPage] = useState(1);
  const [contests, setContests] = useState<StudentContest[]>([]);
  const [history, setHistory] = useState<ContestHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [status, setStatus] = useState("");
  const [courseId, setCourseId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      studentContestService.getAllContests(),
      studentContestService
        .getAllHistory()
        .catch(() => [] as ContestHistoryItem[]),
    ])
      .then(([contestRows, historyRows]) => {
        if (cancelled) return;
        const joined = new Set(historyRows.map((item) => item.contestId));
        const byStart = (
          a: { startTime?: string },
          b: { startTime?: string },
        ) => (b.startTime ?? "").localeCompare(a.startTime ?? "");
        setContests(
          contestRows
            .map((c) => ({
              ...c,
              isRegistered: Boolean(c.isRegistered || joined.has(c.contestId)),
            }))
            .sort(byStart),
        );
        const startOf = new Map(contestRows.map((c) => [c.contestId, c]));
        setHistory(
          historyRows.map((h) => ({
            ...h,
            startTime: h.startTime ?? startOf.get(h.contestId)?.startTime,
            course: h.course ?? startOf.get(h.contestId)?.course ?? null,
          })),
        );
      })
      .catch((err) => {
        if (cancelled) return;
        const message = getApiErrorMessage(err, "Failed to load contests.");
        setError(message);
        toast.error(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload, toast]);

  const isHistory = tab === "History";
  const courses = useMemo(
    () => coursesOf(isHistory ? history : contests),
    [contests, history, isHistory],
  );
  const filteredContests = useMemo(
    () =>
      contests.filter(
        (c) =>
          (!status || c.status === status) &&
          (!courseId || String(c.course?.courseId) === courseId) &&
          inDateRange(c.startTime, from, to),
      ),
    [contests, courseId, from, status, to],
  );
  const filteredHistory = useMemo(
    () =>
      history.filter(
        (h) =>
          (!courseId || String(h.course?.courseId) === courseId) &&
          inDateRange(h.startTime ?? h.registeredAt, from, to),
      ),
    [courseId, from, history, to],
  );

  const rows = isHistory ? filteredHistory : filteredContests;
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filtersActive = Boolean(
    (!isHistory && status) || courseId || from || to,
  );

  const chooseTab = (next: string) => {
    setTab(next);
    setPage(1);
    setStatus("");
    setCourseId("");
  };
  const resetFilters = () => {
    setStatus("");
    setCourseId("");
    setFrom("");
    setTo("");
    setPage(1);
  };
  const open = (id: number) => navigate(`${ROUTES.studentContests}/${id}`);

  return (
    <div className={`${STUDENT_PAGE_CLASS} space-y-6`}>
      <PageTitle
        title="Contests"
        subtitle="Join a contest, compete with other students, and claim your rewards."
      />
      <Tabs
        tabs={LIST_TABS}
        active={tab}
        onChange={chooseTab}
        variant="underline"
      />

      <section className="card p-4">
        <div
          className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${isHistory ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}
        >
          {courses.length > 0 && (
            <Select
              aria-label="Course"
              value={courseId}
              onChange={(v) => {
                setCourseId(v);
                setPage(1);
              }}
              options={[
                { label: "All courses", value: "" },
                ...courses.map((c) => ({
                  label: c.title,
                  value: String(c.courseId),
                })),
              ]}
              maxVisibleOptions={8}
            />
          )}
          {!isHistory && (
            <Select
              aria-label="Status"
              value={status}
              onChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
              options={STATUS_OPTIONS}
            />
          )}
          <Input
            aria-label="Starts from"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
          <Input
            aria-label="Starts until"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </div>
        {filtersActive && (
          <button
            type="button"
            onClick={resetFilters}
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <Icon.X className="h-3.5 w-3.5" /> Clear filters
          </button>
        )}
      </section>

      {error ? (
        <LoadError message={error} onRetry={() => setReload((v) => v + 1)} />
      ) : loading ? (
        <div className="card p-8 text-sm text-content-subtle">
          Loading contests…
        </div>
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Icon.Trophy className="w-7 h-7" />}
            title={
              filtersActive
                ? "No contests match your filters"
                : isHistory
                  ? "No contest history"
                  : "No contests yet"
            }
            message={
              filtersActive
                ? "Try another course, status or date."
                : isHistory
                  ? "Contests you join will appear here."
                  : "New contests will appear here."
            }
          />
        </div>
      ) : isHistory ? (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-line">
            {(pageRows as ContestHistoryItem[]).map((item) => (
              <li
                key={item.contestId}
                className="flex flex-wrap items-center gap-3 px-4 py-4"
              >
                <Icon.Trophy className="h-5 w-5 text-warning" />
                <div className="min-w-[12rem] flex-1">
                  <p className="text-sm font-semibold text-content">
                    {item.title}
                  </p>
                  <p className="text-xs text-content-subtle">
                    {item.course ? `${item.course.title} · ` : ""}
                    {item.startTime
                      ? `Starts ${formatDate(item.startTime)}`
                      : `Joined ${formatDate(item.registeredAt)}`}
                  </p>
                </div>
                <StatusBadge status={item.status} />
                <span className="text-sm text-content-secondary">
                  {item.rank != null ? `Rank #${item.rank}` : "—"} ·{" "}
                  {item.score ?? "No score"}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => open(item.contestId)}
                >
                  Details
                </Button>
              </li>
            ))}
          </ul>
          <div className="border-t border-line">
            <Pagination
              page={page}
              total={rows.length}
              perPage={PAGE_SIZE}
              onChange={setPage}
              unit="contests"
            />
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
            {(pageRows as StudentContest[]).map((contest) => (
              <ContestCard
                key={contest.contestId}
                contest={contest}
                onOpen={() => open(contest.contestId)}
              />
            ))}
          </div>
          <div className="card">
            <Pagination
              page={page}
              total={rows.length}
              perPage={PAGE_SIZE}
              onChange={setPage}
              unit="contests"
            />
          </div>
        </>
      )}
    </div>
  );
}

const STATUS_ACCENT: Record<ContestStatus, string> = {
  UPCOMING: "bg-primary",
  ONGOING: "bg-success",
  ENDED: "bg-line",
  CANCELLED: "bg-danger",
};

function startLabel(status: ContestStatus) {
  return status === "UPCOMING" ? "Starts" : "Started";
}

function ctaFor(contest: StudentContest): {
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
  if (contest.status === "CANCELLED")
    return { label: "View details", variant: "outline" };
  return {
    label: contest.isRegistered ? "View results" : "View leaderboard",
    variant: "outline",
  };
}

function ContestCard({
  contest,
  onOpen,
}: {
  contest: StudentContest;
  onOpen: () => void;
}) {
  const cta = ctaFor(contest);
  const hasLimit = Boolean(contest.maxParticipants);
  const fillPct = hasLimit
    ? Math.min(
        100,
        Math.round((contest.registeredCount / contest.maxParticipants!) * 100),
      )
    : 0;
  const isFull =
    hasLimit && contest.registeredCount >= contest.maxParticipants!;

  return (
    <article className="card group relative flex flex-col overflow-hidden transition-shadow duration-200 hover:shadow-md focus-within:shadow-md">
      <div
        className={`h-1 w-full ${STATUS_ACCENT[contest.status] ?? "bg-line"}`}
        aria-hidden="true"
      />

      <div className="relative">
        {contest.bannerUrl ? (
          <img
            src={contest.bannerUrl}
            alt=""
            className="h-36 w-full object-cover"
          />
        ) : (
          <div className="flex h-36 items-center justify-center bg-gradient-to-br from-primary-light to-surface-muted text-primary">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface shadow-sm">
              <Icon.Trophy className="h-7 w-7" />
            </span>
          </div>
        )}
        <div className="absolute left-3 top-3 rounded-full bg-surface/90 p-0.5 shadow-sm backdrop-blur">
          <StatusBadge status={contest.status} />
        </div>
        {contest.isRegistered && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-success px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
            <Icon.Check className="h-3.5 w-3.5" />
            Registered
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="space-y-1.5">
          <h2
            className="line-clamp-2 min-h-[2.75rem] text-base font-semibold leading-snug text-content"
            title={contest.title}
          >
            {contest.title}
          </h2>
          {contest.course && (
            <p className="truncate text-xs font-medium text-primary">
              {contest.course.title}
            </p>
          )}
          <p className="line-clamp-2 min-h-10 text-sm leading-5 text-content-soft">
            {contest.description ||
              "Join this contest to test your skills and compete with other students."}
          </p>
        </div>

        <div className="space-y-2 border-t border-line-soft pt-3 text-sm text-content-secondary">
          <p className="flex items-center gap-2">
            <Icon.Calendar className="h-4 w-4 flex-shrink-0 text-primary" />
            <span className="text-content-subtle">
              {startLabel(contest.status)}
            </span>
            <span className="font-medium text-content">
              {formatDate(contest.startTime)}
            </span>
          </p>
          <p className="flex items-center gap-2">
            <Icon.Clock className="h-4 w-4 flex-shrink-0 text-primary" />
            <span className="tabular-nums">{contest.durationMinutes} min</span>
            <span className="text-line" aria-hidden="true">
              |
            </span>
            <span className="tabular-nums">
              {contest.questionCount} questions
            </span>
          </p>
        </div>

        <div className="mt-auto space-y-3 pt-1">
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-content-subtle">
                {hasLimit ? "Spots filled" : "Participants"}
              </span>
              <span
                className={`font-semibold tabular-nums ${isFull ? "text-danger" : "text-content-secondary"}`}
              >
                {hasLimit
                  ? `${contest.registeredCount} / ${contest.maxParticipants}${isFull ? " · Full" : ""}`
                  : contest.registeredCount}
              </span>
            </div>
            {hasLimit && (
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
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
          </div>
          <Button className="w-full" variant={cta.variant} onClick={onOpen}>
            {cta.label}
          </Button>
        </div>
      </div>
    </article>
  );
}

function ownReward(result: ContestResult | null): ContestReward | null {
  if (!result?.rank || !result.rewards.length) return null;
  if (result.rewards.some((r) => r.rankPosition != null))
    return result.rewards.find((r) => r.rankPosition === result.rank) ?? null;
  return result.rewards[result.rank - 1] ?? null;
}

function prizeText(prize: ContestPrize | null | undefined) {
  if (!prize) return null;
  if (prize.value == null) return prize.discountCode;
  return `${prize.discountCode} · ${prize.discountType === "PERCENT" ? `${prize.value}% off` : `${formatVnd(prize.value)} off`}`;
}

function useCountdown(target: string | undefined, enabled: boolean) {
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

function formatCountdown(ms: number) {
  const mins = Math.floor(ms / 60_000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(m, 1)}m`;
}

function Stat({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line-soft bg-surface-muted/60 p-3">
      <div className="flex items-center gap-1.5 text-xs text-content-subtle">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <div className="mt-1.5 text-sm font-semibold text-content">{children}</div>
    </div>
  );
}

function ActionPanel({
  contest,
  busy,
  onRegister,
  onStart,
}: {
  contest: StudentContest;
  busy: "register" | "start" | number | null;
  onRegister: () => void;
  onStart: () => void;
}) {
  const countdown = useCountdown(
    contest.startTime,
    contest.status === "UPCOMING",
  );
  const isFull =
    Boolean(contest.maxParticipants) &&
    contest.registeredCount >= contest.maxParticipants!;

  let heading = "";
  let body = "";
  let action: React.ReactNode = null;
  let tone = "bg-surface-muted text-content-secondary";

  if (contest.status === "UPCOMING" && !contest.isRegistered) {
    heading = isFull ? "This contest is full" : "Registration is open";
    body = isFull
      ? "All spots are taken."
      : countdown != null
        ? `Starts in ${formatCountdown(countdown)}. Register now to secure your spot.`
        : "Register now to secure your spot.";
    tone = "bg-primary-light text-primary";
    action = (
      <Button
        className="w-full"
        onClick={onRegister}
        loading={busy === "register"}
        disabled={busy !== null || isFull}
      >
        Register
      </Button>
    );
  } else if (contest.status === "UPCOMING") {
    heading = "You’re registered";
    body =
      countdown != null
        ? `Starts in ${formatCountdown(countdown)}. Come back when the contest goes live.`
        : "Come back when the contest goes live.";
    tone = "bg-success/10 text-success";
  } else if (contest.status === "ONGOING" && contest.isRegistered) {
    heading = "The contest is live";
    body = `You have ${contest.durationMinutes} minutes once you start. The timer can’t be paused.`;
    tone = "bg-success/10 text-success";
    action = (
      <Button
        className="w-full"
        icon={<Icon.Zap className="h-4 w-4" />}
        onClick={onStart}
        loading={busy === "start"}
        disabled={busy !== null}
      >
        Start contest
      </Button>
    );
  } else if (contest.status === "ONGOING") {
    heading = "Live now";
    body = "Only registered students can start this contest.";
  } else if (contest.status === "CANCELLED") {
    heading = "Contest cancelled";
    body = "This contest will not take place.";
    tone = "bg-danger/10 text-danger";
  } else {
    heading = "Contest ended";
    body = contest.isRegistered
      ? "Your result and rewards are shown below."
      : "You can view the final leaderboard.";
  }

  return (
    <section className="card space-y-3 p-4">
      <div className={`rounded-lg px-3 py-2.5 ${tone}`}>
        <p className="text-sm font-semibold">{heading}</p>
        <p className="mt-0.5 text-xs leading-5 opacity-90">{body}</p>
      </div>
      {action}
    </section>
  );
}

function PrizesCard({
  prizes,
  ownRank,
}: {
  prizes: ContestPrize[];
  ownRank?: number | null;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-line p-4">
        <h2 className="font-semibold text-content">Prizes</h2>
        <p className="mt-0.5 text-xs text-content-subtle">
          Finish in one of these ranks to win.
        </p>
      </div>
      <ul className="divide-y divide-line">
        {[...prizes]
          .sort((a, b) => a.rankPosition - b.rankPosition)
          .map((prize) => (
            <li
              key={prize.rankPosition}
              className={`flex items-center gap-3 px-4 py-3 text-sm ${
                ownRank === prize.rankPosition ? "bg-primary-light/50" : ""
              }`}
            >
              <RankMedal rank={prize.rankPosition} />
              <span className="min-w-0 flex-1 truncate font-medium text-content">
                {prizeText(prize)}
              </span>
              <Icon.Award className="h-4 w-4 flex-shrink-0 text-warning" />
            </li>
          ))}
      </ul>
    </section>
  );
}

function ResultCard({
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
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-surface-muted/60 p-3">
          <p className="text-xs text-content-subtle">Rank</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-content">
            {result.rank != null ? `#${result.rank}` : "—"}
          </p>
        </div>
        <div className="rounded-xl bg-surface-muted/60 p-3">
          <p className="text-xs text-content-subtle">Score</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-content">
            {result.score ?? "—"}
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
        <p className="text-xs text-content-subtle">
          No reward for your rank this time.
        </p>
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

function ContestDetail({ contestId }: { contestId: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [contest, setContest] = useState<StudentContest | null>(null);
  const [leaderboard, setLeaderboard] = useState<ContestLeaderboard | null>(
    null,
  );
  const [result, setResult] = useState<ContestResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"register" | "start" | number | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setError(null);
      try {
        const [contestRows, historyRows] = await Promise.all([
          studentContestService.getAllContests(),
          studentContestService.getAllHistory().catch(() => null),
        ]);
        const current = contestRows.find(
          (item) => String(item.contestId) === contestId,
        );
        if (!current) throw new Error("Contest not found.");
        const joined = Boolean(
          current.isRegistered ||
            historyRows?.some((item) => String(item.contestId) === contestId),
        );
        const next = { ...current, isRegistered: joined };
        const [leaderboardData, resultData] = await Promise.all([
          studentContestService.getLeaderboard(contestId).catch(() => null),
          next.status === "ENDED" && joined
            ? studentContestService.getResult(contestId).catch(() => null)
            : Promise.resolve(null),
        ]);
        setContest(next);
        setLeaderboard(leaderboardData);
        setResult(resultData);
      } catch (err) {
        if (!silent) {
          const message = getApiErrorMessage(
            err,
            "Failed to load this contest.",
          );
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
      toast.error(
        getApiErrorMessage(err, "Could not register for this contest."),
      );
    } finally {
      setBusy(null);
    }
  };
  const start = async () => {
    setBusy("start");
    try {
      const attempt = await studentContestService.start(contestId);
      navigate(
        `${ROUTES.studentExam}?attemptId=${encodeURIComponent(String(attempt.attemptId))}`,
        { state: { contestId: Number(contestId), endsAt: attempt.endsAt } },
      );
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not start the contest."));
      setBusy(null);
    }
  };
  const claim = async (rewardId: number) => {
    setBusy(rewardId);
    try {
      const claimed = await studentContestService.claimReward(
        contestId,
        rewardId,
      );
      setResult((current) =>
        current
          ? {
              ...current,
              rewards: current.rewards.map((reward) =>
                reward.rewardId === rewardId
                  ? { ...reward, ...claimed, claimed: true }
                  : reward,
              ),
            }
          : current,
      );
      toast.success("Reward claimed.");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not claim this reward."));
    } finally {
      setBusy(null);
    }
  };

  if (loading)
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
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-xl bg-surface-muted"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  if (error || !contest)
    return (
      <div className={`${STUDENT_PAGE_CLASS} space-y-4`}>
        <Button
          variant="ghost"
          onClick={() => navigate(ROUTES.studentContests)}
        >
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

  const prizes = contest.rewards ?? [];
  const showPrizes =
    (contest.status === "UPCOMING" || contest.status === "ONGOING") &&
    prizes.length > 0;
  const reward = ownReward(result);
  const certificate =
    result?.certificateUrl ??
    result?.rewards.find((r) => r.rewardType === "CERTIFICATE")
      ?.certificateUrl ??
    null;

  const hasLimit = Boolean(contest.maxParticipants);
  const fillPct = hasLimit
    ? Math.min(
        100,
        Math.round((contest.registeredCount / contest.maxParticipants!) * 100),
      )
    : 0;
  const isFull = hasLimit && contest.registeredCount >= contest.maxParticipants!;

  return (
    <div className={`${STUDENT_PAGE_CLASS} space-y-6`}>
      <Button variant="ghost" onClick={() => navigate(ROUTES.studentContests)}>
        ← Contests
      </Button>
      <section className="card overflow-hidden">
        <div className={`h-1 w-full ${STATUS_ACCENT[contest.status] ?? "bg-line"}`} aria-hidden="true" />
        {contest.bannerUrl ? (
          <img
            src={contest.bannerUrl}
            alt=""
            className="h-48 w-full object-cover sm:h-60"
          />
        ) : (
          <div className="flex h-28 items-center justify-center bg-gradient-to-br from-primary-light to-surface-muted text-primary">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface shadow-sm">
              <Icon.Trophy className="h-7 w-7" />
            </span>
          </div>
        )}
        <div className="space-y-5 p-5 sm:p-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={contest.status} />
              {contest.isRegistered && (
                <Badge variant="success">
                  <Icon.Check className="mr-1 inline h-3 w-3" />
                  Registered
                </Badge>
              )}
            </div>
            <h1 className="text-2xl font-bold leading-tight text-content sm:text-3xl">
              {contest.title}
            </h1>
            {contest.course && (
              <p className="text-sm font-medium text-primary">
                {contest.course.title}
              </p>
            )}
            {contest.description && (
              <p className="max-w-prose whitespace-pre-line pt-1 text-sm leading-6 text-content-soft">
                {contest.description}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat icon={<Icon.Calendar className="h-3.5 w-3.5" />} label={startLabel(contest.status)}>
              {formatDate(contest.startTime)}
            </Stat>
            <Stat icon={<Icon.Clock className="h-3.5 w-3.5" />} label="Duration">
              <span className="tabular-nums">{contest.durationMinutes} minutes</span>
            </Stat>
            <Stat icon={<Icon.Zap className="h-3.5 w-3.5" />} label="Questions">
              <span className="tabular-nums">{contest.questionCount}</span>
            </Stat>
            <Stat icon={<Icon.Trophy className="h-3.5 w-3.5" />} label={hasLimit ? "Spots filled" : "Participants"}>
              <span className={`tabular-nums ${isFull ? "text-danger" : ""}`}>
                {hasLimit
                  ? `${contest.registeredCount} / ${contest.maxParticipants}${isFull ? " · Full" : ""}`
                  : contest.registeredCount}
              </span>
              {hasLimit && (
                <div
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line-soft"
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
            </Stat>
          </div>
        </div>
      </section>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <aside className="space-y-4 lg:order-2 lg:sticky lg:top-6">
          <ActionPanel
            contest={contest}
            busy={busy}
            onRegister={register}
            onStart={start}
          />
          {result && (
            <ResultCard
              result={result}
              reward={reward}
              busy={busy}
              onClaim={claim}
              certificate={certificate}
            />
          )}
          {showPrizes && <PrizesCard prizes={prizes} ownRank={result?.rank} />}
        </aside>

        <div className="min-w-0 lg:order-1">
          <Results
            contest={contest}
            leaderboard={leaderboard}
            result={result}
            busy={busy}
            onClaim={claim}
          />
        </div>
      </div>
    </div>
  );
}

function Results({
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
    if (reward.claimable === false)
      return <span className="text-xs text-content-soft">Not available yet</span>;
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
          Updated{" "}
          {leaderboard?.generatedAt ? formatDate(leaderboard.generatedAt) : "—"}
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
                : contest.status !== "ENDED"
                  ? "Leaderboard opens after the contest"
                  : "No entries yet"
          }
          message={
            !leaderboard
              ? "We couldn’t load it right now. It will retry automatically."
              : contest.status === "CANCELLED"
                ? "There are no results for this contest."
                : contest.status !== "ENDED"
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
                const prize =
                  prizeText(row.reward) ?? (mine && reward ? reward.value : null);
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
                        <span className={mine ? "font-semibold" : ""}>
                          {row.studentName}
                        </span>
                        {mine && <Badge variant="info">You</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {row.score}
                    </td>
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

function StatusBadge({ status }: { status: ContestStatus }) {
  const variant =
    status === "UPCOMING"
      ? "info"
      : status === "ONGOING"
        ? "success"
        : status === "CANCELLED"
          ? "danger"
          : "default";
  return <Badge variant={variant}>{STATUS_LABEL[status] ?? status}</Badge>;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
