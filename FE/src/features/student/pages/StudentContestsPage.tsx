import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Card';
import { Pagination } from '@/components/ui/Pagination';
import { Tabs } from '@/components/ui/Tabs';
import { Icon } from '@/assets/icons';
import { ROUTES } from '@/app/routes';
import {
  studentContestService,
  type ContestHistoryItem,
  type ContestLeaderboard,
  type ContestResult,
  type ContestStatus,
  type StudentContest,
} from '@/services/studentContest.service';
import { getApiErrorMessage } from '@/utils/apiError';
import { LoadError, PageTitle, STUDENT_PAGE_CLASS } from '../components/studentUi';

const PAGE_SIZE = 10;
const LIST_TABS = ['Upcoming', 'Ongoing', 'Ended', 'History'];
const STATUS_BY_TAB: Record<string, ContestStatus> = { Upcoming: 'UPCOMING', Ongoing: 'ONGOING', Ended: 'ENDED' };

export function StudentContestsPage() {
  const { contestId } = useParams<{ contestId: string }>();
  return contestId ? <ContestDetail contestId={contestId} /> : <ContestList />;
}

function ContestList() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('Upcoming');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<StudentContest[]>([]);
  const [history, setHistory] = useState<ContestHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const request = tab === 'History'
      ? studentContestService.getHistory({ page, size: PAGE_SIZE }).then(result => ({ kind: 'history' as const, result }))
      : Promise.all([
          studentContestService.getContests({ status: STATUS_BY_TAB[tab], page, size: PAGE_SIZE }),
          studentContestService.getHistory({ page: 0, size: 100 }).catch(() => null),
        ]).then(([contests, historyData]) => ({ kind: 'contests' as const, contests, historyData }));
    request.then(result => {
      if (cancelled) return;
      if (result.kind === 'history') {
        setHistory(result.result.content);
        setTotal(result.result.totalElements);
      } else {
        const registeredIds = new Set((result.historyData?.content ?? []).map(item => item.contestId));
        setRows(result.contests.content.map(contest => ({
          ...contest,
          isRegistered: Boolean(contest.isRegistered || registeredIds.has(contest.contestId)),
        })));
        setTotal(result.contests.totalElements);
      }
    }).catch(err => { if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load contests.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tab, page, reload]);

  const chooseTab = (next: string) => { setTab(next); setPage(0); };
  return <div className={`${STUDENT_PAGE_CLASS} space-y-6`}>
    <PageTitle title="Contests" subtitle="Join a contest, compete with other students, and claim your rewards." />
    <Tabs tabs={LIST_TABS} active={tab} onChange={chooseTab} variant="underline" />
    {error ? <LoadError message={error} onRetry={() => setReload(v => v + 1)} /> : loading ? <div className="card p-8 text-sm text-content-subtle">Loading contests…</div> : tab === 'History' ? (
      history.length === 0 ? <div className="card"><EmptyState icon={<Icon.Trophy className="w-7 h-7" />} title="No contest history" message="Contests you join will appear here." /></div> :
      <div className="card overflow-hidden">
        <ul className="divide-y divide-line">{history.map(item => <li key={item.contestId} className="flex flex-wrap items-center gap-3 px-4 py-4">
          <Icon.Trophy className="h-5 w-5 text-warning" />
          <div className="min-w-[12rem] flex-1"><p className="text-sm font-semibold text-content">{item.title}</p><p className="text-xs text-content-subtle">Joined {formatDate(item.registeredAt)}</p></div>
          <Badge variant={item.status === 'ENDED' ? 'default' : item.status === 'ONGOING' ? 'success' : 'info'}>{item.status}</Badge>
          <span className="text-sm text-content-secondary">{item.rank != null ? `Rank #${item.rank}` : '—'} · {item.score ?? 'No score'}</span>
          <Button size="sm" variant="outline" onClick={() => navigate(`${ROUTES.studentContests}/${item.contestId}`)}>Details</Button>
        </li>)}</ul>
        <div className="border-t border-line"><Pagination page={page + 1} total={total} perPage={PAGE_SIZE} onChange={p => setPage(p - 1)} unit="contests" /></div>
      </div>
    ) : rows.length === 0 ? <div className="card"><EmptyState icon={<Icon.Trophy className="w-7 h-7" />} title={`No ${tab.toLowerCase()} contests`} message="Check another tab to find contests you can join." /></div> : (
      <>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
          {rows.map(contest => <ContestCard key={contest.contestId} contest={contest} onOpen={() => navigate(`${ROUTES.studentContests}/${contest.contestId}`)} />)}
        </div>
        <div className="card"><Pagination page={page + 1} total={total} perPage={PAGE_SIZE} onChange={p => setPage(p - 1)} unit="contests" /></div>
      </>
    )}
  </div>;
}

const STATUS_ACCENT: Record<ContestStatus, string> = {
  UPCOMING: 'bg-primary',
  ONGOING: 'bg-success',
  ENDED: 'bg-line',
};

