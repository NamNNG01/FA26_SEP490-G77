import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { Tabs } from '@/components/ui/Tabs';
import { useToast } from '@/components/ui/ToastHost';
import { Icon } from '@/assets/icons';
import { ROUTES } from '@/app/routes';
import { formatVnd } from '@/services/payment.service';
import {
  studentContestService,
  type ContestHistoryItem,
  type ContestLeaderboard,
  type ContestPrize,
  type ContestResult,
  type ContestReward,
  type ContestStatus,
  type StudentContest,
} from '@/services/studentContest.service';
import { getApiErrorMessage } from '@/utils/apiError';
import { LoadError, PageTitle, STUDENT_PAGE_CLASS } from '../components/studentUi';

const PAGE_SIZE = 9;
const LIST_TABS = ['Contests', 'History'];
/** The detail page reloads the contest, leaderboard and result this often while the tab is visible. */
const REFRESH_MS = 30_000;

const STATUS_LABEL: Record<ContestStatus, string> = { UPCOMING: 'Upcoming', ONGOING: 'Live now', ENDED: 'Ended', CANCELLED: 'Cancelled' };
const STATUS_OPTIONS = [
  { label: 'Any status', value: '' },
  ...(['UPCOMING', 'ONGOING', 'ENDED', 'CANCELLED'] as ContestStatus[]).map(s => ({ label: STATUS_LABEL[s], value: s })),
];

export function StudentContestsPage() {
  const { contestId } = useParams<{ contestId: string }>();
  return contestId ? <ContestDetail contestId={contestId} /> : <ContestList />;
}

// ------------------------------------------------------------- list

type Course = { courseId: number; title: string };

/** Day input (yyyy-mm-dd, local time) → is `value` on/after `from` and on/before `to`. */
function inDateRange(value: string | undefined, from: string, to: string) {
  if (!from && !to) return true;
  if (!value) return false;
  const t = new Date(value).getTime();
  if (from && t < new Date(`${from}T00:00:00`).getTime()) return false;
  if (to && t > new Date(`${to}T23:59:59.999`).getTime()) return false;
  return true;
}

