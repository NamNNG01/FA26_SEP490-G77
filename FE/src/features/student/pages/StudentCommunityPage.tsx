import { useEffect, useState, type FormEvent } from 'react';
import { useQuietRefresh } from '@/hooks/useAutoRefresh';
import { useNavigate, useParams } from 'react-router';
import { Alert } from '@/components/ui/Alert';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { Tabs } from '@/components/ui/Tabs';
import { Icon } from '@/assets/icons';
import { DiscussionImageAttachment } from '@/components/common/DiscussionImageAttachment';
import { ImageViewer } from '@/components/common/ImageViewer';
import { useToast } from '@/components/ui/ToastHost';
import { ROUTES } from '@/app/routes';
import { studentCommunityService, type DiscussionAnswerFilter, type DiscussionApprovalFilter, type DiscussionContentStatus, type DiscussionDetail as DiscussionDetailItem, type DiscussionItem, type DiscussionSort, type DiscussionTag } from '@/services/studentCommunity.service';
import { getApiErrorMessage } from '@/utils/apiError';
import { LoadError, PageTitle, STUDENT_PAGE_CLASS } from '../components/studentUi';

const PAGE_SIZE = 10;

export function StudentCommunityPage() {
  const { discussionId } = useParams<{ discussionId: string }>();
  return discussionId ? <DiscussionDetail discussionId={discussionId} /> : <DiscussionList />;
}

