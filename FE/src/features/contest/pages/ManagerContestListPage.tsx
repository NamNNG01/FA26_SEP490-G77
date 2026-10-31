import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { Modal } from '@/components/ui/Modal';
import { Checkbox } from '@/components/ui/Checkbox';
import { Dropdown } from '@/components/ui/Dropdown';
import { Alert } from '@/components/ui/Alert';
import { Table, type TableColumn } from '@/components/ui/Table';
import { Icon } from '@/assets/icons';
import { useToast } from '@/components/ui/ToastHost';
import { getApiErrorMessage } from '@/utils/apiError';
import { ROUTES, managerContestEditPath, managerContestPath } from '@/app/routes';
import { courseService, type CourseSummaryItem, type PageResponse } from '@/services/course.service';
import {
  managerContestService,
  contestErrorCode,
  CONTEST_STATUSES,
  MAX_BATCH_PAY,
  type BatchPayResult,
  type ContestListItem,
  type ContestStatus,
} from '@/services/managerContest.service';
import { CONTEST_ERROR_TEXT, ContestStatusBadge, IssueList, RankingBadge, STATUS_LABEL, formatDateTime, hcmInputToIso } from '../components/contestUi';
import { PayRewardsDialog } from '../components/PayRewardsDialog';

const PAGE_SIZE = 10;
const EMPTY: PageResponse<ContestListItem> = { content: [], page: 0, size: PAGE_SIZE, totalElements: 0, totalPages: 0, first: true, last: true };
const SORTS = [
  { label: 'Start time · newest', value: 'startTime,desc' },
  { label: 'Start time · oldest', value: 'startTime,asc' },
  { label: 'End time · newest', value: 'endTime,desc' },
  { label: 'Title A–Z', value: 'title,asc' },
  { label: 'Recently created', value: 'createdAt,desc' },
];
const LOCKED: ContestStatus[] = ['REWARDED', 'CANCELLED'];

