import React, { useState } from 'react';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Alert } from '@/components/ui/Alert';
import { QuestionForm as QuestionFormBlock, emptyQuestion, type QuestionForm } from '../components/QuestionForm';
import { validateQuestion } from '../validation';
import { QuestionSidePanel } from '../components/QuestionSidePanel';
import { ImportPdfModal } from '../components/ImportPdfModal';
import { modulesByCourse } from '@/features/module/mockModules';

const DEFAULT_MODULE_ID = 'loc-ml-1';

/** Pre-filled sample used to match the Edit Question UI reference. */
const sampleEditQuestion = (): QuestionForm => ({
  id: 'q-edit-sample',
  text: 'Which of the following best describes the primary purpose of machine learning in artificial intelligence?',
  moduleId: DEFAULT_MODULE_ID,
  difficulty: 'medium',
  type: 'mcq',
  options: [
    { label: 'A', text: 'To enable computers to learn from data and make predictions or decisions without being explicitly programmed.' },
    { label: 'B', text: 'To increase the processing speed of computer hardware.' },
    { label: 'C', text: 'To replace human decision-making in all situations.' },
    { label: 'D', text: 'To eliminate the need for data in software development.' },
  ],
  correct: 'A',
});

export function QuestionFormPage({ mode, onNavigate }: { mode: 'create' | 'edit'; onNavigate?: (id: string) => void }) {
  const isEdit = mode === 'edit';
  const [questions, setQuestions] = useState<QuestionForm[]>(isEdit ? [sampleEditQuestion()] : []);
  const [courseId, setCourseId] = useState(isEdit ? 'loc-ml' : '');
  const [moduleId, setModuleId] = useState(isEdit ? DEFAULT_MODULE_ID : '');
  const [showImport, setShowImport] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [imported, setImported] = useState(0);

  const locationReady = courseId !== '' && moduleId !== '';

  // Keep imported/added questions stamped with the current location.
  const updateQuestion = (i: number, q: QuestionForm) => {
    setQuestions(prev => prev.map((p, pi) => pi === i ? q : p));
  };

  const move = (i: number, dir: -1 | 1) => {
    setQuestions(prev => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const handleImported = (incoming: QuestionForm[]) => {
    const stamped = incoming.map(q => ({ ...q, moduleId: moduleId || (modulesByCourse(courseId)[0]?.id ?? '') }));
    setQuestions(prev => [...prev, ...stamped]);
    setImported(incoming.length);
    setShowImport(false);
  };

  const scrollToQuestion = (i: number) => {
    if (i < 0 || i >= questions.length) return;
    const el = document.getElementById(questions[i].id);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleAdd = () => {
    setQuestions(prev => [...prev, emptyQuestion(prev.length, moduleId)]);
  };

  const handleCancel = () => {
    onNavigate?.('question-bank');
  };

  const handleRemove = () => {
    onNavigate?.('question-bank');
  };

  const saveAll = () => {
    const firstInvalid = questions.findIndex(q => !validateQuestion(q));
    if (firstInvalid >= 0) {
      scrollToQuestion(firstInvalid);
      return;
    }
    setSavedCount(questions.length);
    setSaved(true);
  };

  // Two-column layout (form left, sticky Location/Actions sidebar right).
  // Only the question column scrolls; the sidebar stays fixed and visible.
  const pageCls = 'px-8 py-6 space-y-4 lg:h-full lg:flex lg:flex-col lg:overflow-hidden';

  return (
    <div className={pageCls}>
      <Breadcrumb items={[{ label: 'Question', onClick: () => onNavigate?.('question-bank') }, { label: isEdit ? 'Edit Question' : 'New Questions' }]} />
      <div className="flex items-center justify-between">
        <h2 className="text-[22px] font-bold text-[#111827]">{isEdit ? 'Edit Question' : 'New Questions'}</h2>
      </div>

      {saved && (
        <Alert type="success" title={`${savedCount} question${savedCount === 1 ? '' : 's'} saved`} message={isEdit ? 'The question has been updated successfully.' : 'Your questions have been submitted in a single request.'} />
      )}
      {imported > 0 && !saved && (
        <Alert type="success" title={`${imported} question${imported === 1 ? '' : 's'} imported`} message="Extracted questions were added to the selected course. Review and edit them before saving." />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:flex-1 lg:min-h-0 items-start">
        {/* Left (80%): question editing form */}
        <div className="lg:col-span-4 space-y-3 lg:min-h-0 lg:overflow-y-auto lg:pr-2">
          {questions.length === 0 && (
            <div className="card p-10 text-center">
              <p className="text-[14px] font-medium text-[#374151]">No questions yet</p>
              <p className="text-[13px] text-[#9CA3AF] mt-1">Use "Add Question" or import a PDF to begin.</p>
            </div>
          )}
          {questions.map((q, i) => (
            <div key={q.id} id={q.id} className="scroll-mt-6">
              <QuestionFormBlock q={q} index={i} onChange={updated => updateQuestion(i, updated)}
                showValidation={!isEdit}
                removable={questions.length > 1} onRemove={() => setQuestions(prev => prev.filter((_, pi) => pi !== i))}
                canMoveUp={i > 0} canMoveDown={i < questions.length - 1} onMoveUp={() => move(i, -1)} onMoveDown={() => move(i, 1)} />
            </div>
          ))}
        </div>

        {/* Right (20%): sticky Location + Actions sidebar */}
        <div className="lg:col-span-1 min-h-0">
          <QuestionSidePanel
            mode={isEdit ? 'edit' : 'create'}
            questions={questions}
            courseId={courseId}
            moduleId={moduleId}
            onLocationChange={(c, m) => { setCourseId(c); setModuleId(m); }}
            onAdd={handleAdd}
            onImport={() => { setSaved(false); setImported(0); setShowImport(true); }}
            onSave={saveAll}
            onCancel={handleCancel}
            onRemove={handleRemove}
            saveDisabled={!locationReady}
          />
        </div>
      </div>

      <ImportPdfModal open={showImport} onClose={() => setShowImport(false)} onImported={handleImported} />
    </div>
  );
}
