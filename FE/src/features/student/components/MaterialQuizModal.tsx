import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { Icon } from '@/assets/icons';
import { studentPracticePath } from '@/app/routes';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  DRAFT_TYPES,
  DRAFT_TYPE_LABEL,
  MATERIAL_ACCEPT,
  MATERIAL_MAX_BYTES,
  PRACTICE_MAX_MINUTES,
  PRACTICE_MAX_QUESTIONS,
  blankIndices,
  convertDraft,
  newKey,
  studentPracticeService,
  validateDraft,
  type DraftGroup,
  type DraftQuestion,
  type DraftQuestionType,
  type MaterialDraft,
} from '@/services/studentPractice.service';
import { optionLetter } from './QuestionAnswerInput';
import { TypeCountSelect, type TypeCounts } from '@/features/question/components/TypeCountSelect';

const FIELD =
  'w-full rounded-[10px] border border-line bg-surface px-3 text-sm text-content placeholder:text-content-subtle transition-all focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600';
const PILL = 'h-8 pl-3 pr-8 rounded-[8px] text-xs font-medium';
const NEW_GROUP = '__new';
const SINGLE = '';
const EXTENSIONS = MATERIAL_ACCEPT.split(',');

const EMPTY_DRAFT: MaterialDraft = { title: '', groups: [], questions: [] };

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Groups with no question left are dropped. */
function prune(draft: MaterialDraft): MaterialDraft {
  const used = new Set(draft.questions.map(q => q.groupKey));
  return { ...draft, groups: draft.groups.filter(g => used.has(g.key)) };
}

/**
 * Material to Quiz Creator — upload a PDF / DOCX / PPTX, choose how many
 * questions of each type, let the AI draft them, edit / regroup / remove, and
 * start the quiz. Occupies 90% of the screen: the question list and the
 * "Exam Information" panel scroll on their own (the panel sits above the list on narrow screens).
 */
