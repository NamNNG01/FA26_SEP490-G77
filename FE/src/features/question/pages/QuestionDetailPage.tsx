import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Alert } from '@/components/ui/Alert';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/ToastHost';
import { Icon } from '@/assets/icons';
import { ROUTES } from '@/app/routes';
import { QUESTION_STATUS_LABELS, questionService, type QuestionDifficulty, type QuestionStatus } from '@/services/question.service';
import { questionGroupService, type QuestionGroup } from '@/services/questionGroup.service';
import { AnswerSection } from '../components/QuestionForm';
import { QuestionLocationCard } from '../components/QuestionLocationCard';
import { GroupInfoCard, QuestionGroupPicker } from '../components/QuestionGroupPicker';
import {
  DIFFICULTY_OPTIONS,
  QUESTION_TYPE_OPTIONS,
  changeType,
  fromDetail,
  isDraftValid,
  toUpdateRequest,
  validateDraft,
  type EditableQuestionType,
  type QuestionDraft,
} from '../model';

type Confirm = 'discard' | 'delete' | null;

const STATUS_VARIANT: Record<QuestionStatus, BadgeVariant> = { ACTIVE: 'success', INACTIVE: 'danger', DRAFT: 'default' };
const STATUS_OPTIONS = (Object.keys(QUESTION_STATUS_LABELS) as QuestionStatus[]).map(value => ({ label: QUESTION_STATUS_LABELS[value], value }));
const TYPE_VARIANT: Partial<Record<EditableQuestionType, BadgeVariant>> = { ESSAY: 'purple', TRUE_FALSE: 'success', ORDERING: 'warning' };
const typeLabel = (t: EditableQuestionType) => QUESTION_TYPE_OPTIONS.find(o => o.value === t)?.label ?? t;

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);
const httpStatus = (err: unknown) => (err as { response?: { status?: number } })?.response?.status;

const textareaCls = (invalid: boolean) =>
  `w-full px-3 py-2 rounded-[10px] border text-base text-content bg-surface resize-y focus:outline-none focus:ring-2 transition-all ${
    invalid ? 'border-danger-solid focus:ring-danger-solid/20 focus:border-danger-solid' : 'border-line focus:ring-brand-600/20 focus:border-brand-600'
  }`;

