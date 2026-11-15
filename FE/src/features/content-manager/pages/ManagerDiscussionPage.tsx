import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
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
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Select } from '@/components/ui/Select';
import { Icon } from '@/assets/icons';
import { useToast } from '@/components/ui/ToastHost';
import { courseService, type CourseSummaryItem } from '@/services/course.service';
import { managerDiscussionService, type ManagerDiscussionStatus, type ManagerPostStatus } from '@/services/managerDiscussion.service';
import type { DiscussionDetail, DiscussionDetailComment, DiscussionItem, DiscussionTag } from '@/services/studentCommunity.service';
import { getApiErrorMessage } from '@/utils/apiError';

const PAGE_SIZE = 20;
const APPROVAL_OPTIONS = [
  { label: 'Pending approval', value: 'PENDING' },
  { label: 'Published', value: 'APPROVED' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'All approval statuses', value: 'ALL' },
];
const POST_STATUS_OPTIONS = [
  { label: 'Any post status', value: 'ALL' },
  { label: 'Open', value: 'OPEN' },
  { label: 'Closed', value: 'CLOSED' },
  { label: 'Hidden', value: 'HIDDEN' },
];
const approvalLabel = (status?: string) => ({ PENDING: 'Pending approval', APPROVED: 'Published', REJECTED: 'Rejected' }[status ?? ''] ?? status ?? '—');
const tagLabel = (tag: string) => ({ question: 'Question', tip: 'Tip', announcement: 'Announcement' }[tag] ?? tag);
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

type DeleteTarget = { kind: 'discussion'; id: number } | { kind: 'comment'; id: number };

