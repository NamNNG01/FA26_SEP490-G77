import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
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
import { SaveErrorAlert } from '../components/SaveErrorAlert';

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
  const navigate = useNavigate();
  const toast = useToast();

  /** Create mode: unsaved work from before a reload, read once. */
  const [restored] = useState<CreateDraftSnapshot | null>(() => (isEdit ? null : loadCreateDraft()));
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
  const [showRestored, setShowRestored] = useState(Boolean(restored));
  /** The latest edits are in localStorage, so a reload needs no browser prompt. */
  const [draftStored, setDraftStored] = useState(Boolean(restored));

  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [saveError, setSaveError] = useState<SaveError | null>(null);
  const [importedCount, setImportedCount] = useState(0);
  /** Of the imported questions, how many the backend couldn't read. */
  const [importedIssues, setImportedIssues] = useState(0);
  const [showImport, setShowImport] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [createMode, setCreateMode] = useState<CreateMode>('manual');
  /** Asks before throwing away one mode's unsaved work to switch to the other. */
  const [confirmDiscard, setConfirmDiscard] = useState<CreateMode | null>(null);
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
        setSaveError(null);
      })
      .catch(err => {
        if (!cancelled) setLoadError(loadErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [isEdit, questionId, reloadKey]);

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

  // Keep the group context in line with the written questions: a new group takes their kind,
  // and an existing group of another kind is unpicked.
  useEffect(() => {
    if (!writtenKinds.length) return;
    setGroupCtx(prev => {
      if (prev.mode === 'new' && writtenKinds.length === 1 && prev.newKind !== writtenKinds[0]) return { ...prev, newKind: writtenKinds[0] };
      if (prev.mode === 'existing' && prev.existingGroupId) {
        const picked = asGroupKind(groups.find(g => String(g.groupId) === prev.existingGroupId)?.questionType);
        if (writtenKinds.length > 1 || (picked && picked !== writtenKinds[0])) return { ...prev, existingGroupId: '' };
      }
      return prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- writtenKey stands in for writtenKinds (a new array every render)
  }, [writtenKey, groupCtx.mode, groups]);

  // In a group every question must be of the group's kind (QUIZ / ESSAY / CODE / DIAGRAM).
  const kind = isEdit ? null : contextKind(groupCtx, groups);
  const allowedTypes = kind ? typesOfKind(kind) : undefined;
  const kindError = (q: QuestionDraft) =>
    allowedTypes && !allowedTypes.includes(q.type) && kind
      ? `${typeLabel(q.type)} questions can’t go into a ${GROUP_KIND_LABELS[kind].toLowerCase()} group — pick a ${GROUP_KIND_LABELS[kind].toLowerCase()} type.`
      : undefined;
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
    setSaveError(null);
    setImportedCount(0);
    setDirty(false);
    setShowRestored(false);
  };

  const discardRestored = () => {
    resetManual();
    setQuestions([emptyDraft()]);
    setCourseId('');
    setModuleId('');
    setGroupCtx(emptyGroupContext());
  };

  const unsavedDetails = [
    ...(dirty ? [isEdit ? 'Your changes to this question' : `${questions.length} question${questions.length === 1 ? '' : 's'} not saved yet`] : []),
    ...(aiPending > 0 ? [`${aiPending} AI suggestion${aiPending === 1 ? '' : 's'} not saved yet`] : []),
  ];

  /** Leaving through Cancel / breadcrumb goes through the guard's confirmation. */
  const goToBank = () => navigate(ROUTES.managerQuestions);

  const switchMode = (next: CreateMode) => {
    if (next === createMode) return;
    // The current mode's unsaved work must be saved or discarded first.
    if ((createMode === 'manual' && manualBusy) || (createMode === 'ai' && aiBusy)) {
      setConfirmDiscard(createMode);
      return;
    }
    setSaveError(null);
    setSubmitted(false);
    // Only blank starter questions are left — nothing of manual mode to keep.
    if (next === 'ai') setDirty(false);
    setCreateMode(next);
  };

  const discardAndSwitch = () => {
    if (confirmDiscard === 'manual') {
      resetManual();
      setCreateMode('ai');
    } else if (confirmDiscard === 'ai') {
      aiRef.current?.clear();
      setSaveError(null);
      setCreateMode('manual');
    }
    setConfirmDiscard(null);
  };

  const updateQuestion = (i: number, q: QuestionDraft) => {
    setQuestions(prev => prev.map((p, pi) => (pi === i ? q : p)));
    setTouched(prev => (prev.has(q.key) ? prev : new Set(prev).add(q.key)));
    setDirty(true);
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
    setImportedCount(fitting.length);
    setImportedIssues(fitting.filter(d => d.importIssue).length);
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

  /** Q-03 for a batch of new questions, in the picked group. Returns how many were saved. */
  const createBatch = async (drafts: QuestionDraft[]): Promise<number> => {
    const groupId = await resolveGroupId();
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
    setSaveError(null);
    const firstInvalid = questions.find(q => !isDraftValid(q) || kindError(q));
    if (firstInvalid) {
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
      setDirty(false);
      if (!isEdit) clearCreateDraft();
      leave(goToBank);
    } catch (err) {
      const error = describeSaveError(err, 'Could not save. Please try again.');
      setSaveError(error);
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
    setSaveError(null);
    if (!courseId) return;
    if (!aiAccepted.length) {
      toast.warning('Accept at least one suggestion to save.');
      return;
    }
    if (!groupReady()) return;
    const misfit = aiAccepted.find(q => kindError(q));
    if (misfit) {
      toast.error(kindError(misfit)!);
      return;
    }
    setSaving(true);
    try {
      await createBatch(aiAccepted);
      setSubmitted(false);
      const left = aiRef.current?.removeAccepted() ?? 0;
      if (left === 0) leave(goToBank);
    } catch (err) {
      setSaveError(describeSaveError(err, 'Could not save. Please try again.'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  };

  const save = !isEdit && createMode === 'ai' ? saveAi : saveManual;

  const changeStatus = async (next: QuestionStatus) => {
    const q = questions[0];
    if (!q?.questionId) return;
    setStatusBusy(true);
    setSaveError(null);
    try {
      const updated = await questionService.updateQuestionStatus(q.questionId, next, q.lockVersion);
      setStatus(updated.status);
      setQuestions(prev => prev.map(p => ({ ...p, lockVersion: updated.lockVersion })));
      toast.success(next === 'ACTIVE' ? 'Question published.' : 'Question archived.');
    } catch (err) {
      setSaveError(describeSaveError(err, 'Could not change the status.'));
    } finally {
      setStatusBusy(false);
      setConfirm(null);
    }
  };

  const cancel = goToBank;

  const title = isEdit ? 'Edit Question' : 'New Questions';
  const pageCls = 'px-4 sm:px-8 py-6 space-y-4';

  if (isEdit && (loading || loadError)) {
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
          // The other mode is closed while this one has unsaved work.
          const locked = !active && ((createMode === 'manual' && manualBusy) || (createMode === 'ai' && aiBusy));
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={active}
              aria-disabled={locked}
              onClick={() => switchMode(t.value)}
              title={locked ? `Save or discard the ${createMode === 'manual' ? 'manual questions' : 'AI suggestions'} first` : undefined}
              className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-[8px] text-sm font-medium transition-all ${
                active ? 'bg-surface text-content shadow-sm' : locked ? 'text-content-faint cursor-not-allowed' : 'text-content-soft hover:text-content-secondary'
              }`}
            >
              {locked ? <Icon.Lock className="w-3.5 h-3.5" /> : t.icon} {t.label}
            </button>
          );
        })}
      </div>
      {((createMode === 'manual' && manualBusy) || (createMode === 'ai' && aiBusy)) && (
        <p className="px-1.5 pb-0.5 text-xs text-content-subtle">
          Save {createMode === 'manual' ? 'these questions' : 'the accepted suggestions'} before switching to {createMode === 'manual' ? 'AI Generate' : 'Manual'}.
        </p>
      )}
    </div>
  );

  return (
    <div className={pageCls}>
      <Breadcrumb items={[{ label: 'Question', onClick: cancel }, { label: title }]} />
      <h2 className="text-xl font-bold text-content">{title}</h2>

      {showRestored && restored && (
        <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-brand-line bg-primary-light px-4 py-2.5 text-sm text-brand-ink-strong">
          <Icon.RefreshCw className="w-4 h-4 flex-shrink-0 text-brand-ink" />
          <span className="flex-1 min-w-[200px]">
            Restored your unsaved draft from {new Date(restored.savedAt).toLocaleString()}.
          </span>
          <Button size="sm" variant="ghost" onClick={discardRestored}>Discard draft</Button>
          <button type="button" onClick={() => setShowRestored(false)} className="p-1 rounded-[6px] hover:bg-accent" aria-label="Dismiss">
            <Icon.X className="w-4 h-4" />
          </button>
        </div>
      )}
      {saveError && <SaveErrorAlert error={saveError} onReload={isEdit ? () => setReloadKey(k => k + 1) : undefined} />}
      {importedCount > 0 && createMode === 'manual' && (
        importedIssues > 0 ? (
          <Alert
            type="warning"
            title={`${importedCount} question${importedCount === 1 ? '' : 's'} imported — ${importedIssues} couldn’t be read`}
            message="The questions marked in red came in blank. Fill them in or remove them, then review the rest before saving."
          />
        ) : (
          <Alert type="success" title={`${importedCount} question${importedCount === 1 ? '' : 's'} imported`} message="Review the extracted questions before saving." />
        )
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
        <div className="min-w-0 space-y-3 pb-4">
          {/* Shared by both modes: the questions saved from either go into this group */}
          {!isEdit && (
            <GroupContextCard
              value={groupCtx}
              onChange={changeGroupCtx}
              groups={groups}
              loadingGroups={groupsLoading}
              courseSelected={Boolean(courseId)}
              moduleId={moduleId}
              questionKinds={writtenKinds}
              showErrors={submitted}
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
                  showErrors={submitted || touched.has(q.key)}
                  removable={!isEdit}
                  onRemove={() => (isKept(q) ? setConfirmRemove(i) : remove(i))}
                  canMoveUp={i > 0}
                  canMoveDown={i < questions.length - 1}
                  onMoveUp={isEdit ? undefined : () => move(i, -1)}
                  onMoveDown={isEdit ? undefined : () => move(i, 1)}
                  allowedTypes={allowedTypes}
                  kindError={kindError(q)}
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
          onImport={createMode === 'manual' ? () => { setImportedCount(0); setShowImport(true); } : undefined}
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
        open={confirmDiscard != null}
        onClose={() => setConfirmDiscard(null)}
        title={confirmDiscard === 'manual' ? 'Switch to AI Generate?' : 'Switch to Manual?'}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDiscard(null)}>Keep working</Button>
            <Button variant="danger" onClick={discardAndSwitch}>Discard &amp; switch</Button>
          </>
        }
      >
        <p className="text-sm text-content-secondary">
          {confirmDiscard === 'manual'
            ? `Your ${kept} manual question${kept === 1 ? ' hasn’t' : 's haven’t'} been saved. Save them first, or discard them to draft questions with AI.`
            : `${aiPending} AI suggestion${aiPending === 1 ? ' hasn’t' : 's haven’t'} been saved. Save the accepted ones first, or discard them to write questions by hand.`}
        </p>
      </Modal>

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