export function MaterialQuizModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [counts, setCounts] = useState<TypeCounts<DraftQuestionType>>({ MULTIPLE_CHOICE: '10', TRUE_FALSE: '5' });
  const [touched, setTouched] = useState(false);

  const [draft, setDraft] = useState<MaterialDraft>(EMPTY_DRAFT);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [minutes, setMinutes] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (open) return;
    abortRef.current?.abort();
    setFile(null);
    setFileError(null);
    setDraft(EMPTY_DRAFT);
    setGenError(null);
    setTouched(false);
    setShowErrors(false);
    setMinutes('');
    setGenerating(false);
  }, [open]);

  /* ── generation settings ─────────────────────────────────────────────── */
  const types = DRAFT_TYPES.filter(t => counts[t] != null);
  const typeCounts = Object.fromEntries(types.map(t => [t, Number(counts[t])])) as Record<DraftQuestionType, number>;
  const badCount = types.some(t => !Number.isInteger(typeCounts[t]) || typeCounts[t] < 1);
  const total = types.reduce((s, t) => s + (Number.isInteger(typeCounts[t]) && typeCounts[t] > 0 ? typeCounts[t] : 0), 0);
  const typesError =
    types.length === 0
      ? 'Choose at least one question type.'
      : badCount
        ? 'Every question type needs a count of at least 1.'
        : total > PRACTICE_MAX_QUESTIONS
          ? `At most ${PRACTICE_MAX_QUESTIONS} questions in total.`
          : null;
  const settingsError = !file ? 'Upload a learning material first.' : typesError;

  const pickFile = (f: File | undefined | null) => {
    if (!f) return;
    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
    if (!EXTENSIONS.includes(ext)) {
      setFileError('Only PDF, DOCX or PPTX files are supported.');
      return;
    }
    if (f.size > MATERIAL_MAX_BYTES) {
      setFileError(`The file is larger than ${formatSize(MATERIAL_MAX_BYTES)}.`);
      return;
    }
    setFileError(null);
    setFile(f);
  };

  const generate = async () => {
    setTouched(true);
    if (settingsError || !file) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setGenerating(true);
    setGenError(null);
    try {
      const res = await studentPracticeService.generateFromMaterial(file, typeCounts, ctrl.signal);
      setDraft(d => ({ ...res, title: d.title.trim() ? d.title : res.title }));
      setMinutes(String(Math.min(PRACTICE_MAX_MINUTES, Math.max(5, Math.ceil(res.questions.length * 1.5)))));
      setShowErrors(false);
    } catch (err) {
      if (!ctrl.signal.aborted) setGenError(getApiErrorMessage(err, 'Failed to generate questions. Please try again.'));
    } finally {
      if (abortRef.current === ctrl) setGenerating(false);
    }
  };

  /* ── editing ─────────────────────────────────────────────────────────── */
  const updateQuestion = (key: string, next: DraftQuestion) =>
    setDraft(d => prune({ ...d, questions: d.questions.map(q => (q.key === key ? next : q)) }));
  const removeQuestion = (key: string) => setDraft(d => prune({ ...d, questions: d.questions.filter(q => q.key !== key) }));
  const renameGroup = (key: string, title: string) =>
    setDraft(d => ({ ...d, groups: d.groups.map(g => (g.key === key ? { ...g, title } : g)) }));
  const setGroup = (q: DraftQuestion, value: string) => {
    if (value !== NEW_GROUP) return updateQuestion(q.key, { ...q, groupKey: value || null });
    const group: DraftGroup = { key: newKey('g'), title: `Group ${draft.groups.length + 1}` };
    setDraft(d => prune({ ...d, groups: [...d.groups, group], questions: d.questions.map(x => (x.key === q.key ? { ...x, groupKey: group.key } : x)) }));
  };
  const addQuestion = () => setDraft(d => ({ ...d, questions: [...d.questions, convertDraft(emptyQuestion(), 'MULTIPLE_CHOICE')] }));

  const errorsByKey = useMemo(() => new Map(draft.questions.map(q => [q.key, validateDraft(q)])), [draft.questions]);
  const invalidCount = [...errorsByKey.values()].filter(e => e.length > 0).length;
  const minutesNum = Number(minutes);
  const minutesError =
    !Number.isInteger(minutesNum) || minutesNum < 1 || minutesNum > PRACTICE_MAX_MINUTES ? `Enter 1 – ${PRACTICE_MAX_MINUTES} minutes.` : undefined;

  const start = () => {
    setShowErrors(true);
    if (invalidCount > 0 || minutesError || draft.questions.length === 0) {
      document.querySelector<HTMLElement>('[data-draft-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const quiz = studentPracticeService.createFromDrafts(draft, minutesNum, file?.name ?? null);
    onClose();
    navigate(studentPracticePath(quiz.quizId));
  };

  /** Question list as blocks: a group box (all its questions together) or a single question. */
  const blocks = useMemo(() => {
    const out: ({ kind: 'single'; q: DraftQuestion } | { kind: 'group'; group: DraftGroup; questions: DraftQuestion[] })[] = [];
    const seen = new Set<string>();
    for (const q of draft.questions) {
      const group = q.groupKey ? draft.groups.find(g => g.key === q.groupKey) : undefined;
      if (!group) out.push({ kind: 'single', q });
      else if (!seen.has(group.key)) {
        seen.add(group.key);
        out.push({ kind: 'group', group, questions: draft.questions.filter(x => x.groupKey === group.key) });
      }
    }
    return out;
  }, [draft]);
  const numberOf = useMemo(() => {
    const m = new Map<string, number>();
    let n = 0;
    for (const b of blocks) for (const q of b.kind === 'single' ? [b.q] : b.questions) m.set(q.key, ++n);
    return m;
  }, [blocks]);

  const groupOptions = [
    { value: SINGLE, label: 'Single' },
    ...draft.groups.map(g => ({ value: g.key, label: g.title.trim() || 'Untitled group' })),
    { value: NEW_GROUP, label: '+ New group' },
  ];

  const renderQuestion = (q: DraftQuestion) => (
    <QuestionEditor
      key={q.key}
      number={numberOf.get(q.key) ?? 0}
      question={q}
      groupOptions={groupOptions}
      errors={showErrors ? (errorsByKey.get(q.key) ?? []) : []}
      onChange={next => updateQuestion(q.key, next)}
      onGroup={v => setGroup(q, v)}
      onRemove={() => removeQuestion(q.key)}
    />
  );

  const hasQuestions = draft.questions.length > 0;

  return (
    <Modal open={open} onClose={onClose} title="Material to Quiz Creator" size="screen">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] lg:h-full">
        {/* ── Generated questions ───────────────────────────────────────── */}
        <section aria-label="Generated questions" className="min-w-0 space-y-4 order-2 lg:order-1 lg:overflow-y-auto lg:pr-2">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-base font-semibold text-content">Generate Questions</h2>
            {hasQuestions && (
              <span className="text-xs text-content-subtle">
                {draft.questions.length} question{draft.questions.length === 1 ? '' : 's'}
              </span>
            )}
          </div>

          <Input
            aria-label="Exam name"
            placeholder="Exam name — filled in from the material when you generate"
            value={draft.title}
            onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
            className="sm:max-w-md"
          />

          {generating ? (
            <div className="card flex flex-col items-center justify-center gap-3 py-16 text-center">
              <Spinner />
              <p className="text-sm text-content-soft">Reading {file?.name} and drafting {total} questions…</p>
            </div>
          ) : !hasQuestions ? (
            <div className="rounded-[14px] border-2 border-dashed border-line flex flex-col items-center justify-center gap-2 py-16 px-6 text-center">
              <Icon.Brain className="w-9 h-9 text-content-subtle" />
              <p className="text-sm font-medium text-content-secondary">No questions yet</p>
              <p className="text-xs text-content-subtle max-w-sm">
                Upload a learning material, choose the question types and counts, then press Generate. You can edit every question
                before starting the quiz.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {blocks.map(b =>
                b.kind === 'single' ? (
                  renderQuestion(b.q)
                ) : (
                  <div key={b.group.key} className="rounded-[14px] border-2 border-line p-[clamp(0.75rem,1.5vw,1rem)] space-y-4">
                    <input
                      aria-label="Group title"
                      value={b.group.title}
                      onChange={e => renameGroup(b.group.key, e.target.value)}
                      placeholder="Group title"
                      className="w-full bg-transparent text-base font-bold text-content border-b border-transparent hover:border-line focus:border-brand-600 focus:outline-none py-1"
                    />
                    {b.questions.map(renderQuestion)}
                  </div>
                ),
              )}
              <Button variant="outline" icon={<Icon.Plus className="w-4 h-4" />} onClick={addQuestion}>
                Add question
              </Button>
            </div>
          )}
        </section>

        {/* ── Exam information ──────────────────────────────────────────── */}
        <aside className="card p-[clamp(1rem,1.8vw,1.25rem)] space-y-5 self-start lg:max-h-full lg:overflow-y-auto order-1 lg:order-2">
          <h2 className="text-base font-semibold text-content">Exam Information</h2>

          <Alert type="info" message="Demo mode: questions are sample data until the backend supports students." />

          <div className="space-y-1.5">
            <p className="text-sm font-medium text-content-secondary">Upload File</p>
            <div
              onDragOver={e => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => {
                e.preventDefault();
                setDragOver(false);
                pickFile(e.dataTransfer.files?.[0]);
              }}
              className={`rounded-[12px] border-2 border-dashed px-4 py-5 text-center transition-colors ${
                dragOver ? 'border-brand-600 bg-primary-light' : touched && !file ? 'border-danger-solid' : 'border-line'
              }`}
            >
              {file ? (
                <div className="flex items-center gap-3 text-left">
                  <Icon.FileText className="w-8 h-8 text-primary flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-content truncate" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-xs text-content-subtle">{formatSize(file.size)}</p>
                  </div>
                  <button
                    type="button"
                    aria-label="Remove file"
                    onClick={() => setFile(null)}
                    className="p-1.5 rounded-[6px] text-content-subtle hover:bg-accent hover:text-content"
                  >
                    <Icon.X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <Icon.Upload className="w-6 h-6 mx-auto text-content-subtle" />
                  <p className="mt-2 text-sm text-content-secondary">Drag &amp; Drop PDF, DOCX, PPTX</p>
                  <p className="text-xs text-content-subtle">Up to {formatSize(MATERIAL_MAX_BYTES)}</p>
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => fileInput.current?.click()}>
                    Browse File
                  </Button>
                </>
              )}
              <input
                ref={fileInput}
                type="file"
                accept={MATERIAL_ACCEPT}
                className="hidden"
                onChange={e => {
                  pickFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>
            {fileError && <p className="text-xs text-danger">{fileError}</p>}
          </div>

          <TypeCountSelect
            label="Question Type"
            placeholder="Choose question types…"
            options={DRAFT_TYPES.map(t => ({ value: t, label: DRAFT_TYPE_LABEL[t] }))}
            value={counts}
            onChange={setCounts}
            min={1}
            max={PRACTICE_MAX_QUESTIONS}
            error={touched ? (typesError ?? undefined) : undefined}
            disabled={generating}
          />

          <Input label="Number of question" value={String(total)} readOnly tabIndex={-1} className="[&_input]:bg-surface-alt" />

          {touched && !file && <p className="text-xs text-danger">Upload a learning material first.</p>}
          {genError && <p className="text-xs text-danger" role="alert">{genError}</p>}
          {hasQuestions && !generating && (
            <p className="text-xs text-content-subtle">Generating again replaces the current questions.</p>
          )}

          <div className="flex gap-2">
            <Button className="flex-1" loading={generating} disabled={generating} icon={<Icon.Zap className="w-4 h-4" />} onClick={generate}>
              {hasQuestions ? 'Regenerate' : 'Generate'}
            </Button>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>

          {hasQuestions && !generating && (
            <div className="pt-4 border-t border-line-soft space-y-3">
              <Input
                label="Time Limit (minutes)"
                type="number"
                inputMode="numeric"
                min={1}
                max={PRACTICE_MAX_MINUTES}
                value={minutes}
                onChange={e => setMinutes(e.target.value)}
                error={showErrors ? minutesError : undefined}
              />
              {showErrors && invalidCount > 0 && (
                <p className="text-xs text-danger">
                  {invalidCount} question{invalidCount === 1 ? ' needs' : 's need'} fixing before you can start.
                </p>
              )}
              <Button className="w-full" icon={<Icon.ChevronRight className="w-4 h-4" />} onClick={start}>
                Start Quiz ({draft.questions.length})
              </Button>
            </div>
          )}
        </aside>
      </div>
    </Modal>
  );
}

function emptyQuestion(): DraftQuestion {
  return {
    key: newKey('q'),
    type: 'MULTIPLE_CHOICE',
    content: '',
    options: [],
    trueFalse: true,
    blanks: {},
    pairs: [],
    items: [],
    groupKey: null,
  };
}

/* ── one question card ─────────────────────────────────────────────────── */

interface EditorProps {
  number: number;
  question: DraftQuestion;
  groupOptions: { value: string; label: string }[];
  errors: string[];
  onChange: (next: DraftQuestion) => void;
  onGroup: (value: string) => void;
  onRemove: () => void;
}

function QuestionEditor({ number, question: q, groupOptions, errors, onChange, onGroup, onRemove }: EditorProps) {
  // Last caret in the question text; null (never focused) = insert at the end.
  const caretRef = useRef<{ start: number; end: number } | null>(null);
  const invalid = errors.length > 0;

  const insertBlank = () => {
    const next = String(Math.max(0, ...blankIndices(q.content).map(Number)) + 1);
    const { start, end } = caretRef.current ?? { start: q.content.length, end: q.content.length };
    onChange({ ...q, content: `${q.content.slice(0, start)}{{${next}}}${q.content.slice(end)}` });
    caretRef.current = null;
  };

  return (
    <article
      data-draft-invalid={invalid}
      aria-label={`Question ${number}`}
      className={`card p-[clamp(0.75rem,1.5vw,1rem)] space-y-3 ${invalid ? '!border-danger-solid' : ''}`}
    >
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold text-content mr-1">Question {number}</h3>
        <Select
          aria-label="Question type"
          triggerClassName={PILL}
          className="w-40"
          options={DRAFT_TYPES.map(t => ({ value: t, label: DRAFT_TYPE_LABEL[t] }))}
          value={q.type}
          onChange={t => onChange(convertDraft(q, t as DraftQuestionType))}
        />
        <Select
          aria-label="Group"
          triggerClassName={PILL}
          className="w-40"
          options={groupOptions}
          value={q.groupKey ?? SINGLE}
          onChange={onGroup}
        />
        <Button size="sm" variant="ghost" className="ml-auto text-danger" icon={<Icon.Trash className="w-3.5 h-3.5" />} onClick={onRemove}>
          Remove
        </Button>
      </header>

      <textarea
        aria-label="Question text"
        value={q.content}
        onChange={e => onChange({ ...q, content: e.target.value })}
        onSelect={e => (caretRef.current = { start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd })}
        placeholder="Question text"
        rows={3}
        className={`${FIELD} py-2 resize-y leading-relaxed`}
      />

      {q.type === 'MULTIPLE_CHOICE' && <ChoiceEditor q={q} onChange={onChange} />}
      {q.type === 'TRUE_FALSE' && <TrueFalseEditor q={q} onChange={onChange} />}
      {q.type === 'FILL_BLANK' && <FillBlankEditor q={q} onChange={onChange} onInsertBlank={insertBlank} />}
      {q.type === 'MATCHING' && <MatchingEditor q={q} onChange={onChange} />}
      {q.type === 'ORDERING' && <OrderingEditor q={q} onChange={onChange} />}

      {invalid && (
        <ul className="text-xs text-danger space-y-0.5" role="alert">
          {errors.map(e => (
            <li key={e}>• {e}</li>
          ))}
        </ul>
      )}
    </article>
  );
}

type PartProps = { q: DraftQuestion; onChange: (next: DraftQuestion) => void };

function RemoveButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="p-1.5 rounded-[6px] text-content-subtle hover:bg-accent hover:text-danger disabled:opacity-30 disabled:hover:bg-transparent flex-shrink-0"
    >
      <Icon.X className="w-4 h-4" />
    </button>
  );
}

