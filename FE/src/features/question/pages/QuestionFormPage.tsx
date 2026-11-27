import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastHost';
import { ROUTES } from '@/app/routes';
import { QUESTION_STATUS_LABELS, explanationMissing, questionService, type QuestionDetail, type QuestionStatus } from '@/services/question.service';
import { questionGroupService, type QuestionGroup } from '@/services/questionGroup.service';
import { QuestionForm as QuestionFormBlock } from '../components/QuestionForm';
import { QuestionSidePanel } from '../components/QuestionSidePanel';
import { ImportPdfModal } from '../components/ImportPdfModal';
import { GroupContextCard, contextGroupMeta, contextKind, emptyGroupContext, groupContextErrors, type GroupContextValue } from '../components/GroupContextCard';
import { AiGeneratePanel, type AiGeneratePanelHandle } from '../components/AiGeneratePanel';
import { Badge } from '@/components/ui/Badge';
import { Checkbox } from '@/components/ui/Checkbox';
import { UnsavedChangesModal } from '@/components/common/UnsavedChangesModal';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import {
  GROUP_KIND_LABELS,
  QUESTION_TYPE_OPTIONS,
  asGroupKind,
  changeType,
  copyDraft,
  emptyDraft,
  fromDetail,
  isDraftValid,
  kindOf,
  toCreateRequest,
  toUpdateRequest,
  typesOfKind,
  type GroupKind,
  type QuestionDraft,
} from '../model';
import { clearCreateDraft, hasUnsavedCreateWork, loadCreateDraft, saveCreateDraft, type CreateDraftSnapshot } from '../createDraft';
import { Icon } from '@/assets/icons';
import { describeSaveError, loadErrorMessage, type SaveError } from '../saveError';
import { getApiErrorMessage } from '@/utils/apiError';

/** Q-03 accepts 1..50 questions per request. */
const MAX_BATCH = 50;
/** How often saved questions whose explanation the AI is writing are re-read. */
const EXPLANATION_POLL_MS = 10000;

/** Publishing is final, so both publish buttons ask first: this question (edit) or the ticked drafts (create). */
type Confirm = 'publishOne' | 'publishSaved' | null;

/**
 * Create mode: write questions by hand, or draft them with AI (AI-01/02). The
 * two are separate — each saves its own questions, and the page only switches
 * to the other one when nothing is left unsaved in the current one.
 */
type CreateMode = 'manual' | 'ai';
type DraftFilter = 'all' | 'errors' | 'valid';

/** A question saved on this visit (or opened from an AI explanation notification), editable in place. */
interface SavedQuestion {
  detail: QuestionDetail;
  /** The card's form state — the stored question until the manager changes it. */
  draft: QuestionDraft;
  groupMeta?: { groupId: number; title: string; questionType: string | null };
  /** Changed on the page and not saved yet. */
  edited?: boolean;
}

const typeLabel = (t: string) => QUESTION_TYPE_OPTIONS.find(o => o.value === t)?.label ?? t;

/** `?review=` ids from an "AI explanations ready" notification. */
const parseReviewIds = (raw: string | null) =>
  [...new Set((raw ?? '').split(',').map(Number).filter(n => Number.isInteger(n) && n > 0))];

/** New Questions route: a new notification batch (`?review=`) opens a fresh page. */
export function QuestionCreatePage() {
  const [searchParams] = useSearchParams();
  return <QuestionFormPage key={searchParams.get('review') ?? ''} mode="create" />;
}

