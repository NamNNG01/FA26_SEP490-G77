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
import { QuestionForm as QuestionFormBlock } from '../components/QuestionForm';
import { QuestionSidePanel } from '../components/QuestionSidePanel';
import { ImportPdfModal } from '../components/ImportPdfModal';
import {
  emptyDraft,
  fromDetail,
  fromExtracted,
  isDraftValid,
  toCreateRequest,
  toUpdateRequest,
  type ExtractedQuestion,
  type QuestionDraft,
} from '../model';

/** Q-03 accepts 1..50 questions per request. */
const MAX_BATCH = 50;

type Confirm = 'discard' | 'deactivate' | null;

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);
const httpStatus = (err: unknown) => (err as { response?: { status?: number } })?.response?.status;

export function QuestionFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const isEdit = mode === 'edit';
  const { questionId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [questions, setQuestions] = useState<QuestionDraft[]>(() => (isEdit ? [] : [emptyDraft()]));
  const [courseId, setCourseId] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [status, setStatus] = useState<QuestionStatus>('ACTIVE');

  /** Questions the user has edited — their errors show before the first save attempt. */
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [saveError, setSaveError] = useState<{ message: string; conflict?: boolean } | null>(null);
  const [importedCount, setImportedCount] = useState(0);
  const [showImport, setShowImport] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [reloadKey, setReloadKey] = useState(0);
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
        if (!cancelled) setLoadError(httpStatus(err) === 404 ? 'This question does not exist or has been deleted.' : errorMessage(err, 'Could not load the question.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [isEdit, questionId, reloadKey]);

  // Warn before closing the tab with unsaved work.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

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
    requestAnimationFrame(() => scrollTo(draft.key));
  };

  const handleImported = (incoming: ExtractedQuestion[]) => {
    // Replace the untouched blank starter question instead of keeping it around.
    const drafts = incoming.map(fromExtracted);
    setQuestions(prev => [...prev.filter(q => touched.has(q.key) || q.content.trim() !== ''), ...drafts]);
    setImportedCount(drafts.length);
    setShowImport(false);
    setDirty(true);
  };

  const changeLocation = (c: string, m: string) => {
    setCourseId(c);
    setModuleId(m);
    setDirty(true);
  };

  const locationNote =
    !courseId || !moduleId ? 'Select a course and module to save.'
      : !isEdit && questions.length > MAX_BATCH ? `You can save up to ${MAX_BATCH} questions at a time.`
      : null;

  const save = async () => {
    setSubmitted(true);
    setSaveError(null);
    const firstInvalid = questions.find(q => !isDraftValid(q));
    if (firstInvalid) {
      scrollTo(firstInvalid.key);
      return;
    }
    if (locationNote || questions.length === 0) return;

    setSaving(true);
    try {
      if (isEdit) {
        await questionService.updateQuestion(questions[0].questionId!, toUpdateRequest(questions[0], Number(moduleId)));
        toast.success('Question updated.');
      } else {
        const payload = questions.map(q => toCreateRequest(q, Number(courseId), Number(moduleId)));
        const created = await questionService.createQuestionsBatch(Number(courseId), Number(moduleId), payload);
        toast.success(`${created.length} question${created.length === 1 ? '' : 's'} saved.`);
      }
      setDirty(false);
      goToBank();
    } catch (err) {
      const message = errorMessage(err, 'Could not save. Please try again.');
      setSaveError({ message, conflict: httpStatus(err) === 409 });
      // Batch errors read "Error at index N: …" — jump to that question.
      const idx = /index (\d+)/i.exec(message);
      const target = idx ? questions[Number(idx[1])] : undefined;
      if (target) scrollTo(target.key);
      else listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
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
      toast.success(next === 'ACTIVE' ? 'Question activated.' : 'Question deactivated.');
    } catch (err) {
      setSaveError({ message: errorMessage(err, 'Could not change the status.'), conflict: httpStatus(err) === 409 });
    } finally {
      setStatusBusy(false);
      setConfirm(null);
    }
  };

  const cancel = () => (dirty ? setConfirm('discard') : goToBank());

  const title = isEdit ? 'Edit Question' : 'New Questions';
  const pageCls = 'px-4 sm:px-8 py-6 space-y-4 lg:h-full lg:flex lg:flex-col lg:overflow-hidden';

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

      {saveError && (
        <div className="space-y-2">
          <Alert
            type="error"
            title={saveError.conflict ? 'This question was changed by someone else' : 'Could not save'}
            message={saveError.conflict ? 'Reload to get the latest version, then apply your changes again.' : saveError.message}
          />
          {saveError.conflict && isEdit && <Button variant="secondary" size="sm" onClick={() => setReloadKey(k => k + 1)}>Reload question</Button>}
        </div>
      )}
      {importedCount > 0 && (
        <Alert type="success" title={`${importedCount} question${importedCount === 1 ? '' : 's'} imported`} message="Review the extracted questions before saving." />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-6 lg:flex-1 lg:min-h-0 items-start">
        {/* Question blocks — the only part that scrolls on desktop */}
        <div ref={listRef} className="space-y-3 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-2 pb-4">
          {questions.length === 0 && (
            <div className="card p-10 text-center">
              <p className="text-base font-medium text-content-secondary">No questions yet</p>
              <p className="text-sm text-content-subtle mt-1">Use “Add Question” or import a PDF to begin.</p>
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
          onToggleStatus={isEdit ? () => (status === 'ACTIVE' ? setConfirm('deactivate') : changeStatus('ACTIVE')) : undefined}
          saving={saving}
          statusBusy={statusBusy}
          isActive={status === 'ACTIVE'}
        />
      </div>

      <ImportPdfModal open={showImport} onClose={() => setShowImport(false)} onImported={handleImported} />

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
        <p className="text-sm text-content-secondary">
          {isEdit ? 'Your unsaved changes to this question will be lost.' : 'The questions you have not saved will be lost.'}
        </p>
      </Modal>

      <Modal
        open={confirm === 'deactivate'}
        onClose={() => setConfirm(null)}
        title="Deactivate question?"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)} disabled={statusBusy}>Cancel</Button>
            <Button variant="danger" onClick={() => changeStatus('INACTIVE')} loading={statusBusy}>Deactivate</Button>
          </>
        }
      >
        <p className="text-sm text-content-secondary">Inactive questions are no longer used when new exams are generated. You can activate it again later.</p>
      </Modal>
    </div>
  );
}