function AddLink({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-xs font-medium text-brand-ink hover:underline">
      <Icon.Plus className="w-3.5 h-3.5" /> {children}
    </button>
  );
}

function ChoiceEditor({ q, onChange }: PartProps) {
  const set = (key: string, patch: Partial<DraftQuestion['options'][number]>) =>
    onChange({ ...q, options: q.options.map(o => (o.key === key ? { ...o, ...patch } : o)) });
  return (
    <div className="space-y-2">
      <p className="text-xs text-content-subtle">Click a letter to mark it correct — several correct options make it a multi-select question.</p>
      {q.options.map((o, i) => (
        <div key={o.key} className="flex items-center gap-2">
          <button
            type="button"
            aria-pressed={o.correct}
            aria-label={`Option ${optionLetter(i)} is ${o.correct ? 'correct' : 'not correct'}`}
            onClick={() => set(o.key, { correct: !o.correct })}
            className={`w-9 h-9 rounded-[8px] border-2 text-sm font-bold flex items-center justify-center flex-shrink-0 transition-colors ${
              o.correct ? 'border-success-solid bg-success-light text-success' : 'border-line text-content-secondary hover:border-brand-600'
            }`}
          >
            {o.correct ? <Icon.Check className="w-4 h-4" /> : optionLetter(i)}
          </button>
          <input
            aria-label={`Option ${optionLetter(i)} text`}
            value={o.text}
            onChange={e => set(o.key, { text: e.target.value })}
            placeholder={`Option ${optionLetter(i)} text`}
            className={`${FIELD} h-9`}
          />
          <RemoveButton
            label={`Remove option ${optionLetter(i)}`}
            disabled={q.options.length <= 2}
            onClick={() => onChange({ ...q, options: q.options.filter(x => x.key !== o.key) })}
          />
        </div>
      ))}
      <AddLink onClick={() => onChange({ ...q, options: [...q.options, { key: newKey('o'), text: '', correct: false }] })}>Add option</AddLink>
    </div>
  );
}

