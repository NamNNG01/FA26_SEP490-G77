import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { Spinner } from '@/components/ui/Spinner';
import { Icon } from '@/assets/icons';
import { AI_CONTEXT_MAX, AI_MATERIAL_EXTENSIONS, IMPORT_MAX_BYTES, questionService, type QuestionAiGenerateRequest, type QuestionAiPreview, type QuestionDifficulty, type QuestionType } from '@/services/question.service';
import {
  AI_QUESTION_TYPE_OPTIONS,
  DIFFICULTY_OPTIONS,
  QUESTION_TYPE_OPTIONS,
  RUBRIC_TYPES,
  blankIndexes,
  fromAiDraft,
  newKey,
  optionLabel,
  validateDraft,
  type QuestionDraft,
} from '../model';
import { checkPlantUml, plantUmlSvgUrl } from '../diagram';
import { QuestionForm } from './QuestionForm';

const MIN_COUNT = 1;
const MAX_COUNT = 10;
/** The backend drafts at most 50 questions per AI call, and one Save All takes at most 50. */
const MAX_TOTAL = 50;

type Language = NonNullable<QuestionAiGenerateRequest['language']>;

const LANGUAGE_OPTIONS: { label: string; value: Language }[] = [
  { label: 'English', value: 'English' },
  { label: 'Vietnamese', value: 'Vietnamese' },
];

const typeLabel = (t: string) => QUESTION_TYPE_OPTIONS.find(o => o.value === t)?.label ?? t;
const difficultyLabel = (d: string) => DIFFICULTY_OPTIONS.find(o => o.value === d)?.label ?? d;

/** AI generation errors → what the manager can do about them. */
function aiErrorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string; response?: { status?: number; data?: { message?: string } } };
  if (e?.code === 'ECONNABORTED') return 'The AI took too long to respond. Try fewer questions or try again.';
  switch (e?.response?.status) {
    // Bad settings, or the AI's answer was unusable (e.g. "AI returned an incorrect question distribution").
    case 400: return e.response.data?.message || 'The AI could not draft these questions. Try again.';
    case 403: return 'You are not a manager of this course, so you cannot generate questions for it.';
    case 404: return e.response.data?.message || 'The course was not found.';
    case 429: return 'You have reached today’s AI generation limit. Try again tomorrow or write the questions manually.';
    case 502: return e.response.data?.message || 'The AI service returned an error. Please try again in a moment.';
    case 503: return 'The AI service is busy right now. Please try again in a moment.';
    case 504: return 'The AI took too long to respond. Try fewer questions or try again.';
  }
  return e?.message || 'Could not generate questions. Please try again.';
}

/** `n` split as evenly as possible over `keys` (5 over Easy + Hard → 3 Easy, 2 Hard). */
function spread<K extends string>(keys: K[], n: number): Partial<Record<K, number>> {
  return Object.fromEntries(keys.map((k, i) => [k, Math.floor(n / keys.length) + (i < n % keys.length ? 1 : 0)])) as Partial<Record<K, number>>;
}

interface Preview {
  /** Stable across regenerations (the draft's key changes). */
  id: string;
  draft: QuestionDraft;
  /** The request that produced it, narrowed to one question of its type — reused by "Regenerate". */
  request: QuestionAiGenerateRequest;
  /** The file it was drafted from (AI-02) — "Regenerate" sends it again. */
  material: File | null;
  /** The backend found an active question with the same content in the course. */
  duplicate: boolean;
  accepted: boolean;
  editing: boolean;
  edited: boolean;
  regenerating: boolean;
  regenerateError?: string;
}

const toPreview = (p: QuestionAiPreview, request: QuestionAiGenerateRequest, material: File | null): Preview => ({
  id: newKey('ai'),
  material,
  draft: fromAiDraft(p.question),
  request: { ...request, questionTypeCounts: { [p.question.questionType]: 1 }, difficultyCounts: { [p.question.difficulty ?? 'MEDIUM']: 1 } },
  duplicate: p.hasHashConflict,
  accepted: false,
  editing: false,
  edited: false,
  regenerating: false,
});

