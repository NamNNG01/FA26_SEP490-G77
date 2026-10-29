import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { EmptyState } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { Tabs } from '@/components/ui/Tabs';
import { Icon } from '@/assets/icons';
import { ROUTES } from '@/app/routes';
import { studentCourseService, type MyCourse } from '@/services/studentCourse.service';
import { studentCommunityService, type DiscussionItem, type DiscussionSort } from '@/services/studentCommunity.service';
import { getApiErrorMessage } from '@/utils/apiError';
import { LoadError, PageTitle, STUDENT_PAGE_CLASS } from '../components/studentUi';

const PAGE_SIZE = 10;

export function StudentCommunityPage() {
  const { discussionId } = useParams<{ discussionId: string }>();
  return discussionId ? <DiscussionDetail discussionId={discussionId} /> : <DiscussionList />;
}

function DiscussionList() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('Discussions');
  const [courses, setCourses] = useState<MyCourse[]>([]);
  const [courseId, setCourseId] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<DiscussionSort>('latest');
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<DiscussionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    studentCourseService.getMyCourses({ page: 0, size: 100 }).then(result => {
      if (!cancelled) setCourses(result.content.filter(course => course.status === 'ACTIVE'));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    const params = { courseId: courseId ? Number(courseId) : undefined, page, size: PAGE_SIZE };
    const request = tab === 'Tips'
      ? studentCommunityService.getTips(params)
      : studentCommunityService.getDiscussions({ ...params, tag: 'question', search: search.trim() || undefined, sort });
    request.then(result => {
      if (cancelled) return;
      setItems(result.content); setTotal(result.totalElements);
    }).catch(err => { if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load community posts.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tab, courseId, search, sort, page, reload]);

  const courseOptions = useMemo(() => [{ label: 'All courses', value: '' }, ...courses.map(course => ({ label: course.title, value: String(course.courseId) }))], [courses]);
  const chooseTab = (value: string) => { setTab(value); setPage(0); };

  return <div className={`${STUDENT_PAGE_CLASS} space-y-6`}>
    <PageTitle title="Community" subtitle="Ask questions, share tips, and learn with your course community." action={<Button icon={<Icon.Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Create post</Button>} />
    <Tabs tabs={['Discussions', 'Tips']} active={tab} onChange={chooseTab} variant="underline" />
    <div className="card flex flex-wrap items-center gap-3 p-4">
      <Select aria-label="Filter by course" className="w-full sm:w-56" value={courseId} options={courseOptions} onChange={value => { setCourseId(value); setPage(0); }} />
      {tab === 'Discussions' && <>
        <Input className="w-full sm:w-72" aria-label="Search discussions" placeholder="Search discussions…" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} />
        <Select aria-label="Sort discussions" className="w-full sm:w-52" value={sort} options={[{ label: 'Latest', value: 'latest' }, { label: 'Most commented', value: 'mostCommented' }, { label: 'Most upvoted', value: 'mostUpvoted' }]} onChange={value => { setSort(value as DiscussionSort); setPage(0); }} />
      </>}
    </div>
    {error ? <LoadError message={error} onRetry={() => setReload(value => value + 1)} /> : loading ? <div className="card p-8 text-sm text-content-subtle">Loading posts…</div> : items.length === 0 ?
      <div className="card"><EmptyState icon={tab === 'Tips' ? <Icon.Lightbulb className="h-7 w-7" /> : <Icon.Book className="h-7 w-7" />} title={tab === 'Tips' ? 'No tips yet' : 'No discussions found'} message={tab === 'Tips' ? 'Helpful tips from students will appear here.' : 'Start a discussion with your course community.'} action={<Button onClick={() => setCreateOpen(true)}>Create post</Button>} /></div> :
      <div className="space-y-3">{items.map(item => <DiscussionCard key={item.discussionId} item={item} onOpen={() => navigate(`${ROUTES.studentDiscussions}/${item.discussionId}`)} />)}
        <div className="card"><Pagination page={page + 1} total={total} perPage={PAGE_SIZE} onChange={value => setPage(value - 1)} unit={tab.toLowerCase()} /></div>
      </div>}
    <CreateDiscussionModal open={createOpen} courses={courses} defaultTag={tab === 'Tips' ? 'tip' : 'question'} onClose={() => setCreateOpen(false)} onCreated={item => { setCreateOpen(false); navigate(`${ROUTES.studentDiscussions}/${item.discussionId}`); }} />
  </div>;
}

function DiscussionCard({ item, onOpen }: { item: DiscussionItem; onOpen: () => void }) {
  return <article className="card p-4 sm:p-5">
    <div className="flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {item.isPinned && <Badge variant="warning">Pinned</Badge>}
          <Badge variant={item.tag === 'tip' ? 'success' : 'info'}>{item.tag === 'tip' ? 'Tip' : 'Question'}</Badge>
          {item.isClosed && <Badge variant="default">Closed</Badge>}
          {item.course && <span className="text-xs text-content-subtle">{item.course.title}</span>}
        </div>
        <button type="button" onClick={onOpen} className="text-left text-base font-semibold leading-snug text-content hover:text-primary hover:underline">{item.title}</button>
        <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-content-soft">{item.excerpt}</p>
        <p className="mt-3 text-xs text-content-subtle">{item.author.displayName} · {formatDate(item.createdAt)}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onOpen}>Open</Button>
    </div>
    <div className="mt-4 flex flex-wrap gap-4 border-t border-line pt-3 text-xs text-content-secondary">
      <span className="inline-flex items-center gap-1.5"><Icon.Star className="h-4 w-4" />{item.upvoteCount} upvotes</span>
      <span className="inline-flex items-center gap-1.5"><Icon.Users className="h-4 w-4" />{item.commentCount} comments</span>
      {item.lastCommentAt && <span className="ml-auto">Last reply {formatDate(item.lastCommentAt)}</span>}
    </div>
  </article>;
}

