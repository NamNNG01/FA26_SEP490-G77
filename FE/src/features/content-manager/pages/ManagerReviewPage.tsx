import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { apiClient } from '@/services/axios';
import { courseService, type CourseModuleResponse, type CourseSummaryItem } from '@/services/course.service';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Select } from '@/components/ui/Select';
import { SearchInput } from '@/components/common/SearchInput';
import { Table, type TableColumn } from '@/components/ui/Table';
import { ImageViewer } from '@/components/common/ImageViewer';
import { Icon } from '@/assets/icons';
import { QuestionForm } from '@/features/question/components/QuestionForm';
import { fromDetail, type QuestionDraft } from '@/features/question/model';
import type { QuestionDetail } from '@/services/question.service';
import { useAuth } from '@/auth/authContext';

type Kind = 'contributions' | 'decks';
type Row = Record<string, any>;
const unwrap = (response: any) => {
  if (!response?.success) throw Object.assign(new Error(response?.message || 'Request failed'), { data: response?.data });
  return response.data;
};
const idOf = (row: Row, kind: Kind) => kind === 'contributions' ? row.contributionId : row.deckId;
const statusOf = (row: Row, kind: Kind) => kind === 'contributions' ? row.status : row.reviewStatus;
const QUESTION_TYPES = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'MATCHING', 'FILL_BLANK', 'ORDERING', 'ESSAY', 'CODE', 'DIAGRAM', 'DIAGRAM_ESSAY'];
const questionTypeLabel = (value: string) => ({
  SINGLE_CHOICE: 'Single choice', MULTIPLE_CHOICE: 'Multiple choice', TRUE_FALSE: 'True or false',
  MATCHING: 'Matching', FILL_BLANK: 'Fill in the blank', ORDERING: 'Ordering', ESSAY: 'Essay', CODE: 'Code', DIAGRAM: 'Diagram', DIAGRAM_ESSAY: 'Diagram + Essay',
} as Record<string, string>)[value] || value;
const statusLabel = (value: string) => ({ PENDING: 'Pending', PENDING_REVIEW: 'Pending', ACCEPTED: 'Approved', APPROVED: 'Approved', REJECTED: 'Rejected', ALL: 'All statuses' } as Record<string, string>)[value] || value;
const collectionPath = (kind: Kind) => kind === 'contributions' ? '/manager/contributions' : '/manager/decks/review';
const detailPath = (kind: Kind, id: number | string) => `${collectionPath(kind)}/${id}`;
const actionPath = (kind: Kind, id: number | string, decision: 'approve' | 'reject') => `${detailPath(kind, id)}/${decision}`;
const isPending = (kind: Kind, status: string | null | undefined) => status === (kind === 'contributions' ? 'PENDING' : 'PENDING_REVIEW');
const apiStatus = (kind: Kind, status: string) => {
  if (status === 'PENDING' || status === 'PENDING_REVIEW') return kind === 'contributions' ? 'PENDING' : 'PENDING_REVIEW';
  if (status === 'APPROVED' || status === 'ACCEPTED') return 'APPROVED';
  return status;
};
const decisionMessage = (decision: 'approve' | 'reject', kind: Kind) => `${kind === 'decks' ? 'Flashcard deck' : 'Question contribution'} ${decision === 'approve' ? 'approved' : 'rejected'}.`;
const errorDetails = (error: any) => error?.response?.data?.data ?? error?.data ?? {};
const errorMessage = (error: any) => error?.response?.data?.message || error?.message || 'The request could not be completed.';
const difficultyLabel = (value: string) => value ? value[0] + value.slice(1).toLowerCase() : '—';
const dateTimeLocal = (value: string | null, subtractMilliseconds = 0) => {
  if (!value) return '';
  const date = new Date(new Date(value).getTime() - subtractMilliseconds);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const parseJson = (value: unknown, fallback: unknown = null): any => {
  if (typeof value !== 'string') return value ?? fallback;
  try { return JSON.parse(value); } catch { return fallback; }
};

function contributionQuestionDraft(detail: Row): QuestionDraft {
  const metadata = parseJson(detail.questionMetadata, {});
  const rawOptions = parseJson(detail.options, []);
  const rawTestCases = parseJson(detail.testCases, metadata?.testCases ?? null);
  const options = Array.isArray(rawOptions) ? rawOptions.map((option: Row, index: number) => ({
    optionId: option.optionId ?? null,
    optionText: option.optionText ?? option.text ?? option.label ?? '',
    isCorrect: option.isCorrect ?? false,
    explanation: option.explanation ?? null,
    orderIndex: option.orderIndex ?? index,
  })) : [];
  const question: QuestionDetail = {
    questionId: detail.contributionId,
    courseId: detail.courseId ?? null,
    moduleId: detail.moduleId ?? null,
    groupId: detail.groupId ?? null,
    questionType: detail.questionType || detail.type || 'SINGLE_CHOICE',
    difficulty: detail.difficulty || 'MEDIUM',
    content: detail.content ?? '',
    questionMetadata: metadata,
    answerKey: parseJson(detail.answerKey, null),
    defaultPoints: null,
    source: 'CONTRIBUTION_REVIEW',
    creatorRole: 'STUDENT',
    createdBy: detail.contributorId ?? null,
    scoringVersion: null,
    lockVersion: detail.version ?? null,
    aiExplanation: detail.explanation ?? '',
    status: 'INACTIVE',
    approvalStatus: 'PENDING',
    essayGradingRubric: parseJson(detail.essayGradingRubric, null),
    options,
    codeConfig: parseJson(detail.codeConfig, metadata?.codeConfig ?? metadata?.codeQuestionConfig ?? null),
    testCases: Array.isArray(rawTestCases) ? rawTestCases.map((testCase: Row, index: number) => ({
      ...testCase,
      inputData: testCase.inputData ?? testCase.input ?? '',
      expectedOutput: testCase.expectedOutput ?? testCase.output ?? '',
      hidden: testCase.hidden ?? testCase.isHidden ?? false,
      orderIndex: testCase.orderIndex ?? index,
    })) : null,
    createdAt: detail.createdAt ?? null,
    updatedAt: detail.reviewedAt ?? null,
  };
  return fromDetail(question);
}

async function findContributorName(courseId: number | string, userId: number | string) {
  for (let page = 0, totalPages = 1; page < totalPages; page += 1) {
    const result = await courseService.getCourseStudents(courseId, { page, size: 100 });
    const match = result.content.find(student => String(student.userId) === String(userId));
    if (match?.fullName?.trim()) return match.fullName;
    totalPages = result.totalPages;
  }
  return undefined;
}

export function ManagerReviewPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [kind, setKind] = useState<Kind>(params.get('kind') === 'decks' ? 'decks' : 'contributions');
  const [rows, setRows] = useState<Row[]>([]);
  const [detail, setDetail] = useState<Row | null>(null);
  const [questionDraft, setQuestionDraft] = useState<QuestionDraft | null>(null);
  const [pageData, setPageData] = useState<any>({ page: 0, totalPages: 0, totalElements: 0 });
  const [status, setStatus] = useState(() => {
    const value = params.get('status') || 'PENDING';
    return apiStatus(params.get('kind') === 'decks' ? 'decks' : 'contributions', value);
  });
  const [keyword, setKeyword] = useState(params.get('keyword') || '');
  const [courseId, setCourseId] = useState(params.get('courseId') || '');
  const [moduleId, setModuleId] = useState(params.get('moduleId') || '');
  const [contributorId, setContributorId] = useState(params.get('contributorId') || '');
  const [questionType, setQuestionType] = useState(params.get('questionType') || '');
  const [difficulty, setDifficulty] = useState(params.get('difficulty') || '');
  const [submittedFrom, setSubmittedFrom] = useState(dateTimeLocal(params.get('submittedFrom')));
  const [submittedTo, setSubmittedTo] = useState(dateTimeLocal(params.get('submittedTo'), 60_000));
  const [courses, setCourses] = useState<CourseSummaryItem[]>([]);
  const [modules, setModules] = useState<CourseModuleResponse[]>([]);
  const [students, setStudents] = useState<{ userId: number; fullName: string }[]>([]);
  const [courseNameOverrides, setCourseNameOverrides] = useState<Record<string, string>>({});
  const [contributorSearch, setContributorSearch] = useState('');
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [openingId, setOpeningId] = useState<number | string | null>(null);
  const [reason, setReason] = useState('');
  const [approveNote, setApproveNote] = useState('');
  const [confirmingApproval, setConfirmingApproval] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [deckCardPage, setDeckCardPage] = useState(0);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async (nextPage = Number(params.get('page') || 0)) => {
    setBusy(true);
    setError('');
    try {
      const query = new URLSearchParams({ page: String(nextPage), size: '20', status: apiStatus(kind, status), sort: 'submittedAt,asc' });
      if (keyword.trim()) query.set('keyword', keyword.trim());
      if (courseId) query.set('courseId', courseId);
      if (moduleId) query.set('moduleId', moduleId);
      if (contributorId) query.set('contributorId', contributorId);
      if (kind === 'contributions' && questionType) query.set('questionType', questionType);
      if (kind === 'contributions' && difficulty) query.set('difficulty', difficulty);
      if (submittedFrom) query.set('submittedFrom', new Date(submittedFrom).toISOString());
      if (submittedTo) query.set('submittedTo', new Date(new Date(submittedTo).getTime() + 60_000).toISOString());
      const data = unwrap((await apiClient.get(`${collectionPath(kind)}?${query}`)).data);
      setRows(data.content || []);
      setPageData(data);
      setDetail(null);
      return data.content || [];
    } catch (e: any) {
      setError(errorMessage(e) || 'Could not load review queue');
      return [];
    } finally {
      setBusy(false);
    }
  }, [kind, status, keyword, courseId, moduleId, contributorId, questionType, difficulty, submittedFrom, submittedTo, params]);

  useEffect(() => {
    let cancelled = false;
    courseService.getCourses({ size: 100, sort: 'title,asc' }).then(result => {
      if (!cancelled) setCourses(result.content);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!courseId) {
      setModules([]);
      setModuleId('');
      return;
    }
    setModules([]);
    courseService.getCourseModules(courseId).then(result => {
      if (!cancelled) setModules(result);
    }).catch(() => {
      if (!cancelled) setModules([]);
    });
    return () => { cancelled = true; };
  }, [courseId]);

  useEffect(() => {
    if (courses.length === 0) return;
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setStudentsLoading(true);
      try {
        const relevantCourses = courseId ? courses.filter(course => String(course.courseId) === courseId) : courses;
        const pages = await Promise.all(relevantCourses.map(course => courseService.getCourseStudents(course.courseId, {
          search: contributorSearch.trim() || undefined,
          page: 0,
          size: 100,
        })));
        if (!cancelled) {
          const unique = new Map<number, { userId: number; fullName: string }>();
          pages.flatMap(result => result.content).forEach(student => unique.set(student.userId, { userId: student.userId, fullName: student.fullName }));
          setStudents([...unique.values()].sort((a, b) => a.fullName.localeCompare(b.fullName)));
        }
      } catch {
        if (!cancelled) setStudents([]);
      } finally {
        if (!cancelled) setStudentsLoading(false);
      }
    }, contributorSearch ? 250 : 0);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [courses, courseId, contributorSearch]);

  useEffect(() => {
    let cancelled = false;
    const knownNames = new Set(courses.map(course => String(course.courseId)));
    const unresolvedIds = [...new Set(rows.map(row => row.courseId ?? row.course?.courseId ?? row.course?.id)
      .filter((id): id is number | string => id != null)
      .map(String))]
      .filter(id => !knownNames.has(id) && !courseNameOverrides[id]);
    if (!unresolvedIds.length) return;
    Promise.all(unresolvedIds.map(async id => {
      try {
        const course = await courseService.getCourseById(id);
        return [id, course.title] as const;
      } catch {
        return null;
      }
    })).then(results => {
      if (cancelled) return;
      const resolved = Object.fromEntries(results.filter((item): item is readonly [string, string] => !!item && !!item[1]));
      if (Object.keys(resolved).length) setCourseNameOverrides(current => ({ ...current, ...resolved }));
    });
    return () => { cancelled = true; };
  }, [rows, courses, courseNameOverrides]);

  const syncUrl = (pageNumber = 0) => {
    const next: Record<string, string> = { kind, status: apiStatus(kind, status), page: String(pageNumber) };
    if (keyword.trim()) next.keyword = keyword.trim();
    if (courseId) next.courseId = courseId;
    if (moduleId) next.moduleId = moduleId;
    if (contributorId) next.contributorId = contributorId;
    if (kind === 'contributions' && questionType) next.questionType = questionType;
    if (kind === 'contributions' && difficulty) next.difficulty = difficulty;
    if (submittedFrom) next.submittedFrom = new Date(submittedFrom).toISOString();
    if (submittedTo) next.submittedTo = new Date(new Date(submittedTo).getTime() + 60_000).toISOString();
    setParams(next, { replace: true });
  };

  useEffect(() => {
    syncUrl(0);
    load(0);
  }, [kind, status]);

  const open = async (row: Row, cardPage = 0) => {
    if (kind === 'decks' && detail?.deckId === idOf(row, kind)) setCardsLoading(true);
    else setDetailLoading(true);
    setOpeningId(idOf(row, kind));
    if (kind !== 'decks' || detail?.deckId !== idOf(row, kind)) setDetail(null);
    setQuestionDraft(null);
    setError('');
    try {
      const query = kind === 'decks' ? `?cardPage=${cardPage}&cardSize=50` : '';
      let data = unwrap((await apiClient.get(`${detailPath(kind, idOf(row, kind))}${query}`)).data);
      if (kind === 'contributions') {
        const contributorId = data.contributorId ?? row.contributor?.id ?? row.contributorId;
        const knownName = data.owner?.fullName || data.contributor?.fullName || data.contributorName || students.find(student => String(student.userId) === String(contributorId))?.fullName;
        const fetchedName = !knownName && data.courseId && contributorId
          ? await findContributorName(data.courseId, contributorId).catch(() => undefined)
          : undefined;
        data = { ...data, contributorName: knownName || fetchedName || (contributorId ? `Contributor #${contributorId}` : 'Unknown contributor') };
        setQuestionDraft(contributionQuestionDraft(data));
      } else {
        setQuestionDraft(null);
        setDeckCardPage(data.cards?.page ?? cardPage);
      }
      setDetail(data);
      setRejecting(false);
      setConfirmingApproval(false);
      setReason('');
      setApproveNote('');
    } catch (e: any) {
      setError(errorMessage(e) || 'Could not load item');
    } finally {
      setDetailLoading(false);
      setCardsLoading(false);
      setOpeningId(null);
    }
  };

  const review = async (decision: 'approve' | 'reject') => {
    if (!detail) return;
    if (decision === 'reject' && reason.trim().length < 5) {
      setError('Please enter a reason of at least 5 characters.');
      return;
    }
    if (decision === 'approve' && !confirmingApproval) {
      setConfirmingApproval(true);
      setRejecting(false);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const id = idOf(detail, kind);
      const payload = decision === 'approve' ? { version: detail.version, note: approveNote.trim() } : { version: detail.version, reason: reason.trim() };
      unwrap((await apiClient.post(actionPath(kind, id, decision), payload)).data);
      setRejecting(false);
      setConfirmingApproval(false);
      setReason('');
      setApproveNote('');
      setNotice(decisionMessage(decision, kind));
      const currentIndex = rows.findIndex(row => idOf(row, kind) === id);
      const remainingRows = await load(Number(params.get('page') || 0));
      const nextRow = remainingRows[Math.min(Math.max(currentIndex, 0), remainingRows.length - 1)];
      if (nextRow) void open(nextRow);
    } catch (e: any) {
      const details = errorDetails(e);
      const subCode = details.subCode;
      const code = details.code;
      if (subCode === 'VERSION_CONFLICT') {
        setError('This submission changed while you were reviewing it. Reload the item to see the latest version.');
      } else if (subCode === 'ALREADY_REVIEWED') {
        setDetail(null);
        await load(Number(params.get('page') || 0));
        setError('This submission has already been reviewed. The queue has been refreshed.');
      } else if (subCode === 'INVALID_CONTENT') {
        const reasons = details.details?.reasons ?? details.reasons;
        setError(Array.isArray(reasons) && reasons.length ? `This submission cannot be approved: ${reasons.join('; ')}` : errorMessage(e));
      } else if (subCode === 'REASON_REQUIRED') {
        setRejecting(true);
        setError('Enter a rejection reason of at least 5 characters.');
      } else if (subCode === 'CANNOT_REVIEW_OWN') {
        setDetail(current => current ? { ...current, canReview: false } : current);
        setError('You cannot review your own submission.');
      } else if (code === 'RESOURCE_NOT_FOUND') {
        setDetail(null);
        await load(Number(params.get('page') || 0));
        setError('This item was not found or is outside your course access. The queue has been refreshed.');
      } else if (code === 'VALIDATION_ERROR' && details.details?.fieldErrors) {
        const fields = Object.entries(details.details.fieldErrors as Record<string, unknown>).map(([field, message]) => `${field}: ${message}`).join('; ');
        setError(fields || errorMessage(e));
      } else {
        setError(errorMessage(e) || 'Review action failed. You can retry manually.');
      }
    } finally {
      setBusy(false);
    }
  };

  const clearFilters = async () => {
    setKeyword('');
    setCourseId('');
    setModuleId('');
    setContributorId('');
    setQuestionType('');
    setDifficulty('');
    setSubmittedFrom('');
    setSubmittedTo('');
    setParams({ kind, status, page: '0' }, { replace: true });
    setBusy(true);
    setError('');
    try {
      const query = new URLSearchParams({ page: '0', size: '20', status: apiStatus(kind, status), sort: 'submittedAt,asc' });
      const data = unwrap((await apiClient.get(`${collectionPath(kind)}?${query}`)).data);
      setRows(data.content || []);
      setPageData(data);
      setDetail(null);
    } catch (e: any) {
      setError(e.message || 'Could not load review queue');
    } finally {
      setBusy(false);
    }
  };

  const refreshQueue = async () => {
    setRefreshing(true);
    try { await load(Number(params.get('page') || 0)); }
    finally { setRefreshing(false); }
  };

  const page = Number(pageData.page || 0);
  const detailStatus = detail && statusOf(detail, kind);
  const detailContributorId = detail?.contributor?.id ?? detail?.contributorId ?? detail?.owner?.id ?? detail?.userId;
  const isOwnSubmission = !!detail && detailContributorId != null && String(detailContributorId) === String(user?.userId);
  const canReviewDetail = !!detail?.canReview && !isOwnSubmission && isPending(kind, detailStatus);
  const courseOptions = [{ label: 'All courses', value: '' }, ...courses.map(course => ({ label: course.title, value: String(course.courseId) }))];
  const moduleOptions = [{ label: 'All modules', value: '' }, ...modules.map(module => ({ label: module.title, value: String(module.moduleId) }))];
  const contributorOptions = [
    { label: 'Any contributor', value: '' },
    ...students.map(student => ({ label: `${student.fullName} (#${student.userId})`, value: String(student.userId) })),
  ];
  if (contributorId && !contributorOptions.some(option => option.value === contributorId)) contributorOptions.push({ label: `Contributor #${contributorId}`, value: contributorId });
  const studentNames = new Map(students.map(student => [String(student.userId), student.fullName]));
  const courseNames = new Map(courses.map(course => [String(course.courseId), course.title]));
  const courseNameOf = (row: Row) => {
    const id = String(row.courseId ?? row.course?.courseId ?? row.course?.id);
    return row.course?.title || row.courseName || row.courseTitle || courseNames.get(id) || courseNameOverrides[id] || '—';
  };
  const columns: TableColumn[] = [
    { key: 'submission', label: 'Submission', width: '36%', render: value => {
      const row = value as Row;
      const id = idOf(row, kind);
      const title = row.title || row.contentPreview || row.content || `Submission #${id}`;
      const subtitle = kind === 'decks' ? `${row.cardCount ?? 0} cards${row.module?.title ? ` · ${row.module.title}` : ''}` : row.questionType ? questionTypeLabel(row.questionType) : `Submission #${id}`;
      return <div className="min-w-0"><p className="line-clamp-2 whitespace-normal font-medium text-content" title={title}>{title}</p><p className="mt-1 truncate text-xs text-content-secondary" title={subtitle}>{subtitle}</p></div>;
    } },
    { key: 'contributor', label: 'Contributor', render: value => {
      const row = value as Row;
      return row.owner?.fullName || row.contributor?.fullName || studentNames.get(String(row.contributor?.id ?? row.contributorId)) || row.contributorName || (row.contributor?.id ? `Contributor #${row.contributor.id}` : '—');
    } },
    { key: 'course', label: 'Course', render: value => <span className="block truncate" title={courseNameOf(value as Row)}>{courseNameOf(value as Row)}</span> },
    { key: 'submittedAt', label: 'Submitted', className: 'whitespace-nowrap', render: value => {
      const submittedAt = (value as Row).submittedAt;
      return submittedAt ? new Date(submittedAt).toLocaleString() : '—';
    } },
    { key: 'status', label: 'Status', render: value => {
      const current = statusOf(value as Row, kind);
      const variant = isPending(kind, current) ? 'warning' : current === 'REJECTED' ? 'danger' : 'success';
      return <Badge variant={variant}>{statusLabel(current || '')}</Badge>;
    } },
  ];

  return <main className="mx-auto max-w-screen-2xl space-y-6 p-6 lg:p-8">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-2xl font-bold text-content">Content review</h1><p className="mt-1 text-sm text-content-subtle">Review student questions and flashcard decks submitted for publication.</p></div>
      <div className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-content-secondary">{pageData.totalElements || 0} submissions</div>
    </header>

    <div className="flex gap-2 border-b border-line" role="tablist" aria-label="Review type">
      {(['contributions', 'decks'] as Kind[]).map(tab => <button key={tab} type="button" role="tab" aria-selected={kind === tab} onClick={() => {
        setKind(tab);
        setStatus(current => current === 'ALL' || current === 'REJECTED'
          ? current
          : current === 'APPROVED' || current === 'ACCEPTED' ? 'APPROVED' : (tab === 'decks' ? 'PENDING_REVIEW' : 'PENDING'));
        if (tab === 'decks') {
          setQuestionType('');
          setDifficulty('');
        }
      }} className={`border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${kind === tab ? 'border-brand-600 text-brand-700' : 'border-transparent text-content-secondary hover:text-content'}`}>
        {tab === 'contributions' ? 'Question contributions' : 'Flashcard decks'}
      </button>)}
    </div>

    {notice && <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">{notice}</div>}
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

    <form onSubmit={e => { e.preventDefault(); syncUrl(0); load(0); }} className="card space-y-3 px-4 py-4">
      <SearchInput className="w-full" aria-label="Search submissions" placeholder="Search submissions…" value={keyword} onChange={e => setKeyword(e.target.value)} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Select label="Status" value={status} onChange={value => setStatus(apiStatus(kind, value))} options={[
            { label: 'Pending', value: kind === 'contributions' ? 'PENDING' : 'PENDING_REVIEW' },
            { label: 'Approved', value: 'APPROVED' },
            { label: 'Rejected', value: 'REJECTED' },
            { label: 'All statuses', value: 'ALL' },
          ]} />
          <SearchableSelect label="Course" options={courseOptions} value={courseId} onChange={value => { setCourseId(value); setModuleId(''); }} placeholder="All courses" searchPlaceholder="Search courses…" />
          <SearchableSelect label="Module" options={moduleOptions} value={moduleId} onChange={setModuleId} disabled={!courseId} placeholder={courseId ? 'All modules' : 'Choose a course first'} searchPlaceholder="Search modules…" />
          <SearchableSelect label="Contributor" options={contributorOptions} value={contributorId} onChange={setContributorId} onSearchChange={setContributorSearch} placeholder="Any contributor" searchPlaceholder="Search students by name…" emptyText={studentsLoading ? 'Searching students…' : 'No students found'} />
          {kind === 'contributions' && <>
            <Select label="Question type" triggerClassName="w-full h-10 pl-3 pr-10 rounded-lg text-sm" value={questionType} onChange={setQuestionType} options={[{ label: 'All question types', value: '' }, ...QUESTION_TYPES.map(type => ({ label: questionTypeLabel(type), value: type }))]} />
            <Select label="Difficulty" triggerClassName="w-full h-10 pl-3 pr-10 rounded-lg text-sm" value={difficulty} onChange={setDifficulty} options={[{ label: 'All difficulties', value: '' }, { label: 'Easy', value: 'EASY' }, { label: 'Medium', value: 'MEDIUM' }, { label: 'Hard', value: 'HARD' }]} />
          </>}
          <label className="grid gap-1.5 text-sm font-medium text-content-secondary">Submitted after
            <input type="datetime-local" className="h-10 rounded-lg border border-line bg-surface px-3 text-content" value={submittedFrom} onChange={e => setSubmittedFrom(e.target.value)} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-content-secondary">Submitted before
            <input type="datetime-local" className="h-10 rounded-lg border border-line bg-surface px-3 text-content" value={submittedTo} onChange={e => setSubmittedTo(e.target.value)} />
          </label>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="outline" disabled={busy || refreshing} loading={refreshing} onClick={() => void refreshQueue()}>Refresh</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void clearFilters()}>Clear filters</Button>
        <Button type="submit" loading={busy}>Apply filters</Button>
      </div>
    </form>

    <div className="card overflow-hidden">
      <Table
        columns={columns}
        data={rows.map(row => ({ ...row, id: idOf(row, kind) }))}
        unit="submissions"
        serverPagination={{ page: page + 1, total: pageData.totalElements || 0, onChange: value => { syncUrl(value - 1); void load(value - 1); } }}
        onRowClick={row => void open(row as Row)}
        emptyState={busy ? 'Loading submissions…' : 'No submissions found. Try changing the filters.'}
      />
    </div>

    <Modal open={!!detail || detailLoading} onClose={() => { setDetail(null); setRejecting(false); setConfirmingApproval(false); setReason(''); setApproveNote(''); setError(''); }} title={detail ? (detail.title || `Submission #${idOf(detail, kind)}`) : 'Loading submission…'} size="2xl" footer={detail && <>
      {canReviewDetail && rejecting ? <>
        <Button variant="outline" onClick={() => { setRejecting(false); setReason(''); setError(''); }} disabled={busy}>Cancel rejection</Button>
        <Button variant="danger" onClick={() => void review('reject')} loading={busy} disabled={reason.trim().length < 5}>Confirm rejection</Button>
      </> : canReviewDetail && confirmingApproval ? <>
        <Button variant="outline" onClick={() => { setConfirmingApproval(false); setApproveNote(''); setError(''); }} disabled={busy}>Cancel</Button>
        <Button onClick={() => void review('approve')} loading={busy} disabled={approveNote.trim().length > 1000}>Confirm approval</Button>
      </> : canReviewDetail ? <>
        <Button variant="outline" onClick={() => setDetail(null)} disabled={busy}>Close</Button>
        <Button variant="danger" onClick={() => { setRejecting(true); setConfirmingApproval(false); setError(''); }} disabled={busy}>Reject</Button>
        <Button onClick={() => void review('approve')} disabled={busy}>Approve</Button>
      </> : <Button variant="outline" onClick={() => setDetail(null)}>Close</Button>}
    </>}>
      {!detail ? <div className="py-12 text-center text-sm text-content-secondary">Loading submission details…</div> : <div className="space-y-5">
        {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><span>{error}</span>{detail && <Button size="sm" variant="outline" disabled={detailLoading || cardsLoading || busy} onClick={() => void open(detail, deckCardPage)}>Reload item</Button>}</div>}
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isPending(kind, detailStatus) ? 'bg-amber-50 text-amber-800' : detailStatus === 'REJECTED' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{statusLabel(detailStatus || '')}</span>
          <span className="text-xs text-content-secondary">{kind === 'decks' ? 'Flashcard deck' : 'Question contribution'}</span>
          <span className="ml-auto text-xs text-content-secondary">Version {detail.version ?? 0}</span>
        </div>
        <div className="grid gap-3 rounded-lg bg-surface-muted p-4 text-sm sm:grid-cols-2">
          <p><span className="text-content-secondary">Contributor</span><br /><span className="font-medium text-content">{detail.owner?.fullName || detail.contributor?.fullName || detail.contributorName || studentNames.get(String(detail.contributorId ?? detail.contributor?.id)) || (detail.contributorId ? `Contributor #${detail.contributorId}` : '—')}</span></p>
          <p><span className="text-content-secondary">Course and module</span><br /><span className="font-medium text-content">{courseNameOf(detail)}{detail.module?.title ? ` · ${detail.module.title}` : ''}</span></p>
          <p><span className="text-content-secondary">Submitted</span><br /><span className="font-medium text-content">{detail.submittedAt || detail.createdAt ? new Date(detail.submittedAt || detail.createdAt).toLocaleString() : '—'}</span></p>
          <p><span className="text-content-secondary">Submission</span><br /><span className="font-medium text-content">{detail.resubmissionCount ? `Resubmission ${detail.resubmissionCount}` : 'First submission'}</span></p>
          {kind === 'contributions' && <p><span className="text-content-secondary">Type and difficulty</span><br /><span className="font-medium text-content">{questionTypeLabel(detail.questionType || detail.type || '')} · {difficultyLabel(detail.difficulty || 'MEDIUM')}</span></p>}
        </div>
        {kind === 'contributions' && detail.contributor?.stats && <section aria-label="Contributor history" className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-lg border border-line p-3"><div className="font-semibold text-content">{detail.contributor.stats.approvedCount ?? 0}</div><div className="text-xs text-content-secondary">Approved</div></div>
          <div className="rounded-lg border border-line p-3"><div className="font-semibold text-content">{detail.contributor.stats.rejectedCount ?? 0}</div><div className="text-xs text-content-secondary">Rejected</div></div>
          <div className="rounded-lg border border-line p-3"><div className="font-semibold text-content">{detail.contributor.stats.pendingCount ?? 0}</div><div className="text-xs text-content-secondary">Pending</div></div>
        </section>}
        {(detail.reviewedBy || detail.reviewNote) && <section className="rounded-lg border border-line bg-surface-muted p-3 text-sm">
          <h3 className="font-semibold text-content">Review result</h3>
          {detail.reviewedBy && <p className="mt-1 text-content-secondary">Reviewed by {detail.reviewedBy.fullName || detail.reviewedBy.name || `#${detail.reviewedBy.id ?? detail.reviewedBy}`}{detail.reviewedAt ? ` · ${new Date(detail.reviewedAt).toLocaleString()}` : ''}</p>}
          {detail.reviewNote && <p className="mt-2 whitespace-pre-wrap text-content-secondary">{detail.reviewNote}</p>}
        </section>}
        {detail.description && <section><h3 className="mb-2 text-sm font-semibold text-content">Description</h3><p className="whitespace-pre-wrap text-sm text-content-secondary">{detail.description}</p></section>}
        {kind === 'decks' ? <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-content">Cards</h3><div className="flex items-center gap-3"><span className="text-xs text-content-secondary">{detail.cardCount ?? detail.cards?.totalElements ?? 0} total</span>{(detail.cards?.totalPages ?? 1) > 1 && <div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={cardsLoading || deckCardPage <= 0} onClick={() => void open(detail, deckCardPage - 1)}>Previous</Button><span className="text-xs text-content-secondary">Page {deckCardPage + 1} of {detail.cards.totalPages}</span><Button size="sm" variant="outline" disabled={cardsLoading || deckCardPage + 1 >= detail.cards.totalPages} onClick={() => void open(detail, deckCardPage + 1)}>Next</Button></div>}</div></div>
          {cardsLoading && <p className="text-sm text-content-secondary" role="status">Loading cards…</p>}
          {(detail.cards?.content || []).map((card: Row) => <article key={card.cardId} className="rounded-lg border border-line p-4">
            <div className="mb-3 flex items-center justify-between gap-2"><h4 className="font-semibold text-content">Card {card.position ?? ''}</h4><span className="rounded-full bg-surface-muted px-2 py-1 text-xs text-content-secondary">{card.cardType || 'TEXT'}</span></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="min-w-0"><h5 className="mb-1 text-xs font-semibold uppercase tracking-wide text-content-secondary">Front</h5>{card.frontText && <p className="whitespace-pre-wrap break-words text-sm text-content">{card.frontText}</p>}{card.frontImageUrl && <ImageViewer src={card.frontImageUrl} alt="Flashcard front" className="mt-2" />}</div>
              <div className="min-w-0"><h5 className="mb-1 text-xs font-semibold uppercase tracking-wide text-content-secondary">Back</h5>{card.backText && <p className="whitespace-pre-wrap break-words text-sm text-content">{card.backText}</p>}{card.backImageUrl && <ImageViewer src={card.backImageUrl} alt="Flashcard back" className="mt-2" />}</div>
            </div>
            {card.codeBody && <div className="mt-3"><p className="mb-1 text-xs font-semibold text-content-secondary">Code{card.codeLanguage ? ` · ${card.codeLanguage}` : ''}</p><pre className="overflow-auto rounded bg-surface-muted p-3 text-sm"><code>{card.codeBody}</code></pre></div>}
            {card.hint && <p className="mt-3 rounded bg-surface-muted p-3 text-sm text-content-secondary"><span className="font-medium text-content">Hint: </span>{card.hint}</p>}
          </article>)}
        </section> : <>
          <section><h3 className="mb-2 text-sm font-semibold text-content">Submitted question</h3>{questionDraft ? <QuestionForm q={questionDraft} index={0} heading={detail.title || 'Question preview'} onChange={() => undefined} showErrors={false} readOnly /> : <p className="whitespace-pre-wrap rounded-lg border border-line p-4 text-sm text-content">{detail.question?.content || detail.content || detail.questionText || '—'}</p>}</section>
          {detail.mediaUrl && <section><h3 className="mb-2 text-sm font-semibold text-content">Question image</h3><ImageViewer src={detail.mediaUrl} alt="Question attachment" />
          </section>}
          {detail.group && <p className="rounded-lg bg-surface-muted p-3 text-sm text-content-secondary">Question group: <span className="font-medium text-content">{detail.group.title || detail.group.name || `#${detail.group.id}`}</span></p>}
          {kind === 'contributions' && detail.sourceReference && <section><h3 className="mb-2 text-sm font-semibold text-content">Source reference</h3><p className="whitespace-pre-wrap rounded-lg bg-surface-muted p-3 text-sm text-content-secondary">{detail.sourceReference}</p></section>}
        </>}
        {!!detail.history?.length && <section><h3 className="mb-2 text-sm font-semibold text-content">Review history</h3><div className="space-y-2">{detail.history.map((entry: Row, index: number) => <div key={index} className="rounded-lg border border-line px-3 py-2 text-sm"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium text-content">{statusLabel(entry.decision || '')}{entry.reviewer?.fullName ? ` · ${entry.reviewer.fullName}` : ''}</span><span className="text-xs text-content-secondary">{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : ''}</span></div>{(entry.note || entry.reason) && <p className="mt-1 whitespace-pre-wrap text-content-secondary">{entry.note || entry.reason}</p>}</div>)}</div></section>}
        {(!detail.canReview || isOwnSubmission) && <p className="rounded-lg bg-surface-muted p-3 text-sm text-content-secondary">{isOwnSubmission ? 'You cannot review your own submission.' : `This item is ${isPending(kind, detailStatus) ? 'not available for review by your account' : statusLabel(detailStatus || '').toLowerCase()}.`}</p>}
        {confirmingApproval && <section className="rounded-lg border border-brand-200 bg-brand-50 p-4"><label className="grid gap-2 text-sm font-medium text-content">Approval note <span className="font-normal text-content-secondary">Optional</span><textarea maxLength={1000} value={approveNote} onChange={e => setApproveNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && void review('approve')} rows={3} className="rounded-lg border border-line bg-white p-3 text-content" placeholder="Add a note for the contributor (optional)" /></label><div className="mt-2 text-right text-xs text-content-secondary">{approveNote.length}/1000</div></section>}
        {rejecting && <section className="rounded-lg border border-red-200 bg-red-50 p-4"><label className="grid gap-2 text-sm font-medium text-red-900">Reason for rejection<textarea autoFocus maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && reason.trim().length >= 5 && void review('reject')} rows={4} className="rounded-lg border border-line bg-white p-3 text-content" placeholder="Explain why this submission is being rejected" /></label><div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-content-secondary"><span>At least 5 characters</span><span>{reason.length}/1000</span></div><div className="mt-3 flex flex-wrap gap-2">{['Incorrect answer', 'Duplicate content', 'Spelling or grammar', 'Not suitable for this course'].map(template => <button key={template} type="button" onClick={() => setReason(template)} className="rounded-full border border-red-200 bg-white px-2.5 py-1 text-xs text-red-900 hover:bg-red-100">{template}</button>)}</div></section>}
      </div>}
    </Modal>
  </main>;
}