/** Course options from the rows themselves (CT-01 / CT-06 send `course` once the BE adds it). */
function coursesOf(items: { course?: Course | null }[]): Course[] {
  const map = new Map<number, Course>();
  items.forEach(item => { if (item.course) map.set(item.course.courseId, item.course); });
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
  const [status, setStatus] = useState('');
  const [courseId, setCourseId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      studentContestService.getAllContests(),
      studentContestService.getAllHistory().catch(() => [] as ContestHistoryItem[]),
    ]).then(([contestRows, historyRows]) => {
      if (cancelled) return;
      const joined = new Set(historyRows.map(item => item.contestId));
      const byStart = (a: { startTime?: string }, b: { startTime?: string }) => (b.startTime ?? '').localeCompare(a.startTime ?? '');
      setContests(contestRows.map(c => ({ ...c, isRegistered: Boolean(c.isRegistered || joined.has(c.contestId)) })).sort(byStart));
      // CT-06 has no start time yet: fall back to the contest list for it.
      const startOf = new Map(contestRows.map(c => [c.contestId, c]));
      setHistory(historyRows.map(h => ({ ...h, startTime: h.startTime ?? startOf.get(h.contestId)?.startTime, course: h.course ?? startOf.get(h.contestId)?.course ?? null })));
    }).catch(err => {
      if (cancelled) return;
      const message = getApiErrorMessage(err, 'Failed to load contests.');
      setError(message);
      toast.error(message);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reload, toast]);

  const isHistory = tab === 'History';
  const courses = useMemo(() => coursesOf(isHistory ? history : contests), [contests, history, isHistory]);
  const filteredContests = useMemo(() => contests.filter(c =>
    (!status || c.status === status)
    && (!courseId || String(c.course?.courseId) === courseId)
    && inDateRange(c.startTime, from, to)), [contests, courseId, from, status, to]);
  const filteredHistory = useMemo(() => history.filter(h =>
    (!courseId || String(h.course?.courseId) === courseId)
    && inDateRange(h.startTime ?? h.registeredAt, from, to)), [courseId, from, history, to]);

  const rows = isHistory ? filteredHistory : filteredContests;
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filtersActive = Boolean((!isHistory && status) || courseId || from || to);

  const chooseTab = (next: string) => { setTab(next); setPage(1); setStatus(''); setCourseId(''); };
  const resetFilters = () => { setStatus(''); setCourseId(''); setFrom(''); setTo(''); setPage(1); };
  const open = (id: number) => navigate(`${ROUTES.studentContests}/${id}`);

  return <div className={`${STUDENT_PAGE_CLASS} space-y-6`}>
    <PageTitle title="Contests" subtitle="Join a contest, compete with other students, and claim your rewards." />
    <Tabs tabs={LIST_TABS} active={tab} onChange={chooseTab} variant="underline" />

    <section className="card p-4">
      <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${isHistory ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
        {courses.length > 0 && <Select aria-label="Course" value={courseId} onChange={v => { setCourseId(v); setPage(1); }}
          options={[{ label: 'All courses', value: '' }, ...courses.map(c => ({ label: c.title, value: String(c.courseId) }))]} maxVisibleOptions={8} />}
        {!isHistory && <Select aria-label="Status" value={status} onChange={v => { setStatus(v); setPage(1); }} options={STATUS_OPTIONS} />}
        <Input aria-label="Starts from" type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} />
        <Input aria-label="Starts until" type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} />
      </div>
      {filtersActive && <button type="button" onClick={resetFilters} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <Icon.X className="h-3.5 w-3.5" /> Clear filters
      </button>}
    </section>

    {error ? <LoadError message={error} onRetry={() => setReload(v => v + 1)} />
      : loading ? <div className="card p-8 text-sm text-content-subtle">Loading contests…</div>
      : rows.length === 0 ? <div className="card"><EmptyState icon={<Icon.Trophy className="w-7 h-7" />}
          title={filtersActive ? 'No contests match your filters' : isHistory ? 'No contest history' : 'No contests yet'}
          message={filtersActive ? 'Try another course, status or date.' : isHistory ? 'Contests you join will appear here.' : 'New contests will appear here.'} /></div>
      : isHistory ? (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-line">{(pageRows as ContestHistoryItem[]).map(item => <li key={item.contestId} className="flex flex-wrap items-center gap-3 px-4 py-4">
            <Icon.Trophy className="h-5 w-5 text-warning" />
            <div className="min-w-[12rem] flex-1">
              <p className="text-sm font-semibold text-content">{item.title}</p>
              <p className="text-xs text-content-subtle">{item.course ? `${item.course.title} · ` : ''}{item.startTime ? `Starts ${formatDate(item.startTime)}` : `Joined ${formatDate(item.registeredAt)}`}</p>
            </div>
            <StatusBadge status={item.status} />
            <span className="text-sm text-content-secondary">{item.rank != null ? `Rank #${item.rank}` : '—'} · {item.score ?? 'No score'}</span>
            <Button size="sm" variant="outline" onClick={() => open(item.contestId)}>Details</Button>
          </li>)}</ul>
          <div className="border-t border-line"><Pagination page={page} total={rows.length} perPage={PAGE_SIZE} onChange={setPage} unit="contests" /></div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
            {(pageRows as StudentContest[]).map(contest => <ContestCard key={contest.contestId} contest={contest} onOpen={() => open(contest.contestId)} />)}
          </div>
          <div className="card"><Pagination page={page} total={rows.length} perPage={PAGE_SIZE} onChange={setPage} unit="contests" /></div>
        </>
      )}
  </div>;
}

const STATUS_ACCENT: Record<ContestStatus, string> = {
  UPCOMING: 'bg-primary',
  ONGOING: 'bg-success',
  ENDED: 'bg-line',
  CANCELLED: 'bg-danger',
};