function CreateDiscussionModal({ open, courses, defaultTag, onClose, onCreated }: { open: boolean; courses: MyCourse[]; defaultTag: 'question' | 'tip'; onClose: () => void; onCreated: (item: DiscussionItem) => void }) {
  const [courseId, setCourseId] = useState('');
  const [tag, setTag] = useState<'question' | 'tip'>(defaultTag);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setTag(defaultTag); setError(null); } }, [open, defaultTag]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(null);
    if (!courseId || !title.trim() || !content.trim()) { setError('Choose a course and complete the title and content.'); return; }
    setBusy(true);
    try {
      const item = await studentCommunityService.createDiscussion({ courseId: Number(courseId), tag, title: title.trim(), content: content.trim(), isAnonymous: anonymous });
      onCreated(item); setTitle(''); setContent(''); setCourseId(''); setAnonymous(false);
    } catch (err) { setError(getApiErrorMessage(err, 'Could not create this post.')); }
    finally { setBusy(false); }
  };
  return <Modal open={open} onClose={onClose} title="Create a community post" size="lg" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button form="create-discussion-form" type="submit" loading={busy}>Publish</Button></>}>
    <form id="create-discussion-form" onSubmit={submit} className="space-y-4">
      <Select label="Course" value={courseId} options={[{ label: 'Choose an enrolled course', value: '' }, ...courses.map(course => ({ label: course.title, value: String(course.courseId) }))]} onChange={setCourseId} />
      <Select label="Post type" value={tag} options={[{ label: 'Question', value: 'question' }, { label: 'Tip', value: 'tip' }]} onChange={value => setTag(value as 'question' | 'tip')} />
      <Input label="Title" maxLength={200} value={title} onChange={event => setTitle(event.target.value)} placeholder="What would you like to discuss?" />
      <label className="flex flex-col gap-1.5 text-sm font-medium text-content-secondary">Details
        <textarea required maxLength={10000} rows={6} value={content} onChange={event => setContent(event.target.value)} className="w-full rounded-[10px] border border-line bg-surface p-3 text-sm text-content focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20" placeholder="Add context, what you tried, or the steps behind your tip." />
        <span className="text-xs font-normal text-content-subtle">{content.length}/10,000</span>
      </label>
      <Checkbox checked={anonymous} onChange={setAnonymous} label="Post anonymously" />
      {!courses.length && <p className="text-sm text-warning">Enroll in an active course to create a post.</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </form>
  </Modal>;
}