/** Question Detail — view and edit one question, its answer key, group and classification. */
export function QuestionDetailPage() {
  const { questionId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [q, setQ] = useState<QuestionDraft | null>(null);
  const [courseId, setCourseId] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [status, setStatus] = useState<QuestionStatus>('ACTIVE');
  /** Values as last loaded/saved — the header badge and "Unsaved" hints compare against these. */
  const [savedStatus, setSavedStatus] = useState<QuestionStatus>('ACTIVE');
  const [savedGroupId, setSavedGroupId] = useState<number | null>(null);

  const [groups, setGroups] = useState<QuestionGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<{ message: string; conflict?: boolean } | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!questionId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    questionService
      .getQuestionById(questionId)
      .then(detail => {
        if (cancelled) return;
        setQ(fromDetail(detail));
        setCourseId(detail.courseId != null ? String(detail.courseId) : '');
        setModuleId(detail.moduleId != null ? String(detail.moduleId) : '');
        setStatus(detail.status);
        setSavedStatus(detail.status);
        setSavedGroupId(detail.groupId ?? null);
        setDirty(false);
        setSubmitted(false);
        setSaveError(null);
      })
      .catch(err => {
        if (!cancelled) setLoadError(httpStatus(err) === 404 ? 'This question does not exist or has been deleted.' : errorMessage(err, 'Could not load the question.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [questionId, reloadKey]);

  // Groups belong to a course; the question's course never changes here.
  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    setGroupsLoading(true);
    questionGroupService
      .getQuestionGroups({ courseId: Number(courseId), size: 100 })
      .then(res => { if (!cancelled) setGroups(res.content); })
      .catch(() => { if (!cancelled) setGroups([]); })
      .finally(() => { if (!cancelled) setGroupsLoading(false); });
    return () => { cancelled = true; };
  }, [courseId]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const goToBank = () => navigate(ROUTES.managerQuestions);
  const cancel = () => (dirty ? setConfirm('discard') : goToBank());

  const update = (patch: Partial<QuestionDraft>) => {
    setQ(prev => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
  };
  const markDirty = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setDirty(true); };

  const attachGroup = (group: QuestionGroup) => {
    setGroups(prev => (prev.some(g => g.groupId === group.groupId) ? prev : [group, ...prev]));
    update({ groupId: group.groupId });
    toast.info(`Linked to “${group.title || `Group #${group.groupId}`}”. Save changes to keep it.`);
  };

  const createGroup = async (title: string, passageText: string) => {
    try {
      const group = await questionGroupService.createQuestionGroup({
        courseId: Number(courseId),
        moduleId: moduleId ? Number(moduleId) : null,
        title,
        passageText,
      });
      attachGroup(group);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not create the question group.'));
      throw err;
    }
  };

  /** Saved right away (not with Save Changes) — the passage is shared by every question in the group. */
  const updateGroup = async (group: QuestionGroup, title: string, passageText: string) => {
    try {
      const updated = await questionGroupService.updateQuestionGroup(group.groupId, { title, passageText });
      setGroups(prev => prev.map(g => (g.groupId === updated.groupId ? updated : g)));
      toast.success(`Group “${updated.title || `Group #${updated.groupId}`}” updated.`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update the question group.'));
      throw err;
    }
  };

  const save = async () => {
    if (!q?.questionId) return;
    setSubmitted(true);
    setSaveError(null);
    if (!isDraftValid(q) || !moduleId) {
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSaving(true);
    try {
      const updated = await questionService.updateQuestion(q.questionId, toUpdateRequest(q, Number(moduleId), { status }));
      setQ(fromDetail(updated));
      setStatus(updated.status);
      setSavedStatus(updated.status);
      setSavedGroupId(updated.groupId ?? null);
      setDirty(false);
      setSubmitted(false);
      toast.success('Question updated.');
    } catch (err) {
      setSaveError({ message: errorMessage(err, 'Could not save. Please try again.'), conflict: httpStatus(err) === 409 });
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!q?.questionId) return;
    setBusy(true);
    try {
      await questionService.deleteQuestion(q.questionId);
      toast.success('Question deleted.');
      setDirty(false);
      goToBank();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete the question.'));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const pageCls = 'px-4 sm:px-8 py-6 space-y-4 lg:h-full lg:flex lg:flex-col lg:overflow-hidden';
  const crumbs = [{ label: 'Question', onClick: cancel }, { label: 'Question Detail' }];

  if (loading || loadError || !q) {
    return (
      <div className={pageCls}>
        <Breadcrumb items={crumbs} />
        {loadError ? (
          <div className="space-y-3">
            <Alert type="error" title="Could not open the question" message={loadError} />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setReloadKey(k => k + 1)}>Try again</Button>
              <Button variant="ghost" onClick={goToBank}>Back to questions</Button>
            </div>
          </div>
        ) : (
          <div className="card p-10 flex items-center justify-center gap-3 text-content-soft"><Spinner size="sm" /> Loading question…</div>
        )}
      </div>
    );
  }

  const errors = submitted ? validateDraft(q) : {};
  const linkedGroup = groups.find(g => g.groupId === q.groupId) ?? null;
  const groupPending = q.groupId !== savedGroupId;
  const locked = saving || busy;

  return (
    <div className={pageCls}>
      <Breadcrumb items={crumbs} />

      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-content">Question Detail</h2>
          {dirty && <Badge variant="warning">Unsaved changes</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={cancel} disabled={saving}>Cancel</Button>
          <Button icon={<Icon.CheckCircle className="w-4 h-4" />} onClick={save} loading={saving} disabled={locked || Boolean(validateDraft(q).type)}>
            Save Changes
          </Button>
        </div>
      </div>

      {saveError && (
        <div className="space-y-2">
          <Alert
            type="error"
            title={saveError.conflict ? 'This question was changed by someone else' : 'Could not save'}
            message={saveError.conflict ? 'Reload to get the latest version, then apply your changes again.' : saveError.message}
          />
          {saveError.conflict && <Button variant="secondary" size="sm" onClick={() => setReloadKey(k => k + 1)}>Reload question</Button>}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 lg:flex-1 lg:min-h-0 items-start">
        {/* Main editor — the only part that scrolls on desktop */}
        <div ref={scrollRef} className="lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-2 pb-4">
          <section aria-labelledby="question-detail-title" className="card px-4 sm:px-5 py-4 space-y-4">
            {/* Header: id, question text label, badges */}
            <div>
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="h-7 px-2 rounded-[6px] bg-brand-600/10 text-brand-ink flex items-center justify-center text-xs font-bold flex-shrink-0">#{q.questionId}</span>
                  <h3 id="question-detail-title" className="text-lg font-semibold text-content">
                    <label htmlFor="question-content">Question Text *</label>
                  </h3>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Badge variant={STATUS_VARIANT[savedStatus] ?? 'default'}>{QUESTION_STATUS_LABELS[savedStatus] ?? savedStatus}</Badge>
                  <Badge variant={TYPE_VARIANT[q.type] ?? 'info'}>{typeLabel(q.type)}</Badge>
                </div>
              </div>
              <textarea
                id="question-content"
                value={q.content}
                onChange={e => update({ content: e.target.value })}
                aria-invalid={Boolean(errors.content)}
                disabled={locked}
                className={`${textareaCls(Boolean(errors.content))} h-[120px]`}
                placeholder={q.type === 'FILL_BLANK' ? 'e.g. The capital of France is {{1}}.' : 'Enter the question…'}
              />
              {errors.content && <p className="text-xs text-danger mt-1">{errors.content}</p>}
            </div>

            <QuestionGroupPicker
              groups={groups}
              loading={groupsLoading}
              currentGroupId={q.groupId}
              onAttach={attachGroup}
              onCreate={createGroup}
              onUpdate={updateGroup}
              disabled={locked}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select label="Difficulty" value={q.difficulty} onChange={v => update({ difficulty: v as QuestionDifficulty })} options={DIFFICULTY_OPTIONS} disabled={locked} />
              <Select label="Type" value={q.type} onChange={v => { setQ(changeType(q, v as EditableQuestionType)); setDirty(true); }} options={QUESTION_TYPE_OPTIONS} disabled={locked} />
            </div>

            <div className="border-t border-line pt-4">
              <AnswerSection q={q} set={update} error={errors.answers} />
            </div>

            <div className="border-t border-line pt-4">
              <label htmlFor="question-explanation" className="block text-sm font-medium text-content-secondary mb-1">Explanation</label>
              <textarea
                id="question-explanation"
                value={q.explanation}
                onChange={e => update({ explanation: e.target.value })}
                disabled={locked}
                className={`${textareaCls(false)} h-[110px]`}
                placeholder="Why the correct answer is correct — students see this when reviewing their attempt."
              />
            </div>

            {/* Lifecycle actions */}
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button variant="danger" icon={<Icon.Trash className="w-4 h-4" />} onClick={() => setConfirm('delete')} disabled={locked}>
                Delete Question
              </Button>
            </div>
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-4 lg:h-full lg:min-h-0 lg:overflow-y-auto pb-4">
          <div className="card p-4 space-y-3">
            <h3 className="flex items-center gap-1.5 text-base font-semibold text-content">
              <Icon.FolderOpen className="w-4 h-4 text-brand-ink" /> Classification
            </h3>
            <QuestionLocationCard
              courseId={courseId}
              moduleId={moduleId}
              onChange={(c, m) => { setCourseId(c); setModuleId(m); setDirty(true); }}
              courseLocked
              showErrors={submitted}
              hideHeading
            />
            <Select label="Status" value={status} onChange={markDirty(v => setStatus(v as QuestionStatus))} options={STATUS_OPTIONS} disabled={locked} />
            <p className="text-xs text-content-subtle">The course can't be changed after a question is created.</p>
          </div>

          <GroupInfoCard group={linkedGroup} groupId={q.groupId} loading={groupsLoading} pending={groupPending} onUnlink={() => update({ groupId: savedGroupId })} />
        </div>
      </div>

      <Modal
        open={confirm === 'discard'}
        onClose={() => setConfirm(null)}
        title="Discard changes?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>Keep editing</Button>
            <Button variant="danger" onClick={() => { setDirty(false); goToBank(); }}>Discard</Button>
          </>
        }
      >
        <p className="text-sm text-content-secondary">Your unsaved changes to this question will be lost.</p>
      </Modal>

      <Modal
        open={confirm === 'delete'}
        onClose={() => !busy && setConfirm(null)}
        title="Delete question?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)} disabled={busy}>Cancel</Button>
            <Button variant="danger" onClick={remove} loading={busy}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-content-secondary">
          Question #{q.questionId} will be removed from the question bank and won't be used in new exams. Questions already used by a published exam can't be deleted.
        </p>
      </Modal>
    </div>
  );
}