function TrueFalseEditor({ q, onChange }: PartProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-content-subtle">Choose the correct answer.</p>
      <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Correct answer">
        {[true, false].map(v => (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={q.trueFalse === v}
            onClick={() => onChange({ ...q, trueFalse: v })}
            className={`h-10 rounded-[10px] border-2 text-sm font-bold transition-colors ${
              q.trueFalse === v ? 'border-success-solid bg-success-light text-success' : 'border-line text-content-secondary hover:border-brand-600'
            }`}
          >
            {v ? 'TRUE' : 'FALSE'}
          </button>
        ))}
      </div>
    </div>
  );
}

function FillBlankEditor({ q, onChange, onInsertBlank }: PartProps & { onInsertBlank: () => void }) {
  const ids = blankIndices(q.content);
  const parts = q.content.split(/(\{\{\d+\}\})/g);
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-content-subtle">
          Write <code className="font-mono">{'{{1}}'}</code>, <code className="font-mono">{'{{2}}'}</code>… where a blank goes.
        </p>
        <Button size="sm" variant="outline" icon={<Icon.Plus className="w-3.5 h-3.5" />} onClick={onInsertBlank}>
          Insert blank
        </Button>
      </div>
      {ids.map(n => (
        <label key={n} className="flex items-center gap-2">
          <span className="w-10 text-sm font-semibold text-content-secondary">({n})</span>
          <input
            value={q.blanks[n] ?? ''}
            onChange={e => onChange({ ...q, blanks: { ...q.blanks, [n]: e.target.value } })}
            placeholder={`Answer for blank ${n}`}
            className={`${FIELD} h-9`}
          />
        </label>
      ))}
      {ids.length > 0 && (
        <p className="rounded-[10px] bg-surface-alt px-3 py-2 text-sm text-content-secondary break-words">
          <span className="text-2xs uppercase tracking-wide text-content-subtle mr-2">Preview</span>
          {parts.map((p, i) => {
            const m = /^\{\{(\d+)\}\}$/.exec(p);
            return m ? (
              <strong key={i} className="text-content underline decoration-dotted underline-offset-4">
                {q.blanks[m[1]]?.trim() || '______'}
              </strong>
            ) : (
              <React.Fragment key={i}>{p}</React.Fragment>
            );
          })}
        </p>
      )}
    </div>
  );
}