function startLabel(status: ContestStatus) {
  return status === 'UPCOMING' ? 'Starts' : status === 'ONGOING' ? 'Started' : 'Ended';
}

function ctaFor(contest: StudentContest): { label: string; variant: 'primary' | 'outline' } {
  if (contest.status === 'ONGOING') {
    return contest.isRegistered ? { label: 'Open contest', variant: 'primary' } : { label: 'View details', variant: 'outline' };
  }
  if (contest.status === 'UPCOMING') {
    return contest.isRegistered ? { label: 'View contest', variant: 'outline' } : { label: 'View & register', variant: 'primary' };
  }
  return { label: contest.isRegistered ? 'View results' : 'View leaderboard', variant: 'outline' };
}

function ContestCard({ contest, onOpen }: { contest: StudentContest; onOpen: () => void }) {
  const cta = ctaFor(contest);
  const hasLimit = Boolean(contest.maxParticipants);
  const fillPct = hasLimit ? Math.min(100, Math.round((contest.registeredCount / contest.maxParticipants!) * 100)) : 0;
  const isFull = hasLimit && contest.registeredCount >= contest.maxParticipants!;

  return <article className="card group relative flex flex-col overflow-hidden transition-shadow duration-200 hover:shadow-md focus-within:shadow-md">
    <div className={`h-1 w-full ${STATUS_ACCENT[contest.status]}`} aria-hidden="true" />

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

function ContestDetail({ contestId }: { contestId: string }) {
  const navigate = useNavigate();
  const [contest, setContest] = useState<StudentContest | null>(null);
  const [leaderboard, setLeaderboard] = useState<ContestLeaderboard | null>(null);
  const [result, setResult] = useState<ContestResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'register' | 'start' | number | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const load = async () => {
      try {
        const [pageData, historyData] = await Promise.all([
          studentContestService.getContests({ page: 0, size: 100 }),
          studentContestService.getHistory({ page: 0, size: 100 }).catch(() => null),
        ]);
        if (cancelled) return;
        const current = pageData.content.find(item => String(item.contestId) === contestId);
        if (!current) throw new Error('Contest not found.');
        const foundInHistory = Boolean(historyData?.content.some(item => String(item.contestId) === contestId));
        const contestWithRegistration = { ...current, isRegistered: Boolean(current.isRegistered || foundInHistory) };
        setContest(contestWithRegistration);
        const leaderboardPromise = studentContestService.getLeaderboard(contestId).catch(() => null);
        const resultPromise = contestWithRegistration.status === 'ENDED' && contestWithRegistration.isRegistered ? studentContestService.getResult(contestId).catch(() => null) : Promise.resolve(null);
        const [leaderboardData, resultData] = await Promise.all([leaderboardPromise, resultPromise]);
        if (cancelled) return;
        setLeaderboard(leaderboardData);
        setResult(resultData);
      } catch (err) {
        if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load this contest.'));
      } finally { if (!cancelled) setLoading(false); }
    };
    void load();
    return () => { cancelled = true; };
  }, [contestId, reload]);

  const register = async () => {
    setBusy('register'); setActionError(null);
    try {
      const response = await studentContestService.register(contestId);
      setContest(current => current ? { ...current, isRegistered: true, registeredCount: response.registeredCount } : current);
    }
    catch (err) { setActionError(getApiErrorMessage(err, 'Could not register for this contest.')); }
    finally { setBusy(null); }
  };
  const start = async () => {
    setBusy('start'); setActionError(null);
    try {
      const attempt = await studentContestService.start(contestId);
      navigate(`${ROUTES.studentExam}?attemptId=${encodeURIComponent(String(attempt.attemptId))}`, { state: { contestId: Number(contestId), endsAt: attempt.endsAt } });
    } catch (err) { setActionError(getApiErrorMessage(err, 'Could not start the contest.')); }
    finally { setBusy(null); }
  };
  const claim = async (rewardId: number) => {
    setBusy(rewardId); setActionError(null);
    try {
      const claimed = await studentContestService.claimReward(contestId, rewardId);
      setResult(current => current ? { ...current, rewards: current.rewards.map(reward => reward.rewardId === rewardId ? { ...reward, ...claimed } : reward) } : current);
    } catch (err) { setActionError(getApiErrorMessage(err, 'Could not claim this reward.')); }
    finally { setBusy(null); }
  };

  if (loading) return <div className={`${STUDENT_PAGE_CLASS}`}><div className="card p-8 text-sm text-content-subtle">Loading contest…</div></div>;
  if (error || !contest) return <div className={`${STUDENT_PAGE_CLASS} space-y-4`}><Button variant="ghost" onClick={() => navigate(ROUTES.studentContests)}>← Contests</Button><LoadError message={error ?? 'Contest not found.'} onRetry={() => setReload(v => v + 1)} /></div>;
  return <div className={`${STUDENT_PAGE_CLASS} space-y-6`}>
    <Button variant="ghost" onClick={() => navigate(ROUTES.studentContests)}>← Contests</Button>
    <section className="card overflow-hidden">
      {contest.bannerUrl && <img src={contest.bannerUrl} alt="" className="max-h-72 w-full object-cover" />}
      <div className="space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><StatusBadge status={contest.status} /><h1 className="mt-2 text-2xl font-bold text-content">{contest.title}</h1></div>
          {contest.status === 'UPCOMING' && !contest.isRegistered && <Button onClick={register} loading={busy === 'register'} disabled={busy !== null}>Register</Button>}
          {contest.status === 'ONGOING' && contest.isRegistered && <Button icon={<Icon.Zap className="h-4 w-4" />} onClick={start} loading={busy === 'start'} disabled={busy !== null}>Start contest</Button>}
          {contest.isRegistered && contest.status !== 'ENDED' && <Badge variant="success">You’re registered</Badge>}
        </div>
        {contest.description && <p className="whitespace-pre-line text-sm text-content-soft">{contest.description}</p>}
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-4 text-sm text-content-secondary">
          <span><Icon.Calendar className="mr-1.5 inline h-4 w-4" />Starts {formatDate(contest.startTime)}</span>
          <span><Icon.Clock className="mr-1.5 inline h-4 w-4" />{contest.durationMinutes} minutes</span>
          <span>{contest.questionCount} questions</span>
          <span>{contest.registeredCount}{contest.maxParticipants ? ` / ${contest.maxParticipants}` : ''} participants</span>
        </div>
        {actionError && <p role="alert" className="text-sm text-danger">{actionError}</p>}
      </div>
    </section>

    {contest.status === 'ENDED' && result && <section className="card p-5 space-y-4">
      <div><h2 className="text-lg font-semibold text-content">Your result</h2><p className="mt-1 text-sm text-content-secondary">Rank #{result.rank} of {result.totalParticipants} · Score {result.score}</p></div>
      {(result.certificateUrl || result.rewards.some(reward => reward.rewardType === 'CERTIFICATE' && reward.certificateUrl)) && <a href={result.certificateUrl ?? result.rewards.find(reward => reward.rewardType === 'CERTIFICATE')?.certificateUrl ?? undefined} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary hover:underline">View certificate</a>}
      <div className="space-y-3">{result.rewards.map(reward => <div key={reward.rewardId} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
        <Icon.Award className="h-5 w-5 text-warning" />
        <div className="min-w-[12rem] flex-1"><p className="text-sm font-semibold text-content">{reward.value}</p><p className="text-xs text-content-subtle">{reward.description} · {reward.rewardType.replace(/_/g, ' ')}</p></div>
        {reward.claimed ? <Badge variant="success">Claimed</Badge> : <Button size="sm" onClick={() => claim(reward.rewardId)} loading={busy === reward.rewardId} disabled={busy !== null}>Claim reward</Button>}
      </div>)}</div>
      {actionError && <p role="alert" className="text-sm text-danger">{actionError}</p>}
    </section>}

    <section className="card overflow-hidden">
      <div className="border-b border-line p-4"><h2 className="font-semibold text-content">Leaderboard</h2><p className="mt-1 text-xs text-content-subtle">Updated {leaderboard?.generatedAt ? formatDate(leaderboard.generatedAt) : '—'}</p></div>
      {!leaderboard?.rows.length ? <p className="p-5 text-sm text-content-soft">{!leaderboard ? 'Leaderboard is temporarily unavailable.' : contest.status !== 'ENDED' ? 'The leaderboard will open after the contest ends.' : 'No leaderboard entries yet.'}</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-surface-muted text-xs text-content-subtle"><tr><th className="px-4 py-3">Rank</th><th className="px-4 py-3">Student</th><th className="px-4 py-3 text-right">Score</th><th className="px-4 py-3">Completed</th></tr></thead><tbody className="divide-y divide-line">{leaderboard.rows.map(row => <tr key={`${row.rank}-${row.userId}`} className={row.isCurrentUser ? 'bg-primary-light/50 font-semibold' : ''}><td className="px-4 py-3">#{row.rank}</td><td className="px-4 py-3">{row.studentName}{row.isCurrentUser ? ' (You)' : ''}</td><td className="px-4 py-3 text-right">{row.score}</td><td className="px-4 py-3 text-content-subtle">{formatDate(row.completedAt)}</td></tr>)}</tbody></table></div>}
    </section>
  </div>;
}

function StatusBadge({ status }: { status: ContestStatus }) {
  const variant = status === 'UPCOMING' ? 'info' : status === 'ONGOING' ? 'success' : 'default';
  return <Badge variant={variant}>{status === 'UPCOMING' ? 'Upcoming' : status === 'ONGOING' ? 'Live now' : 'Ended'}</Badge>;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