export function QuestionFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const isEdit = mode === 'edit';
  const { questionId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  /** Create mode: the AI explanation batch to review, from the notification. */
  const [reviewIds] = useState(() => (isEdit ? [] : parseReviewIds(searchParams.get('review'))));
  const isReview = reviewIds.length > 0;
  /** Create mode: "Duplicate" in the bank — start from a copy of this question (replaces any stored draft). */
  const [duplicateOf] = useState(() => (isEdit ? null : searchParams.get('duplicate')));
  /** Create mode: entry intent from Question Bank (+ New Question Group / + Add Question to group). */
  const [entryIntent] = useState(() => {
    if (isEdit || searchParams.get('duplicate')) return null;
    const context = searchParams.get('context');
    const groupId = searchParams.get('groupId');
    const courseIdParam = searchParams.get('courseId') ?? '';
    const moduleIdParam = searchParams.get('moduleId') ?? '';
    if (!context && !groupId && !courseIdParam && !moduleIdParam) return null;
    return { context, groupId, courseId: courseIdParam, moduleId: moduleIdParam };
  });
  const hasGroupIntent = Boolean(entryIntent?.context === 'new-group' || entryIntent?.groupId);
  const navigate = useNavigate();
  const toast = useToast();

  /** Create mode: unsaved work from before a reload, read once. */
  const [restored] = useState<CreateDraftSnapshot | null>(() => (isEdit || duplicateOf || hasGroupIntent ? null : loadCreateDraft()));
  const [questions, setQuestions] = useState<QuestionDraft[]>(() => {
    if (isEdit) return [];
    if (hasGroupIntent) return [emptyDraft()];
    return restored?.questions ?? [];
  });
  const [courseId, setCourseId] = useState(() => (hasGroupIntent ? entryIntent?.courseId ?? '' : restored?.courseId || entryIntent?.courseId || ''));
  const [moduleId, setModuleId] = useState(() => (hasGroupIntent ? entryIntent?.moduleId ?? '' : restored?.moduleId || entryIntent?.moduleId || ''));
  const [status, setStatus] = useState<QuestionStatus>('INACTIVE');
  /** Edit mode: the stored question has an explanation — publishing needs one. */
  const [savedHasExplanation, setSavedHasExplanation] = useState(true);
  /** Saved questions whose explanation the AI is writing in the background (AI-04). */
  const [pendingExplanations, setPendingExplanations] = useState<Set<number>>(() => new Set());
  /** Saved questions the AI could not write an explanation for. */
  const [failedExplanations, setFailedExplanations] = useState<Set<number>>(() => new Set());
  /** Create mode: questions saved on this visit (manual and AI), in save order — they start as Draft. */
  const [saved, setSaved] = useState<SavedQuestion[]>([]);
  /** Saved drafts ticked for publishing. */
  const [toPublish, setToPublish] = useState<Set<number>>(() => new Set());
  const [publishing, setPublishing] = useState(false);
  /** Create mode: standalone batch, or questions that share one group passage. */
  const [groupCtx, setGroupCtx] = useState<GroupContextValue>(() => {
    if (entryIntent?.context === 'new-group') return { ...emptyGroupContext(), mode: 'new' };
    if (entryIntent?.groupId) return { ...emptyGroupContext(), mode: 'existing', existingGroupId: entryIntent.groupId };
    return restored?.groupCtx ?? emptyGroupContext();
  });
  const [groups, setGroups] = useState<QuestionGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);

  /** Questions the user has edited — their errors show before the first save attempt. */
  const [touched, setTouched] = useState<Set<string>>(() => new Set(restored?.touched ?? []));
  const [submitted, setSubmitted] = useState(false);
  const [dirty, setDirty] = useState(Boolean(restored));
  /** The latest edits are in localStorage, so a reload needs no browser prompt. */
  const [draftStored, setDraftStored] = useState(Boolean(restored));

  // Clear one-time URL intent parameters after initializing state.
  useEffect(() => {
    if (!entryIntent) return;
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('context');
      next.delete('groupId');
      next.delete('courseId');
      next.delete('moduleId');
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once for opening intent
  }, []);

  const [loading, setLoading] = useState(isEdit || Boolean(duplicateOf));
  /** Keys of questions the backend found already in the course — they can't be saved until changed. */
  const [inBank, setInBank] = useState<Set<string>>(() => new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [createMode, setCreateMode] = useState<CreateMode>('manual');
  const [draftFilter, setDraftFilter] = useState<DraftFilter>('all');
  const [draftTypeFilter, setDraftTypeFilter] = useState<string>('ALL');
  /** Index of a written question waiting for a delete confirmation (blank ones go at once). */
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  /** AI suggestions on the page, accepted or not — none of them saved yet. */
  const [aiPending, setAiPending] = useState(0);
  const [aiAccepted, setAiAccepted] = useState<QuestionDraft[]>([]);
  const aiRef = useRef<AiGeneratePanelHandle>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** Set once the user confirmed leaving without saving — stops the draft from being stored again. */
  const leavingRef = useRef(false);

  // Edit mode: load the question.
  useEffect(() => {
    if (!isEdit || !questionId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    questionService
      .getQuestionById(questionId)
      .then(detail => {
        if (cancelled) return;
        setQuestions([fromDetail(detail)]);
        setCourseId(detail.courseId != null ? String(detail.courseId) : '');
        setModuleId(detail.moduleId != null ? String(detail.moduleId) : '');
        setStatus(detail.status);
        setSavedHasExplanation(!explanationMissing(detail.aiExplanation));
        if (detail.explanationStatus === 'PENDING') {
          setPendingExplanations(new Set([detail.questionId]));
          setFailedExplanations(new Set());
        } else if (detail.explanationStatus === 'FAILED') {
          setPendingExplanations(new Set());
          setFailedExplanations(new Set([detail.questionId]));
        } else {
          setPendingExplanations(new Set());
          setFailedExplanations(new Set());
        }
        setDirty(false);
      })
      .catch(err => {
        if (!cancelled) setLoadError(loadErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [isEdit, questionId, reloadKey]);

  // Create mode, from "Duplicate": load the question and start from an unsaved copy of it.
  useEffect(() => {
    if (!duplicateOf) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    questionService
      .getQuestionById(duplicateOf)
      .then(detail => {
        if (cancelled) return;
        const copy = copyDraft(fromDetail(detail));
        setQuestions([copy]);
        setTouched(new Set([copy.key]));
        setCourseId(detail.courseId != null ? String(detail.courseId) : '');
        setModuleId(detail.moduleId != null ? String(detail.moduleId) : '');
        setGroupCtx(detail.groupId != null ? { ...emptyGroupContext(), mode: 'existing', existingGroupId: String(detail.groupId) } : emptyGroupContext());
        toast.info(
          'Change it before saving — a question that already exists in the course can’t be saved again.',
          { title: `Copied from question #${detail.questionId}`, duration: 8000 },
        );
        // Stored as the draft from here on, so a reload keeps the copy (and its edits).
        setDirty(true);
        setSearchParams(prev => {
          const next = new URLSearchParams(prev);
          next.delete('duplicate');
          return next;
        }, { replace: true });
      })
      .catch(err => {
        if (!cancelled) setLoadError(loadErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once for the question the page opened with
  }, [duplicateOf, reloadKey]);

  // Create mode, from an "AI explanations" notification: load the batch into the saved list to fix and publish.
  const [reviewLoading, setReviewLoading] = useState(isReview);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewReloadKey, setReviewReloadKey] = useState(0);
  /** Unsaved draft from before, while a batch opens: keep it or clear it? */
  const [askDraft, setAskDraft] = useState(isReview && Boolean(restored));
  /** Course & module of the batch — the page moves there unless the draft keeps its own. */
  const reviewLocationRef = useRef<{ courseId: string; moduleId: string } | null>(null);
  useEffect(() => {
    if (!isReview) return;
    let cancelled = false;
    setReviewLoading(true);
    setReviewError(null);
    Promise.all(reviewIds.map(id => questionService.getQuestionById(id).catch(() => null)))
      .then(details => {
        if (cancelled) return;
        const found = details.filter((d): d is QuestionDetail => Boolean(d));
        if (!found.length) {
          setReviewError('These questions were not found — they may have been deleted.');
          return;
        }
        setSaved(found.map(detail => ({ detail, draft: fromDetail(detail) })));
        setPendingExplanations(new Set(found.filter(d => d.explanationStatus === 'PENDING').map(d => d.questionId)));
        setFailedExplanations(new Set(found.filter(d => d.explanationStatus === 'FAILED').map(d => d.questionId)));
        const first = found[0];
        reviewLocationRef.current = {
          courseId: first.courseId != null ? String(first.courseId) : '',
          moduleId: first.moduleId != null ? String(first.moduleId) : '',
        };
        if (!restored) {
          setCourseId(reviewLocationRef.current.courseId);
          setModuleId(reviewLocationRef.current.moduleId);
        }
        if (found.length < reviewIds.length) {
          const n = reviewIds.length - found.length;
          toast.warning(`${n} question${n === 1 ? ' was' : 's were'} not found — they may have been deleted.`);
        }
      })
      .finally(() => {
        if (!cancelled) setReviewLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once for the batch the page opened with
  }, [reviewReloadKey]);

  // Create mode: groups belong to a course — load them for the selected one.
  useEffect(() => {
    if (isEdit || !courseId) {
      setGroups([]);
      return;
    }
    let cancelled = false;
    setGroupsLoading(true);
    questionGroupService
      .getQuestionGroups({ courseId: Number(courseId), size: 100 })
      .then(res => { if (!cancelled) setGroups(res.content); })
      .catch(() => { if (!cancelled) setGroups([]); })
      .finally(() => { if (!cancelled) setGroupsLoading(false); });
    return () => { cancelled = true; };
  }, [isEdit, courseId]);

  const hasRealCreateWork = !isEdit && hasUnsavedCreateWork(questions, touched, groupCtx);

  // Create mode: keep only real unsaved work (written questions or drafted new group) in localStorage; clear empty shells so revisiting never pops an alert.
  useEffect(() => {
    if (isEdit || leavingRef.current) return;
    if (!hasRealCreateWork) {
      clearCreateDraft();
      setDraftStored(false);
      return;
    }
    setDraftStored(false);
    // A save still pending when the user leaves must not bring the draft back.
    const id = setTimeout(() => {
      if (!leavingRef.current) setDraftStored(saveCreateDraft({ questions, courseId, moduleId, groupCtx, touched: [...touched] }));
    }, 400);
    return () => clearTimeout(id);
  }, [isEdit, hasRealCreateWork, questions, courseId, moduleId, groupCtx, touched]);

  /** Untouched blank questions (the starter one) give way to appended drafts; flagged imports stay. */
  const isKept = (q: QuestionDraft) => touched.has(q.key) || q.content.trim() !== '' || Boolean(q.importIssue);
  const kept = questions.filter(isKept).length;

  /**
   * Kinds of the questions already written (manual mode). A group holds one
   * kind, so they decide which groups the batch can go into: one kind → only
   * groups of it; several → none until the questions agree.
   */
  const writtenKinds = isEdit || createMode === 'ai'
    ? []
    : [...new Set(questions.filter(isKept).map(q => kindOf(q.type)).filter((k): k is GroupKind => k != null))];
  const writtenKey = writtenKinds.join(',');

  // Keep an existing group in line with the written questions: one of another kind is unpicked.
  // A new group's type stays the user's choice — a mismatch is reported when saving.
  useEffect(() => {
    if (!writtenKinds.length) return;
    setGroupCtx(prev => {
      if (prev.mode === 'existing' && prev.existingGroupId) {
        const picked = asGroupKind(groups.find(g => String(g.groupId) === prev.existingGroupId)?.questionType);
        if (writtenKinds.length > 1 || (picked && picked !== writtenKinds[0])) return { ...prev, existingGroupId: '' };
      }
      return prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- writtenKey stands in for writtenKinds (a new array every render)
  }, [writtenKey, groupCtx.mode, groups]);

  // In a group every question must be of the group's kind (QUIZ / ESSAY / CODE / DIAGRAM / DIAGRAM_ESSAY) across BOTH Manual and AI Generate.
  const kind = isEdit ? null : contextKind(groupCtx, groups);
  const allowedTypes = kind ? typesOfKind(kind) : undefined;
  const activeGroupMeta = isEdit ? null : contextGroupMeta(groupCtx, groups);
  const groupCtxErrors = groupContextErrors(groupCtx);
  const firstGroupIssue = groupCtxErrors.group ?? groupCtxErrors.title ?? groupCtxErrors.passage;
  const kindError = (q: QuestionDraft) =>
    allowedTypes && !allowedTypes.includes(q.type) && kind
      ? `${typeLabel(q.type)} questions can’t go into a ${GROUP_KIND_LABELS[kind].toLowerCase()} group — pick a ${GROUP_KIND_LABELS[kind].toLowerCase()} type.`
      : undefined;
  /** Save-time toast: which question types the group's kind holds. */
  const kindToast = (k: GroupKind) =>
    `${GROUP_KIND_LABELS[k]} groups can only contain these question types: ${typesOfKind(k).map(typeLabel).join(', ')}.`;
  /** A blank question starts on the first type the group allows. */
  const newDraft = () => (allowedTypes && !allowedTypes.includes(emptyDraft().type) ? changeType(emptyDraft(), allowedTypes[0]) : emptyDraft());

  // Picking a group kind moves the untouched starter questions onto an allowed type; written ones keep theirs (and show an error).
  const kindKey = allowedTypes?.join(',');
  useEffect(() => {
    if (!allowedTypes) return;
    setQuestions(prev => prev.map(q => (allowedTypes.includes(q.type) || isKept(q) ? q : changeType(q, allowedTypes[0]))));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kindKey stands in for allowedTypes (a new array every render)
  }, [kindKey]);

  /** Manual mode holds real written work or a new group draft that would be lost on exit. */
  const manualBusy = hasRealCreateWork;
  const aiBusy = aiPending > 0;
  /**
   * Edit mode: any change. Create mode: only real written questions or a drafted new group.
   */
  /** Create mode: saved questions changed on the page — not kept across a reload. */
  const savedChanged = !isEdit && saved.some(s => s.edited);
  const unsaved = isEdit ? dirty : manualBusy || savedChanged;

  // Unsaved edits, or AI suggestions not saved yet, hold any navigation away for confirmation.
  // Reloading only prompts for what the stored draft can't bring back.
  const { blocker, leave } = useUnsavedChangesGuard(
    unsaved || aiBusy,
    (unsaved && (isEdit || !draftStored)) || savedChanged || aiBusy,
  );

  /**
   * Leaving without saving was confirmed — the draft goes with it. Done in the
   * click itself: the page unmounts as the navigation goes ahead, so an effect
   * waiting for the blocker's 'proceeding' state may never run.
   */
  const discardOnLeave = () => {
    if (isEdit) return;
    leavingRef.current = true;
    clearCreateDraft();
  };

  /** Back to an empty list; the location and group context stay. */
  const resetManual = () => {
    clearCreateDraft();
    setQuestions([]);
    setTouched(new Set());
    setSubmitted(false);
    setInBank(new Set());
    setDraftFilter('all');
    setDraftTypeFilter('ALL');
    setDirty(false);
  };

  const discardRestored = () => {
    resetManual();
    setCourseId('');
    setModuleId('');
    setGroupCtx(emptyGroupContext());
  };

  // Create mode: say once that unsaved work came back, with a way to throw it away.
  const restoredToastRef = useRef(false);
  useEffect(() => {
    // Opening a batch asks about the draft in a dialog instead.
    if (!restored || restoredToastRef.current || isReview) return;
    restoredToastRef.current = true;
    toast.info(`Restored your unsaved draft from ${new Date(restored.savedAt).toLocaleString()}.`, {
      action: { label: 'Discard draft', onClick: discardRestored },
      duration: 10000,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shown once, for the draft the page opened with
  }, []);

  /** A failed save: the backend's field errors as a list, and Reload when someone else changed the question. Stays until closed. */
  const showSaveError = (error: SaveError) =>
    toast.error(error.conflict ? 'Reload to get the latest version, then apply your changes again.' : error.message, {
      title: error.conflict ? 'This question was changed by someone else' : 'Could not save',
      details: error.details,
      action: error.conflict && isEdit ? { label: 'Reload question', onClick: () => setReloadKey(k => k + 1) } : undefined,
      duration: null,
    });

  const unsavedDetails = [
    ...(isEdit && unsaved ? ['Your changes to this question'] : []),
    ...(!isEdit && manualBusy ? [`${kept} question${kept === 1 ? '' : 's'} not saved yet`] : []),
    ...(savedChanged ? (() => {
      const n = saved.filter(s => s.edited).length;
      return [`Changes to ${n} saved question${n === 1 ? '' : 's'}`];
    })() : []),
    ...(aiPending > 0 ? [`${aiPending} AI suggestion${aiPending === 1 ? '' : 's'} not saved yet`] : []),
  ];

  /** Leaving through Cancel / breadcrumb goes through the guard's confirmation. */
  const goToBank = () => navigate(ROUTES.managerQuestions);

  /** Manual and AI keep their own work — switching only changes which one is shown. */
  const switchMode = (next: CreateMode) => {
    if (next === createMode) return;
    setSubmitted(false);
    setCreateMode(next);
  };

  const updateQuestion = (i: number, q: QuestionDraft) => {
    setQuestions(prev => prev.map((p, pi) => (pi === i ? q : p)));
    setTouched(prev => (prev.has(q.key) ? prev : new Set(prev).add(q.key)));
    // Changed since the backend said it was already in the course — let the next save check it again.
    setInBank(prev => {
      if (!prev.has(q.key)) return prev;
      const next = new Set(prev);
      next.delete(q.key);
      return next;
    });
    setDirty(true);
  };

  /** "Generate AI Explanation" on one question: only flags it — the AI runs after saving (AI-04). */
  const requestExplanation = (i: number, requested: boolean) => {
    const q = questions[i];
    if (!q) return;
    updateQuestion(i, { ...q, explanationRequested: requested || undefined });
    if (requested) {
      toast.info('You can save now — AI writes the explanation in the background and notifies you when it is ready.', {
        title: 'AI explanation queued for after save',
      });
    }
  };

  /** Flags every question with a blank explanation at once. */
  const blankExplanationCount = questions.filter(q => explanationMissing(q.explanation) && !q.explanationRequested).length;
  const requestAllBlankExplanations = () => {
    const count = blankExplanationCount;
    if (!count) return;
    setQuestions(prev => prev.map(q => (explanationMissing(q.explanation) ? { ...q, explanationRequested: true } : q)));
    setDirty(true);
    toast.info(`You can save now — AI writes the ${count} explanation${count === 1 ? '' : 's'} in the background and notifies you when they are ready.`, {
      title: `AI explanations queued for ${count} question${count === 1 ? '' : 's'}`,
    });
  };

  /**
   * Hands saved questions to the AI (AI-04). The backend notifies the manager when done; while
   * the page stays open the questions are also re-read here, so their cards update by themselves.
   */
  const queueExplanations = async (ids: number[], overwrite = false) => {
    if (!ids.length) return;
    try {
      const res = await questionService.queueAiExplanations(ids, overwrite);
      setPendingExplanations(prev => new Set([...prev, ...ids]));
      setFailedExplanations(prev => {
        const next = new Set(prev);
        ids.forEach(id => next.delete(id));
        return next;
      });
      const queued = res?.queuedCount ?? ids.length;
      toast.info('You will get a notification when they are ready — publishing unlocks then.', {
        title: `AI is writing ${queued} explanation${queued === 1 ? '' : 's'} in the background`,
      });
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not start the AI explanations.'), {
        title: 'AI explanations not started',
        action: { label: 'Try again', onClick: () => { void queueExplanations(ids, overwrite); } },
        duration: null,
      });
    }
  };

  // Re-read questions whose explanation is being written until the AI is done (or gave up).
  const pendingKey = [...pendingExplanations].sort((a, b) => a - b).join(',');
  useEffect(() => {
    if (!pendingKey) return;
    const ids = pendingKey.split(',').map(Number);
    const id = window.setTimeout(async () => {
      const details = await Promise.all(ids.map(qid => questionService.getQuestionById(qid).catch(() => null)));
      const done = new Set<number>();
      const failed = new Set<number>();
      details.forEach(d => {
        if (!d) return;
        if (!explanationMissing(d.aiExplanation) && d.explanationStatus !== 'PENDING') done.add(d.questionId);
        else if (d.explanationStatus === 'FAILED') failed.add(d.questionId);
      });
      const byId = new Map(details.filter((d): d is QuestionDetail => Boolean(d)).map(d => [d.questionId, d]));
      setSaved(prev => prev.map(item => {
        const d = byId.get(item.detail.questionId);
        if (!d || !(done.has(d.questionId) || failed.has(d.questionId))) return item;
        if (!item.edited) return { ...item, detail: d, draft: fromDetail(d) };
        // Keep the manager's unsaved changes; take the new version and fill a still-blank explanation.
        const explanation = explanationMissing(item.draft.explanation) ? d.aiExplanation ?? '' : item.draft.explanation;
        return { ...item, detail: d, draft: { ...item.draft, lockVersion: d.lockVersion, explanation } };
      }));
      if (isEdit) {
        const d = details[0];
        if (d && done.has(d.questionId)) {
          setSavedHasExplanation(true);
          if (!dirty) setQuestions([fromDetail(d)]);
        }
      }
      if (done.size || failed.size) {
        setPendingExplanations(prev => new Set([...prev].filter(x => !done.has(x) && !failed.has(x))));
        if (failed.size) setFailedExplanations(prev => new Set([...prev, ...failed]));
      } else {
        // Nothing finished yet: a new Set re-runs this effect for the next round.
        setPendingExplanations(prev => new Set(prev));
      }
    }, EXPLANATION_POLL_MS);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pendingKey stands in for pendingExplanations
  }, [pendingKey, pendingExplanations]);

  /** Adds an unsaved copy right below question i. */
  const duplicateQuestion = (i: number) => {
    if (questions.length >= MAX_BATCH) {
      toast.warning(`You can save up to ${MAX_BATCH} questions at a time — save these first.`);
      return;
    }
    const copy = copyDraft(questions[i]);
    setQuestions(prev => [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)]);
    setTouched(prev => new Set(prev).add(copy.key));
    setDirty(true);
    requestAnimationFrame(() => scrollTo(copy.key));
  };

  const move = (i: number, dir: -1 | 1) => {
    setQuestions(prev => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setDirty(true);
  };

  const remove = (i: number) => {
    setQuestions(prev => prev.filter((_, pi) => pi !== i));
    setDirty(true);
  };

  const scrollTo = (key: string) => document.getElementById(key)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const hasDraftError = (q: QuestionDraft) =>
    !isDraftValid(q) || Boolean(kindError(q)) || inBank.has(q.key) || (Boolean(q.importIssue) && !touched.has(q.key));

  const revealAndScrollTo = (key: string, forceReset = false) => {
    if (forceReset || draftFilter !== 'all' || draftTypeFilter !== 'ALL') {
      setDraftFilter('all');
      setDraftTypeFilter('ALL');
      requestAnimationFrame(() => requestAnimationFrame(() => scrollTo(key)));
    } else {
      requestAnimationFrame(() => scrollTo(key));
    }
  };

  const addQuestion = () => {
    if (questions.length >= MAX_BATCH) {
      toast.warning(`You can save up to ${MAX_BATCH} questions at a time — save these first.`);
      return;
    }
    const draft = newDraft();
    setQuestions(prev => [...prev, draft]);
    revealAndScrollTo(draft.key);
  };

  /** Append drafts, replacing the untouched blank starter question instead of keeping it around. */
  const appendDrafts = (drafts: QuestionDraft[]) => {
    setQuestions(prev => [...prev.filter(isKept), ...drafts]);
    setDirty(true);
  };

  /** Every block of the file comes in; ones that couldn't be read carry their errors. */
  const handleImported = (drafts: QuestionDraft[], importCourseId: string, importModuleId: string) => {
    // The questions belong where they were imported into.
    if (importCourseId !== courseId || importModuleId !== moduleId) changeLocation(importCourseId, importModuleId);
    const fitting = drafts.slice(0, Math.max(0, MAX_BATCH - kept));
    if (fitting.length < drafts.length) {
      toast.warning(`Only ${fitting.length} of ${drafts.length} questions were added — you can save up to ${MAX_BATCH} at a time.`);
    }
    setShowImport(false);
    if (!fitting.length) return;
    appendDrafts(fitting);
    const issues = fitting.filter(d => d.importIssue || !isDraftValid(d)).length;
    const imported = `${fitting.length} question${fitting.length === 1 ? '' : 's'} imported`;
    if (issues > 0) {
      toast.warning('Questions with errors are highlighted below — filter by Errors or click Save to jump straight to them.', {
        title: `${imported} — ${issues} need fixes`,
        duration: 8000,
      });
    } else {
      toast.success('Review and filter the imported questions below before saving.', { title: imported });
    }
    revealAndScrollTo(fitting[0].key, true);
  };

  const onAiAccepted = useCallback((drafts: QuestionDraft[]) => setAiAccepted(drafts), []);

  const changeGroupCtx = (v: GroupContextValue) => {
    setGroupCtx(v);
    if (createMode === 'manual' && v.mode === 'new' && questions.length === 0) {
      const types = typesOfKind(v.newKind);
      const starter = types.length && !types.includes(emptyDraft().type) ? changeType(emptyDraft(), types[0]) : emptyDraft();
      setQuestions([starter]);
    }
    if (createMode === 'manual') setDirty(hasUnsavedCreateWork(questions, touched, v));
  };

  const changeLocation = (c: string, m: string) => {
    // A group belongs to one course (and maybe one module), so a picked group may no longer apply.
    const nextCtx = c !== courseId || m !== moduleId ? { ...groupCtx, existingGroupId: '' } : groupCtx;
    if (nextCtx !== groupCtx) setGroupCtx(nextCtx);
    setCourseId(c);
    setModuleId(m);
    if (createMode === 'manual') setDirty(hasUnsavedCreateWork(questions, touched, nextCtx));
  };

  const locationNote =
    !courseId ? 'Select a course to save.'
      : !isEdit && !moduleId ? 'Select a module to save.'
      : !isEdit && createMode === 'manual' && questions.length > MAX_BATCH ? `You can save up to ${MAX_BATCH} questions at a time.`
      : null;

  /**
   * Persists a batch of questions (standalone, into an existing group, or atomically creating a new group + >= 1 question).
   * Returns how many questions were saved.
   */
  const createBatch = async (drafts: QuestionDraft[]): Promise<number> => {
    const moduleVal = moduleId ? Number(moduleId) : null;
    if (groupCtx.mode === 'new') {
      const res = await questionGroupService.createGroupWithQuestions({
        courseId: Number(courseId),
        moduleId: moduleVal,
        questionType: groupCtx.newKind,
        title: groupCtx.newTitle.trim(),
        passageText: groupCtx.newPassage.trim(),
        questions: drafts.map(q => toCreateRequest(q, Number(courseId), moduleVal)),
      });
      setGroups(prev => [res.group, ...prev]);
      setGroupCtx({ ...emptyGroupContext(), mode: 'existing', existingGroupId: String(res.group.groupId) });
      const groupMeta = {
        groupId: res.group.groupId,
        title: res.group.title ?? `Group #${res.group.groupId}`,
        questionType: res.group.questionType,
      };
      toast.success(`Group “${groupMeta.title}” created with ${res.questions.length} draft question${res.questions.length === 1 ? '' : 's'}.`);
      setSaved(prev => [...prev, ...res.questions.map(detail => ({ detail, draft: fromDetail(detail), groupMeta }))]);
      void queueRequested(drafts, res.questions);
      return res.questions.length;
    }

    const groupId = groupCtx.mode === 'existing' ? Number(groupCtx.existingGroupId) : null;
    const pickedGroup = groupId != null ? groups.find(g => g.groupId === groupId) : undefined;
    const payload = drafts.map(q => ({ ...toCreateRequest(q, Number(courseId), moduleVal), groupId }));
    const created = await questionService.createQuestionsBatch(Number(courseId), moduleVal, payload);
    if (groupId != null && courseId) {
      questionGroupService.getQuestionGroups({ courseId: Number(courseId), size: 100 })
        .then(res => setGroups(res.content))
        .catch(() => {});
    }
    const groupMeta = groupId != null
      ? { groupId, title: pickedGroup?.title?.trim() || `Group #${groupId}`, questionType: pickedGroup?.questionType ?? null }
      : undefined;
    toast.success(`${created.length} question${created.length === 1 ? '' : 's'} saved as Draft${groupId != null ? ' to the question group' : ''}.`);
    setSaved(prev => [...prev, ...created.map(detail => ({ detail, draft: fromDetail(detail), groupMeta }))]);
    void queueRequested(drafts, created);
    return created.length;
  };

  /** Q-03 answers in request order: queue the AI for the drafts that asked for it (all-or-nothing batch). */
  const queueRequested = (drafts: QuestionDraft[], created: QuestionDetail[]) => {
    const requested = drafts.map((d, i) => (d.explanationRequested ? created[i] : undefined)).filter((d): d is QuestionDetail => Boolean(d));
    if (!requested.length) return Promise.resolve();
    // A filled explanation the manager asked to regenerate is overwritten; blank ones are just filled.
    const overwrite = drafts.some(d => d.explanationRequested && !explanationMissing(d.explanation));
    return queueExplanations(requested.map(d => d.questionId), overwrite);
  };

  /** Saved drafts without an explanation can't be published yet. */
  const blockedFromPublish = (d: QuestionDetail) => explanationMissing(d.aiExplanation) || pendingExplanations.has(d.questionId);

  const savedDrafts = saved.filter(s => s.detail.status === 'INACTIVE');
  /** Drafts that already have an explanation — the only ones that can be ticked for publishing. */
  const publishableDrafts = savedDrafts.filter(s => !blockedFromPublish(s.detail) && !s.edited);
  const savedPublished = saved.filter(s => s.detail.status === 'ACTIVE');
  const pickedDrafts = publishableDrafts.filter(s => toPublish.has(s.detail.questionId));
  const allDraftsPicked = publishableDrafts.length > 0 && pickedDrafts.length === publishableDrafts.length;
  const togglePublish = (id: number) =>
    setToPublish(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAllDrafts = () => setToPublish(allDraftsPicked ? new Set() : new Set(publishableDrafts.map(s => s.detail.questionId)));
  /** Saved drafts with no explanation and nothing running for them yet. */
  const savedWithoutExplanation = savedDrafts.filter(s => explanationMissing(s.detail.aiExplanation) && !pendingExplanations.has(s.detail.questionId));

  /** Saved questions changed on the page — they are saved (one PUT each) before they can be published. */
  const editedSaved = saved.filter(s => s.edited);
  const [savingSaved, setSavingSaved] = useState(false);
  /** Saved cards whose errors show (after a save attempt). */
  const [savedSubmitted, setSavedSubmitted] = useState<Set<number>>(() => new Set());

  const editSaved = (id: number, draft: QuestionDraft) =>
    setSaved(prev => prev.map(item => (item.detail.questionId === id ? { ...item, draft, edited: true } : item)));

  const discardSaved = (id: number) =>
    setSaved(prev => prev.map(item => (item.detail.questionId === id ? { ...item, draft: fromDetail(item.detail), edited: false } : item)));

  /** Saves the changed saved questions; each keeps its own module and group. */
  /** True when every one was saved. */
  const saveEditedSaved = async (items: SavedQuestion[]): Promise<boolean> => {
    if (!items.length) return true;
    const invalid = items.filter(s => !isDraftValid(s.draft));
    if (invalid.length) {
      setSavedSubmitted(prev => new Set([...prev, ...invalid.map(s => s.detail.questionId)]));
      toast.error(`${invalid.length} question${invalid.length === 1 ? '' : 's'} have errors. Fix the highlighted fields before saving.`, {
        title: 'Cannot save yet',
      });
      document.getElementById(invalid[0].draft.key)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return false;
    }
    setSavingSaved(true);
    let savedCount = 0;
    let ok = true;
    const requested: { id: number; overwrite: boolean }[] = [];
    try {
      for (const item of items) {
        const id = item.detail.questionId;
        const updated = await questionService.updateQuestion(id, toUpdateRequest(item.draft, item.detail.moduleId ?? null));
        // Read back so the card shows exactly what was stored.
        const fresh = updated?.questionId ? updated : await questionService.getQuestionById(id);
        setSaved(prev => prev.map(s => (s.detail.questionId === id ? { ...s, detail: fresh, draft: fromDetail(fresh), edited: false } : s)));
        setSavedSubmitted(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        // An explanation written by hand settles one the AI could not write.
        if (!explanationMissing(fresh.aiExplanation)) {
          setFailedExplanations(prev => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }
        if (item.draft.explanationRequested) requested.push({ id, overwrite: !explanationMissing(item.draft.explanation) });
        savedCount++;
      }
      toast.success(`${savedCount} question${savedCount === 1 ? '' : 's'} updated.`);
    } catch (err) {
      if (savedCount) toast.success(`${savedCount} question${savedCount === 1 ? '' : 's'} updated.`);
      showSaveError(describeSaveError(err, 'Could not save. Please try again.'));
      ok = false;
    } finally {
      setSavingSaved(false);
    }
    // Queued after the update so the AI reads the saved version.
    const fill = requested.filter(r => !r.overwrite).map(r => r.id);
    const redo = requested.filter(r => r.overwrite).map(r => r.id);
    if (fill.length) await queueExplanations(fill);
    if (redo.length) await queueExplanations(redo, true);
    return ok;
  };

  const applyPublished = (updated: QuestionDetail[]) => {
    const byId = new Map(updated.map(u => [u.questionId, u]));
    setSaved(prev => prev.map(item => {
      const u = byId.get(item.detail.questionId);
      return u ? { ...item, detail: u } : item;
    }));
    setToPublish(prev => {
      const next = new Set(prev);
      updated.forEach(u => next.delete(u.questionId));
      return next;
    });
    if (courseId) {
      questionGroupService.getQuestionGroups({ courseId: Number(courseId), size: 100 })
        .then(res => setGroups(res.content))
        .catch(() => {});
    }
  };

  const publishIds = async (allIds: number[], successMsg?: string) => {
    // Publishing takes the stored version, so changed questions are saved first.
    const changed = new Set(saved.filter(s => s.edited).map(s => s.detail.questionId));
    const blocked = new Set(saved.filter(s => blockedFromPublish(s.detail)).map(s => s.detail.questionId));
    const unchangedIds = allIds.filter(id => !changed.has(id));
    if (unchangedIds.length < allIds.length) {
      const n = allIds.length - unchangedIds.length;
      toast.warning(`Save your changes to ${n} question${n === 1 ? '' : 's'} first — ${n === 1 ? 'it stays' : 'they stay'} as Draft.`, {
        title: 'Unsaved changes',
      });
      successMsg = undefined;
    }
    const ids = unchangedIds.filter(id => !blocked.has(id));
    if (ids.length < unchangedIds.length) {
      const n = unchangedIds.length - ids.length;
      toast.warning(`${n} question${n === 1 ? ' has' : 's have'} no explanation yet and stay${n === 1 ? 's' : ''} as Draft.`, {
        title: 'Explanation required to publish',
      });
      successMsg = undefined;
    }
    if (!ids.length) {
      setConfirm(null);
      return;
    }
    setPublishing(true);
    try {
      const updated = await questionService.batchUpdateStatus(ids, 'ACTIVE');
      applyPublished(updated);
      toast.success(successMsg ?? `${updated.length} question${updated.length === 1 ? '' : 's'} published.`);
      // Everything saved on the page is published — the batch is done, back to the bank.
      const published = new Set(updated.filter(u => u.status === 'ACTIVE').map(u => u.questionId));
      if (saved.every(s => s.detail.status === 'ACTIVE' || published.has(s.detail.questionId))) {
        // Unsaved new questions still ask before leaving.
        if (manualBusy) goToBank();
        else leave(goToBank);
      }
    } catch (err) {
      showSaveError(describeSaveError(err, 'Could not publish the questions.'));
    } finally {
      setPublishing(false);
      setConfirm(null);
    }
  };

  /** Publishes the ticked drafts in one call and keeps them visible with their updated Published status. */
  const publishSaved = () => publishIds(pickedDrafts.map(s => s.detail.questionId));

  const groupReady = () => {
    if (Object.keys(groupContextErrors(groupCtx)).length === 0) return true;
    setSubmitted(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return false;
  };

  const saveManual = async () => {
    if (!isEdit && questions.length === 0) {
      if (groupCtx.mode === 'new') toast.warning('A question group must have at least 1 question before it can be created.');
      else toast.warning('Add a question or import a file first.');
      return;
    }
    setSubmitted(true);
    const invalidEntries = questions
      .map((q, idx) => ({ q, idx }))
      .filter(({ q }) => hasDraftError(q));
    if (invalidEntries.length > 0) {
      const nums = invalidEntries.slice(0, 8).map(e => `#${e.idx + 1}`).join(', ') + (invalidEntries.length > 8 ? '…' : '');
      if (kind && questions.some(q => kindError(q))) {
        toast.error(kindToast(kind), {
          title: `${invalidEntries.length} question${invalidEntries.length === 1 ? '' : 's'} need fixes (${nums})`,
          duration: 8000,
        });
      } else if (inBank.has(invalidEntries[0].q.key)) {
        toast.error(`Some questions already exist in this course (${nums}) — change them before saving.`, {
          title: 'Cannot save yet',
          duration: 8000,
        });
      } else {
        toast.error(
          `${invalidEntries.length} question${invalidEntries.length === 1 ? '' : 's'} have errors (${nums}). Fix the highlighted fields before saving.`,
          { title: 'Cannot save yet', duration: 8000 },
        );
      }
      revealAndScrollTo(invalidEntries[0].q.key);
      return;
    }
    if (locationNote || questions.length === 0) return;
    if (!isEdit && !groupReady()) return;

    setSaving(true);
    try {
      if (isEdit) {
        const q = questions[0];
        await questionService.updateQuestion(q.questionId!, toUpdateRequest(q, moduleId ? Number(moduleId) : null));
        toast.success('Question updated.');
        // Queued after the update so the AI reads the saved version; the notification brings the manager back.
        if (q.explanationRequested) await queueExplanations([q.questionId!], !explanationMissing(q.explanation));
        setDirty(false);
        leave(goToBank);
        return;
      }
      await createBatch(questions);
      // The saved questions stay on the page to fix and publish; "Add Question" starts the next one.
      resetManual();
    } catch (err) {
      const error = describeSaveError(err, 'Could not save. Please try again.');
      showSaveError(error);
      if (error.duplicateIndexes?.length) {
        setInBank(new Set(error.duplicateIndexes.map(i => questions[i]?.key).filter((k): k is string => Boolean(k))));
      }
      // Batch field errors carry "questions[i]." — jump to that question.
      const target = error.questionIndex != null ? questions[error.questionIndex] : undefined;
      if (target) revealAndScrollTo(target.key);
      else listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } finally {
      setSaving(false);
    }
  };

  /** Saves the accepted AI suggestions (standalone or into the selected/new group); the rest stay for review. */
  const saveAi = async () => {
    setSubmitted(true);
    if (!courseId || !moduleId) return;
    if (!groupReady()) return;
    if (!aiAccepted.length) {
      if (groupCtx.mode === 'new') toast.warning('Accept at least 1 generated question before creating the group.');
      else toast.warning('Accept at least one suggestion to save.');
      return;
    }
    if (kind && aiAccepted.some(q => kindError(q))) {
      toast.error(kindToast(kind));
      return;
    }
    setSaving(true);
    try {
      await createBatch(aiAccepted);
      setSubmitted(false);
      aiRef.current?.removeAccepted();
    } catch (err) {
      showSaveError(describeSaveError(err, 'Could not save. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  /** Save All: the changed saved questions first, then the new ones. */
  const saveAll = async () => {
    const changed = editedSaved;
    if (changed.length && !(await saveEditedSaved(changed))) return;
    if (questions.length || !changed.length) await saveManual();
  };

  const save = isEdit ? saveManual : createMode === 'ai' ? saveAi : saveAll;

  /** Edit mode: Publish needs a stored explanation (an unsaved one in the box doesn't count yet). */
  const editPublishBlocked = !savedHasExplanation || (questions[0]?.questionId != null && pendingExplanations.has(questions[0].questionId));

  const publishOne = async () => {
    const q = questions[0];
    if (!q?.questionId) return;
    if (editPublishBlocked) {
      setConfirm(null);
      toast.warning('Save an explanation first, or let AI write one.', { title: 'Explanation required to publish' });
      return;
    }
    setStatusBusy(true);
    try {
      const [updated] = await questionService.batchUpdateStatus([q.questionId], 'ACTIVE');
      setStatus(updated.status);
      setQuestions(prev => prev.map(p => ({ ...p, lockVersion: updated.lockVersion })));
      toast.success('Question published.');
    } catch (err) {
      showSaveError(describeSaveError(err, 'Could not publish the question.'));
    } finally {
      setStatusBusy(false);
      setConfirm(null);
    }
  };

  const cancel = goToBank;

  const title = isEdit ? 'Edit Question' : 'New Questions';
  const pageCls = 'p-8 space-y-5';

  if ((isEdit || duplicateOf) && (loading || loadError)) {
    return (
      <div className={pageCls}>
        <Breadcrumb items={[{ label: 'Question', onClick: goToBank }, { label: title }]} />
        {loading ? (
          <div className="card p-10 flex items-center justify-center gap-3 text-content-soft"><Spinner size="sm" /> Loading question…</div>
        ) : (
          <div className="space-y-3">
            <Alert type="error" title="Could not open the question" message={loadError!} />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setReloadKey(k => k + 1)}>Try again</Button>
              <Button variant="ghost" onClick={goToBank}>Back to questions</Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const modeSwitch = !isEdit && (
    <div className="card p-1.5 space-y-1.5">
      <div role="tablist" aria-label="How to create questions" className="grid grid-cols-2 gap-1 bg-surface-muted p-1 rounded-[10px]">
        {([
          { value: 'manual', label: 'Manual', icon: <Icon.Edit className="w-3.5 h-3.5" />, busy: manualBusy },
          { value: 'ai', label: 'AI Generate', icon: <Icon.Zap className="w-3.5 h-3.5" />, busy: aiBusy },
        ] as const).map(t => {
          const active = createMode === t.value;
          // The other mode keeps its unsaved work — a dot says there is some waiting there.
          const waiting = !active && t.busy;
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => switchMode(t.value)}
              title={waiting ? `Unsaved ${t.value === 'manual' ? 'manual questions' : 'AI suggestions'} are kept here` : undefined}
              className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-[8px] text-sm font-medium transition-all ${
                active ? 'bg-surface text-content shadow-sm' : 'text-content-soft hover:text-content-secondary'
              }`}
            >
              {t.icon} {t.label}
              {waiting && <span className="w-1.5 h-1.5 rounded-full bg-warning" aria-label="has unsaved work" />}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className={pageCls}>
      <Breadcrumb items={[{ label: 'Question', onClick: cancel }, { label: title }]} />
      <h2 className="text-xl font-bold text-content">{title}</h2>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
        <div className="min-w-0 space-y-3 pb-4">
          {/* Shared across both Manual and AI Generate: choose Standalone or Question Group */}
          {!isEdit && (
            <GroupContextCard
              value={groupCtx}
              onChange={changeGroupCtx}
              groups={groups}
              loadingGroups={groupsLoading}
              courseSelected={Boolean(courseId)}
              moduleId={moduleId}
              questionKinds={writtenKinds}
              draftQuestionCount={createMode === 'ai' ? aiAccepted.length : questions.length}
              onAddQuestion={createMode === 'manual' ? addQuestion : undefined}
              showErrors={submitted}
              kindInvalid={submitted && (createMode === 'manual' ? questions.some(q => kindError(q)) : aiAccepted.some(q => kindError(q)))}
              disabled={saving}
            />
          )}

          {/* AI mode — kept mounted while hidden so its settings stay as they were */}
          {!isEdit && (
            <div className={createMode === 'ai' ? '' : 'hidden'}>
              <AiGeneratePanel
                ref={aiRef}
                courseId={courseId}
                moduleId={moduleId}
                allowedTypes={allowedTypes}
                isGroupMode={groupCtx.mode !== 'standalone'}
                groupTitle={activeGroupMeta?.title}
                groupPassage={activeGroupMeta?.passage}
                groupIssue={firstGroupIssue}
                onGroupInvalid={() => {
                  setSubmitted(true);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onAcceptedChange={onAiAccepted}
                onPendingChange={setAiPending}
                disabled={saving}
              />
            </div>
          )}

          {!isEdit && isReview && reviewLoading && (
            <div className="card p-8 flex items-center justify-center gap-3 text-content-soft"><Spinner size="sm" /> Loading your AI explanation batch…</div>
          )}
          {!isEdit && isReview && !reviewLoading && reviewError && (
            <div className="space-y-3">
              <Alert type="error" title="Could not open the batch" message={reviewError} />
              <Button variant="secondary" onClick={() => setReviewReloadKey(k => k + 1)}>Try again</Button>
            </div>
          )}

          {/* One list: saved questions (the AI batch, or saved on this visit) first, then the new ones being written */}
          {!isEdit && (createMode === 'manual' || saved.length > 0) && (() => {
            const showNew = createMode === 'manual';
            const presentTypes = [...new Set([...saved.map(s => s.draft.type), ...(showNew ? questions.map(q => q.type) : [])])];
            const activeTypeFilter =
              draftTypeFilter === 'ALL' || presentTypes.includes(draftTypeFilter as QuestionDraft['type'])
                ? draftTypeFilter
                : 'ALL';
            /** A saved question only has errors once it is changed. */
            const savedHasError = (s: SavedQuestion) => Boolean(s.edited) && !isDraftValid(s.draft);
            const passes = (type: string, hasError: boolean) =>
              !(draftFilter === 'errors' && !hasError)
              && !(draftFilter === 'valid' && hasError)
              && (activeTypeFilter === 'ALL' || type === activeTypeFilter);

            const draftEntries = showNew ? questions.map((q, idx) => ({ q, idx, hasError: hasDraftError(q) })) : [];
            const errorCount = draftEntries.filter(e => e.hasError).length + saved.filter(savedHasError).length;
            const totalCount = saved.length + draftEntries.length;
            const validCount = totalCount - errorCount;
            const visibleSaved = saved.filter(s => passes(s.draft.type, savedHasError(s)));
            const filteredEntries = draftEntries.filter(e => passes(e.q.type, e.hasError));
            const firstError = saved.find(savedHasError)?.draft.key
              ?? draftEntries.find(e => e.hasError)?.q.key;

            // Numbering runs through the whole list: saved questions in save order, then the new ones.
            const savedNumber = new Map(saved.map((s, i) => [s.detail.questionId, i]));

            const groupedBuckets = new Map<number, { meta: { groupId: number; title: string; questionType: string | null }; items: SavedQuestion[] }>();
            const standaloneItems: SavedQuestion[] = [];
            visibleSaved.forEach(item => {
              const gid = item.detail.groupId;
              if (gid != null) {
                const existing = groupedBuckets.get(gid);
                if (existing) existing.items.push(item);
                else {
                  const foundGroup = groups.find(g => g.groupId === gid);
                  groupedBuckets.set(gid, {
                    meta: item.groupMeta ?? {
                      groupId: gid,
                      title: foundGroup?.title?.trim() || `Group #${gid}`,
                      questionType: foundGroup?.questionType ?? null,
                    },
                    items: [item],
                  });
                }
              } else {
                standaloneItems.push(item);
              }
            });

            const renderSavedCard = (item: SavedQuestion, groupKind?: GroupKind | null) => {
              const { detail, draft, edited } = item;
              const id = detail.questionId;
              const isDraft = detail.status === 'INACTIVE';
              const pending = pendingExplanations.has(id);
              const failed = failedExplanations.has(id);
              const blocked = blockedFromPublish(detail);
              return (
                <div key={draft.key} id={draft.key} className="scroll-mt-4">
                <QuestionFormBlock
                  q={draft}
                  index={savedNumber.get(id) ?? 0}
                  onChange={next => editSaved(id, next)}
                  showErrors={savedSubmitted.has(id)}
                  // Only drafts can change — the backend rejects edits to a published question.
                  readOnly={!isDraft}
                  allowedTypes={groupKind ? typesOfKind(groupKind) : undefined}
                  onRequestExplanation={requested => editSaved(id, { ...draft, explanationRequested: requested || undefined })}
                  explanationStatus={pending ? 'PENDING' : failed ? 'FAILED' : undefined}
                  leading={
                    <Checkbox
                      checked={toPublish.has(id)}
                      onChange={() => togglePublish(id)}
                      disabled={!isDraft || publishing || blocked || edited}
                    />
                  }
                  actions={
                    <div className="flex items-center gap-2">
                      <Badge variant={isDraft ? 'default' : 'success'} className="whitespace-nowrap">
                        {QUESTION_STATUS_LABELS[detail.status] ?? detail.status}
                      </Badge>
                      {edited && (
                        <>
                          <Badge variant="warning" className="whitespace-nowrap">Unsaved changes</Badge>
                          <Button size="sm" variant="ghost" onClick={() => discardSaved(id)} disabled={savingSaved}>
                            Discard
                          </Button>
                          <Button
                            size="sm"
                            icon={<Icon.Check className="w-3.5 h-3.5" />}
                            onClick={() => saveEditedSaved([item])}
                            loading={savingSaved}
                            disabled={savingSaved}
                          >
                            Save
                          </Button>
                        </>
                      )}
                      {!edited && isDraft && blocked && !pending && (
                        <Button
                          size="sm"
                          variant="outline"
                          icon={<Icon.Zap className="w-3.5 h-3.5" />}
                          onClick={() => queueExplanations([detail.questionId])}
                          title="Publishing needs an explanation"
                        >
                          {failed ? 'Retry AI Explanation' : 'Generate AI Explanation'}
                        </Button>
                      )}
                      {!edited && isDraft && !blocked && (
                        <Button
                          size="sm"
                          variant="outline"
                          icon={<Icon.Upload className="w-3.5 h-3.5" />}
                          onClick={() => publishIds([id], 'Question published.')}
                          disabled={publishing}
                        >
                          Publish
                        </Button>
                      )}
                    </div>
                  }
                />
                </div>
              );
            };

            return (
              <section aria-label="Questions" className="space-y-3">
                {isReview && saved.length > 0 && (
                  <Alert
                    type="info"
                    title="Your AI explanation batch"
                    message={failedExplanations.size > 0
                      ? `AI could not write ${failedExplanations.size} explanation${failedExplanations.size === 1 ? '' : 's'}. Edit any question right here, save it, then publish — or retry the AI.`
                      : 'Review the explanations, edit any question right here and save it, then publish. Once all are published you go back to the Question Bank.'}
                  />
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-content">
                      Questions <span className="text-content-soft font-normal">({totalCount})</span>
                    </h3>
                    {draftEntries.length > 0 && <Badge variant="info">{draftEntries.length} New</Badge>}
                    {savedDrafts.length > 0 && <Badge variant="warning">{savedDrafts.length} Draft</Badge>}
                    {savedPublished.length > 0 && <Badge variant="success">{savedPublished.length} Published</Badge>}
                    {totalCount > 0 && (
                      <span className="text-xs text-content-subtle">
                        <span className="text-success font-medium">{validCount} valid</span>
                        {' · '}
                        <span className={errorCount > 0 ? 'text-danger font-medium' : 'text-content-subtle'}>
                          {errorCount} with errors
                        </span>
                      </span>
                    )}
                    {pendingExplanations.size > 0 && (
                      <Badge variant="info"><Icon.Clock className="w-3 h-3" /> AI writing {pendingExplanations.size} explanation{pendingExplanations.size === 1 ? '' : 's'}</Badge>
                    )}
                  </div>

                  {totalCount > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      {showNew && blankExplanationCount > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          icon={<Icon.Zap className="w-3.5 h-3.5" />}
                          onClick={requestAllBlankExplanations}
                          title="AI writes them in the background after you save"
                        >
                          AI Explanations for blanks ({blankExplanationCount})
                        </Button>
                      )}
                      {savedWithoutExplanation.length > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          icon={<Icon.Zap className="w-3.5 h-3.5" />}
                          onClick={() => queueExplanations(savedWithoutExplanation.map(s => s.detail.questionId))}
                        >
                          Generate AI Explanations ({savedWithoutExplanation.length})
                        </Button>
                      )}
                      <div className="inline-flex items-center rounded-[8px] border border-line bg-surface p-0.5 gap-0.5">
                        {([
                          { key: 'all', label: `All (${totalCount})` },
                          { key: 'errors', label: `Errors (${errorCount})` },
                          { key: 'valid', label: `Valid (${validCount})` },
                        ] as const).map(tab => (
                          <button
                            key={tab.key}
                            type="button"
                            onClick={() => setDraftFilter(tab.key)}
                            className={`px-2.5 py-1 rounded-[6px] text-xs font-medium transition-colors cursor-pointer ${
                              draftFilter === tab.key
                                ? 'bg-brand-600 text-white'
                                : 'text-content-secondary hover:bg-surface-alt'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      {presentTypes.length > 1 && (
                        <select
                          aria-label="Filter by question type"
                          value={activeTypeFilter}
                          onChange={e => setDraftTypeFilter(e.target.value)}
                          className="h-8 px-2.5 rounded-[8px] border border-line bg-surface text-xs text-content-secondary focus:outline-none focus:ring-2 focus:ring-brand-600/20"
                        >
                          <option value="ALL">All types</option>
                          {presentTypes.map(t => (
                            <option key={t} value={t}>{typeLabel(t)}</option>
                          ))}
                        </select>
                      )}

                      {firstError && (
                        <Button size="sm" variant="outline" onClick={() => revealAndScrollTo(firstError)}>
                          Jump to error
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {(publishableDrafts.length > 0 || pickedDrafts.length > 0) && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-line bg-surface-alt/40 px-3 py-2">
                    <Checkbox
                      label={`Select all drafts to publish (${publishableDrafts.length})`}
                      checked={allDraftsPicked}
                      indeterminate={pickedDrafts.length > 0 && !allDraftsPicked}
                      onChange={toggleAllDrafts}
                      disabled={publishing}
                    />
                    {pickedDrafts.length > 0 && (
                      <Button
                        size="sm"
                        icon={<Icon.Upload className="w-3.5 h-3.5" />}
                        onClick={() => setConfirm('publishSaved')}
                        loading={publishing}
                        disabled={publishing}
                      >
                        Publish Selected ({pickedDrafts.length})
                      </Button>
                    )}
                  </div>
                )}

                <div ref={listRef} className="space-y-3 scroll-mt-5">
                  {[...groupedBuckets.values()].map(bucket => {
                    const gPub = bucket.items.filter(s => s.detail.status === 'ACTIVE').length;
                    const gDraftIds = bucket.items.filter(s => s.detail.status === 'INACTIVE').map(s => s.detail.questionId);
                    const gKind = asGroupKind(bucket.meta.questionType);
                    const allGroupPub = gPub === bucket.items.length;
                    return (
                      <div key={bucket.meta.groupId} className="rounded-[10px] border border-line bg-surface-alt/40 p-3 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2 min-w-0">
                            <Icon.Layers className="w-4 h-4 text-brand-ink flex-shrink-0" />
                            <span className="text-sm font-semibold text-content truncate">{bucket.meta.title}</span>
                            {gKind && <Badge variant="purple">{GROUP_KIND_LABELS[gKind]}</Badge>}
                            <Badge variant={allGroupPub ? 'success' : gPub > 0 ? 'warning' : 'default'}>
                              {allGroupPub
                                ? `Group Published (${gPub}/${bucket.items.length})`
                                : gPub > 0
                                  ? `Partially Published (${gPub}/${bucket.items.length})`
                                  : `Draft (0/${bucket.items.length} published)`}
                            </Badge>
                          </div>
                          {gDraftIds.length > 0 && (
                            <Button
                              size="sm"
                              variant="secondary"
                              icon={<Icon.Upload className="w-3.5 h-3.5" />}
                              onClick={() => publishIds(gDraftIds, `Published all ${gDraftIds.length} question(s) in “${bucket.meta.title}”.`)}
                              disabled={publishing}
                            >
                              Publish Group ({gDraftIds.length})
                            </Button>
                          )}
                        </div>
                        <div className="space-y-2">
                          {bucket.items.map(item => renderSavedCard(item, gKind))}
                        </div>
                      </div>
                    );
                  })}

                  {standaloneItems.map(item => renderSavedCard(item))}

                  {filteredEntries.map(({ q, idx }) => (
                    <div key={q.key} id={q.key} className="scroll-mt-4">
                      <QuestionFormBlock
                        q={q}
                        index={saved.length + idx}
                        onChange={updated => updateQuestion(idx, updated)}
                        showErrors={submitted || Boolean(q.importIssue)}
                        removable
                        onRemove={() => (isKept(q) ? setConfirmRemove(idx) : remove(idx))}
                        onDuplicate={() => duplicateQuestion(idx)}
                        duplicateError={inBank.has(q.key) ? 'This question already exists in this course. Change its content or answers before saving, or remove it.' : undefined}
                        canMoveUp={idx > 0}
                        canMoveDown={idx < questions.length - 1}
                        onMoveUp={() => move(idx, -1)}
                        onMoveDown={() => move(idx, 1)}
                        allowedTypes={allowedTypes}
                        kindError={submitted || Boolean(q.importIssue) ? kindError(q) : undefined}
                        onRequestExplanation={requested => requestExplanation(idx, requested)}
                        actions={<Badge variant="info" className="whitespace-nowrap">New</Badge>}
                      />
                    </div>
                  ))}

                  {totalCount === 0 ? (
                    <div className="card p-10 text-center space-y-2">
                      <p className="text-base font-medium text-content-secondary">No questions yet</p>
                      <p className="text-sm text-content-subtle">
                        {groupCtx.mode === 'new'
                          ? 'A question group requires at least 1 question — click “Add Question” to write one.'
                          : 'Use “Add Question” or import an Excel, Word, or PDF file.'}
                      </p>
                    </div>
                  ) : visibleSaved.length === 0 && filteredEntries.length === 0 && (
                    <div className="card p-8 text-center space-y-3">
                      <p className="text-sm text-content-subtle">
                        {draftFilter === 'errors'
                          ? 'No questions with errors under this filter.'
                          : draftFilter === 'valid'
                            ? 'No completely valid questions under this filter.'
                            : 'No questions match the selected type filter.'}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setDraftFilter('all'); setDraftTypeFilter('ALL'); }}
                      >
                        Show all questions
                      </Button>
                    </div>
                  )}
                </div>
              </section>
            );
          })()}

          {isEdit && status === 'INACTIVE' && editPublishBlocked && (
            <Alert
              type="info"
              title="Explanation required to publish"
              message={questions[0]?.questionId != null && pendingExplanations.has(questions[0].questionId)
                ? 'AI is writing the explanation — you will get a notification, and Publish unlocks when it is ready.'
                : 'Write an explanation and save, or click “Generate AI Explanation” and save — AI writes it in the background.'}
            />
          )}

          {isEdit && (
            <div ref={listRef} className="space-y-3 scroll-mt-5">
              {questions.map((q, i) => (
                <div key={q.key} id={q.key} className="scroll-mt-4">
                  <QuestionFormBlock
                    q={q}
                    index={i}
                    onChange={updated => updateQuestion(i, updated)}
                    showErrors={submitted}
                    removable={false}
                    onRemove={() => {}}
                    duplicateError={inBank.has(q.key) ? 'This question already exists in this course. Change its content or answers before saving, or remove it.' : undefined}
                    canMoveUp={false}
                    canMoveDown={false}
                    allowedTypes={allowedTypes}
                    kindError={submitted ? kindError(q) : undefined}
                    onRequestExplanation={requested => requestExplanation(i, requested)}
                    explanationStatus={
                      q.questionId != null && pendingExplanations.has(q.questionId)
                        ? 'PENDING'
                        : q.questionId != null && failedExplanations.has(q.questionId)
                          ? 'FAILED'
                          : undefined
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <QuestionSidePanel
          tabs={modeSwitch}
          mode={mode}
          count={questions.length + editedSaved.length}
          courseId={courseId}
          moduleId={moduleId}
          onLocationChange={changeLocation}
          showErrors={submitted}
          prerequisiteNote={locationNote}
          onAdd={createMode === 'manual' ? addQuestion : undefined}
          onImport={createMode === 'manual' ? () => setShowImport(true) : undefined}
          onSave={save}
          saveLabel={!isEdit && createMode === 'ai' ? `Save Accepted (${aiAccepted.length})` : undefined}
          onCancel={cancel}
          onPublishOne={isEdit && status === 'INACTIVE' && !editPublishBlocked ? () => setConfirm('publishOne') : undefined}
          saving={saving}
          statusBusy={statusBusy}
        />
      </div>

      <ImportPdfModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={handleImported}
        courseId={courseId}
        moduleId={moduleId}
      />

      <UnsavedChangesModal
        blocker={blocker}
        onLeave={discardOnLeave}
        message="You have work on this page that hasn’t been saved. If you leave now, it will be lost:"
        details={unsavedDetails}
      />

      <ConfirmDialog
        open={askDraft}
        onClose={() => setAskDraft(false)}
        onConfirm={() => {
          discardRestored();
          const loc = reviewLocationRef.current;
          if (loc) {
            setCourseId(loc.courseId);
            setModuleId(loc.moduleId);
          }
          setAskDraft(false);
        }}
        tone="danger"
        title="Replace your unsaved draft?"
        description={`You have ${restored?.questions.length ?? 0} unsaved question${restored?.questions.length === 1 ? '' : 's'} from before. Discard them to work on the AI explanation batch, or keep them below the batch.`}
        cancelLabel="Keep draft"
        confirmLabel="Discard draft"
      />

      <ConfirmDialog
        open={confirmRemove != null}
        onClose={() => setConfirmRemove(null)}
        onConfirm={() => { if (confirmRemove != null) remove(confirmRemove); setConfirmRemove(null); }}
        tone="danger"
        title={`Delete question ${confirmRemove != null ? confirmRemove + 1 : ''}?`}
        description="This question hasn’t been saved yet, so what you wrote for it will be lost."
        cancelLabel="Keep it"
        confirmLabel="Delete"
      />

      <ConfirmDialog
        open={confirm != null}
        onClose={() => setConfirm(null)}
        onConfirm={confirm === 'publishSaved' ? publishSaved : publishOne}
        loading={statusBusy || publishing}
        title={confirm === 'publishSaved' && pickedDrafts.length !== 1 ? `Publish ${pickedDrafts.length} questions?` : 'Publish this question?'}
        description="This action can’t be undone."
        confirmLabel="Publish"
      />
    </div>
  );
}