function startLabel(status: ContestStatus) {
  return status === 'UPCOMING' ? 'Starts' : 'Started';
}

function ctaFor(contest: StudentContest): { label: string; variant: 'primary' | 'outline' } {
  if (contest.status === 'ONGOING') {
    return contest.isRegistered ? { label: 'Open contest', variant: 'primary' } : { label: 'View details', variant: 'outline' };
  }
  if (contest.status === 'UPCOMING') {
    return contest.isRegistered ? { label: 'View contest', variant: 'outline' } : { label: 'View & register', variant: 'primary' };
  }
  if (contest.status === 'CANCELLED') return { label: 'View details', variant: 'outline' };
  return { label: contest.isRegistered ? 'View results' : 'View leaderboard', variant: 'outline' };
}

function ContestCard({ contest, onOpen }: { contest: StudentContest; onOpen: () => void }) {
  const cta = ctaFor(contest);
  const hasLimit = Boolean(contest.maxParticipants);
  const fillPct = hasLimit ? Math.min(100, Math.round((contest.registeredCount / contest.maxParticipants!) * 100)) : 0;
  const isFull = hasLimit && contest.registeredCount >= contest.maxParticipants!;

  return <article className="card group relative flex flex-col overflow-hidden transition-shadow duration-200 hover:shadow-md focus-within:shadow-md">
    <div className={`h-1 w-full ${STATUS_ACCENT[contest.status] ?? 'bg-line'}`} aria-hidden="true" />

    <div className="relative">
      {contest.bannerUrl
        ? <img src={contest.bannerUrl} alt="" className="h-36 w-full object-cover" />
        : <div className="flex h-36 items-center justify-center bg-gradient-to-br from-primary-light to-surface-muted text-primary">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface shadow-sm"><Icon.Trophy className="h-7 w-7" /></span>
          </div>}
      <div className="absolute left-3 top-3 rounded-full bg-surface/90 p-0.5 shadow-sm backdrop-blur"><StatusBadge status={contest.status} /></div>
      {contest.isRegistered && <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-success px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
        <Icon.Check className="h-3.5 w-3.5" />Registered
      </span>}
    </div>

    <div className="flex flex-1 flex-col gap-3 p-4">
      <div className="space-y-1.5">
        <h2 className="line-clamp-2 min-h-[2.75rem] text-base font-semibold leading-snug text-content" title={contest.title}>{contest.title}</h2>
        {contest.course && <p className="truncate text-xs font-medium text-primary">{contest.course.title}</p>}
        <p className="line-clamp-2 min-h-10 text-sm leading-5 text-content-soft">
          {contest.description || 'Join this contest to test your skills and compete with other students.'}
        </p>
      </div>

      <div className="space-y-2 border-t border-line-soft pt-3 text-sm text-content-secondary">
        <p className="flex items-center gap-2">
          <Icon.Calendar className="h-4 w-4 flex-shrink-0 text-primary" />
          <span className="text-content-subtle">{startLabel(contest.status)}</span>
          <span className="font-medium text-content">{formatDate(contest.startTime)}</span>
        </p>
        <p className="flex items-center gap-2">
          <Icon.Clock className="h-4 w-4 flex-shrink-0 text-primary" />
          <span className="tabular-nums">{contest.durationMinutes} min</span>
          <span className="text-line" aria-hidden="true">|</span>
          <span className="tabular-nums">{contest.questionCount} questions</span>
        </p>
      </div>

      <div className="mt-auto space-y-3 pt-1">
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-content-subtle">{hasLimit ? 'Spots filled' : 'Participants'}</span>
            <span className={`font-semibold tabular-nums ${isFull ? 'text-danger' : 'text-content-secondary'}`}>
              {hasLimit ? `${contest.registeredCount} / ${contest.maxParticipants}${isFull ? ' · Full' : ''}` : contest.registeredCount}
            </span>
          </div>
          {hasLimit && <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
            role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={fillPct} aria-label="Registration capacity"
          >
            <div className={`h-full rounded-full transition-[width] duration-300 ${isFull ? 'bg-danger' : 'bg-primary'}`} style={{ width: `${fillPct}%` }} />
          </div>}
        </div>
        <Button className="w-full" variant={cta.variant} onClick={onOpen}>{cta.label}</Button>
      </div>
    </div>
  </article>;
}

