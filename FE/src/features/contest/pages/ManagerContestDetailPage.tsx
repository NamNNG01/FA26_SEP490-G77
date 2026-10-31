import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Alert } from '@/components/ui/Alert';
import { Tabs } from '@/components/ui/Tabs';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Spinner } from '@/components/ui/Spinner';
import { Avatar } from '@/components/ui/Avatar';
import { Table, type TableColumn } from '@/components/ui/Table';
import { Icon } from '@/assets/icons';
import { useToast } from '@/components/ui/ToastHost';
import { getApiErrorMessage } from '@/utils/apiError';
import { ROUTES, managerContestEditPath } from '@/app/routes';
import type { PageResponse } from '@/services/course.service';
import {
  managerContestService,
  contestErrorCode,
  contestErrorIssues,
  CANCEL_REASON_MAX,
  type ContestDetail,
  type LeaderboardRow,
  type PrizeIssue,
} from '@/services/managerContest.service';
import {
  CONTEST_ERROR_TEXT,
  ContestStatusBadge,
  Info,
  IssueList,
  RankingBadge,
  formatDateTime,
  formatDuration,
  prizeValue,
} from '../components/contestUi';
import { PayRewardsDialog } from '../components/PayRewardsDialog';

const TABS = ['Overview', 'Leaderboard'];
const LEADERBOARD_SIZE = 20;

const errorText = (err: unknown, fallback: string) => {
  const code = contestErrorCode(err);
  return (code && CONTEST_ERROR_TEXT[code]) || getApiErrorMessage(err, fallback);
};