function DiscussionList() {
  const navigate = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState<'Discussions' | 'My Discussions' | 'Tips' | 'Announcements'>('Discussions');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState<DiscussionSort>('latest');
  const [tagFilter, setTagFilter] = useState<DiscussionTag | 'ALL'>('ALL');
  const [approvalFilter, setApprovalFilter] = useState<DiscussionApprovalFilter>('ALL');
  const [contentStatusFilter, setContentStatusFilter] = useState<DiscussionContentStatus>('ALL');
  const [answerFilter, setAnswerFilter] = useState<DiscussionAnswerFilter>('ALL');
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<DiscussionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const takeQuiet = useQuietRefresh(() => setReload(value => value + 1));
  const [createOpen, setCreateOpen] = useState(false);
  const [votingIds, setVotingIds] = useState<Set<number>>(new Set());
  const [voteError, setVoteError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    // A shared auto-refresh read keeps the posts and any error as they are.
    const quiet = takeQuiet();
    if (!quiet) { setLoading(true); setError(null); }
    const params = { page, size: PAGE_SIZE };
    const request = tab === 'Tips'
      ? studentCommunityService.getTips(params)
      : studentCommunityService.getDiscussions(tab === 'My Discussions'
        ? { ...params, scope: 'MINE', tag: tagFilter, approvalStatus: approvalFilter, status: contentStatusFilter, search: debouncedSearch || undefined, sort }
        : { ...params, scope: 'PUBLIC', tag: tab === 'Announcements' ? 'announcement' : 'question', answerFilter: tab === 'Discussions' ? answerFilter : undefined, search: tab === 'Discussions' ? debouncedSearch || undefined : undefined, sort });
    request.then(result => {
      if (cancelled) return;
      setItems(result.content); setTotal(result.totalElements);
    }).catch(err => { if (!cancelled && !quiet) setError(getApiErrorMessage(err, 'Failed to load community posts.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tab, debouncedSearch, sort, tagFilter, approvalFilter, contentStatusFilter, answerFilter, page, reload]);

  const chooseTab = (value: string) => { setTab(value as typeof tab); setPage(0); };
  const hasMyFilters = Boolean(debouncedSearch || tagFilter !== 'ALL' || approvalFilter !== 'ALL' || contentStatusFilter !== 'ALL');
  const toggleUpvote = async (discussionId: number) => {
    if (votingIds.has(discussionId)) return;
    setVotingIds(current => new Set(current).add(discussionId));
    setVoteError(null);
    try {
      const result = await studentCommunityService.toggleUpvote(discussionId);
      setItems(current => current.map(item => item.discussionId === discussionId
        ? { ...item, upvoteCount: result.upvoteCount, isUpvoted: result.isUpvoted }
        : item));
    } catch (err) {
      setVoteError(getApiErrorMessage(err, 'Could not update this upvote.'));
    } finally {
      setVotingIds(current => { const next = new Set(current); next.delete(discussionId); return next; });
    }
  };

  return <div className={`${STUDENT_PAGE_CLASS} space-y-6`}>
    <PageTitle title="Community" subtitle="Ask questions, share tips, and learn with the community." action={tab !== 'Announcements' ? <Button icon={<Icon.Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Create post</Button> : undefined} />
    <Tabs tabs={['Discussions', 'My Discussions', 'Tips', 'Announcements']} active={tab} onChange={chooseTab} variant="underline" />
    {(tab === 'Discussions' || tab === 'My Discussions') && (
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <Input className="w-full sm:w-72" aria-label={tab === 'My Discussions' ? 'Search my discussions' : 'Search discussions'} placeholder={tab === 'My Discussions' ? 'Search my posts…' : 'Search discussions…'} maxLength={100} value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} />
        {tab === 'My Discussions' && <>
          <Select aria-label="Filter by tag" className="w-full sm:w-48" value={tagFilter} options={[{ label: 'All tags', value: 'ALL' }, { label: 'Questions', value: 'question' }, { label: 'Tips', value: 'tip' }, { label: 'Announcements', value: 'announcement' }]} onChange={value => { setTagFilter(value as DiscussionTag | 'ALL'); setPage(0); }} />
          <Select aria-label="Filter by review status" className="w-full sm:w-52" value={approvalFilter} options={[{ label: 'All review statuses', value: 'ALL' }, { label: 'Pending approval', value: 'PENDING' }, { label: 'Approved', value: 'APPROVED' }, { label: 'Rejected', value: 'REJECTED' }]} onChange={value => { setApprovalFilter(value as DiscussionApprovalFilter); setPage(0); }} />
          <Select aria-label="Filter by post status" className="w-full sm:w-48" value={contentStatusFilter} options={[{ label: 'All post statuses', value: 'ALL' }, { label: 'Open', value: 'OPEN' }, { label: 'Closed', value: 'CLOSED' }, { label: 'Hidden', value: 'HIDDEN' }]} onChange={value => { setContentStatusFilter(value as DiscussionContentStatus); setPage(0); }} />
        </>}
        {tab === 'Discussions' && (
          <Select aria-label="Filter by answer status" className="w-full sm:w-48" value={answerFilter} options={[{ label: 'All questions', value: 'ALL' }, { label: 'Unanswered', value: 'UNANSWERED' }, { label: 'Has accepted answer', value: 'ACCEPTED' }]} onChange={value => { setAnswerFilter(value as DiscussionAnswerFilter); setPage(0); }} />
        )}
        <Select aria-label="Sort discussions" className="w-full sm:w-52" value={sort} options={[{ label: 'Latest', value: 'latest' }, { label: 'Most commented', value: 'mostCommented' }, { label: 'Most upvoted', value: 'mostUpvoted' }]} onChange={value => { setSort(value as DiscussionSort); setPage(0); }} />
      </div>
    )}
    {error ? <LoadError message={error} onRetry={() => setReload(value => value + 1)} /> : loading ? <div className="card p-8 text-sm text-content-subtle">Loading posts…</div> : items.length === 0 ?
      <div className="card"><EmptyState icon={tab === 'Tips' ? <Icon.Lightbulb className="h-7 w-7" /> : tab === 'Announcements' ? <Icon.Bell className="h-7 w-7" /> : <Icon.Book className="h-7 w-7" />} title={emptyTitle(tab, hasMyFilters)} message={emptyMessage(tab, hasMyFilters)} action={tab !== 'Announcements' && !(tab === 'My Discussions' && hasMyFilters) ? <Button onClick={() => setCreateOpen(true)}>Create post</Button> : undefined} /></div> :
      <div className="space-y-3">{voteError && <Alert type="error" message={voteError} />}{items.map(item => <DiscussionCard key={item.discussionId} item={item} showReviewStatus={tab === 'My Discussions'} voting={votingIds.has(item.discussionId)} onUpvote={() => void toggleUpvote(item.discussionId)} onOpen={() => navigate(`${ROUTES.studentDiscussions}/${item.discussionId}`)} />)}
        <div className="card"><Pagination page={page + 1} total={total} perPage={PAGE_SIZE} onChange={value => setPage(value - 1)} unit={tab.toLowerCase()} /></div>
      </div>}
    <CreateDiscussionModal open={createOpen} defaultTag={tab === 'Tips' ? 'tip' : 'question'} onClose={() => setCreateOpen(false)} onCreated={item => { setCreateOpen(false); toast.info(item.approvalStatus === 'APPROVED' ? 'Your post is now live in the community.' : 'Your post was submitted and is waiting for an admin to approve it before it becomes public.'); navigate(`${ROUTES.studentDiscussions}/${item.discussionId}`); }} />
  </div>;
}

function DiscussionCard({ item, onOpen, onUpvote, voting, showReviewStatus = false }: { item: DiscussionItem; onOpen: () => void; onUpvote: () => void; voting: boolean; showReviewStatus?: boolean }) {
  const canReact = !showReviewStatus || (item.approvalStatus === 'APPROVED' && item.status !== 'HIDDEN');
  return <article className="card p-4 sm:p-5">
    <div className="flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {item.isPinned && <Badge variant="warning">Pinned</Badge>}
          <Badge variant={item.tag === 'tip' ? 'success' : item.tag === 'announcement' ? 'warning' : 'info'}>{item.tag === 'tip' ? 'Tip' : item.tag === 'announcement' ? 'Announcement' : 'Question'}</Badge>
          {showReviewStatus && item.status === 'HIDDEN'
            ? <Badge variant="danger">Hidden</Badge>
            : showReviewStatus && item.approvalStatus && <Badge variant={item.approvalStatus === 'REJECTED' ? 'danger' : item.approvalStatus === 'PENDING' ? 'warning' : 'success'}>{item.approvalStatus === 'PENDING' ? 'Pending approval' : item.approvalStatus === 'APPROVED' ? 'Approved' : 'Rejected'}</Badge>}
          {item.isClosed && <Badge variant="default">Closed</Badge>}
        </div>
        <button type="button" onClick={onOpen} className="text-left text-base font-semibold leading-snug text-content hover:text-primary hover:underline">{item.title}</button>
        <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-content-soft">{item.excerpt}</p>
        {item.imageUrl && <ImageViewer src={item.imageUrl} alt="Discussion attachment" className="mt-3" imageClassName="max-h-52" />}
        <div className="mt-3 flex items-center gap-2.5">
          <Avatar name={item.author.displayName} src={authorAvatar(item.author)} size="sm" />
          <p className="text-xs text-content-subtle">{item.author.displayName} · {formatDate(item.createdAt)}</p>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={onOpen}>Open</Button>
    </div>
    <div className="mt-4 flex flex-wrap gap-4 border-t border-line pt-3 text-xs text-content-secondary">
      {canReact && <button type="button" aria-pressed={item.isUpvoted} aria-label={`${item.isUpvoted ? 'Remove upvote' : 'Upvote'} this discussion. ${item.upvoteCount} ${item.upvoteCount === 1 ? 'upvote' : 'upvotes'}`} disabled={voting} onClick={onUpvote} className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors disabled:cursor-wait disabled:opacity-60 ${item.isUpvoted ? 'font-medium text-amber-600 hover:bg-amber-50' : 'text-content-secondary hover:bg-surface-hover hover:text-amber-600'}`}>
        <Icon.Star className={`h-4 w-4 ${item.isUpvoted ? 'fill-current' : 'fill-none'}`} />{item.upvoteCount} {item.upvoteCount === 1 ? 'upvote' : 'upvotes'}
      </button>}
      <span className="inline-flex items-center gap-1.5"><Icon.Users className="h-4 w-4" />{item.commentCount} {item.commentCount === 1 ? 'comment' : 'comments'}</span>
      {item.lastCommentAt && <span className="ml-auto">Last reply {formatDate(item.lastCommentAt)}</span>}
    </div>
  </article>;
}

function CreateDiscussionModal({ open, defaultTag, initialItem, onClose, onCreated }: {
  open: boolean;
  defaultTag: 'question' | 'tip';
  initialItem?: DiscussionDetailItem | null;
  onClose: () => void;
  onCreated: (item: DiscussionItem) => void;
}) {
  const isResubmit = Boolean(initialItem);
  const [tag, setTag] = useState<'question' | 'tip'>(defaultTag);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  useEffect(() => {
    if (open) {
      setTag(initialItem?.tag === 'tip' ? 'tip' : defaultTag);
      setTitle(initialItem?.title ?? '');
      setContent(initialItem?.content ?? '');
      setAnonymous(false);
      setImageUrl(initialItem?.imageUrl ?? '');
      setError(null);
    }
  }, [open, defaultTag, initialItem]);
  const hasDraft = Boolean(!isResubmit && (title.trim() || content.trim() || anonymous || imageUrl));
  const requestClose = () => {
    if (busy) return;
    if (hasDraft) setConfirmDiscard(true);
    else onClose();
  };
  const discard = () => {
    setTitle(''); setContent(''); setAnonymous(false); setImageUrl(''); setError(null); setConfirmDiscard(false); onClose();
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(null);
    if (!title.trim() || !content.trim()) { setError('Complete the title and content.'); return; }
    setBusy(true);
    try {
      const payload = { tag, title: title.trim(), content: content.trim(), isAnonymous: anonymous, imageUrl: imageUrl || null };
      const item = isResubmit && initialItem
        ? await studentCommunityService.resubmitDiscussion(initialItem.discussionId, payload)
        : await studentCommunityService.createDiscussion(payload);
      onCreated(item); setTitle(''); setContent(''); setAnonymous(false); setImageUrl('');
    } catch (err) { setError(getApiErrorMessage(err, isResubmit ? 'Could not resubmit this post.' : 'Could not create this post.')); }
    finally { setBusy(false); }
  };
  return <><Modal open={open} onClose={requestClose} title={isResubmit ? 'Edit & resubmit post' : 'Create a community post'} size="lg" error={error && <Alert type="error" message={error} />} footer={<><Button variant="outline" onClick={requestClose} disabled={busy}>Cancel</Button><Button form="create-discussion-form" type="submit" loading={busy}>{isResubmit ? 'Resubmit for approval' : 'Publish'}</Button></>}>
    <form id="create-discussion-form" onSubmit={submit} className="space-y-4">
      <Select label="Post type" value={tag} options={[{ label: 'Question', value: 'question' }, { label: 'Tip', value: 'tip' }]} onChange={value => setTag(value as 'question' | 'tip')} />
      <Input label="Title" maxLength={200} value={title} onChange={event => setTitle(event.target.value)} placeholder="What would you like to discuss?" />
      <label className="flex flex-col gap-1.5 text-sm font-medium text-content-secondary">Details
        <textarea required maxLength={10000} rows={6} value={content} onChange={event => setContent(event.target.value)} className="w-full rounded-[10px] border border-line bg-surface p-3 text-sm text-content focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20" placeholder="Add context, what you tried, or the steps behind your tip." />
        <span className="text-xs font-normal text-content-subtle">{content.length}/10,000</span>
      </label>
      <div className="space-y-1.5"><p className="text-sm font-medium text-content-secondary">Image attachment <span className="font-normal text-content-subtle">Optional</span></p><DiscussionImageAttachment imageUrl={imageUrl} onChange={setImageUrl} /></div>
      <Checkbox checked={anonymous} onChange={setAnonymous} label="Post anonymously" />
    </form>
  </Modal><ConfirmDialog open={confirmDiscard} onClose={() => setConfirmDiscard(false)} onConfirm={discard} tone="warning" title="Discard this post?" description="Your draft will be cleared and cannot be recovered." confirmLabel="Discard draft" /></>;
}

function DiscussionDetail({ discussionId }: { discussionId: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [item, setItem] = useState<DiscussionDetailItem | null>(null);
  const [comment, setComment] = useState('');
  const [commentImageUrl, setCommentImageUrl] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [resubmitOpen, setResubmitOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ kind: 'discussion' } | { kind: 'comment'; commentId: number } | null>(null);
  const [reportReason, setReportReason] = useState('');
  useEffect(() => {
    let cancelled = false;
    setComment('');
    setCommentImageUrl('');
    setLoading(true); setError(null);
    studentCommunityService.getDiscussion(discussionId).then(data => { if (!cancelled) setItem(data); })
      .catch(err => { if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load this discussion.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [discussionId, reload]);

  const update = async (action: 'upvote' | 'bookmark' | 'close') => {
    if (!item) return;
    setBusy(true); setActionError(null);
    try {
      if (action === 'upvote') {
        const result = await studentCommunityService.toggleUpvote(discussionId);
        setItem(current => current ? { ...current, upvoteCount: result.upvoteCount, isUpvoted: result.isUpvoted } : current);
      } else if (action === 'bookmark') {
        const result = await studentCommunityService.toggleBookmark(discussionId);
        setItem(current => current ? { ...current, isBookmarked: result.isBookmarked } : current);
      } else {
        const result = await studentCommunityService.setClosed(discussionId, !item.isClosed);
        setItem(current => current ? { ...current, isClosed: result.isClosed } : current);
      }
    } catch (err) { setActionError(getApiErrorMessage(err, 'Could not update this discussion.')); }
    finally { setBusy(false); }
  };
  const postComment = async (event: FormEvent) => {
    event.preventDefault(); if (!comment.trim()) return;
    setBusy(true); setActionError(null);
    try {
      const created = await studentCommunityService.addComment(discussionId, { content: comment.trim(), isAnonymous: anonymous, imageUrl: commentImageUrl || null });
      setItem(current => current ? { ...current, comments: [...(current.comments ?? []), created], commentCount: current.commentCount + 1 } : current);
      setComment(''); setCommentImageUrl('');
    } catch (err) { setActionError(getApiErrorMessage(err, 'Could not post your comment.')); }
    finally { setBusy(false); }
  };

  const toggleAcceptComment = async (commentId: number) => {
    setBusy(true); setActionError(null);
    try {
      const updated = await studentCommunityService.acceptComment(discussionId, commentId);
      setItem(current => current ? {
        ...current,
        comments: (current.comments ?? []).map(c => c.commentId === commentId ? updated : c),
      } : current);
    } catch (err) { setActionError(getApiErrorMessage(err, 'Could not update accepted answer.')); }
    finally { setBusy(false); }
  };

  const submitReport = async (event: FormEvent) => {
    event.preventDefault();
    if (!reportTarget || reportReason.trim().length < 5) return;
    setBusy(true);
    try {
      if (reportTarget.kind === 'discussion') {
        await studentCommunityService.reportDiscussion(discussionId, reportReason.trim());
      } else {
        await studentCommunityService.reportComment(discussionId, reportTarget.commentId, reportReason.trim());
      }
      toast.success('Report submitted to Admin.');
      setReportTarget(null);
      setReportReason('');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not submit report.'));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className={`${STUDENT_PAGE_CLASS}`}><div className="card p-8 text-sm text-content-subtle">Loading discussion…</div></div>;
  if (error || !item) {
    const validId = /^\d+$/.test(discussionId) && Number(discussionId) > 0;
    const notFound = !validId || /not found|invalid request parameter/i.test(error ?? '');
    return <div className={`${STUDENT_PAGE_CLASS} space-y-4`}><Button variant="ghost" onClick={() => navigate(ROUTES.studentDiscussions)}>← Community</Button>{notFound ? <div className="card p-8 text-center"><h1 className="font-semibold text-content">Discussion not found</h1><p className="mt-2 text-sm text-content-subtle">It may have been removed or the link may be incorrect.</p><Button className="mt-4" onClick={() => navigate(ROUTES.studentDiscussions)}>Back to Community</Button></div> : <LoadError message={error ?? 'Failed to load this discussion.'} onRetry={() => setReload(value => value + 1)} />}</div>;
  }
  const approved = item.approvalStatus === 'APPROVED' && item.status !== 'HIDDEN';
  const visibleComments = (item.comments ?? []).filter(reply => reply.status !== 'HIDDEN');
  return <div className={`${STUDENT_PAGE_CLASS} space-y-5`}>
    <Button variant="ghost" onClick={() => navigate(ROUTES.studentDiscussions)}>← Community</Button>
    <article className="card space-y-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2"><Badge variant={item.tag === 'tip' ? 'success' : item.tag === 'announcement' ? 'warning' : 'info'}>{item.tag === 'tip' ? 'Tip' : item.tag === 'announcement' ? 'Announcement' : 'Question'}</Badge>{item.status === 'HIDDEN' ? <Badge variant="danger">Hidden</Badge> : <>{item.approvalStatus === 'PENDING' && <Badge variant="warning">Pending approval</Badge>}{item.approvalStatus === 'APPROVED' && <Badge variant="success">Approved</Badge>}{item.approvalStatus === 'REJECTED' && <Badge variant="danger">Rejected</Badge>}</>}{item.isPinned && <Badge variant="warning">Pinned</Badge>}{item.isClosed && <Badge>Closed</Badge>}</div>
      {item.approvalStatus === 'PENDING' && item.status !== 'HIDDEN' && <Alert type="info" message="This post is waiting for an admin to approve it. It is not visible to other students yet." />}
      {item.approvalStatus === 'REJECTED' && item.rejectionReason && (
        <div className="space-y-3">
          <Alert type="error" message={`This post was not approved: ${item.rejectionReason}`} />
          {item.isAuthor && <Button size="sm" onClick={() => setResubmitOpen(true)}>Edit & resubmit</Button>}
        </div>
      )}
      <h1 className="text-2xl font-bold text-content">{item.title}</h1>
      <div className="flex items-center gap-3">
        <Avatar name={item.author.displayName} src={authorAvatar(item.author)} size="md" />
        <p className="text-sm text-content-subtle">{item.author.displayName} · {formatDate(item.createdAt)}</p>
      </div>
      <div className="whitespace-pre-wrap border-t border-line pt-4 text-sm leading-6 text-content-secondary">{item.content}</div>
      {item.imageUrl && <ImageViewer src={item.imageUrl} alt="Discussion attachment" imageClassName="max-h-[28rem]" />}
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        {approved && <>
          <Button size="sm" variant={item.isUpvoted ? 'primary' : 'outline'} disabled={busy} icon={<Icon.Star className={`h-4 w-4 ${item.isUpvoted ? 'fill-current' : 'fill-none'}`} />} onClick={() => update('upvote')}>{item.isUpvoted ? 'Upvoted' : 'Upvote'} · {item.upvoteCount}</Button>
          <Button size="sm" variant={item.isBookmarked ? 'primary' : 'outline'} disabled={busy} icon={<Icon.Book className="h-4 w-4" />} onClick={() => update('bookmark')}>{item.isBookmarked ? 'Saved' : 'Save'}</Button>
          {item.isAuthor && item.status !== 'HIDDEN' && <Button size="sm" variant="outline" disabled={busy} icon={<Icon.Lock className="h-4 w-4" />} onClick={() => update('close')}>{item.isClosed ? 'Reopen discussion' : 'Close discussion'}</Button>}
          {!item.isAuthor && <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setReportTarget({ kind: 'discussion' }); setReportReason(''); }}>Report</Button>}
        </>}
      </div>
    </article>

    <section className="card p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-content">Replies <span className="text-sm font-normal text-content-subtle">({visibleComments.length})</span></h2>
      <div className="mt-4 divide-y divide-line">{visibleComments.map(reply => <article key={reply.commentId} className="flex gap-3 py-4 first:pt-0 last:pb-0">
        <Avatar name={reply.author.displayName} src={authorAvatar(reply.author, reply.isAnonymous)} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-content-subtle">{reply.author.displayName} · {formatDate(reply.createdAt)}</p>
            {reply.isAccepted && <Badge variant="success">Accepted answer</Badge>}
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm text-content-secondary">{reply.content}</p>
          {reply.imageUrl && <ImageViewer src={reply.imageUrl} alt="Reply attachment" className="mt-3" imageClassName="max-h-64" />}
          {approved && (
            <div className="mt-2 flex flex-wrap gap-2">
              {item.isAuthor && (
                <Button size="sm" variant={reply.isAccepted ? 'primary' : 'ghost'} disabled={busy} onClick={() => void toggleAcceptComment(reply.commentId)}>
                  {reply.isAccepted ? 'Unmark solution' : 'Mark as solution'}
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setReportTarget({ kind: 'comment', commentId: reply.commentId }); setReportReason(''); }}>
                Report
              </Button>
            </div>
          )}
        </div>
      </article>)}</div>
      {visibleComments.length === 0 && <p className="py-4 text-sm text-content-subtle">No replies yet.</p>}
      {!approved ? <p className="mt-4 rounded-lg bg-surface-muted p-3 text-sm text-content-soft">{item.status === 'HIDDEN' ? 'This post is hidden and cannot receive replies or reactions.' : 'Replies and reactions are available after an admin approves this post.'}</p> : item.isClosed ? <p className="mt-4 rounded-lg bg-surface-muted p-3 text-sm text-content-soft">This discussion is closed to new replies.</p> : <form onSubmit={postComment} className="mt-5 space-y-3 border-t border-line pt-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-content-secondary">Add a reply<textarea required maxLength={10000} rows={3} value={comment} onChange={event => setComment(event.target.value)} className="w-full rounded-[10px] border border-line bg-surface p-3 text-sm text-content focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20" placeholder="Write a helpful reply…" /></label>
        <DiscussionImageAttachment imageUrl={commentImageUrl} onChange={setCommentImageUrl} label="Attach image to reply" />
        <div className="flex flex-wrap items-center justify-between gap-3"><Checkbox checked={anonymous} onChange={setAnonymous} label="Reply anonymously" /><Button type="submit" disabled={busy || !comment.trim()} loading={busy}>Post reply</Button></div>
      </form>}
      {actionError && <p role="alert" className="mt-3 text-sm text-danger">{actionError}</p>}
    </section>

    <CreateDiscussionModal
      open={resubmitOpen}
      defaultTag={item.tag === 'tip' ? 'tip' : 'question'}
      initialItem={item}
      onClose={() => setResubmitOpen(false)}
      onCreated={() => {
        setResubmitOpen(false);
        toast.success('Post resubmitted for admin approval.');
        setReload(value => value + 1);
      }}
    />

    <Modal open={!!reportTarget} onClose={() => { if (!busy) setReportTarget(null); }} title="Report inappropriate content" size="md" footer={<>
      <Button variant="outline" onClick={() => setReportTarget(null)} disabled={busy}>Cancel</Button>
      <Button form="report-community-form" type="submit" variant="danger" disabled={busy || reportReason.trim().length < 5} loading={busy}>Submit report</Button>
    </>}>
      <form id="report-community-form" onSubmit={submitReport} className="space-y-3">
        <label className="grid gap-1.5 text-sm font-medium text-content-secondary">Reason for reporting
          <textarea required maxLength={500} rows={3} value={reportReason} onChange={event => setReportReason(event.target.value)} className="w-full rounded-lg border border-line bg-surface p-3 text-sm text-content" placeholder="Describe the issue (at least 5 characters)..." />
        </label>
      </form>
    </Modal>
  </div>;
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

function emptyTitle(tab: 'Discussions' | 'My Discussions' | 'Tips' | 'Announcements', filtered: boolean) {
  if (tab === 'My Discussions') return filtered ? 'No posts match these filters' : "You haven't posted yet";
  if (tab === 'Tips') return 'No tips yet';
  if (tab === 'Announcements') return 'No announcements yet';
  return 'No discussions found';
}

function emptyMessage(tab: 'Discussions' | 'My Discussions' | 'Tips' | 'Announcements', filtered: boolean) {
  if (tab === 'My Discussions') return filtered ? 'Try changing your search or status filters.' : 'Posts you create will appear here, including posts waiting for review.';
  if (tab === 'Tips') return 'Helpful tips from students will appear here.';
  if (tab === 'Announcements') return 'Announcements from your managers will appear here.';
  return 'Start a discussion with the community.';
}

function authorAvatar(author: DiscussionItem['author'], isAnonymous = false) {
  const anonymousName = author.displayName.toLowerCase().includes('ẩn danh') || author.displayName.toLowerCase().includes('anonymous');
  return isAnonymous || anonymousName ? '/images/anonymous_student.png' : author.avatarUrl || undefined;
}