function MatchingEditor({ q, onChange }: PartProps) {
  const set = (key: string, patch: Partial<DraftQuestion['pairs'][number]>) =>
    onChange({ ...q, pairs: q.pairs.map(p => (p.key === key ? { ...p, ...patch } : p)) });
  return (
    <div className="space-y-2">
      {q.pairs.map((p, i) => (
        <div key={p.key} className="flex items-center gap-2">
          <input
            aria-label={`Item ${i + 1} left`}
            value={p.left}
            onChange={e => set(p.key, { left: e.target.value })}
            placeholder={`Item ${i + 1} left`}
            className={`${FIELD} h-9 text-center`}
          />
          <span className="text-content-subtle text-sm flex-shrink-0" aria-hidden="true">
            =&gt;
          </span>
          <input
            aria-label={`Item ${i + 1} right`}
            value={p.right}
            onChange={e => set(p.key, { right: e.target.value })}
            placeholder={`Item ${i + 1} right`}
            className={`${FIELD} h-9 text-center`}
          />
          <RemoveButton
            label={`Remove pair ${i + 1}`}
            disabled={q.pairs.length <= 2}
            onClick={() => onChange({ ...q, pairs: q.pairs.filter(x => x.key !== p.key) })}
          />
        </div>
      ))}
      <AddLink onClick={() => onChange({ ...q, pairs: [...q.pairs, { key: newKey('p'), left: '', right: '' }] })}>Add pair</AddLink>
    </div>
  );
}

