import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastHost';
import { ROUTES } from '@/app/routes';
import { questionService, type QuestionStatus } from '@/services/question.service';
import { questionGroupService, type QuestionGroup } from '@/services/questionGroup.service';
import { QuestionForm as QuestionFormBlock } from '../components/QuestionForm';
import { QuestionSidePanel } from '../components/QuestionSidePanel';
import { ImportPdfModal } from '../components/ImportPdfModal';
import { GroupContextCard, contextKind, emptyGroupContext, groupContextErrors, type GroupContextValue } from '../components/GroupContextCard';
import { AiGeneratePanel, type AiGeneratePanelHandle } from '../components/AiGeneratePanel';
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
import { clearCreateDraft, loadCreateDraft, saveCreateDraft, type CreateDraftSnapshot } from '../createDraft';
import { Icon } from '@/assets/icons';
import { describeSaveError, loadErrorMessage, type SaveError } from '../saveError';

/** Q-03 accepts 1..50 questions per request. */
const MAX_BATCH = 50;

type Confirm = 'archive' | null;

/**
 * Create mode: write questions by hand, or draft them with AI (AI-01/02). The
 * two are separate — each saves its own questions, and the page only switches
 * to the other one when nothing is left unsaved in the current one.
 */
type CreateMode = 'manual' | 'ai';

const typeLabel = (t: string) => QUESTION_TYPE_OPTIONS.find(o => o.value === t)?.label ?? t;