export function ManagerContestDetailPage() {
  const { contestId } = useParams<{ contestId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [contest, setContest] = useState<ContestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState(TABS[0]);
  const [publishing, setPublishing] = useState(false);
  const [publishIssues, setPublishIssues] = useState<{ message: string; issues: PrizeIssue[] } | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    if (!contestId) return;
    setLoadError(null);
    try {
      setContest(await managerContestService.get(contestId));
    } catch (err) {
      setLoadError(errorText(err, 'Could not load the contest.'));
    } finally {
      setLoading(false);
    }
  }, [contestId]);
  useEffect(() => { setLoading(true); void load(); }, [load]);

  const publish = async () => {
    if (!contest) return;
    setPublishing(true);
    setPublishIssues(null);
    try {
      setContest(await managerContestService.publish(contest.contestId));
      toast.success('Contest published.');
    } catch (err) {
      const issues = contestErrorIssues(err);
      const message = errorText(err, 'Could not publish the contest.');
      if (issues.length || contestErrorCode(err)) setPublishIssues({ message, issues });
      else toast.error(message);
    } finally {
      setPublishing(false);
    }
  };

  const needsReason = (contest?.participantCount ?? 0) > 0;
  const cancel = async () => {
    if (!contest) return;
    if (needsReason && !cancelReason.trim()) { toast.error('A reason is required because students already joined.'); return; }
    setWorking(true);
    try {
      setContest(await managerContestService.cancel(contest.contestId, cancelReason));
      setCancelOpen(false);
      toast.success('Contest cancelled. Participants were notified.');
    } catch (err) {
      toast.error(errorText(err, 'Could not cancel the contest.'));
    } finally {
      setWorking(false);
    }
  };

  const remove = async () => {
    if (!contest) return;
    setWorking(true);
    try {
      await managerContestService.remove(contest.contestId);
      toast.success('Contest deleted.');
      navigate(ROUTES.managerContests);
    } catch (err) {
      toast.error(errorText(err, 'Could not delete the contest.'));
      setWorking(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (loadError || !contest) {
    return (
      <div className="space-y-4 py-6">
        <Alert type="error" message={loadError ?? 'Contest not found.'} />
        <Button variant="outline" onClick={() => navigate(ROUTES.managerContests)}>Back to contests</Button>
      </div>
    );
  }

  const c = contest;
  const blocked = c.canPayReward && c.payBlockers.length > 0;

  return (
    <div className="space-y-5 py-6">
      <Breadcrumb items={[{ label: 'Contests', onClick: () => navigate(ROUTES.managerContests) }, { label: c.title }]} />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-bold text-content">{c.title}</h1>
            <ContestStatusBadge status={c.status} />
            <RankingBadge ranking={c.rankingStatus} />
          </div>
          <p className="mt-1 text-sm text-content-soft">{c.course?.title ?? '—'} · {c.exam.title}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {c.canEdit && <Button variant="outline" icon={<Icon.Edit className="h-4 w-4" />} onClick={() => navigate(managerContestEditPath(c.contestId))}>Edit</Button>}
          {c.status === 'DRAFT' && <Button variant="outline" icon={<Icon.Trash className="h-4 w-4" />} onClick={() => setDeleteOpen(true)}>Delete</Button>}
          {c.canCancel && <Button variant="outline" icon={<Icon.XCircle className="h-4 w-4" />} onClick={() => { setCancelReason(''); setCancelOpen(true); }}>Cancel contest</Button>}
          {c.canPublish && <Button loading={publishing} disabled={publishing} icon={<Icon.Zap className="h-4 w-4" />} onClick={() => void publish()}>Publish</Button>}
          {c.canPayReward && <Button disabled={blocked} icon={<Icon.Award className="h-4 w-4" />} onClick={() => setPaying(true)}>Pay rewards</Button>}
        </div>
      </header>

      {publishIssues && (
        <div className="space-y-2">
          <Alert type="error" title="Could not publish" message={publishIssues.message} />
          {publishIssues.issues.length > 0 && <div className="card p-3"><IssueList issues={publishIssues.issues} /></div>}
        </div>
      )}
      {blocked && (
        <div className="space-y-2 rounded-[10px] border border-warning-line bg-warning-light p-4">
          <p className="text-sm font-semibold text-warning-strong">Rewards cannot be paid yet</p>
          <IssueList issues={c.payBlockers} />
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {c.canEdit && <Button size="sm" variant="outline" onClick={() => navigate(managerContestEditPath(c.contestId))}>Change prize discounts</Button>}
            <Button size="sm" variant="ghost" icon={<Icon.RefreshCw className="h-4 w-4" />} onClick={() => void load()}>Check again</Button>
            <span className="text-xs text-content-soft">Or ask an admin to reactivate or extend the discount.</span>
          </div>
        </div>
      )}
      {c.status === 'PENDING_REWARD' && c.rankingStatus === 'CALCULATING' && (
        <Alert type="info" message="Ranks are being calculated. Rewards can be paid once every attempt is submitted and graded." />
      )}
      {c.status === 'CANCELLED' && (
        <Alert type="warning" title={`Cancelled ${formatDateTime(c.cancelledAt)}`} message={c.cancelReason || 'No reason given.'} />
      )}
      {c.status === 'REWARDED' && (
        <Alert type="success" message={`Rewards paid ${formatDateTime(c.rewardedAt)}${c.rewardedBy ? ` by ${c.rewardedBy.fullName}` : ''}.`} />
      )}

      <Tabs tabs={TABS} active={tab} onChange={setTab} variant="underline" />

      {tab === 'Overview' ? <Overview contest={c} /> : <Leaderboard contest={c} />}

      <Modal open={cancelOpen} onClose={() => !working && setCancelOpen(false)} title="Cancel this contest?" dismissible={!working}
        footer={<>
          <Button variant="outline" disabled={working} onClick={() => setCancelOpen(false)}>Keep contest</Button>
          <Button variant="danger" loading={working} disabled={working || (needsReason && !cancelReason.trim())} onClick={() => void cancel()}>Cancel contest</Button>
        </>}>
        <div className="space-y-3">
          <p className="text-sm text-content-secondary">
            No prizes will be granted{c.participantCount ? ` and ${c.participantCount} participant${c.participantCount === 1 ? '' : 's'} will be notified` : ''}. This cannot be undone.
          </p>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-content-secondary">
            Reason{needsReason ? ' (required)' : ' (optional)'}
            <textarea className="min-h-20 rounded-[10px] border border-line bg-surface px-3 py-2 text-sm font-normal text-content focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
              maxLength={CANCEL_REASON_MAX} value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="e.g. Error in the exam" />
          </label>
        </div>
      </Modal>

      <Modal open={deleteOpen} onClose={() => !working && setDeleteOpen(false)} title="Delete draft?" dismissible={!working}
        footer={<>
          <Button variant="outline" disabled={working} onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button variant="danger" loading={working} disabled={working} onClick={() => void remove()}>Delete</Button>
        </>}>
        <p className="text-sm text-content-secondary">Delete the draft <strong>{c.title}</strong>? Its exam becomes available for other contests.</p>
      </Modal>

      <PayRewardsDialog contest={paying ? c : null} blockers={c.payBlockers} onClose={() => setPaying(false)} onPaid={() => void load()} />
    </div>
  );
}

function Overview({ contest: c }: { contest: ContestDetail }) {
  const ranked = c.rankingStatus === 'READY';
  return (
    <div className="space-y-5">
      <section className="card grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
        <Info label="Starts">{formatDateTime(c.startTime)}</Info>
        <Info label="Ends">{formatDateTime(c.endTime)}</Info>
        <Info label="Participants">{c.participantCount.toLocaleString()}</Info>
        <Info label="Prize ranks">{c.topN}</Info>
        <Info label="Exam">{c.exam.title}</Info>
        <Info label="Duration">{c.exam.durationMinutes} min</Info>
        <Info label="Questions">{c.exam.questionCount}</Info>
        <Info label="Max score">{c.exam.maxScore ?? '—'}</Info>
        <Info label="Ranked">{formatDateTime(c.rankedAt)}</Info>
        <Info label="Rewarded">{formatDateTime(c.rewardedAt)}</Info>
        {c.description && <div className="col-span-2 sm:col-span-4"><Info label="Description"><p className="whitespace-pre-line font-normal text-content-secondary">{c.description}</p></Info></div>}
      </section>

      <section className="card overflow-hidden">
        <div className="border-b border-line-soft px-5 py-3">
          <h2 className="font-semibold text-content">Prizes</h2>
          {!ranked && <p className="text-xs text-content-soft">Winners appear once the contest has ended and ranks are calculated.</p>}
        </div>
        {c.rewards.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-content-soft">No prizes yet. Add at least one before publishing.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-surface-muted text-xs uppercase text-content-soft">
                <tr><th className="px-5 py-2.5">Rank</th><th className="px-5 py-2.5">Discount</th><th className="px-5 py-2.5">Validity</th><th className="px-5 py-2.5">Winner</th><th className="px-5 py-2.5">Granted</th></tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {c.rewards.map(r => (
                  <tr key={r.rewardId}>
                    <td className="px-5 py-3 font-semibold text-content">#{r.rankPosition}</td>
                    <td className="px-5 py-3"><p className="font-medium text-content">{r.discount.code}</p><p className="text-xs text-content-soft">{r.discount.name} · {prizeValue(r.discount.discountType, r.discount.value)}</p></td>
                    <td className="px-5 py-3"><Badge variant={r.discount.validity === 'ACTIVE' ? 'success' : r.discount.validity === 'UPCOMING' ? 'info' : 'warning'}>{r.discount.validity}</Badge></td>
                    <td className="px-5 py-3">{r.winner ? <span>{r.winner.fullName} <span className="text-xs text-content-soft">· {r.winner.score}</span></span> : <span className="text-content-soft">{ranked ? 'Nobody at this rank' : '—'}</span>}</td>
                    <td className="px-5 py-3">{r.granted ? <span className="inline-flex items-center gap-1 text-success"><Icon.CheckCircle className="h-4 w-4" /> Yes</span> : <span className="text-content-soft">No</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Leaderboard({ contest }: { contest: ContestDetail }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PageResponse<LeaderboardRow> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = contest.rankingStatus === 'READY';

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    managerContestService.leaderboard(contest.contestId, page - 1, LEADERBOARD_SIZE)
      .then(res => { if (!cancelled) setData(res); })
      .catch(err => { if (!cancelled) setError(errorText(err, 'Could not load the leaderboard.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [contest.contestId, contest.rewardedAt, page, ready]);

  if (!ready) {
    const message = contest.status === 'CANCELLED' ? 'The contest was cancelled before it was ranked.'
      : contest.rankingStatus === 'CALCULATING' ? CONTEST_ERROR_TEXT.RANKING_NOT_READY
      : 'The leaderboard opens after the contest ends and ranks are calculated.';
    return <div className="card px-5 py-10 text-center text-sm text-content-soft">{message}</div>;
  }
  if (error) return <Alert type="error" message={error} />;

  const columns: TableColumn[] = [
    { key: 'rank', label: 'Rank', width: '72px', render: row => <span className="font-semibold text-content">#{Number(row.rank)}</span> },
    {
      key: 'user', label: 'Student',
      render: row => {
        const r = row as unknown as LeaderboardRow;
        return <div className="flex items-center gap-2"><Avatar name={r.user.fullName} src={r.user.avatarUrl ?? undefined} size="sm" /><span className="font-medium text-content">{r.user.fullName}</span></div>;
      },
    },
    { key: 'score', label: 'Score', render: row => <span className="tabular-nums">{row.score == null ? '—' : String(row.score)}</span> },
    { key: 'timeSpentSeconds', label: 'Time', render: row => <span className="tabular-nums text-content-secondary">{formatDuration(row.timeSpentSeconds as number | null)}</span> },
    { key: 'submittedAt', label: 'Submitted', render: row => <span className="whitespace-nowrap text-content-secondary">{formatDateTime(row.submittedAt as string | null)}</span> },
    {
      key: 'reward', label: 'Prize',
      render: row => {
        const r = row as unknown as LeaderboardRow;
        if (!r.reward) return <span className="text-content-soft">—</span>;
        return (
          <div className="whitespace-nowrap">
            <p className="font-medium text-content">{r.reward.code} <span className="text-xs font-normal text-content-soft">· {prizeValue(r.reward.discountType, r.reward.value)}</span></p>
            <p className="text-xs">{r.rewardGranted ? <span className="text-success">Granted {formatDateTime(r.rewardGrantedAt)}</span> : <span className="text-content-soft">Not granted yet</span>}</p>
          </div>
        );
      },
    },
  ];

  return (
    <div className={`card overflow-hidden transition-opacity ${loading && data ? 'opacity-60' : ''}`} aria-busy={loading}>
      <Table columns={columns} data={(data?.content ?? []).map(r => ({ ...r, id: `${r.rank}-${r.user.userId}` })) as unknown as Record<string, unknown>[]}
        perPage={LEADERBOARD_SIZE} unit="participants"
        serverPagination={{ page, total: data?.totalElements ?? 0, onChange: setPage }}
        emptyState={loading ? 'Loading leaderboard…' : 'Nobody submitted this contest.'} />
    </div>
  );
}
