import React, { useEffect, useRef, useState } from 'react';
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
import { GroupContextCard, emptyGroupContext, groupContextErrors, type GroupContextValue } from '../components/GroupContextCard';
import { AiGeneratePanel } from '../components/AiGeneratePanel';
import { Tabs } from '@/components/ui/Tabs';
import { UnsavedChangesModal } from '@/components/common/UnsavedChangesModal';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import {
  emptyDraft,
  fromDetail,
  isDraftValid,
  toCreateRequest,
  toUpdateRequest,
  type QuestionDraft,
} from '../model';
import { clearCreateDraft, loadCreateDraft, saveCreateDraft, type CreateDraftSnapshot } from '../createDraft';
import { Icon } from '@/assets/icons';
import { describeSaveError, loadErrorMessage, type SaveError } from '../saveError';
import { SaveErrorAlert } from '../components/SaveErrorAlert';

/** Q-03 accepts 1..50 questions per request. */
const MAX_BATCH = 50;

type Confirm = 'archive' | null;

/** Create mode: write questions by hand, or draft them with AI (AI-03) and accept into the list. */
type CreateTab = 'manual' | 'ai';
const AI_TAB_LABEL = 'AI Generate';


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
  const [showImport, setShowImport] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState<CreateTab>('manual');
  const [aiPending, setAiPending] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

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
    if (isEdit || !dirty) return;
    setDraftStored(false);
    const id = setTimeout(() => setDraftStored(saveCreateDraft({ questions, courseId, moduleId, groupCtx, touched: [...touched] })), 400);
    return () => clearTimeout(id);
  }, [isEdit, dirty, questions, courseId, moduleId, groupCtx, touched]);

  // Unsaved edits, or AI suggestions not accepted yet, hold any navigation away for confirmation.
  // Reloading only prompts for what the stored draft can't bring back.
  const { blocker, leave } = useUnsavedChangesGuard(dirty || aiPending > 0, (dirty && (isEdit || !draftStored)) || aiPending > 0);

  // Leaving without saving was confirmed — the draft goes with it.
  useEffect(() => {
    if (!isEdit && blocker.state === 'proceeding') clearCreateDraft();
  }, [isEdit, blocker.state]);

  const discardRestored = () => {
    clearCreateDraft();
    setQuestions([emptyDraft()]);
    setCourseId('');
    setModuleId('');
    setGroupCtx(emptyGroupContext());
    setTouched(new Set());
    setSubmitted(false);
    setSaveError(null);
    setDirty(false);
    setShowRestored(false);
  };
  const unsavedDetails = [
    ...(dirty ? [isEdit ? 'Your changes to this question' : `${questions.length} question${questions.length === 1 ? '' : 's'} not saved yet`] : []),
    ...(aiPending > 0 ? [`${aiPending} AI suggestion${aiPending === 1 ? '' : 's'} not accepted yet`] : []),
  ];

  /** Leaving through Cancel / breadcrumb goes through the guard's confirmation. */
  const goToBank = () => navigate(ROUTES.managerQuestions);

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
    const draft = emptyDraft();
    setQuestions(prev => [...prev, draft]);
    setTab('manual');
    requestAnimationFrame(() => scrollTo(draft.key));
  };

  /** Append drafts, replacing the untouched blank starter question instead of keeping it around. */
  const appendDrafts = (drafts: QuestionDraft[]) => {
    setQuestions(prev => [...prev.filter(q => touched.has(q.key) || q.content.trim() !== ''), ...drafts]);
    setDirty(true);
  };

  const handleImported = (drafts: QuestionDraft[]) => {
    appendDrafts(drafts);
    setImportedCount(drafts.length);
    setShowImport(false);
    setTab('manual');
  };

  const kept = questions.filter(q => touched.has(q.key) || q.content.trim() !== '').length;
  const aiRoom = MAX_BATCH - kept;

  /** Returns how many drafts made it in (the batch is capped at MAX_BATCH). */
  const handleAiAccepted = (drafts: QuestionDraft[]): number => {
    const fitting = drafts.slice(0, Math.max(0, aiRoom));
    if (fitting.length < drafts.length) toast.warning(`You can save up to ${MAX_BATCH} questions at a time — save these first.`);
    if (!fitting.length) return 0;
    appendDrafts(fitting);
    toast.success(`${fitting.length} question${fitting.length === 1 ? '' : 's'} added. Review in the Manual tab, then Save All.`);
    return fitting.length;
  };

  const changeGroupCtx = (v: GroupContextValue) => {
    setGroupCtx(v);
    setDirty(true);
  };

  const changeLocation = (c: string, m: string) => {
    // A group belongs to one course, so a picked group no longer applies.
    if (c !== courseId) setGroupCtx(prev => ({ ...prev, existingGroupId: '' }));
    setCourseId(c);
    setModuleId(m);
    setDirty(true);
  };

  const locationNote =
    !courseId || !moduleId ? 'Select a course and module to save.'
      : !isEdit && questions.length > MAX_BATCH ? `You can save up to ${MAX_BATCH} questions at a time.`
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
      title: groupCtx.newTitle.trim(),
      passageText: groupCtx.newPassage.trim(),
    });
    setGroups(prev => [group, ...prev]);
    setGroupCtx(prev => ({ ...prev, mode: 'existing', existingGroupId: String(group.groupId) }));
    return group.groupId;
  };

  const save = async () => {
    setSubmitted(true);
    setSaveError(null);
    const firstInvalid = questions.find(q => !isDraftValid(q));
    if (firstInvalid) {
      setTab('manual');
      requestAnimationFrame(() => scrollTo(firstInvalid.key));
      return;
    }
    if (locationNote || questions.length === 0) return;
    if (!isEdit && Object.keys(groupContextErrors(groupCtx)).length > 0) {
      setTab('manual');
      listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        await questionService.updateQuestion(questions[0].questionId!, toUpdateRequest(questions[0], Number(moduleId)));
        toast.success('Question updated.');
      } else {
        const groupId = await resolveGroupId();
        const payload = questions.map(q => ({ ...toCreateRequest(q, Number(courseId), Number(moduleId)), groupId }));
        const created = await questionService.createQuestionsBatch(Number(courseId), Number(moduleId), payload);
        toast.success(`${created.length} question${created.length === 1 ? '' : 's'} saved${groupId != null ? ' to the question group' : ''}.`);
      }
      setDirty(false);
      if (!isEdit) clearCreateDraft();
      // Saved — unaccepted AI suggestions are left behind on purpose.
      leave(goToBank);
    } catch (err) {
      const error = describeSaveError(err, 'Could not save. Please try again.');
      setSaveError(error);
      // Batch field errors carry "questions[i]." — jump to that question.
      const target = error.questionIndex != null ? questions[error.questionIndex] : undefined;
      setTab('manual');
      if (target) requestAnimationFrame(() => scrollTo(target.key));
      else listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } finally {
      setSaving(false);
    }
  };

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
  const manualTabLabel = `Manual (${questions.length})`;
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
      {importedCount > 0 && (
        <Alert type="success" title={`${importedCount} question${importedCount === 1 ? '' : 's'} imported`} message="Review the extracted questions before saving." />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
        {/* AI tab — kept mounted so its suggestions survive switching tabs */}
        {!isEdit && (
          <div className={`min-w-0 pb-4 ${tab === 'ai' ? '' : 'hidden'}`}>
            <AiGeneratePanel courseId={courseId} moduleId={moduleId} onAccept={handleAiAccepted} onPendingChange={setAiPending} disabled={saving} />
          </div>
        )}

        {/* Question blocks — scroll with the page; the side panel stays pinned */}
        <div ref={listRef} className={`min-w-0 space-y-3 pb-4 scroll-mt-5 ${tab === 'manual' ? '' : 'hidden'}`}>
          {!isEdit && (
            <GroupContextCard
              value={groupCtx}
              onChange={changeGroupCtx}
              groups={groups}
              loadingGroups={groupsLoading}
              courseSelected={Boolean(courseId)}
              showErrors={submitted}
              disabled={saving}
            />
          )}
          {questions.length === 0 && (
            <div className="card p-10 text-center">
              <p className="text-base font-medium text-content-secondary">No questions yet</p>
              <p className="text-sm text-content-subtle mt-1">Use “Add Question”, import a PDF or Word file, or draft questions in the AI Generate tab.</p>
            </div>
          )}
          {questions.map((q, i) => (
            <div key={q.key} id={q.key} className="scroll-mt-4">
              <QuestionFormBlock
                q={q}
                index={i}
                onChange={updated => updateQuestion(i, updated)}
                showErrors={submitted || touched.has(q.key)}
                removable={!isEdit && questions.length > 1}
                onRemove={() => remove(i)}
                canMoveUp={i > 0}
                canMoveDown={i < questions.length - 1}
                onMoveUp={isEdit ? undefined : () => move(i, -1)}
                onMoveDown={isEdit ? undefined : () => move(i, 1)}
              />
            </div>
          ))}
        </div>

        <QuestionSidePanel
          tabs={!isEdit && (
            // Full-width segmented switch above the Location card.
            <div className="[&>[role=tablist]]:w-full [&_[role=tab]]:flex-1">
              <Tabs
                tabs={[manualTabLabel, AI_TAB_LABEL]}
                active={tab === 'manual' ? manualTabLabel : AI_TAB_LABEL}
                onChange={t => setTab(t === AI_TAB_LABEL ? 'ai' : 'manual')}
              />
            </div>
          )}
          mode={mode}
          count={questions.length}
          courseId={courseId}
          moduleId={moduleId}
          onLocationChange={changeLocation}
          showErrors={submitted}
          prerequisiteNote={locationNote}
          onAdd={questions.length < MAX_BATCH ? addQuestion : undefined}
          onImport={() => { setImportedCount(0); setShowImport(true); }}
          onSave={save}
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
        room={aiRoom}
      />

      <UnsavedChangesModal
        blocker={blocker}
        message="You have work on this page that hasn’t been saved. If you leave now, it will be lost:"
        details={unsavedDetails}
      />

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
