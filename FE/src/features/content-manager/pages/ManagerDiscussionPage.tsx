import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { Alert } from '@/components/ui/Alert';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DiscussionImageAttachment } from '@/components/common/DiscussionImageAttachment';
import { ImageViewer } from '@/components/common/ImageViewer';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { SearchInput } from '@/components/common/SearchInput';
import { Select } from '@/components/ui/Select';
import { Tabs } from '@/components/ui/Tabs';
import { Icon } from '@/assets/icons';
import { useToast } from '@/components/ui/ToastHost';
import {
  managerDiscussionService,
  type AdminReportStatus,
  type DiscussionReportItem,
  type ManagerDiscussionStatus,
  type ManagerPostStatus,
  type ModerationSummary,
} from '@/services/managerDiscussion.service';
import type { DiscussionDetail, DiscussionDetailComment, DiscussionItem, DiscussionTag } from '@/services/studentCommunity.service';
import { getApiErrorMessage } from '@/utils/apiError';

const PAGE_SIZE = 20;
const APPROVAL_OPTIONS = [
  { label: 'Pending approval', value: 'PENDING' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'All approval statuses', value: 'ALL' },
];
const POST_STATUS_OPTIONS = [
  { label: 'Any post status', value: 'ALL' },
  { label: 'Open', value: 'OPEN' },
  { label: 'Closed', value: 'CLOSED' },
  { label: 'Hidden', value: 'HIDDEN' },
];
const TAG_OPTIONS = [
  { label: 'All tags', value: 'ALL' },
  { label: 'Question', value: 'question' },
  { label: 'Tip', value: 'tip' },
  { label: 'Announcement', value: 'announcement' },
];
const IMAGE_FILTER_OPTIONS = [
  { label: 'All posts', value: 'ALL' },
  { label: 'With image', value: 'WITH_IMAGE' },
  { label: 'Text only', value: 'NO_IMAGE' },
];
const SORT_OPTIONS = [
  { label: 'Oldest first (FIFO)', value: 'oldest' },
  { label: 'Newest first', value: 'latest' },
];
const REPORT_STATUS_OPTIONS = [
  { label: 'Pending reports', value: 'PENDING' },
  { label: 'Resolved', value: 'RESOLVED' },
  { label: 'Dismissed', value: 'DISMISSED' },
  { label: 'All reports', value: 'ALL' },
];

const approvalLabel = (status?: string) => ({ PENDING: 'Pending approval', APPROVED: 'Approved', REJECTED: 'Rejected' }[status ?? ''] ?? status ?? '—');
const tagLabel = (tag: string) => ({ QUESTION: 'Question', question: 'Question', TIP: 'Tip', tip: 'Tip', ANNOUNCEMENT: 'Announcement', announcement: 'Announcement' }[tag] ?? tag);
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

type DeleteTarget = { kind: 'comment'; id: number };