export function QuestionFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const isEdit = mode === 'edit';
  const { questionId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  /** Create mode: "Duplicate" in the bank — start from a copy of this question (replaces any stored draft). */
  const [duplicateOf] = useState(() => (isEdit ? null : searchParams.get('duplicate')));
  const navigate = useNavigate();
  const toast = useToast();

  /** Create mode: unsaved work from before a reload, read once. */
  const [restored] = useState<CreateDraftSnapshot | null>(() => (isEdit || duplicateOf ? null : loadCreateDraft()));
  const [questions, setQuestions] = useState<QuestionDraft[]>(() => (isEdit ? [] : restored?.questions.length ? restored.questions : [emptyDraft()]));
  const [courseId, setCourseId] = useState(restored?.courseId ?? '');
  const [moduleId, setModuleId] = useState(restored?.moduleId ?? '');
  const [status, setStatus] = useState<QuestionStatus>('ACTIVE');
  /** Create mode: standalone batch, or questions that share one group passage. */
  const [groupCtx, setGroupCtx] = useState<GroupContextValue>(() => restored?.groupCtx ?? emptyGroupContext());
  const [groups, setGroups] = useState<QuestionGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);

  /** Questions the user has edited — their errors show before the first save attempt. */
  const [touched, setTouched] = useState<Set<string>>(() => new Set(restored?.touched ?? []));
  const [submitted, setSubmitted] = useState(false);
  const [dirty, setDirty] = useState(Boolean(restored));
  /** The latest edits are in localStorage, so a reload needs no browser prompt. */
  const [draftStored, setDraftStored] = useState(Boolean(restored));

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

  // Create mode: keep the work in localStorage so a reload restores it.
  useEffect(() => {
    if (isEdit || !dirty || leavingRef.current) return;
    setDraftStored(false);
    // A save still pending when the user leaves must not bring the draft back.
    const id = setTimeout(() => {
      if (!leavingRef.current) setDraftStored(saveCreateDraft({ questions, courseId, moduleId, groupCtx, touched: [...touched] }));
    }, 400);
    return () => clearTimeout(id);
  }, [isEdit, dirty, questions, courseId, moduleId, groupCtx, touched]);

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

  // In a group every question must be of the group's kind (QUIZ / ESSAY / CODE / DIAGRAM).
  // AI suggestions are saved as standalone questions, so no group limits them.
  const kind = isEdit || createMode === 'ai' ? null : contextKind(groupCtx, groups);
  const allowedTypes = kind ? typesOfKind(kind) : undefined;
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

  /** Manual mode holds work that would be lost by switching to AI. */
  const manualBusy = !isEdit && dirty && kept > 0;
  const aiBusy = aiPending > 0;

  // Unsaved edits, or AI suggestions not saved yet, hold any navigation away for confirmation.
  // Reloading only prompts for what the stored draft can't bring back.
  const { blocker, leave } = useUnsavedChangesGuard(dirty || aiBusy, (dirty && (isEdit || !draftStored)) || aiBusy);

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

  /** Back to one blank question; the location and group context stay. */
  const resetManual = () => {
    clearCreateDraft();
    setQuestions([newDraft()]);
    setTouched(new Set());
    setSubmitted(false);
    setInBank(new Set());
    setDirty(false);
  };

  const discardRestored = () => {
    resetManual();
    setQuestions([emptyDraft()]);
    setCourseId('');
    setModuleId('');
    setGroupCtx(emptyGroupContext());
  };

  // Create mode: say once that unsaved work came back, with a way to throw it away.
  const restoredToastRef = useRef(false);
  useEffect(() => {
    if (!restored || restoredToastRef.current) return;
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
    ...(dirty ? [isEdit ? 'Your changes to this question' : `${questions.length} question${questions.length === 1 ? '' : 's'} not saved yet`] : []),
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

  const addQuestion = () => {
    if (questions.length >= MAX_BATCH) {
      toast.warning(`You can save up to ${MAX_BATCH} questions at a time — save these first.`);
      return;
    }
    const draft = newDraft();
    setQuestions(prev => [...prev, draft]);
    requestAnimationFrame(() => scrollTo(draft.key));
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
    const issues = fitting.filter(d => d.importIssue).length;
    const imported = `${fitting.length} question${fitting.length === 1 ? '' : 's'} imported`;
    if (issues > 0) {
      toast.warning('The questions marked in red came in blank. Fill them in or remove them, then review the rest before saving.', {
        title: `${imported} — ${issues} couldn’t be read`,
        duration: 8000,
      });
    } else {
      toast.success('Review the extracted questions before saving.', { title: imported });
    }
    requestAnimationFrame(() => scrollTo(fitting[0].key));
  };

  const onAiAccepted = useCallback((drafts: QuestionDraft[]) => setAiAccepted(drafts), []);

  const changeGroupCtx = (v: GroupContextValue) => {
    setGroupCtx(v);
    if (createMode === 'manual') setDirty(true);
  };

  const changeLocation = (c: string, m: string) => {
    // A group belongs to one course (and maybe one module), so a picked group may no longer apply.
    if (c !== courseId || m !== moduleId) setGroupCtx(prev => ({ ...prev, existingGroupId: '' }));
    setCourseId(c);
    setModuleId(m);
    if (createMode === 'manual') setDirty(true);
  };

  const locationNote =
    !courseId ? 'Select a course to save.'
      : !isEdit && !moduleId ? 'Select a module to save.'
      : !isEdit && createMode === 'manual' && questions.length > MAX_BATCH ? `You can save up to ${MAX_BATCH} questions at a time.`
      : null;

  /**
   * The group a new batch goes into. A new group is created here, at save time;
   * if the batch then fails, the form switches to that group so a retry doesn't
   * create a second copy.
   */
  const resolveGroupId = async (): Promise<number | null> => {
    if (groupCtx.mode === 'standalone') return null;
    if (groupCtx.mode === 'existing') return Number(groupCtx.existingGroupId);
    const group = await questionGroupService.createQuestionGroup({
      courseId: Number(courseId),
      moduleId: moduleId ? Number(moduleId) : null,
      questionType: groupCtx.newKind,
      title: groupCtx.newTitle.trim(),
      passageText: groupCtx.newPassage.trim(),
    });
    setGroups(prev => [group, ...prev]);
    setGroupCtx(prev => ({ ...prev, mode: 'existing', existingGroupId: String(group.groupId) }));
    return group.groupId;
  };

  /** Q-03 for a batch of new questions — in the picked group (manual), standalone (AI). Returns how many were saved. */
  const createBatch = async (drafts: QuestionDraft[]): Promise<number> => {
    const groupId = createMode === 'ai' ? null : await resolveGroupId();
    const module = moduleId ? Number(moduleId) : null;
    const payload = drafts.map(q => ({ ...toCreateRequest(q, Number(courseId), module), groupId }));
    const created = await questionService.createQuestionsBatch(Number(courseId), module, payload);
    toast.success(`${created.length} question${created.length === 1 ? '' : 's'} saved${groupId != null ? ' to the question group' : ''}.`);
    return created.length;
  };

  const groupReady = () => {
    if (Object.keys(groupContextErrors(groupCtx)).length === 0) return true;
    setSubmitted(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return false;
  };

  const saveManual = async () => {
    setSubmitted(true);
    const firstInvalid = questions.find(q => !isDraftValid(q) || kindError(q) || inBank.has(q.key));
    if (firstInvalid) {
      if (kind && questions.some(q => kindError(q))) toast.error(kindToast(kind));
      else if (inBank.has(firstInvalid.key)) toast.error('Some questions already exist in this course — change them before saving.');
      requestAnimationFrame(() => scrollTo(firstInvalid.key));
      return;
    }
    if (locationNote || questions.length === 0) return;
    if (!isEdit && !groupReady()) return;

    setSaving(true);
    try {
      if (isEdit) {
        await questionService.updateQuestion(questions[0].questionId!, toUpdateRequest(questions[0], moduleId ? Number(moduleId) : null));
        toast.success('Question updated.');
      } else {
        await createBatch(questions);
      }
      // AI suggestions still waiting in the other tab — stay here with a fresh manual form.
      if (!isEdit && aiBusy) {
        resetManual();
        return;
      }
      setDirty(false);
      if (!isEdit) clearCreateDraft();
      leave(goToBank);
    } catch (err) {
      const error = describeSaveError(err, 'Could not save. Please try again.');
      showSaveError(error);
      if (error.duplicateIndexes?.length) {
        setInBank(new Set(error.duplicateIndexes.map(i => questions[i]?.key).filter((k): k is string => Boolean(k))));
      }
      // Batch field errors carry "questions[i]." — jump to that question.
      const target = error.questionIndex != null ? questions[error.questionIndex] : undefined;
      if (target) requestAnimationFrame(() => scrollTo(target.key));
      else listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } finally {
      setSaving(false);
    }
  };

  /** Saves the accepted AI suggestions; the rest stay for review. */
  const saveAi = async () => {
    setSubmitted(true);
    if (!courseId || !moduleId) return;
    if (!aiAccepted.length) {
      toast.warning('Accept at least one suggestion to save.');
      return;
    }
    setSaving(true);
    try {
      await createBatch(aiAccepted);
      setSubmitted(false);
      const left = aiRef.current?.removeAccepted() ?? 0;
      // Manual questions still waiting in the other tab keep the page open.
      if (left === 0 && !manualBusy) leave(goToBank);
    } catch (err) {
      showSaveError(describeSaveError(err, 'Could not save. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const save = !isEdit && createMode === 'ai' ? saveAi : saveManual;

  const changeStatus = async (next: QuestionStatus) => {
    const q = questions[0];
    if (!q?.questionId) return;
    setStatusBusy(true);
    try {
      const updated = await questionService.updateQuestionStatus(q.questionId, next, q.lockVersion);
      setStatus(updated.status);
      setQuestions(prev => prev.map(p => ({ ...p, lockVersion: updated.lockVersion })));
      toast.success(next === 'ACTIVE' ? 'Question published.' : 'Question archived.');
    } catch (err) {
      showSaveError(describeSaveError(err, 'Could not change the status.'));
    } finally {
      setStatusBusy(false);
      setConfirm(null);
    }
  };

  const cancel = goToBank;

  const title = isEdit ? 'Edit Question' : 'New Questions';
  const pageCls = 'px-4 sm:px-8 py-6 space-y-4';

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
          {/* Manual mode only: the questions written here go into this group (AI suggestions are saved standalone) */}
          {!isEdit && createMode === 'manual' && (
            <GroupContextCard
              value={groupCtx}
              onChange={changeGroupCtx}
              groups={groups}
              loadingGroups={groupsLoading}
              courseSelected={Boolean(courseId)}
              moduleId={moduleId}
              questionKinds={writtenKinds}
              showErrors={submitted}
              kindInvalid={submitted && questions.some(q => kindError(q))}
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
                onAcceptedChange={onAiAccepted}
                onPendingChange={setAiPending}
                disabled={saving}
              />
            </div>
          )}

          {/* Manual mode — question blocks scroll with the page; the side panel stays pinned */}
          <div ref={listRef} className={`space-y-3 scroll-mt-5 ${createMode === 'manual' ? '' : 'hidden'}`}>
            {questions.length === 0 && (
              <div className="card p-10 text-center">
                <p className="text-base font-medium text-content-secondary">No questions yet</p>
                <p className="text-sm text-content-subtle mt-1">Use “Add Question” or import a PDF or Word file.</p>
              </div>
            )}
            {questions.map((q, i) => (
              <div key={q.key} id={q.key} className="scroll-mt-4">
                <QuestionFormBlock
                  q={q}
                  index={i}
                  onChange={updated => updateQuestion(i, updated)}
                  showErrors={submitted}
                  removable={!isEdit}
                  onRemove={() => (isKept(q) ? setConfirmRemove(i) : remove(i))}
                  onDuplicate={isEdit ? undefined : () => duplicateQuestion(i)}
                  duplicateError={inBank.has(q.key) ? 'This question already exists in this course. Change its content or answers before saving, or remove it.' : undefined}
                  canMoveUp={i > 0}
                  canMoveDown={i < questions.length - 1}
                  onMoveUp={isEdit ? undefined : () => move(i, -1)}
                  onMoveDown={isEdit ? undefined : () => move(i, 1)}
                  allowedTypes={allowedTypes}
                  kindError={submitted ? kindError(q) : undefined}
                />
              </div>
            ))}
          </div>
        </div>

        <QuestionSidePanel
          tabs={modeSwitch}
          mode={mode}
          count={questions.length}
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
          onToggleStatus={isEdit ? () => (status === 'ACTIVE' ? setConfirm('archive') : changeStatus('ACTIVE')) : undefined}
          saving={saving}
          statusBusy={statusBusy}
          isActive={status === 'ACTIVE'}
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

      <Modal
        open={confirmRemove != null}
        onClose={() => setConfirmRemove(null)}
        title={`Delete question ${confirmRemove != null ? confirmRemove + 1 : ''}?`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRemove(null)}>Keep it</Button>
            <Button variant="danger" onClick={() => { if (confirmRemove != null) remove(confirmRemove); setConfirmRemove(null); }}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-content-secondary">This question hasn’t been saved yet, so what you wrote for it will be lost.</p>
      </Modal>

      <Modal
        open={confirm === 'archive'}
        onClose={() => setConfirm(null)}
        title="Archive question?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)} disabled={statusBusy}>Cancel</Button>
            <Button variant="danger" onClick={() => changeStatus('INACTIVE')} loading={statusBusy}>Archive</Button>
          </>
        }
      >
        <p className="text-sm text-content-secondary">Archived questions are no longer used when new exams are generated. You can publish it again later.</p>
      </Modal>
    </div>
  );
}