// ------------------------------------------------------------- detail

/**
 * The student's own prize. CT-05 currently returns the prizes of every rank, so pick the one of the
 * student's rank: by `rankPosition` once the BE sends it, else by position (prizes are stored rank 1, 2, 3, …).
 */
function ownReward(result: ContestResult | null): ContestReward | null {
  if (!result?.rank || !result.rewards.length) return null;
  if (result.rewards.some(r => r.rankPosition != null)) return result.rewards.find(r => r.rankPosition === result.rank) ?? null;
  return result.rewards[result.rank - 1] ?? null;
}

function prizeText(prize: ContestPrize | null | undefined) {
  if (!prize) return null;
  if (prize.value == null) return prize.discountCode;
  return `${prize.discountCode} · ${prize.discountType === 'PERCENT' ? `${prize.value}% off` : `${formatVnd(prize.value)} off`}`;
}

function ContestDetail({ contestId }: { contestId: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [contest, setContest] = useState<StudentContest | null>(null);
  const [leaderboard, setLeaderboard] = useState<ContestLeaderboard | null>(null);
  const [result, setResult] = useState<ContestResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'register' | 'start' | number | null>(null);

  /** silent: background refresh — a failure keeps what is on screen. */
  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    try {
      const [contestRows, historyRows] = await Promise.all([
        studentContestService.getAllContests(),
        studentContestService.getAllHistory().catch(() => null),
      ]);
      const current = contestRows.find(item => String(item.contestId) === contestId);
      if (!current) throw new Error('Contest not found.');
      const joined = Boolean(current.isRegistered || historyRows?.some(item => String(item.contestId) === contestId));
      const next = { ...current, isRegistered: joined };
      const [leaderboardData, resultData] = await Promise.all([
        studentContestService.getLeaderboard(contestId).catch(() => null),
        next.status === 'ENDED' && joined ? studentContestService.getResult(contestId).catch(() => null) : Promise.resolve(null),
      ]);
      setContest(next);
      setLeaderboard(leaderboardData);
      setResult(resultData);
    } catch (err) {
      if (!silent) {
        const message = getApiErrorMessage(err, 'Failed to load this contest.');
        setError(message);
        toast.error(message);
      }
    } finally {
      setLoading(false);
    }
  }, [contestId, toast]);

  useEffect(() => { setLoading(true); void load(); }, [load]);

  // Live numbers every 30 s while the tab is visible and nothing is in flight.
  useEffect(() => {
    if (busy !== null) return;
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') void load(true); }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [busy, load]);

  const register = async () => {
    setBusy('register');
    try {
      const response = await studentContestService.register(contestId);
      setContest(current => current ? { ...current, isRegistered: true, registeredCount: response.registeredCount } : current);
      toast.success('You are registered for this contest.');
    } catch (err) { toast.error(getApiErrorMessage(err, 'Could not register for this contest.')); }
    finally { setBusy(null); }
  };
  const start = async () => {
    setBusy('start');
    try {
      const attempt = await studentContestService.start(contestId);
      navigate(`${ROUTES.studentExam}?attemptId=${encodeURIComponent(String(attempt.attemptId))}`, { state: { contestId: Number(contestId), endsAt: attempt.endsAt } });
    } catch (err) { toast.error(getApiErrorMessage(err, 'Could not start the contest.')); setBusy(null); }
  };
  const claim = async (rewardId: number) => {
    setBusy(rewardId);
    try {
      const claimed = await studentContestService.claimReward(contestId, rewardId);
      setResult(current => current ? { ...current, rewards: current.rewards.map(reward => reward.rewardId === rewardId ? { ...reward, ...claimed, claimed: true } : reward) } : current);
      toast.success('Reward claimed.');
    } catch (err) { toast.error(getApiErrorMessage(err, 'Could not claim this reward.')); }
    finally { setBusy(null); }
  };

  if (loading) return <div className={`${STUDENT_PAGE_CLASS}`}><div className="card p-8 text-sm text-content-subtle">Loading contest…</div></div>;
  if (error || !contest) return <div className={`${STUDENT_PAGE_CLASS} space-y-4`}><Button variant="ghost" onClick={() => navigate(ROUTES.studentContests)}>← Contests</Button><LoadError message={error ?? 'Contest not found.'} onRetry={() => { setLoading(true); void load(); }} /></div>;

  const prizes = contest.rewards ?? [];
  const certificate = result?.certificateUrl ?? result?.rewards.find(reward => reward.rewardType === 'CERTIFICATE')?.certificateUrl ?? null;

  return <div className={`${STUDENT_PAGE_CLASS} space-y-6`}>
    <Button variant="ghost" onClick={() => navigate(ROUTES.studentContests)}>← Contests</Button>
    <section className="card overflow-hidden">
      {contest.bannerUrl && <img src={contest.bannerUrl} alt="" className="max-h-72 w-full object-cover" />}
      <div className="space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><StatusBadge status={contest.status} /><h1 className="mt-2 text-2xl font-bold text-content">{contest.title}</h1>
          {contest.course && <p className="mt-1 text-sm text-content-soft">{contest.course.title}</p>}</div>
          {contest.status === 'UPCOMING' && !contest.isRegistered && <Button onClick={register} loading={busy === 'register'} disabled={busy !== null}>Register</Button>}
          {contest.status === 'ONGOING' && contest.isRegistered && <Button icon={<Icon.Zap className="h-4 w-4" />} onClick={start} loading={busy === 'start'} disabled={busy !== null}>Start contest</Button>}
          {contest.isRegistered && (contest.status === 'UPCOMING' || contest.status === 'ONGOING') && <Badge variant="success">You’re registered</Badge>}
        </div>
        {contest.description && <p className="whitespace-pre-line text-sm text-content-soft">{contest.description}</p>}
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-4 text-sm text-content-secondary">
          <span><Icon.Calendar className="mr-1.5 inline h-4 w-4" />Starts {formatDate(contest.startTime)}</span>
          <span><Icon.Clock className="mr-1.5 inline h-4 w-4" />{contest.durationMinutes} minutes</span>
          <span>{contest.questionCount} questions</span>
          <span>{contest.registeredCount}{contest.maxParticipants ? ` / ${contest.maxParticipants}` : ''} participants</span>
        </div>
      </div>
    </section>

    {(contest.status === 'UPCOMING' || contest.status === 'ONGOING') && prizes.length > 0 && <section className="card overflow-hidden">
      <div className="border-b border-line p-4"><h2 className="font-semibold text-content">Prizes</h2><p className="mt-1 text-xs text-content-subtle">Finish in one of these ranks to win.</p></div>
      <ul className="divide-y divide-line">{[...prizes].sort((a, b) => a.rankPosition - b.rankPosition).map(prize => <li key={prize.rankPosition} className="flex items-center gap-3 px-4 py-3 text-sm">
        <span className="flex h-8 w-10 items-center justify-center rounded-lg bg-surface-muted font-semibold text-content">#{prize.rankPosition}</span>
        <Icon.Award className="h-4 w-4 text-warning" />
        <span className="font-medium text-content">{prizeText(prize)}</span>
      </li>)}</ul>
    </section>}

    <Results contest={contest} leaderboard={leaderboard} result={result} busy={busy} onClaim={claim} />
    {certificate && <a href={certificate} target="_blank" rel="noreferrer" className="inline-block text-sm font-medium text-primary hover:underline">View certificate</a>}
  </div>;
}

/** Your result and the leaderboard in one table: rank, student, score, prize, and the claim button on your own row. */
function Results({ contest, leaderboard, result, busy, onClaim }: {
  contest: StudentContest;
  leaderboard: ContestLeaderboard | null;
  result: ContestResult | null;
  busy: 'register' | 'start' | number | null;
  onClaim: (rewardId: number) => void;
}) {
  const reward = ownReward(result);
  const rows = leaderboard?.rows ?? [];
  const ownInTable = rows.some(row => row.isCurrentUser);

  const action = (isMine: boolean) => {
    if (!isMine || !reward) return <span className="text-content-soft">—</span>;
    if (reward.claimed) return <Badge variant="success">Claimed</Badge>;
    if (reward.claimable === false) return <span className="text-xs text-content-soft">Not available yet</span>;
    return <Button size="sm" onClick={() => onClaim(reward.rewardId)} loading={busy === reward.rewardId} disabled={busy !== null}>Claim reward</Button>;
  };

  return <section className="card overflow-hidden">
    <div className="border-b border-line p-4">
      <h2 className="font-semibold text-content">Leaderboard</h2>
      <p className="mt-1 text-xs text-content-subtle">
        {result ? `Your rank #${result.rank ?? '—'} of ${result.totalParticipants} · Score ${result.score ?? '—'} · ` : ''}
        Updated {leaderboard?.generatedAt ? formatDate(leaderboard.generatedAt) : '—'} · refreshes every 30 seconds
      </p>
    </div>
    {!rows.length && !result ? <p className="p-5 text-sm text-content-soft">{!leaderboard ? 'Leaderboard is temporarily unavailable.' : contest.status === 'CANCELLED' ? 'This contest was cancelled.' : contest.status !== 'ENDED' ? 'The leaderboard will open after the contest ends.' : 'No leaderboard entries yet.'}</p> : <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="bg-surface-muted text-xs text-content-subtle"><tr>
          <th className="px-4 py-3">Rank</th><th className="px-4 py-3">Student</th><th className="px-4 py-3 text-right">Score</th><th className="px-4 py-3">Prize</th><th className="px-4 py-3 text-right">Reward</th>
        </tr></thead>
        <tbody className="divide-y divide-line">
          {rows.map(row => {
            const mine = row.isCurrentUser;
            const prize = prizeText(row.reward) ?? (mine && reward ? reward.value : null);
            return <tr key={`${row.rank}-${row.userId}`} className={mine ? 'bg-primary-light/50' : ''}>
              <td className="px-4 py-3 font-semibold">#{row.rank}</td>
              <td className="px-4 py-3"><div className="flex items-center gap-2"><Avatar name={row.studentName || '?'} src={row.avatarUrl ?? undefined} size="sm" /><span className={mine ? 'font-semibold' : ''}>{row.studentName}{mine ? ' (You)' : ''}</span></div></td>
              <td className="px-4 py-3 text-right tabular-nums">{row.score}</td>
              <td className="px-4 py-3">{prize ?? <span className="text-content-soft">—</span>}</td>
              <td className="px-4 py-3 text-right">{action(mine)}</td>
            </tr>;
          })}
          {result && !ownInTable && <tr className="bg-primary-light/50">
            <td className="px-4 py-3 font-semibold">{result.rank ? `#${result.rank}` : '—'}</td>
            <td className="px-4 py-3 font-semibold">You</td>
            <td className="px-4 py-3 text-right tabular-nums">{result.score ?? '—'}</td>
            <td className="px-4 py-3">{reward?.value ?? <span className="text-content-soft">—</span>}</td>
            <td className="px-4 py-3 text-right">{action(true)}</td>
          </tr>}
        </tbody>
      </table>
    </div>}
  </section>;
}

function StatusBadge({ status }: { status: ContestStatus }) {
  const variant = status === 'UPCOMING' ? 'info' : status === 'ONGOING' ? 'success' : status === 'CANCELLED' ? 'danger' : 'default';
  return <Badge variant={variant}>{STATUS_LABEL[status] ?? status}</Badge>;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