export function ManagerDiscussionPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'Posts' | 'Reports'>('Posts');
  const [summary, setSummary] = useState<ModerationSummary | null>(null);

  // Posts tab state
  const [approvalStatus, setApprovalStatus] = useState<ManagerDiscussionStatus>('PENDING');
  const [postStatus, setPostStatus] = useState<ManagerPostStatus>('ALL');
  const [tagFilter, setTagFilter] = useState<DiscussionTag | 'ALL'>('ALL');
  const [imageFilter, setImageFilter] = useState<'ALL' | 'WITH_IMAGE' | 'NO_IMAGE'>('ALL');
  const [sortOrder, setSortOrder] = useState<'oldest' | 'latest'>('oldest');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<DiscussionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState('');

  // Detail modal state
  const [detail, setDetail] = useState<DiscussionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [moderationReason, setModerationReason] = useState('');
  const [hidingCommentId, setHidingCommentId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  // Mute user modal state
  const [muteTarget, setMuteTarget] = useState<{ userId: number; displayName: string } | null>(null);
  const [muteDays, setMuteDays] = useState('3');
  const [muteReason, setMuteReason] = useState('');

  // Reports tab state
  const [reportStatus, setReportStatus] = useState<AdminReportStatus>('PENDING');
  const [reportPage, setReportPage] = useState(0);
  const [reports, setReports] = useState<DiscussionReportItem[]>([]);
  const [reportTotal, setReportTotal] = useState(0);
  const [reportLoading, setReportLoading] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      const data = await managerDiscussionService.getSummary();
      setSummary(data);
    } catch {
      // Keep existing summary silently
    }
  }, []);

  const load = useCallback(async (mode?: 'quiet') => {
    const quiet = mode === 'quiet';
    if (!quiet) {
      setLoading(true);
      setError('');
    }
    try {
      const hasImage = imageFilter === 'ALL' ? undefined : imageFilter === 'WITH_IMAGE';
      const result = await managerDiscussionService.list({
        approvalStatus,
        status: postStatus,
        tag: tagFilter,
        hasImage,
        search: appliedSearch || undefined,
        sort: sortOrder,
        page,
        size: PAGE_SIZE,
      });
      setItems(result.content);
      setTotal(result.totalElements);
      setSelectedIds(new Set());
    } catch (err) {
      if (!quiet) setError(getApiErrorMessage(err, 'Could not load discussions.'));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [approvalStatus, postStatus, tagFilter, imageFilter, appliedSearch, sortOrder, page]);

  const loadReports = useCallback(async (mode?: 'quiet') => {
    const quiet = mode === 'quiet';
    if (!quiet) setReportLoading(true);
    try {
      const result = await managerDiscussionService.listReports({
        status: reportStatus,
        page: reportPage,
        size: PAGE_SIZE,
      });
      setReports(result.content);
      setReportTotal(result.totalElements);
    } catch (err) {
      if (!quiet) toast.error(getApiErrorMessage(err, 'Could not load reports.'));
    } finally {
      if (!quiet) setReportLoading(false);
    }
  }, [reportStatus, reportPage, toast]);

  useEffect(() => { void loadSummary(); }, [loadSummary, reload]);
  useEffect(() => {
    if (activeTab === 'Posts') void load();
    else void loadReports();
  }, [activeTab, load, loadReports, reload]);

  useAutoRefresh(() => {
    void loadSummary();
    if (activeTab === 'Posts') void load('quiet');
    else void loadReports('quiet');
  });

  const refreshDetail = async (discussionId: number) => {
    const fresh = await managerDiscussionService.getDetail(discussionId);
    setDetail(fresh);
  };

  const runAction = async (successMessage: string, action: () => Promise<unknown>) => {
    if (!detail) return false;
    setBusy(true);
    try {
      await action();
      toast.success(successMessage);
      await Promise.all([load(), loadSummary(), refreshDetail(detail.discussionId)]);
      return true;
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not update this discussion.'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const approve = () => void runAction('Discussion approved.', () => managerDiscussionService.approve(detail!.discussionId));
  const reject = async () => {
    if (!detail || rejectReason.trim().length < 5) return;
    const succeeded = await runAction('Discussion rejected.', () => managerDiscussionService.reject(detail.discussionId, rejectReason.trim()));
    if (succeeded) { setRejecting(false); setRejectReason(''); }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;
    setBusy(true);
    try {
      const res = await managerDiscussionService.bulkApprove(Array.from(selectedIds));
      toast.success(`Approved ${res.updatedCount} discussions.`);
      await Promise.all([load(), loadSummary()]);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Bulk approve failed.'));
    } finally {
      setBusy(false);
    }
  };

  const handleBulkReject = async () => {
    if (selectedIds.size === 0 || bulkRejectReason.trim().length < 5) return;
    setBusy(true);
    try {
      const res = await managerDiscussionService.bulkReject(Array.from(selectedIds), bulkRejectReason.trim());
      toast.success(`Rejected ${res.updatedCount} discussions.`);
      setBulkRejectOpen(false);
      setBulkRejectReason('');
      await Promise.all([load(), loadSummary()]);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Bulk reject failed.'));
    } finally {
      setBusy(false);
    }
  };

  const handleResolveReport = async (reportId: number, action: 'HIDE_AND_RESOLVE' | 'DISMISS') => {
    setBusy(true);
    try {
      await managerDiscussionService.resolveReport(reportId, action);
      toast.success(action === 'HIDE_AND_RESOLVE' ? 'Content hidden and report resolved.' : 'Report dismissed.');
      await Promise.all([loadReports(), loadSummary()]);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not process report.'));
    } finally {
      setBusy(false);
    }
  };

  const handleMuteUser = async (event: FormEvent) => {
    event.preventDefault();
    if (!muteTarget || muteReason.trim().length < 5) return;
    setBusy(true);
    try {
      await managerDiscussionService.muteUser(muteTarget.userId, Number(muteDays), muteReason.trim());
      toast.success(`Muted ${muteTarget.displayName} for ${muteDays} days.`);
      setMuteTarget(null);
      setMuteReason('');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not mute user.'));
    } finally {
      setBusy(false);
    }
  };

  const togglePin = () => void runAction(detail?.isPinned ? 'Discussion unpinned.' : 'Discussion pinned.', () => managerDiscussionService.setPinned(detail!.discussionId, !detail!.isPinned));
  const hideDiscussion = () => void runAction('Discussion hidden from students.', async () => {
    await managerDiscussionService.hide(detail!.discussionId);
    setDetail(current => current ? { ...current, status: 'HIDDEN', isClosed: true, isPinned: false } : current);
  });
  const restoreDiscussion = () => void runAction('Discussion restored for students.', async () => {
    await managerDiscussionService.restore(detail!.discussionId);
    setDetail(current => current ? { ...current, status: 'OPEN', isClosed: false } : current);
  });
  const cancelReject = () => { setRejecting(false); setRejectReason(''); };

  const restoreComment = async (comment: DiscussionDetailComment) => {
    const succeeded = await runAction('Reply restored for students.', () => managerDiscussionService.setCommentStatus(comment.commentId, 'VISIBLE'));
    if (succeeded) setHidingCommentId(null);
  };

  const hideComment = async (comment: DiscussionDetailComment) => {
    const reason = moderationReason.trim();
    if (reason.length < 5) return;
    const succeeded = await runAction('Reply hidden from students.', () => managerDiscussionService.setCommentStatus(comment.commentId, 'HIDDEN', reason));
    if (succeeded) { setHidingCommentId(null); setModerationReason(''); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      if (detail) {
        await managerDiscussionService.deleteComment(deleteTarget.id);
        toast.success('Reply deleted.');
        await Promise.all([load(), refreshDetail(detail.discussionId)]);
      }
      setDeleteTarget(null);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not delete this item.'));
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (item: DiscussionItem) => {
    setDetail(null);
    setDetailLoading(true);
    setRejecting(false);
    setRejectReason('');
    setModerationReason('');
    setHidingCommentId(null);
    try { setDetail(await managerDiscussionService.getDetail(item.discussionId)); }
    catch (err) { toast.error(getApiErrorMessage(err, 'Could not load discussion details.')); }
    finally { setDetailLoading(false); }
  };

  const submitCreate = async (payload: { title: string; content: string; tag: DiscussionTag; imageUrl?: string | null; isPinned: boolean }) => {
    const created = await managerDiscussionService.create(payload);
    setCreateOpen(false);
    toast.success('Discussion published.');
    await Promise.all([load(), loadSummary()]);
    setDetail(created);
  };

  const templates = summary?.rejectionTemplates ?? [];

  return (
    <main className="mx-auto max-w-screen-2xl space-y-6 p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content">Community Moderation</h1>
          <p className="mt-1 text-sm text-content-subtle">Admin moderation queue, violation reports, and official announcements.</p>
        </div>
        <div className="flex items-center gap-3">
          {summary && (
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="warning">{summary.pendingDiscussionsCount} pending posts</Badge>
              <Badge variant={summary.pendingReportsCount > 0 ? 'danger' : 'default'}>{summary.pendingReportsCount} pending reports</Badge>
            </div>
          )}
          <Button icon={<Icon.Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Create announcement</Button>
        </div>
      </header>

      <Tabs
        tabs={['Posts', 'Reports']}
        active={activeTab}
        onChange={value => setActiveTab(value as 'Posts' | 'Reports')}
        variant="underline"
      />

      {activeTab === 'Posts' ? (
        <>
          <section className="card space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Select label="Approval" value={approvalStatus} options={APPROVAL_OPTIONS} onChange={value => { setApprovalStatus(value as ManagerDiscussionStatus); setPage(0); }} />
              <Select label="Post status" value={postStatus} options={POST_STATUS_OPTIONS} onChange={value => { setPostStatus(value as ManagerPostStatus); setPage(0); }} />
              <Select label="Tag" value={tagFilter} options={TAG_OPTIONS} onChange={value => { setTagFilter(value as DiscussionTag | 'ALL'); setPage(0); }} />
              <Select label="Attachment" value={imageFilter} options={IMAGE_FILTER_OPTIONS} onChange={value => { setImageFilter(value as 'ALL' | 'WITH_IMAGE' | 'NO_IMAGE'); setPage(0); }} />
              <Select label="Queue order" value={sortOrder} options={SORT_OPTIONS} onChange={value => { setSortOrder(value as 'oldest' | 'latest'); setPage(0); }} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
              <form onSubmit={event => { event.preventDefault(); setAppliedSearch(search.trim()); setPage(0); }} className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-md">
                <SearchInput className="min-w-0 flex-1" aria-label="Search discussions" placeholder="Search posts…" value={search} onChange={event => setSearch(event.target.value)} />
                <Button type="submit" variant="outline">Search</Button>
              </form>
              <div className="flex items-center gap-3 text-sm text-content-subtle">
                {selectedIds.size > 0 && (
                  <>
                    <span className="font-medium text-content">{selectedIds.size} selected</span>
                    <Button size="sm" onClick={() => void handleBulkApprove()} disabled={busy}>Bulk approve</Button>
                    <Button size="sm" variant="danger" onClick={() => setBulkRejectOpen(true)} disabled={busy}>Bulk reject</Button>
                  </>
                )}
                <span>{total} {total === 1 ? 'post' : 'posts'}</span>
                <Button size="sm" variant="ghost" icon={<Icon.RefreshCw className="h-4 w-4" />} onClick={() => setReload(value => value + 1)}>Refresh</Button>
              </div>
            </div>
          </section>

          {error ? <Alert type="error" message={error} /> : loading ? (
            <div className="card p-8 text-center text-sm text-content-subtle">Loading discussions…</div>
          ) : items.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="font-medium text-content">No discussions match these filters</p>
              <p className="mt-1 text-sm text-content-subtle">Try a different status or search term.</p>
            </div>
          ) : (
            <section className="space-y-3">
              {items.map(item => (
                <article key={item.discussionId} className="card p-4 transition-colors hover:border-brand-300 hover:bg-surface-hover">
                  <div className="flex flex-wrap items-start gap-4">
                    {item.approvalStatus === 'PENDING' && (
                      <div className="pt-1">
                        <Checkbox
                          checked={selectedIds.has(item.discussionId)}
                          onChange={() => toggleSelect(item.discussionId)}
                          aria-label={`Select ${item.title}`}
                        />
                      </div>
                    )}
                    <button type="button" onClick={() => void openDetail(item)} className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        {item.status === 'HIDDEN'
                          ? <Badge variant="danger">Hidden</Badge>
                          : <Badge variant={item.approvalStatus === 'PENDING' ? 'warning' : item.approvalStatus === 'REJECTED' ? 'danger' : 'success'}>{approvalLabel(item.approvalStatus)}</Badge>}
                        <Badge>{tagLabel(item.tag)}</Badge>
                        {item.isPinned && <Badge variant="warning">Pinned</Badge>}
                        {item.isClosed && <Badge>Closed</Badge>}
                      </div>
                      <h2 className="font-semibold text-content">{item.title}</h2>
                      <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-content-secondary">{item.excerpt}</p>
                      <p className="mt-3 text-xs text-content-subtle">{item.author.displayName} · {dateLabel(item.createdAt)} · {item.commentCount} replies</p>
                    </button>
                    {item.imageUrl && <ImageViewer src={item.imageUrl} alt="Discussion attachment" imageClassName="max-h-28" />}
                    <button type="button" onClick={() => void openDetail(item)} className="mt-1 shrink-0 rounded-md p-1 text-content-subtle hover:bg-surface-muted" aria-label={`Review ${item.title}`}>
                      <Icon.ChevronRight className="h-5 w-5" />
                    </button>
                  </div>
                </article>
              ))}
              <div className="card"><Pagination page={page + 1} total={total} perPage={PAGE_SIZE} onChange={value => setPage(value - 1)} unit="posts" /></div>
            </section>
          )}
        </>
      ) : (
        <>
          <section className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="w-60">
              <Select label="Report status" value={reportStatus} options={REPORT_STATUS_OPTIONS} onChange={value => { setReportStatus(value as AdminReportStatus); setReportPage(0); }} />
            </div>
            <Button size="sm" variant="ghost" icon={<Icon.RefreshCw className="h-4 w-4" />} onClick={() => setReload(value => value + 1)}>Refresh</Button>
          </section>

          {reportLoading ? (
            <div className="card p-8 text-center text-sm text-content-subtle">Loading reports…</div>
          ) : reports.length === 0 ? (
            <div className="card p-8 text-center text-sm text-content-subtle">No reports match this status.</div>
          ) : (
            <section className="space-y-3">
              {reports.map(r => (
                <article key={r.reportId} className="card space-y-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={r.status === 'PENDING' ? 'warning' : r.status === 'RESOLVED' ? 'success' : 'default'}>{r.status}</Badge>
                      <Badge variant="info">{r.targetType}</Badge>
                      <span className="text-xs text-content-subtle">Reported by {r.reporterName} · {dateLabel(r.createdAt)}</span>
                    </div>
                    {r.status === 'PENDING' && (
                      <div className="flex flex-wrap gap-2">
                        {r.targetAuthorId && (
                          <Button size="sm" variant="outline" onClick={() => setMuteTarget({ userId: r.targetAuthorId!, displayName: r.targetAuthorName || 'User' })}>
                            Mute author
                          </Button>
                        )}
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => void handleResolveReport(r.reportId, 'DISMISS')}>Dismiss</Button>
                        <Button size="sm" variant="danger" disabled={busy} onClick={() => void handleResolveReport(r.reportId, 'HIDE_AND_RESOLVE')}>Hide content & Resolve</Button>
                      </div>
                    )}
                  </div>
                  <p className="text-sm font-medium text-content">Post: {r.discussionTitle}</p>
                  <p className="rounded-lg bg-surface-muted p-3 text-sm text-content-secondary">{r.targetContent}</p>
                  <p className="text-sm text-danger">Reason: {r.reason}</p>
                </article>
              ))}
              <div className="card"><Pagination page={reportPage + 1} total={reportTotal} perPage={PAGE_SIZE} onChange={value => setReportPage(value - 1)} unit="reports" /></div>
            </section>
          )}
        </>
      )}

      <Modal open={detailLoading || !!detail} onClose={() => { if (!busy) setDetail(null); }} title={detail?.title ?? 'Loading discussion…'} size="2xl" footer={detail && <>
        <Button variant="outline" onClick={() => setDetail(null)} disabled={busy}>Close</Button>
        {detail.author?.userId && (
          <Button variant="outline" onClick={() => setMuteTarget({ userId: detail.author.userId, displayName: detail.author.displayName })} disabled={busy}>
            Mute user
          </Button>
        )}
        {detail.approvalStatus === 'APPROVED' && detail.status !== 'HIDDEN' && (
          <Button variant="outline" icon={<Icon.Bookmark className="h-4 w-4" />} onClick={togglePin} disabled={busy}>{detail.isPinned ? 'Unpin' : 'Pin'}</Button>
        )}
        {detail.approvalStatus === 'PENDING' && !rejecting && <>
          <Button variant="danger" onClick={() => setRejecting(true)} disabled={busy}>Reject</Button>
          <Button onClick={approve} disabled={busy}>Approve</Button>
        </>}
        {rejecting && <><Button variant="outline" onClick={cancelReject} disabled={busy}>Cancel rejection</Button><Button variant="danger" onClick={() => void reject()} disabled={busy || rejectReason.trim().length < 5} loading={busy}>Confirm rejection</Button></>}
        {detail.status === 'HIDDEN' ? <Button onClick={restoreDiscussion} disabled={busy}>Restore</Button> : <Button variant="danger" onClick={hideDiscussion} disabled={busy}>Hide</Button>}
      </>}>
        {!detail ? <div className="py-12 text-center text-sm text-content-subtle">Loading discussion details…</div> : <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">{detail.status === 'HIDDEN' ? <Badge variant="danger">Hidden</Badge> : <Badge variant={detail.approvalStatus === 'PENDING' ? 'warning' : detail.approvalStatus === 'REJECTED' ? 'danger' : 'success'}>{approvalLabel(detail.approvalStatus)}</Badge>}<Badge>{tagLabel(detail.tag)}</Badge>{detail.isPinned && <Badge variant="warning">Pinned</Badge>}{detail.isClosed && <Badge>Closed</Badge>}<span className="ml-auto text-xs text-content-subtle">{dateLabel(detail.createdAt)}</span></div>
          <div className="flex items-center gap-3"><Avatar name={detail.author.displayName} src={detail.author.avatarUrl || undefined} size="sm" /><p className="text-sm text-content-secondary">{detail.author.displayName}</p></div>
          <p className="whitespace-pre-wrap text-sm leading-6 text-content-secondary">{detail.content}</p>
          {detail.imageUrl && <ImageViewer src={detail.imageUrl} alt="Discussion attachment" imageClassName="max-h-[28rem]" />}
          {rejecting && (
            <section className="space-y-3 rounded-lg border border-danger-line bg-danger-light p-4">
              {templates.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {templates.map(tpl => (
                    <button key={tpl} type="button" onClick={() => setRejectReason(tpl)} className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-content hover:border-brand-500">
                      {tpl}
                    </button>
                  ))}
                </div>
              )}
              <label className="grid gap-2 text-sm font-medium text-content">Reason shown to the student
                <textarea maxLength={1000} rows={3} value={rejectReason} onChange={event => setRejectReason(event.target.value)} className="rounded-lg border border-line bg-surface p-3 font-normal text-content" placeholder="Explain why this post was rejected (at least 5 characters)." />
              </label>
              <p className="text-right text-xs text-content-subtle">{rejectReason.length}/1000</p>
            </section>
          )}
          {detail.approvalStatus === 'REJECTED' && detail.rejectionReason && <Alert type="warning" title="Rejection reason" message={detail.rejectionReason} />}
          <section className="space-y-3 border-t border-line pt-4">
            <div><h3 className="font-semibold text-content">Replies <span className="font-normal text-content-subtle">({(detail.comments ?? []).filter(comment => comment.status !== 'HIDDEN').length})</span></h3><p className="mt-1 text-xs text-content-subtle">Hidden replies remain visible here for moderation ({(detail.comments ?? []).filter(comment => comment.status === 'HIDDEN').length} hidden).</p></div>
            {(detail.comments ?? []).length === 0 ? <p className="rounded-lg bg-surface-muted p-4 text-sm text-content-subtle">No replies yet.</p> : <div className="divide-y divide-line rounded-lg border border-line">
              {[...detail.comments].reverse().map(comment => <ManagerReply
                key={comment.commentId}
                comment={comment}
                busy={busy}
                hiding={hidingCommentId === comment.commentId}
                reason={moderationReason}
                onStartHide={() => { setHidingCommentId(comment.commentId); setModerationReason(''); }}
                onCancelHide={() => { setHidingCommentId(null); setModerationReason(''); }}
                onReasonChange={setModerationReason}
                onHide={() => void hideComment(comment)}
                onRestore={() => void restoreComment(comment)}
                onDelete={() => setDeleteTarget({ kind: 'comment', id: comment.commentId })}
              />)}
            </div>}
          </section>
        </div>}
      </Modal>

      <Modal open={bulkRejectOpen} onClose={() => { if (!busy) setBulkRejectOpen(false); }} title={`Reject ${selectedIds.size} selected posts`} size="md" footer={<>
        <Button variant="outline" onClick={() => setBulkRejectOpen(false)} disabled={busy}>Cancel</Button>
        <Button variant="danger" onClick={() => void handleBulkReject()} disabled={busy || bulkRejectReason.trim().length < 5} loading={busy}>Confirm reject</Button>
      </>}>
        <div className="space-y-3">
          {templates.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {templates.map(tpl => (
                <button key={tpl} type="button" onClick={() => setBulkRejectReason(tpl)} className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-content hover:border-brand-500">
                  {tpl}
                </button>
              ))}
            </div>
          )}
          <textarea maxLength={1000} rows={3} value={bulkRejectReason} onChange={event => setBulkRejectReason(event.target.value)} className="w-full rounded-lg border border-line bg-surface p-3 text-sm text-content" placeholder="Enter rejection reason (at least 5 characters)..." />
        </div>
      </Modal>

      <Modal open={!!muteTarget} onClose={() => { if (!busy) setMuteTarget(null); }} title={`Mute ${muteTarget?.displayName ?? 'user'}`} size="md" footer={<>
        <Button variant="outline" onClick={() => setMuteTarget(null)} disabled={busy}>Cancel</Button>
        <Button form="mute-user-form" type="submit" variant="danger" disabled={busy || muteReason.trim().length < 5} loading={busy}>Mute user</Button>
      </>}>
        <form id="mute-user-form" onSubmit={handleMuteUser} className="space-y-4">
          <Select label="Duration" value={muteDays} options={[{ label: '1 day', value: '1' }, { label: '3 days', value: '3' }, { label: '7 days', value: '7' }, { label: '30 days', value: '30' }]} onChange={setMuteDays} />
          <label className="grid gap-1.5 text-sm font-medium text-content">Reason
            <textarea maxLength={500} rows={3} value={muteReason} onChange={event => setMuteReason(event.target.value)} className="rounded-lg border border-line bg-surface p-3 text-sm font-normal text-content" placeholder="Explain why this user is muted (at least 5 characters)..." />
          </label>
        </form>
      </Modal>

      <CreateManagerDiscussionModal open={createOpen} onClose={() => setCreateOpen(false)} onSubmit={submitCreate} />
      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => void confirmDelete()} loading={busy} tone="danger" confirmLabel="Delete" title="Delete this reply?" description="This permanently removes the reply and cannot be undone." />
    </main>
  );
}

function ManagerReply({ comment, busy, hiding, reason, onStartHide, onCancelHide, onReasonChange, onHide, onRestore, onDelete }: {
  comment: DiscussionDetailComment;
  busy: boolean;
  hiding: boolean;
  reason: string;
  onStartHide: () => void;
  onCancelHide: () => void;
  onReasonChange: (reason: string) => void;
  onHide: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const hidden = comment.status === 'HIDDEN';
  return <article className={`flex flex-wrap items-start gap-3 p-4 ${hidden ? 'bg-surface-muted' : ''}`}>
    <Avatar name={comment.author.displayName} src={comment.isAnonymous || /anonymous|ẩn danh/i.test(comment.author.displayName) ? '/images/anonymous_student.png' : comment.author.avatarUrl || undefined} size="sm" />
    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-xs text-content-subtle">{comment.author.displayName} · {dateLabel(comment.createdAt)}</p>{hidden && <Badge variant="danger">Hidden</Badge>}</div><p className="mt-2 whitespace-pre-wrap text-sm text-content-secondary">{comment.content}</p>{comment.imageUrl && <ImageViewer src={comment.imageUrl} alt="Reply attachment" className="mt-3" imageClassName="max-h-52" />}
      {hiding && <section className="mt-4 rounded-lg border border-warning-line bg-warning-light p-3">
        <label className="grid gap-1.5 text-sm font-medium text-content">Reason for hiding this reply
          <textarea maxLength={500} rows={2} value={reason} onChange={event => onReasonChange(event.target.value)} aria-describedby={`hide-reason-help-${comment.commentId}`} className="w-full rounded-lg border border-line bg-surface p-3 text-sm font-normal text-content focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20" placeholder="Explain why this reply should be hidden" />
        </label>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><p id={`hide-reason-help-${comment.commentId}`} className="text-xs text-content-subtle">A reason of at least 5 characters is required. {reason.length}/500</p><div className="flex gap-2"><Button size="sm" variant="outline" onClick={onCancelHide} disabled={busy}>Cancel</Button><Button size="sm" variant="danger" onClick={onHide} disabled={busy || reason.trim().length < 5} loading={busy}>Hide reply</Button></div></div>
      </section>}
    </div>
    <div className="flex shrink-0 gap-2">{!hiding && <Button size="sm" variant="outline" disabled={busy} onClick={hidden ? onRestore : onStartHide}>{hidden ? 'Restore' : 'Hide'}</Button>}<Button size="sm" variant="ghost" icon={<Icon.Trash className="h-4 w-4" />} aria-label="Delete reply" disabled={busy} onClick={onDelete} /></div>
  </article>;
}

function CreateManagerDiscussionModal({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (payload: { title: string; content: string; tag: DiscussionTag; imageUrl?: string | null; isPinned: boolean }) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tag, setTag] = useState<DiscussionTag>('announcement');
  const [imageUrl, setImageUrl] = useState('');
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setTitle(''); setContent(''); setTag('announcement'); setImageUrl(''); setPinned(false); setError(''); }
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !content.trim()) { setError('Enter a title and post content.'); return; }
    setBusy(true); setError('');
    try { await onSubmit({ title: title.trim(), content: content.trim(), tag, imageUrl: imageUrl || null, isPinned: pinned }); }
    catch (err) { setError(getApiErrorMessage(err, 'Could not create this post.')); }
    finally { setBusy(false); }
  };

  return <Modal open={open} onClose={() => { if (!busy) onClose(); }} title="Create announcement" description="This post is visible immediately." size="lg" error={error && <Alert type="error" message={error} />} footer={<><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button form="manager-discussion-form" type="submit" loading={busy}>Publish post</Button></>}>
    <form id="manager-discussion-form" onSubmit={submit} className="space-y-4">
      <Select label="Post type" value={tag} options={[{ label: 'Announcement', value: 'announcement' }, { label: 'Question', value: 'question' }, { label: 'Tip', value: 'tip' }]} onChange={value => setTag(value as DiscussionTag)} />
      <Input label="Title" maxLength={200} value={title} onChange={event => setTitle(event.target.value)} placeholder="Headline shown in Community" />
      <label className="grid gap-1.5 text-sm font-medium text-content-secondary">Content<textarea maxLength={10000} rows={5} value={content} onChange={event => setContent(event.target.value)} className="w-full rounded-[10px] border border-line bg-surface p-3 text-sm text-content focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20" placeholder="Write the post content…" /></label>
      <DiscussionImageAttachment imageUrl={imageUrl} onChange={setImageUrl} />
      <Checkbox checked={pinned} onChange={setPinned} label="Pin to top of Community" />
    </form>
  </Modal>;
}