function OrderingEditor({ q, onChange }: PartProps) {
  const move = (from: number, to: number) => {
    if (to < 0 || to >= q.items.length) return;
    const items = [...q.items];
    [items[from], items[to]] = [items[to], items[from]];
    onChange({ ...q, items });
  };
  return (
    <div className="space-y-2">
      <p className="text-xs text-content-subtle">Enter the items in the correct order — they are shuffled in the quiz.</p>
      {q.items.map((item, i) => (
        <div key={item.key} className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-surface-muted text-xs font-semibold text-content-secondary flex items-center justify-center flex-shrink-0">
            {i + 1}
          </span>
          <input
            aria-label={`Ordering item ${i + 1}`}
            value={item.text}
            onChange={e => onChange({ ...q, items: q.items.map(x => (x.key === item.key ? { ...x, text: e.target.value } : x)) })}
            placeholder={`Ordering item ${i + 1}`}
            className={`${FIELD} h-9`}
          />
          <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, i - 1)} className="p-1.5 rounded-[6px] hover:bg-accent disabled:opacity-30">
            <Icon.ArrowUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label="Move down"
            disabled={i === q.items.length - 1}
            onClick={() => move(i, i + 1)}
            className="p-1.5 rounded-[6px] hover:bg-accent disabled:opacity-30"
          >
            <Icon.ArrowDown className="w-4 h-4" />
          </button>
          <RemoveButton
            label={`Remove item ${i + 1}`}
            disabled={q.items.length <= 2}
            onClick={() => onChange({ ...q, items: q.items.filter(x => x.key !== item.key) })}
          />
        </div>
      ))}
      <AddLink onClick={() => onChange({ ...q, items: [...q.items, { key: newKey('i'), text: '' }] })}>Add item</AddLink>
    </div>
  );
}