export function ManagerContestListPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [page, setPage] = useState(EMPTY);
  const [pageIndex, setPageIndex] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [statuses, setStatuses] = useState<ContestStatus[]>([]);
  const [courseId, setCourseId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState(SORTS[0].value);
  const [courses, setCourses] = useState<CourseSummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Payable contests picked for API 10, kept across pages (id → title). */
  const [selected, setSelected] = useState<Map<number, string>>(new Map());
  const [batchConfirm, setBatchConfirm] = useState(false);
  const [batchPaying, setBatchPaying] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchPayResult | null>(null);
  const [paying, setPaying] = useState<ContestListItem | null>(null);

  /** keyword, sent 300 ms after the last keystroke. */
  const [search, setSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearch(keyword.trim()), 300);
    return () => clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    courseService.getCourses({ size: 100 })
      .then(res => setCourses(res.content))
      .catch(() => setCourses([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPage(await managerContestService.list({
        keyword: search, status: statuses, courseId: courseId ? Number(courseId) : undefined,
        from: hcmInputToIso(from ? `${from}T00:00` : '') ?? undefined,
        to: hcmInputToIso(to ? `${to}T23:59` : '') ?? undefined,
        sort, page: pageIndex - 1, size: PAGE_SIZE,
      }));
    } catch (err) {
      const code = contestErrorCode(err);
      setError((code && CONTEST_ERROR_TEXT[code]) || getApiErrorMessage(err, 'Could not load contests.'));
      setPage(EMPTY);
    } finally {
      setLoading(false);
    }
  }, [courseId, from, search, pageIndex, sort, statuses, to]);
  useEffect(() => { void load(); }, [load]);

  const resetPage = () => setPageIndex(1);
  const filtersActive = keyword !== '' || statuses.length > 0 || courseId !== '' || from !== '' || to !== '';
  const resetFilters = () => { setKeyword(''); setStatuses([]); setCourseId(''); setFrom(''); setTo(''); resetPage(); };

  const toggle = (c: ContestListItem) => {
    if (!selected.has(c.contestId) && selected.size >= MAX_BATCH_PAY) {
      toast.warning(`Pay at most ${MAX_BATCH_PAY} contests at a time.`);
      return;
    }
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(c.contestId)) next.delete(c.contestId);
      else next.set(c.contestId, c.title);
      return next;
    });
  };
  const payableOnPage = page.content.filter(c => c.canPayReward);
  const allOnPage = payableOnPage.length > 0 && payableOnPage.every(c => selected.has(c.contestId));
  const toggleAllOnPage = () => setSelected(prev => {
    const next = new Map(prev);
    if (allOnPage) payableOnPage.forEach(c => next.delete(c.contestId));
    else payableOnPage.forEach(c => { if (next.size < MAX_BATCH_PAY) next.set(c.contestId, c.title); });
    return next;
  });

  const payBatch = async () => {
    setBatchPaying(true);
    try {
      const result = await managerContestService.batchPayRewards([...selected.keys()]);
      setBatchConfirm(false);
      setBatchResult(result);
      setSelected(new Map(result.results.filter(r => !r.success).map(r => [r.contestId, r.title])));
      await load();
    } catch (err) {
      const code = contestErrorCode(err);
      toast.error((code && CONTEST_ERROR_TEXT[code]) || getApiErrorMessage(err, 'Could not pay the rewards.'));
    } finally {
      setBatchPaying(false);
    }
  };

  const columns: TableColumn[] = [
    {
      key: 'select', label: '', width: '44px',
      render: row => {
        const c = row as unknown as ContestListItem;
        return (
          <div onClick={e => e.stopPropagation()} title={c.canPayReward ? 'Select for batch payment' : 'Only ranked contests waiting for rewards can be paid'}>
            <Checkbox checked={selected.has(c.contestId)} disabled={!c.canPayReward} onChange={() => toggle(c)} />
          </div>
        );
      },
    },
    {
      key: 'title', label: 'Contest', width: '28%',
      render: row => {
        const c = row as unknown as ContestListItem;
        return <div className="min-w-0"><p className="truncate font-semibold text-content">{c.title}</p><p className="truncate text-xs text-content-soft">{c.course?.title ?? '—'} · {c.exam.title}</p></div>;
      },
    },
    {
      key: 'schedule', label: 'Schedule',
      render: row => {
        const c = row as unknown as ContestListItem;
        return <div className="whitespace-nowrap text-sm text-content-secondary"><p>{formatDateTime(c.startTime)}</p><p className="text-xs text-content-soft">to {formatDateTime(c.endTime)}</p></div>;
      },
    },
    {
      key: 'status', label: 'Status',
      render: row => {
        const c = row as unknown as ContestListItem;
        return <div className="flex flex-wrap items-center gap-1"><ContestStatusBadge status={c.status} />{c.status === 'PENDING_REWARD' && <RankingBadge ranking={c.rankingStatus} />}</div>;
      },
    },
    { key: 'participantCount', label: 'Participants', render: row => <span className="tabular-nums text-content-secondary">{Number(row.participantCount).toLocaleString()}</span> },
    { key: 'topN', label: 'Prizes', render: row => <span className="tabular-nums text-content-secondary">{Number(row.topN)}</span> },
    {
      key: 'actions', label: '', width: '48px',
      render: row => {
        const c = row as unknown as ContestListItem;
        return (
          <div onClick={e => e.stopPropagation()}>
            <Dropdown
              trigger={<button type="button" aria-label={`Actions for ${c.title}`} className="rounded-[6px] p-1.5 hover:bg-accent"><Icon.MoreHorizontal className="h-4 w-4 text-content-soft" /></button>}
              items={[
                { label: 'View details', icon: <Icon.Eye className="h-4 w-4" />, onClick: () => navigate(managerContestPath(c.contestId)) },
                ...(LOCKED.includes(c.status) ? [] : [{ label: 'Edit', icon: <Icon.Edit className="h-4 w-4" />, onClick: () => navigate(managerContestEditPath(c.contestId)) }]),
                ...(c.canPayReward ? [{ label: 'Pay rewards', icon: <Icon.Award className="h-4 w-4" />, onClick: () => setPaying(c) }] : []),
              ]}
            />
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-5 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-content">Contests</h1>
          <p className="mt-1 text-sm text-content-soft">Schedule contests on your course exams, follow their ranking and pay the prize discounts.</p>
        </div>
        <Button icon={<Icon.Plus className="h-4 w-4" />} onClick={() => navigate(ROUTES.managerContestCreate)}>New contest</Button>
      </header>

      <section className="card p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Input aria-label="Search contests" placeholder="Search by title" icon={<Icon.Search className="h-4 w-4" />} value={keyword}
            onChange={e => { setKeyword(e.target.value); resetPage(); }} className="xl:col-span-2" />
          <MultiSelect placeholder="Any status" value={statuses} onChange={v => { setStatuses(v); resetPage(); }}
            options={CONTEST_STATUSES.map(s => ({ label: STATUS_LABEL[s], value: s }))} />
          <Select aria-label="Course" value={courseId} onChange={v => { setCourseId(v); resetPage(); }}
            options={[{ label: 'All courses', value: '' }, ...courses.map(c => ({ label: c.title, value: String(c.courseId) }))]} maxVisibleOptions={8} />
          <Input aria-label="Starts from" type="date" value={from} onChange={e => { setFrom(e.target.value); resetPage(); }} />
          <Input aria-label="Starts until" type="date" value={to} onChange={e => { setTo(e.target.value); resetPage(); }} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => { setStatuses(['PENDING_REWARD']); resetPage(); }}
              className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1 text-xs font-medium text-content-secondary hover:bg-surface-hover">
              <Icon.Award className="h-3.5 w-3.5" /> Waiting for rewards
            </button>
            {filtersActive && (
              <button type="button" onClick={resetFilters} className="inline-flex items-center gap-1 text-sm font-medium text-brand-ink hover:underline">
                <Icon.X className="h-3.5 w-3.5" /> Clear filters
              </button>
            )}
          </div>
          <Select aria-label="Sort" value={sort} onChange={v => { setSort(v); resetPage(); }} options={SORTS} className="w-56" />
        </div>
      </section>

      {selected.size > 0 && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-brand-line bg-primary-light/40 px-4 py-3">
          <p className="text-sm text-content-secondary"><strong>{selected.size}</strong> contest{selected.size === 1 ? '' : 's'} selected for payment (max {MAX_BATCH_PAY}).</p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Map())}>Clear</Button>
            <Button size="sm" icon={<Icon.Award className="h-4 w-4" />} onClick={() => setBatchConfirm(true)}>Pay rewards</Button>
          </div>
        </div>
      )}

      {error && <Alert type="error" message={error} />}

      <div className={`card overflow-hidden transition-opacity ${loading && page.content.length ? 'opacity-60' : ''}`} aria-busy={loading}>
        {payableOnPage.length > 0 && (
          <div className="flex items-center gap-2 border-b border-line-soft px-4 py-2 text-xs text-content-soft">
            <Checkbox checked={allOnPage} indeterminate={!allOnPage && payableOnPage.some(c => selected.has(c.contestId))} onChange={toggleAllOnPage} />
            Select every payable contest on this page
          </div>
        )}
        <Table columns={columns} data={page.content.map(c => ({ ...c, id: c.contestId })) as unknown as Record<string, unknown>[]}
          perPage={PAGE_SIZE} unit="contests"
          serverPagination={{ page: pageIndex, total: page.totalElements, onChange: setPageIndex }}
          onRowClick={row => navigate(managerContestPath(Number(row.contestId)))}
          emptyState={loading ? 'Loading contests…' : filtersActive ? 'No contests match your filters.' : 'No contests yet. Click “New contest” to schedule one.'}
        />
      </div>

      <Modal open={batchConfirm} onClose={() => !batchPaying && setBatchConfirm(false)} title={`Pay rewards for ${selected.size} contest${selected.size === 1 ? '' : 's'}?`} dismissible={!batchPaying}
        footer={<>
          <Button variant="outline" disabled={batchPaying} onClick={() => setBatchConfirm(false)}>Cancel</Button>
          <Button loading={batchPaying} disabled={batchPaying} onClick={() => void payBatch()}>Pay rewards</Button>
        </>}>
        <div className="space-y-3">
          <p className="text-sm text-content-secondary">
            Each contest is paid on its own, earliest end time first. One that fails is not paid and does not stop the others.
            Contests sharing a discount use up its remaining uses in that order.
          </p>
          <ul className="max-h-60 space-y-1 overflow-y-auto text-sm text-content">
            {[...selected.values()].map((title, i) => <li key={i} className="truncate">• {title}</li>)}
          </ul>
        </div>
      </Modal>

      <Modal open={!!batchResult} onClose={() => setBatchResult(null)} title="Batch payment result" size="lg" footer={<Button onClick={() => setBatchResult(null)}>Close</Button>}>
        {batchResult && (
          <div className="space-y-4">
            <Alert type={batchResult.failed ? 'warning' : 'success'} message={`Paid ${batchResult.succeeded} of ${batchResult.total} contests.${batchResult.failed ? ' Failed contests stay selected so you can retry after fixing them.' : ''}`} />
            <ul className="divide-y divide-line-soft rounded-[10px] border border-line-soft">
              {batchResult.results.map(r => (
                <li key={r.contestId} className="space-y-2 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <button type="button" className="min-w-0 truncate text-left text-sm font-medium text-content hover:underline" onClick={() => navigate(managerContestPath(r.contestId))}>{r.title}</button>
                    {r.success
                      ? <span className="inline-flex flex-shrink-0 items-center gap-1 text-xs font-medium text-success"><Icon.CheckCircle className="h-4 w-4" /> {r.rewardsGranted ?? 0} granted</span>
                      : <span className="inline-flex flex-shrink-0 items-center gap-1 text-xs font-medium text-danger"><Icon.XCircle className="h-4 w-4" /> Failed</span>}
                  </div>
                  {!r.success && (
                    <div className="space-y-1.5 pl-1">
                      <p className="text-xs text-content-soft">{(r.errorCode && CONTEST_ERROR_TEXT[r.errorCode]) || r.message}</p>
                      <IssueList issues={r.issues ?? []} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Modal>

      <PayRewardsDialog contest={paying} onClose={() => setPaying(null)}
        onPaid={() => { if (paying) setSelected(prev => { const next = new Map(prev); next.delete(paying.contestId); return next; }); void load(); }} />
    </div>
  );
}