export function ManagerDiscussionPage() {
  const toast = useToast();
  const [courses, setCourses] = useState<CourseSummaryItem[]>([]);
  const [courseId, setCourseId] = useState('');
  const [courseError, setCourseError] = useState('');
  const [approvalStatus, setApprovalStatus] = useState<ManagerDiscussionStatus>('PENDING');
  const [postStatus, setPostStatus] = useState<ManagerPostStatus>('ALL');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<DiscussionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [detail, setDetail] = useState<DiscussionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [moderationReason, setModerationReason] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCourseError('');
    courseService.getCourses({ page: 0, size: 100, sort: 'title,asc' }).then(result => {
      if (cancelled) return;
      setCourses(result.content);
      if (!courseId && result.content.length) setCourseId(String(result.content[0].courseId));
    }).catch(err => { if (!cancelled) setCourseError(getApiErrorMessage(err, 'Could not load managed courses.')); });
    return () => { cancelled = true; };
  }, []);

  const load = useCallback(async () => {
    if (!courseId) { setItems([]); setTotal(0); return; }
    setLoading(true);
    setError('');
    try {
      const result = await managerDiscussionService.list(courseId, {
        approvalStatus,
        status: postStatus,
        search: appliedSearch || undefined,
        page,
        size: PAGE_SIZE,
      });
      setItems(result.content);
      setTotal(result.totalElements);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not load course discussions.'));
    } finally {
      setLoading(false);
    }
  }, [courseId, approvalStatus, postStatus, appliedSearch, page]);

  useEffect(() => { void load(); }, [load, reload]);

  const courseOptions = useMemo(() => courses.map(course => ({ label: course.title, value: String(course.courseId) })), [courses]);
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
      await Promise.all([load(), refreshDetail(detail.discussionId)]);
      return true;
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not update this discussion.'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const approve = () => void runAction('Discussion approved and published.', () => managerDiscussionService.approve(detail!.discussionId));
  const reject = async () => {
    if (!detail || rejectReason.trim().length < 5) return;
    const succeeded = await runAction('Discussion rejected.', () => managerDiscussionService.reject(detail.discussionId, rejectReason.trim()));
    if (succeeded) { setRejecting(false); setRejectReason(''); }
  };

  const togglePin = () => void runAction(detail?.isPinned ? 'Discussion unpinned.' : 'Discussion pinned.', () => managerDiscussionService.setPinned(detail!.discussionId, !detail!.isPinned));
  const toggleClosed = () => void runAction(detail?.isClosed ? 'Discussion reopened.' : 'Discussion closed.', () => managerDiscussionService.setClosed(detail!.discussionId, !detail!.isClosed));

  const moderateComment = async (comment: DiscussionDetailComment) => {
    const next = comment.status === 'HIDDEN' ? 'VISIBLE' : 'HIDDEN';
    if (next === 'HIDDEN' && moderationReason.trim().length < 5) {
      toast.warning('Add a moderation reason of at least 5 characters before hiding a comment.');
      return;
    }
    const succeeded = await runAction(next === 'HIDDEN' ? 'Comment hidden from students.' : 'Comment restored.', () => managerDiscussionService.setCommentStatus(comment.commentId, next, next === 'HIDDEN' ? moderationReason.trim() : undefined));
    if (succeeded && next === 'HIDDEN') setModerationReason('');
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      if (deleteTarget.kind === 'discussion') {
        await managerDiscussionService.delete(deleteTarget.id);
        setDetail(null);
        toast.success('Discussion deleted.');
        await load();
      } else if (detail) {
        await managerDiscussionService.deleteComment(deleteTarget.id);
        toast.success('Comment deleted.');
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
    try { setDetail(await managerDiscussionService.getDetail(item.discussionId)); }
    catch (err) { toast.error(getApiErrorMessage(err, 'Could not load discussion details.')); }
    finally { setDetailLoading(false); }
  };

  const submitCreate = async (payload: { title: string; content: string; tag: DiscussionTag; imageUrl?: string | null; isPinned: boolean }) => {
    if (!courseId) return;
    try {
      const created = await managerDiscussionService.create(courseId, payload);
      setCreateOpen(false);
      toast.success('Discussion published.');
      await load();
      setDetail(created);
    } catch (err) {
      throw err;
    }
  };

  return <main className="mx-auto max-w-screen-2xl space-y-6 p-6 lg:p-8">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-2xl font-bold text-content">Course discussions</h1><p className="mt-1 text-sm text-content-subtle">Review student posts, moderate replies, and publish course announcements.</p></div>
      <Button icon={<Icon.Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)} disabled={!courseId}>Create course post</Button>
    </header>

    <section className="card space-y-4 p-4">
      {courseError && <Alert type="error" message={courseError} />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SearchableSelect label="Course" value={courseId} options={courseOptions} onChange={value => { setCourseId(value); setPage(0); }} placeholder="Choose a course" searchPlaceholder="Search courses…" emptyText="No managed courses" />
        <Select label="Approval" value={approvalStatus} options={APPROVAL_OPTIONS} onChange={value => { setApprovalStatus(value as ManagerDiscussionStatus); setPage(0); }} />
        <Select label="Post status" value={postStatus} options={POST_STATUS_OPTIONS} onChange={value => { setPostStatus(value as ManagerPostStatus); setPage(0); }} />
        <form onSubmit={event => { event.preventDefault(); setAppliedSearch(search.trim()); setPage(0); }} className="flex items-end gap-2">
          <SearchInput className="min-w-0 flex-1" aria-label="Search discussions" placeholder="Search posts…" value={search} onChange={event => setSearch(event.target.value)} />
          <Button type="submit" variant="outline">Search</Button>
        </form>
      </div>
      <div className="flex items-center justify-between border-t border-line pt-3 text-sm text-content-subtle"><span>{total} {total === 1 ? 'post' : 'posts'}</span><Button size="sm" variant="ghost" icon={<Icon.RefreshCw className="h-4 w-4" />} onClick={() => setReload(value => value + 1)}>Refresh</Button></div>
    </section>

    {error ? <Alert type="error" message={error} /> : loading ? <div className="card p-8 text-center text-sm text-content-subtle">Loading course discussions…</div> : items.length === 0 ? <div className="card p-8 text-center"><p className="font-medium text-content">No discussions match these filters</p><p className="mt-1 text-sm text-content-subtle">Try a different status, search term, or course.</p></div> : <section className="space-y-3">
      {items.map(item => <article key={item.discussionId} className="card p-4 transition-colors hover:border-brand-300 hover:bg-surface-hover">
        <div className="flex flex-wrap items-start gap-4">
          <button type="button" onClick={() => void openDetail(item)} className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600">
            <div className="mb-2 flex flex-wrap items-center gap-2"><Badge variant={item.approvalStatus === 'PENDING' ? 'warning' : item.approvalStatus === 'REJECTED' ? 'danger' : 'success'}>{approvalLabel(item.approvalStatus)}</Badge><Badge>{tagLabel(item.tag)}</Badge>{item.isPinned && <Badge variant="warning">Pinned</Badge>}{item.isClosed && <Badge>Closed</Badge>}</div>
            <h2 className="font-semibold text-content">{item.title}</h2>
            <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-content-secondary">{item.excerpt}</p>
            <p className="mt-3 text-xs text-content-subtle">{item.author.displayName} · {dateLabel(item.createdAt)} · {item.commentCount} replies</p>
          </button>
          {item.imageUrl && <ImageViewer src={item.imageUrl} alt="Discussion attachment" imageClassName="max-h-28" />}
          <button type="button" onClick={() => void openDetail(item)} className="mt-1 shrink-0 rounded-md p-1 text-content-subtle hover:bg-surface-muted" aria-label={`Review ${item.title}`}><Icon.ChevronRight className="h-5 w-5" /></button>
        </div>
      </article>)}
      <div className="card"><Pagination page={page + 1} total={total} perPage={PAGE_SIZE} onChange={value => setPage(value - 1)} unit="posts" /></div>
    </section>}

    <Modal open={detailLoading || !!detail} onClose={() => { if (!busy) setDetail(null); }} title={detail?.title ?? 'Loading discussion…'} size="2xl" footer={detail && <>
      <Button variant="outline" onClick={() => setDetail(null)} disabled={busy}>Close</Button>
      <Button variant="outline" icon={<Icon.Bookmark className="h-4 w-4" />} onClick={togglePin} disabled={busy}>{detail.isPinned ? 'Unpin' : 'Pin'}</Button>
      <Button variant="outline" icon={<Icon.Lock className="h-4 w-4" />} onClick={toggleClosed} disabled={busy}>{detail.isClosed ? 'Reopen' : 'Close discussion'}</Button>
      {detail.approvalStatus === 'PENDING' && !rejecting && <>
        <Button variant="danger" onClick={() => setRejecting(true)} disabled={busy}>Reject</Button>
        <Button onClick={approve} disabled={busy}>Approve</Button>
      </>}
      {rejecting && <Button variant="danger" onClick={() => void reject()} disabled={busy || rejectReason.trim().length < 5} loading={busy}>Confirm rejection</Button>}
      <Button variant="danger" icon={<Icon.Trash className="h-4 w-4" />} onClick={() => setDeleteTarget({ kind: 'discussion', id: detail.discussionId })} disabled={busy}>Delete</Button>
    </>}>
      {!detail ? <div className="py-12 text-center text-sm text-content-subtle">Loading discussion details…</div> : <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2"><Badge variant={detail.approvalStatus === 'PENDING' ? 'warning' : detail.approvalStatus === 'REJECTED' ? 'danger' : 'success'}>{approvalLabel(detail.approvalStatus)}</Badge><Badge>{tagLabel(detail.tag)}</Badge>{detail.isPinned && <Badge variant="warning">Pinned</Badge>}{detail.isClosed && <Badge>Closed</Badge>}<span className="ml-auto text-xs text-content-subtle">{dateLabel(detail.createdAt)}</span></div>
        <div className="flex items-center gap-3"><Avatar name={detail.author.displayName} src={detail.author.avatarUrl || undefined} size="sm" /><p className="text-sm text-content-secondary">{detail.author.displayName}</p></div>
        <p className="whitespace-pre-wrap text-sm leading-6 text-content-secondary">{detail.content}</p>
        {detail.imageUrl && <ImageViewer src={detail.imageUrl} alt="Discussion attachment" imageClassName="max-h-[28rem]" />}
        {rejecting && <section className="rounded-lg border border-danger-line bg-danger-light p-4"><label className="grid gap-2 text-sm font-medium text-content">Reason shown to the student<textarea maxLength={1000} rows={3} value={rejectReason} onChange={event => setRejectReason(event.target.value)} className="rounded-lg border border-line bg-surface p-3 font-normal text-content" placeholder="Explain why this post was rejected (at least 5 characters)." /></label><p className="mt-1 text-right text-xs text-content-subtle">{rejectReason.length}/1000</p></section>}
        {detail.approvalStatus === 'REJECTED' && detail.rejectionReason && <Alert type="warning" title="Rejection reason" message={detail.rejectionReason} />}
        <section className="space-y-3 border-t border-line pt-4">
          <div><h3 className="font-semibold text-content">Replies <span className="font-normal text-content-subtle">({detail.commentCount})</span></h3><p className="mt-1 text-xs text-content-subtle">Hidden replies remain visible here for moderation.</p></div>
          <label className="grid gap-1.5 text-xs font-medium text-content-secondary">Reason for hiding a reply
            <Input maxLength={500} value={moderationReason} onChange={event => setModerationReason(event.target.value)} placeholder="Explain why it should be hidden" />
          </label>
          {(detail.comments ?? []).length === 0 ? <p className="rounded-lg bg-surface-muted p-4 text-sm text-content-subtle">No replies yet.</p> : <div className="divide-y divide-line rounded-lg border border-line">
            {detail.comments.map(comment => <ManagerReply key={comment.commentId} comment={comment} busy={busy} onToggle={() => void moderateComment(comment)} onDelete={() => setDeleteTarget({ kind: 'comment', id: comment.commentId })} />)}
          </div>}
        </section>
      </div>}
    </Modal>

    <CreateManagerDiscussionModal open={createOpen} courseTitle={courses.find(course => String(course.courseId) === courseId)?.title ?? ''} onClose={() => setCreateOpen(false)} onSubmit={submitCreate} />
    <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => void confirmDelete()} loading={busy} tone="danger" confirmLabel="Delete" title={deleteTarget?.kind === 'comment' ? 'Delete this reply?' : 'Delete this discussion?'} description="This permanently removes the selected content and cannot be undone." />
  </main>;
}