/** Why a material file can't be sent, or null. Any layout works — the AI reads the text. */
function materialProblem(f: File): string | null {
  const name = f.name.toLowerCase();
  if (!AI_MATERIAL_EXTENSIONS.some(ext => name.endsWith(ext))) return 'Only PDF, Word (.docx) and text (.txt) files can be used.';
  if (f.size === 0) return 'This file is empty.';
  if (f.size > IMPORT_MAX_BYTES) return `This file is ${(f.size / 1024 / 1024).toFixed(2)} MB — the limit is 10 MB.`;
  return null;
}

/**
 * "AI Generate" tab: drafts questions with AI-01 from a topic — or with AI-02
 * from a file dropped on the card — for the manager to review. Nothing is
 * saved here — Accept hands a question to the editor, and it is saved with
 * the rest through Save All.
 */
export function AiGeneratePanel({ courseId, moduleId, onAccept, onPendingChange, disabled }: {
  courseId: string;
  moduleId: string;
  /** Returns how many of the drafts the editor took. */
  onAccept: (drafts: QuestionDraft[]) => number;
  /** Suggestions not accepted yet — they're lost if the page is left. */
  onPendingChange?: (count: number) => void;
  disabled?: boolean;
}) {
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>(['SINGLE_CHOICE']);
  const [topic, setTopic] = useState('');
  /** File the AI drafts from instead of the topic alone (AI-02). */
  const [material, setMaterial] = useState<File | null>(null);
  const [materialError, setMaterialError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const materialInputRef = useRef<HTMLInputElement>(null);
  const [count, setCount] = useState('5');
  const [difficulties, setDifficulties] = useState<QuestionDifficulty[]>(['MEDIUM']);
  const [language, setLanguage] = useState<Language>('English');
  const [showErrors, setShowErrors] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  /** The previews came from demo data, not the AI. */
  const [isDemo, setIsDemo] = useState(false);
  const [previews, setPreviews] = useState<Preview[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** In-flight single-question regenerations, by preview id. */
  const regenRef = useRef(new Map<string, AbortController>());

  const abortRegenerations = () => {
    regenRef.current.forEach(c => c.abort());
    regenRef.current.clear();
  };

  useEffect(() => () => { abortRef.current?.abort(); abortRegenerations(); }, []);

  const countNum = Number(count);
  const countValid = Number.isInteger(countNum) && countNum >= MIN_COUNT && countNum <= MAX_COUNT;
  const total = countValid ? countNum * questionTypes.length : 0;

  const topicError = showErrors && !material && !topic.trim() ? 'Enter a topic for the questions.' : undefined;
  const countError = showErrors && !countValid ? `Enter a number from ${MIN_COUNT} to ${MAX_COUNT}.` : undefined;
  const typesError = showErrors && !questionTypes.length ? 'Pick at least one question type.' : undefined;
  const difficultiesError = showErrors && !difficulties.length ? 'Pick at least one difficulty.' : undefined;
  const totalError = total > MAX_TOTAL ? `At most ${MAX_TOTAL} questions per run — lower the number or pick fewer types.` : undefined;

  const pickMaterial = (f?: File | null) => {
    if (!f || generating) return;
    const problem = materialProblem(f);
    setMaterialError(problem);
    if (!problem) setMaterial(f);
  };

  const generate = async () => {
    setShowErrors(true);
    if (!courseId || (!material && !topic.trim()) || !total || !difficulties.length || totalError) return;
    const source = material;

    abortRef.current?.abort();
    abortRegenerations();
    const controller = new AbortController();
    abortRef.current = controller;
    setGenerating(true);
    setError(null);
    setWarnings([]);
    try {
      // AI-01 / AI-02 draft every type and difficulty in one call.
      const request: QuestionAiGenerateRequest = {
        courseId: Number(courseId),
        ...(moduleId ? { moduleId: Number(moduleId) } : {}),
        questionTypeCounts: Object.fromEntries(questionTypes.map(type => [type, countNum])),
        difficultyCounts: spread(difficulties, total),
        topic: topic.trim(),
        language,
      };
      const res = source
        ? await questionService.generateAiQuestionsFromMaterial(source, request, controller.signal)
        : await questionService.generateAiQuestions(request, controller.signal);
      if (controller.signal.aborted) return;
      setPreviews(res.questions.map(q => toPreview(q, request, source)));
      setIsDemo(Boolean(res.mock));
      setWarnings(res.warnings);
    } catch (err) {
      if (!controller.signal.aborted) setError(aiErrorMessage(err));
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setGenerating(false);
      }
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setGenerating(false);
  };

  const accept = (indexes: number[]) => {
    if (!previews) return;
    const picked = indexes.filter(i => !previews[i].accepted);
    if (!picked.length) return;
    const taken = picked.slice(0, onAccept(picked.map(i => previews[i].draft)));
    setPreviews(prev => prev && prev.map((p, i) => (taken.includes(i) ? { ...p, accepted: true, editing: false } : p)));
  };

  const patchPreview = (id: string, patch: Partial<Preview>) =>
    setPreviews(prev => prev && prev.map(p => (p.id === id ? { ...p, ...patch } : p)));

  /** Ask the AI for one fresh question with the same settings, replacing this one. */
  const regenerate = async (p: Preview) => {
    regenRef.current.get(p.id)?.abort();
    const controller = new AbortController();
    regenRef.current.set(p.id, controller);
    patchPreview(p.id, { regenerating: true, regenerateError: undefined });
    try {
      const res = p.material
        ? await questionService.generateAiQuestionsFromMaterial(p.material, p.request, controller.signal)
        : await questionService.generateAiQuestions(p.request, controller.signal);
      if (controller.signal.aborted) return;
      const next = res.questions[0];
      if (next) patchPreview(p.id, { draft: fromAiDraft(next.question), duplicate: next.hasHashConflict, editing: false, edited: false, regenerating: false });
      else patchPreview(p.id, { regenerating: false, regenerateError: 'The AI returned no usable question. Try again.' });
    } catch (err) {
      if (!controller.signal.aborted) patchPreview(p.id, { regenerating: false, regenerateError: aiErrorMessage(err) });
    } finally {
      if (regenRef.current.get(p.id) === controller) regenRef.current.delete(p.id);
    }
  };

  const pending = useMemo(() => (previews ?? []).map((p, i) => (p.accepted ? -1 : i)).filter(i => i >= 0), [previews]);

  useEffect(() => { onPendingChange?.(pending.length); }, [pending.length, onPendingChange]);

  return (
    <div className="space-y-3">
      <section className="card px-4 py-3.5 space-y-3" aria-labelledby="ai-gen-title">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-[8px] bg-brand-600/10 flex items-center justify-center"><Icon.Zap className="w-4 h-4 text-brand-ink" /></span>
          <div>
            <h3 id="ai-gen-title" className="text-lg font-semibold text-content">Generate with AI</h3>
            <p className="text-xs text-content-soft">Review each suggestion and accept the ones you want. Nothing is saved until you click Save All.</p>
          </div>
        </div>

        {material ? (
          <div className="flex items-center gap-3 p-3 bg-surface-alt rounded-[10px]">
            <Icon.FileText className="w-5 h-5 text-brand-ink flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-content-secondary truncate">{material.name}</p>
              <p className="text-2xs text-content-subtle">The AI drafts the questions from this file.</p>
            </div>
            <button
              type="button"
              onClick={() => setMaterial(null)}
              disabled={generating}
              aria-label="Remove file"
              title="Generate from the topic only"
              className="text-content-subtle hover:text-danger p-1"
            >
              <Icon.X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            aria-label="Add a file for the AI to draft questions from"
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); pickMaterial(e.dataTransfer.files?.[0]); }}
            onClick={() => { if (!generating) materialInputRef.current?.click(); }}
            onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !generating) { e.preventDefault(); materialInputRef.current?.click(); } }}
            className={`rounded-[10px] px-4 py-5 text-center border-2 border-dashed transition-colors cursor-pointer bg-primary-light ${dragOver ? 'border-brand-600' : 'border-brand-line'}`}
          >
            <Icon.Upload className="w-7 h-7 text-brand-ink mx-auto mb-2" />
            <p className="text-sm font-semibold text-brand-ink-strong">Drop a file here or click to browse (optional)</p>
            <p className="text-xs text-content-soft mt-0.5">PDF, Word (.docx) or text (.txt), up to 10 MB, any layout — the AI writes questions from its content.</p>
          </div>
        )}
        <input
          ref={materialInputRef}
          type="file"
          accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          className="hidden"
          onChange={e => { pickMaterial(e.target.files?.[0]); e.target.value = ''; }}
        />
        {materialError && <p className="text-xs text-danger -mt-1">{materialError}</p>}

        <Input
          label={material ? 'Instructions for the AI (optional)' : 'Topic *'}
          value={topic}
          onChange={e => setTopic(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !generating) generate(); }}
          placeholder={material ? 'e.g. Only chapter 3, keep the questions in the file as they are' : 'e.g. OOP inheritance'}
          error={topicError}
          maxLength={AI_CONTEXT_MAX}
          disabled={generating}
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MultiSelect label="Question types" value={questionTypes} onChange={setQuestionTypes} options={AI_QUESTION_TYPE_OPTIONS} placeholder="Pick types" error={typesError} disabled={generating} />
          <Input
            label={`Questions per type (${MIN_COUNT}–${MAX_COUNT})`}
            type="number"
            min={MIN_COUNT}
            max={MAX_COUNT}
            value={count}
            onChange={e => setCount(e.target.value)}
            error={countError}
            disabled={generating}
          />
          <MultiSelect label="Difficulties" value={difficulties} onChange={setDifficulties} options={DIFFICULTY_OPTIONS} placeholder="Pick difficulties" error={difficultiesError} disabled={generating} />
          <Select label="Language" value={language} onChange={v => setLanguage(v as Language)} options={LANGUAGE_OPTIONS} disabled={generating} />
        </div>

        {total > 0 && difficulties.length > 0 && (
          <p className={`text-xs ${totalError ? 'text-danger' : 'text-content-soft'}`}>
            {totalError ?? (
              <>
                Will generate <span className="font-medium text-content-secondary">{total} question{total === 1 ? '' : 's'}</span>
                {difficulties.length > 1 && (
                  <> — {Object.entries(spread(difficulties, total)).filter(([, n]) => n).map(([d, n]) => `${n} ${difficultyLabel(d)}`).join(', ')}</>
                )}.
              </>
            )}
          </p>
        )}

        {!courseId && (
          <p className={`flex items-start gap-1.5 text-xs ${showErrors ? 'text-danger' : 'text-content-soft'}`}>
            <Icon.Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            Pick a course on the right first — the AI drafts questions for that course (and module, if picked).
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button icon={<Icon.Zap className="w-4 h-4" />} onClick={generate} loading={generating} disabled={generating || disabled || !courseId}>
            {previews ? 'Generate again' : 'Generate'}
          </Button>
          {generating && <Button variant="ghost" onClick={stop}>Stop</Button>}
        </div>
      </section>

      {error && <Alert type="error" title="Could not generate questions" message={error} />}
      {isDemo && previews && !error && (
        <Alert type="info" title="Demo data" message="AI demo mode is on (VITE_AI_MOCK), so these are sample questions. They can be accepted and edited like real suggestions." />
      )}
      {warnings.length > 0 && (
        <Alert
          type="warning"
          title="Some drafts were skipped"
          message={warnings.join(' · ')}
        />
      )}

      {generating && !previews && (
        <div className="card p-10 flex items-center justify-center gap-3 text-content-soft">
          <Spinner size="sm" /> {material ? `Generating questions from ${material.name}…` : 'Generating questions…'} this can take up to a minute.
        </div>
      )}

      {previews && previews.length === 0 && !generating && (
        <div className="card p-10 text-center">
          <p className="text-base font-medium text-content-secondary">No usable questions came back</p>
          <p className="text-sm text-content-subtle mt-1">Try a more specific topic or generate again.</p>
        </div>
      )}

      {previews && previews.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-content-soft">
              {previews.length} suggestion{previews.length === 1 ? '' : 's'} · {previews.length - pending.length} accepted
            </p>
            <Button variant="outline" size="sm" icon={<Icon.Check className="w-3.5 h-3.5" />} onClick={() => accept(pending)} disabled={!pending.length || disabled}>
              Accept all ({pending.length})
            </Button>
          </div>
          <div className={`space-y-3 ${generating ? 'opacity-50 pointer-events-none' : ''}`} aria-busy={generating}>
            {previews.map((p, i) => (
              <AiPreviewCard
                key={p.id}
                index={i}
                preview={p}
                onAccept={() => accept([i])}
                onEdit={editing => patchPreview(p.id, { editing })}
                onChange={draft => patchPreview(p.id, { draft, edited: true })}
                onRegenerate={() => regenerate(p)}
                disabled={disabled}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const iconBtn = 'p-1.5 rounded-[6px] text-content-subtle hover:bg-accent hover:text-content-secondary disabled:opacity-30 disabled:cursor-not-allowed';

function AiPreviewCard({ index, preview, onAccept, onEdit, onChange, onRegenerate, disabled }: {
  index: number;
  preview: Preview;
  onAccept: () => void;
  onEdit: (editing: boolean) => void;
  onChange: (draft: QuestionDraft) => void;
  onRegenerate: () => void;
  disabled?: boolean;
}) {
  const { draft: q, accepted, editing, edited, regenerating, regenerateError } = preview;
  const locked = accepted || regenerating || disabled;

  const regenerateBtn = (
    <button
      type="button"
      onClick={() => {
        if (edited && !window.confirm('Regenerating replaces your edits to this question. Continue?')) return;
        onRegenerate();
      }}
      disabled={locked}
      className={iconBtn}
      aria-label={`Regenerate suggestion ${index + 1}`}
      title="Regenerate this question"
    >
      <Icon.RefreshCw className={`w-4 h-4 ${regenerating ? 'animate-spin' : ''}`} />
    </button>
  );
  const acceptBtn = (
    <Button
      size="sm"
      variant={accepted ? 'ghost' : 'primary'}
      icon={accepted ? <Icon.CheckCircle className="w-3.5 h-3.5" /> : <Icon.Plus className="w-3.5 h-3.5" />}
      onClick={onAccept}
      disabled={locked}
    >
      {accepted ? 'Added' : 'Accept'}
    </Button>
  );

  if (editing && !accepted) {
    return (
      <div className="space-y-1.5">
        <QuestionForm
          q={q}
          index={index}
          heading={`Suggestion ${index + 1}`}
          onChange={onChange}
          showErrors
          actions={
            <>
              {regenerateBtn}
              <Button size="sm" variant="ghost" icon={<Icon.Check className="w-3.5 h-3.5" />} onClick={() => onEdit(false)} disabled={regenerating}>Done</Button>
              {acceptBtn}
            </>
          }
        />
        {regenerateError && <p className="text-xs text-danger px-1">{regenerateError}</p>}
      </div>
    );
  }

  return <AiPreviewView index={index} preview={preview} actions={
    <div className="flex items-center gap-1 flex-shrink-0">
      {!accepted && (
        <button type="button" onClick={() => onEdit(true)} disabled={locked} className={iconBtn} aria-label={`Edit suggestion ${index + 1}`} title="Edit before accepting">
          <Icon.Edit className="w-4 h-4" />
        </button>
      )}
      {!accepted && regenerateBtn}
      {acceptBtn}
    </div>
  } />;
}

/** Read-only view of one suggestion. */
function AiPreviewView({ index, preview, actions }: { index: number; preview: Preview; actions: React.ReactNode }) {
  const { draft: q, accepted, edited, duplicate, regenerating, regenerateError } = preview;
  const issues = validateDraft(q);
  const issue = issues.content ?? issues.answers;
  const plantUml = typeof q.metadata.plantUmlSource === 'string' ? q.metadata.plantUmlSource : '';
  /** Q-10 stand-in: does the PlantUML render? undefined = checking, null = unknown. */
  const [renders, setRenders] = useState<boolean | null | undefined>(undefined);

  useEffect(() => {
    if (q.type !== 'DIAGRAM' || !plantUml) return;
    setRenders(undefined);
    const controller = new AbortController();
    checkPlantUml(plantUml, controller.signal).then(ok => { if (!controller.signal.aborted) setRenders(ok); });
    return () => controller.abort();
  }, [q.type, plantUml]);

  return (
    <article className={`card px-4 py-3.5 space-y-2.5 relative ${accepted ? 'opacity-70' : ''}`} aria-label={`AI suggestion ${index + 1}`} aria-busy={regenerating}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="min-w-6 h-6 px-1 rounded-[6px] bg-brand-600/10 text-brand-ink flex items-center justify-center text-xs font-bold">#{index + 1}</span>
          <Badge>{typeLabel(q.type)}</Badge>
          <Badge variant="default">{difficultyLabel(q.difficulty)}</Badge>
          {edited && <Badge variant="purple"><Icon.Edit className="w-3 h-3" /> Edited</Badge>}
          {issue && !accepted && (
            <Badge variant="warning"><Icon.AlertCircle className="w-3.5 h-3.5" /> Needs edits</Badge>
          )}
          {duplicate && !edited && (
            <span title="A question with the same content is already in this course. Saving it unchanged will fail.">
              <Badge variant="warning"><Icon.Copy className="w-3.5 h-3.5" /> Already in bank</Badge>
            </span>
          )}
        </div>
        {actions}
      </div>

      {regenerating && (
        <div className="absolute inset-0 rounded-[inherit] bg-surface/70 flex items-center justify-center gap-2 text-sm text-content-soft z-10">
          <Spinner size="sm" /> Generating a new question…
        </div>
      )}
      {regenerateError && <p className="text-xs text-danger">{regenerateError}</p>}

      <p className="text-base text-content whitespace-pre-wrap">{q.content}</p>

      {(q.type === 'SINGLE_CHOICE' || q.type === 'MULTIPLE_CHOICE' || q.type === 'TRUE_FALSE') && (
        <ul className="space-y-1">
          {q.options.map((o, i) => (
            <li key={o.key} className={`flex items-center gap-2 text-sm rounded-[8px] px-2 py-1 ${o.isCorrect ? 'bg-success-light text-success font-medium' : 'text-content-secondary'}`}>
              <span className="w-5 text-xs font-bold">{optionLabel(i)}</span>
              <span className="flex-1">{o.text}</span>
              {o.isCorrect && <Icon.Check className="w-4 h-4" aria-label="Correct answer" />}
            </li>
          ))}
        </ul>
      )}

      {q.type === 'MATCHING' && (
        <ul className="space-y-1 text-sm text-content-secondary">
          {q.pairs.filter(p => p.left || p.right).map(p => (
            <li key={p.key} className="flex items-center gap-2"><span>{p.left}</span><Icon.ChevronRight className="w-3.5 h-3.5 text-content-subtle" /><span>{p.right}</span></li>
          ))}
        </ul>
      )}

      {q.type === 'FILL_BLANK' && (
        <ul className="space-y-1 text-sm text-content-secondary">
          {blankIndexes(q.content).map(n => (
            <li key={n}><code className="px-1 rounded bg-surface-muted">{`{{${n}}}`}</code> {q.blanks[n]?.accepted || <span className="text-content-subtle">no answer</span>}</li>
          ))}
        </ul>
      )}

      {q.type === 'DIAGRAM' && plantUml && (
        <div className="space-y-1.5">
          <div className="rounded-[10px] border border-line bg-white p-3 flex items-center justify-center min-h-[120px]">
            <img src={plantUmlSvgUrl(plantUml)} alt={`Diagram for suggestion ${index + 1}`} className="max-h-[240px] max-w-full object-contain" />
          </div>
          {renders === undefined && <p className="flex items-center gap-1.5 text-xs text-content-soft"><Spinner size="sm" /> Checking the diagram renders…</p>}
          {renders === false && (
            <p className="flex items-start gap-1.5 text-xs text-warning">
              <Icon.AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              This PlantUML has syntax errors. You can still accept it and redraw the diagram in draw.io.
            </p>
          )}
          {renders === null && <p className="text-xs text-content-subtle">Couldn’t reach the PlantUML server to check this diagram.</p>}
        </div>
      )}

      {RUBRIC_TYPES.includes(q.type) && (q.rubric.length > 0 || q.rubricNotes) && (
        <details className="text-sm text-content-secondary">
          <summary className="cursor-pointer select-none text-content-soft">Suggested grading rubric</summary>
          <ul className="mt-1.5 space-y-1">
            {q.rubric.map(c => (
              <li key={c.key} className="rounded-[8px] bg-surface-alt px-2 py-1">
                <span className="font-medium">{c.name || 'Unnamed criterion'}</span>
                <span className="text-content-soft"> · {c.maxScore || '?'} pts</span>
                {c.descriptors && <p className="text-xs text-content-soft">{c.descriptors}</p>}
              </li>
            ))}
          </ul>
          {q.rubricNotes && <p className="mt-1 text-xs text-content-soft">{q.rubricNotes}</p>}
        </details>
      )}

      {q.explanation && (
        <p className="text-sm text-content-soft"><span className="font-medium text-content-secondary">Explanation: </span>{q.explanation}</p>
      )}
      {issue && !accepted && <p className="text-xs text-warning">{issue} Click Edit to fix it.</p>}
    </article>
  );
}