function DiscussionDetail({ discussionId }: { discussionId: string }) {
  const navigate = useNavigate();
  const [item, setItem] = useState<DiscussionItem | null>(null);
  const [comment, setComment] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
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
      const created = await studentCommunityService.addComment(discussionId, { content: comment.trim(), isAnonymous: anonymous });
      setItem(current => current ? { ...current, comments: [...(current.comments ?? []), created].slice(-20), commentCount: current.commentCount + 1, lastCommentAt: created.createdAt } : current);
      setComment(''); setAnonymous(false);
    } catch (err) { setActionError(getApiErrorMessage(err, 'Could not post your comment.')); }
    finally { setBusy(false); }
  };

  if (loading) return <div className={`${STUDENT_PAGE_CLASS}`}><div className="card p-8 text-sm text-content-subtle">Loading discussion…</div></div>;
  if (error || !item) return <div className={`${STUDENT_PAGE_CLASS} space-y-4`}><Button variant="ghost" onClick={() => navigate(ROUTES.studentDiscussions)}>← Community</Button><LoadError message={error ?? 'Discussion not found.'} onRetry={() => setReload(value => value + 1)} /></div>;
  return <div className={`${STUDENT_PAGE_CLASS} space-y-5`}>
    <Button variant="ghost" onClick={() => navigate(ROUTES.studentDiscussions)}>← Community</Button>
    <article className="card space-y-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2"><Badge variant={item.tag === 'tip' ? 'success' : 'info'}>{item.tag === 'tip' ? 'Tip' : 'Question'}</Badge>{item.isPinned && <Badge variant="warning">Pinned</Badge>}{item.isClosed && <Badge>Closed</Badge>}</div>
      <h1 className="text-2xl font-bold text-content">{item.title}</h1>
      <p className="text-sm text-content-subtle">{item.author.displayName} · {formatDate(item.createdAt)}{item.course ? ` · ${item.course.title}` : ''}</p>
      <div className="whitespace-pre-wrap border-t border-line pt-4 text-sm leading-6 text-content-secondary">{item.content ?? item.excerpt}</div>
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Button size="sm" variant={item.isUpvoted ? 'primary' : 'outline'} disabled={busy} icon={<Icon.Star className="h-4 w-4" />} onClick={() => update('upvote')}>{item.isUpvoted ? 'Upvoted' : 'Upvote'} · {item.upvoteCount}</Button>
        <Button size="sm" variant={item.isBookmarked ? 'primary' : 'outline'} disabled={busy} icon={<Icon.Book className="h-4 w-4" />} onClick={() => update('bookmark')}>{item.isBookmarked ? 'Saved' : 'Save'}</Button>
        {item.isAuthor && <Button size="sm" variant="outline" disabled={busy} icon={<Icon.Lock className="h-4 w-4" />} onClick={() => update('close')}>{item.isClosed ? 'Reopen discussion' : 'Close discussion'}</Button>}
      </div>
    </article>

    <section className="card p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-content">Replies <span className="text-sm font-normal text-content-subtle">({item.commentCount})</span></h2>
      <div className="mt-4 divide-y divide-line">{(item.comments ?? []).map(reply => <article key={reply.commentId} className="py-4 first:pt-0 last:pb-0"><p className="text-xs text-content-subtle">{reply.author.displayName} · {formatDate(reply.createdAt)}</p><p className="mt-2 whitespace-pre-wrap text-sm text-content-secondary">{reply.content}</p></article>)}</div>
      {item.comments?.length === 0 && <p className="py-4 text-sm text-content-subtle">No replies yet.</p>}
      {item.isClosed ? <p className="mt-4 rounded-lg bg-surface-muted p-3 text-sm text-content-soft">This discussion is closed to new replies.</p> : <form onSubmit={postComment} className="mt-5 space-y-3 border-t border-line pt-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-content-secondary">Add a reply<textarea required maxLength={10000} rows={3} value={comment} onChange={event => setComment(event.target.value)} className="w-full rounded-[10px] border border-line bg-surface p-3 text-sm text-content focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20" placeholder="Write a helpful reply…" /></label>
        <div className="flex flex-wrap items-center justify-between gap-3"><Checkbox checked={anonymous} onChange={setAnonymous} label="Reply anonymously" /><Button type="submit" disabled={busy || !comment.trim()} loading={busy}>Post reply</Button></div>
      </form>}
      {actionError && <p role="alert" className="mt-3 text-sm text-danger">{actionError}</p>}
    </section>
  </div>;
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}