function ManagerReply({ comment, busy, onToggle, onDelete }: { comment: DiscussionDetailComment; busy: boolean; onToggle: () => void; onDelete: () => void }) {
  const hidden = comment.status === 'HIDDEN';
  return <article className={`flex flex-wrap items-start gap-3 p-4 ${hidden ? 'bg-surface-muted' : ''}`}>
    <Avatar name={comment.author.displayName} src={comment.author.avatarUrl || undefined} size="sm" />
    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-xs text-content-subtle">{comment.author.displayName} · {dateLabel(comment.createdAt)}</p>{hidden && <Badge variant="danger">Hidden</Badge>}</div><p className="mt-2 whitespace-pre-wrap text-sm text-content-secondary">{comment.content}</p>{comment.imageUrl && <ImageViewer src={comment.imageUrl} alt="Reply attachment" className="mt-3" imageClassName="max-h-52" />}</div>
    <div className="flex shrink-0 gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={onToggle}>{hidden ? 'Restore' : 'Hide'}</Button><Button size="sm" variant="ghost" icon={<Icon.Trash className="h-4 w-4" />} aria-label="Delete reply" disabled={busy} onClick={onDelete} /></div>
  </article>;
}

function CreateManagerDiscussionModal({ open, courseTitle, onClose, onSubmit }: { open: boolean; courseTitle: string; onClose: () => void; onSubmit: (payload: { title: string; content: string; tag: DiscussionTag; imageUrl?: string | null; isPinned: boolean }) => Promise<void> }) {
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

  return <Modal open={open} onClose={() => { if (!busy) onClose(); }} title="Create a course post" description={courseTitle ? `Publishing to ${courseTitle}. This post is visible immediately.` : undefined} size="lg" error={error && <Alert type="error" message={error} />} footer={<><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button form="manager-discussion-form" type="submit" loading={busy}>Publish post</Button></>}>
    <form id="manager-discussion-form" onSubmit={submit} className="space-y-4">
      <Select label="Post type" value={tag} onChange={value => setTag(value as DiscussionTag)} options={[{ label: 'Announcement', value: 'announcement' }, { label: 'Tip', value: 'tip' }, { label: 'Question', value: 'question' }]} />
      <Input label="Title" maxLength={200} value={title} onChange={event => setTitle(event.target.value)} placeholder="Post title" />
      <label className="grid gap-1.5 text-sm font-medium text-content-secondary">Details<textarea required maxLength={10000} rows={6} value={content} onChange={event => setContent(event.target.value)} className="w-full rounded-[10px] border border-line bg-surface p-3 text-sm text-content focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20" placeholder="Write the course post…" /><span className="text-right text-xs font-normal text-content-subtle">{content.length}/10,000</span></label>
      <DiscussionImageAttachment imageUrl={imageUrl} onChange={setImageUrl} scope="manager" />
      <Checkbox checked={pinned} onChange={setPinned} label="Pin this post to the top of the course discussion" />
    </form>
  </Modal>;
}
