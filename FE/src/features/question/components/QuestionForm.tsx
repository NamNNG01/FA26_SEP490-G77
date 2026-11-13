import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/assets/icons";
import {
  DIFFICULTY_OPTIONS,
  QUESTION_TYPE_OPTIONS,
  RUBRIC_TYPES,
  blankIndexes,
  changeType,
  emptyCriterion,
  newKey,
  nextBlankIndex,
  optionLabel,
  rubricTotal,
  ESSAY_RUBRIC_REQUIRED,
  validateDraft,
  type EditableQuestionType,
  type QuestionDraft,
  type RubricCriterionDraft,
} from "../model";
import type { QuestionDifficulty } from "@/services/question.service";
import { DiagramAnswer } from "./DiagramAnswer";
import { CodeAnswer } from "./CodeAnswer";
import { InsertImageButton, QuestionImagePreview, splitQuestionImage, withQuestionImage } from "@/components/common/QuestionContent";

const MAX_OPTIONS = 10;

const inputCls = (invalid: boolean) =>
  `w-full h-10 px-3 rounded-[10px] border text-base text-content bg-surface focus:outline-none focus:ring-2 transition-all ${
    invalid
      ? "border-danger-solid focus:ring-danger-solid/20 focus:border-danger-solid"
      : "border-line focus:ring-brand-600/20 focus:border-brand-600"
  }`;

const iconBtn =
  "p-1.5 rounded-[6px] text-content-subtle hover:bg-accent hover:text-content-secondary disabled:opacity-30 disabled:cursor-not-allowed";

/** One question block: header, text, difficulty/type, and the answer section for the selected type. */
export function QuestionForm({
  q,
  index,
  onChange,
  showErrors,
  removable,
  onRemove,
  onDuplicate,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  heading,
  actions,
  allowedTypes,
  sections,
  kindError,
  duplicateError,
  leading,
  readOnly,
}: {
  q: QuestionDraft;
  index: number;
  onChange: (q: QuestionDraft) => void;
  /** Show field errors and the Needs Attention badge (after the user edits or tries to save). */
  showErrors: boolean;
  removable?: boolean;
  onRemove?: () => void;
  /** Adds a copy of this question right below it; hidden without it. */
  onDuplicate?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  /** Header title; defaults to "Question N". */
  heading?: string;
  /** Extra header buttons (e.g. the AI preview's Done / Accept). */
  actions?: React.ReactNode;
  /** Types the Type dropdown offers (a group holds one kind); all when omitted. */
  allowedTypes?: EditableQuestionType[];
  /** Limits the form to the named correction areas. Omit to show every section. */
  sections?: Array<'content' | 'difficulty' | 'type' | 'answers' | 'rubric' | 'explanation'>;
  /** The question's type doesn't fit its group's kind — the Type dropdown turns red (the page explains it in a toast). */
  kindError?: string;
  /** The backend found this question's content already in the course — it can't be saved until changed. */
  duplicateError?: string;
  /** Shown before the index in the header (e.g. a selection checkbox). */
  leading?: React.ReactNode;
  /** Shows the question without letting it be edited (a saved question on the create page). */
  readOnly?: boolean;
}) {
  const textRef = useRef<HTMLTextAreaElement>(null);
  const errors = validateDraft(q);
  const invalid =
    Object.keys(errors).length > 0 ||
    Boolean(kindError) ||
    Boolean(duplicateError);
  const contentError = showErrors ? errors.content : undefined;
  const answersError = showErrors
    ? sections?.includes('answers') && !sections.includes('rubric') && q.type === 'DIAGRAM_ESSAY' && errors.answers === ESSAY_RUBRIC_REQUIRED
      ? undefined
      : errors.answers
    : undefined;
  const typeError = kindError ?? (showErrors ? errors.type : undefined);
  const typeOptions = allowedTypes
    ? QUESTION_TYPE_OPTIONS.filter(
        (o) => o.value === q.type || allowedTypes.includes(o.value),
      )
    : QUESTION_TYPE_OPTIONS;
  const titleId = `${q.key}-title`;
  const showSection = (section: 'content' | 'difficulty' | 'type' | 'answers' | 'rubric' | 'explanation') => !sections || sections.includes(section);

  const set = (patch: Partial<QuestionDraft>) => onChange({ ...q, ...patch });

  // The textarea holds only the text; the image stays at the end of the stored content.
  const { text, images } = splitQuestionImage(q.content);
  const setText = (next: string) => set({ content: withQuestionImage(next, images[0]?.url ?? null) });

  const insertBlank = () => {
    const marker = `{{${nextBlankIndex(q.content)}}}`;
    const el = textRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setText(text.slice(0, start) + marker + text.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + marker.length, start + marker.length);
    });
  };

  return (
    <section
      aria-labelledby={titleId}
      className={`card px-4 py-3.5 space-y-3 ${showErrors && invalid ? "!border-warning-line" : ""}`}
    >
      {/* Header: index, title, attention badge, reorder controls */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {leading}
          <span className="min-w-6 h-6 px-1 rounded-[6px] bg-brand-600/10 text-brand-ink flex items-center justify-center text-xs font-bold">
            #{index + 1}
          </span>
          <h3
            id={titleId}
            className="text-lg font-semibold text-content truncate"
          >
            {heading ?? `Question ${index + 1}`}
          </h3>
          {q.fromAi && (
            <Badge variant="info" className="flex-shrink-0">
              <Icon.Zap className="w-3 h-3" /> AI draft
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {showErrors && (
            <Badge variant={invalid ? "warning" : "success"} className="mr-1">
              {invalid ? (
                <Icon.AlertCircle className="w-3.5 h-3.5" />
              ) : (
                <Icon.CheckCircle className="w-3.5 h-3.5" />
              )}
              {invalid ? "Needs Attention" : "Complete"}
            </Badge>
          )}
          {onMoveUp && (
            <button
              type="button"
              onClick={onMoveUp}
              disabled={!canMoveUp}
              className={iconBtn}
              aria-label={`Move question ${index + 1} up`}
              title="Move up"
            >
              <Icon.ArrowUp className="w-4 h-4" />
            </button>
          )}
          {onMoveDown && (
            <button
              type="button"
              onClick={onMoveDown}
              disabled={!canMoveDown}
              className={iconBtn}
              aria-label={`Move question ${index + 1} down`}
              title="Move down"
            >
              <Icon.ArrowDown className="w-4 h-4" />
            </button>
          )}
          {onDuplicate && (
            <button
              type="button"
              onClick={onDuplicate}
              className={iconBtn}
              aria-label={`Duplicate question ${index + 1}`}
              title="Duplicate question"
            >
              <Icon.Copy className="w-4 h-4" />
            </button>
          )}
          {removable && (
            <button
              type="button"
              onClick={onRemove}
              className={`${iconBtn} hover:!text-danger hover:!bg-danger-light`}
              aria-label={`Delete question ${index + 1}`}
              title="Delete question"
            >
              <Icon.Trash className="w-4 h-4" />
            </button>
          )}
          {actions}
        </div>
      </div>

      {/* Read-only: the fields stay visible but can't be focused or changed */}
      <div aria-readonly={readOnly || undefined} className={`space-y-3 ${readOnly ? 'opacity-75' : ''}`}>
      {duplicateError && (
        <div
          role="alert"
          className="flex gap-3 p-3 rounded-[10px] border bg-danger-light border-danger-line text-danger-strong"
        >
          <Icon.Copy className="w-5 h-5 text-danger flex-shrink-0" />
          <p className="text-sm">{duplicateError}</p>
        </div>
      )}

      {/* Import block the backend couldn't read — write the question here, or remove it */}
      {q.importIssue && (
        <div
          role="alert"
          className="flex gap-3 p-3 rounded-[10px] border bg-danger-light border-danger-line text-danger-strong"
        >
          <Icon.XCircle className="w-5 h-5 text-danger flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold mb-0.5">
              Couldn’t import question #{q.importIssue.block}
              {q.importIssue.line > 0 ? ` (line ${q.importIssue.line})` : ""}
            </p>
            <ul className="text-sm opacity-90 space-y-0.5">
              {q.importIssue.errors.map((e, i) => (
                <li key={i}>
                  {e.line > 0 ? `Line ${e.line}: ` : ""}
                  {e.message}
                </li>
              ))}
            </ul>
            <p className="text-xs opacity-80 mt-1">
              Fill in the question below, or remove it.
            </p>
          </div>
          <button
            type="button"
            onClick={() => set({ importIssue: undefined })}
            disabled={readOnly}
            className="self-start p-1 rounded-[6px] hover:bg-danger-line/40"
            aria-label="Dismiss import error"
          >
            <Icon.X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Difficulty and type first: the type decides what the rest of the form asks for. */}
      {showSection('difficulty') || showSection('type') ? <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {showSection('difficulty') && <>
        <Select
          label="Difficulty"
          value={q.difficulty}
          disabled={readOnly}
          onChange={(v) => set({ difficulty: v as QuestionDifficulty })}
          options={DIFFICULTY_OPTIONS}
        />
        </>}
        {showSection('type') && <>
        <Select
          label="Type"
          value={q.type}
          disabled={readOnly}
          onChange={(v) => onChange(changeType(q, v as EditableQuestionType))}
          options={typeOptions}
          invalid={Boolean(kindError)}
        />
        </>}
      </div> : null}

      {showSection('type') && typeError && <p className="text-xs text-danger -mt-1.5">{typeError}</p>}

      {/* Question text */}
      {showSection('content') && <div>
        <div className="flex items-center justify-between mb-1">
          <label
            htmlFor={`${q.key}-content`}
            className="text-sm font-medium text-content-secondary"
          >
            Question Text *
          </label>
          <div className="flex items-center gap-2">
          {!readOnly && <InsertImageButton value={q.content} onChange={(content) => set({ content })} />}
          {!readOnly && q.type === "FILL_BLANK" && (
            <button
              type="button"
              onClick={insertBlank}
              className="text-xs font-medium text-brand-ink hover:underline"
            >
              + Insert blank
            </button>
          )}
          </div>
        </div>
        <textarea
          id={`${q.key}-content`}
          ref={textRef}
          value={text}
          readOnly={readOnly}
          onChange={(e) => setText(e.target.value)}
          aria-invalid={Boolean(contentError)}
          className={`w-full h-[96px] px-3 py-2 rounded-[10px] border text-base text-content bg-surface resize-y focus:outline-none focus:ring-2 transition-all ${
            contentError
              ? "border-danger-solid focus:ring-danger-solid/20 focus:border-danger-solid"
              : "border-line focus:ring-brand-600/20 focus:border-brand-600"
          }`}
          placeholder={
            q.type === "FILL_BLANK"
              ? "e.g. The capital of France is {{1}}."
              : "Enter the question…"
          }
        />
        <QuestionImagePreview value={q.content} onChange={(content) => set({ content })} disabled={readOnly} />
        {contentError && (
          <p className="text-xs text-danger mt-1">{contentError}</p>
        )}
      </div>}

      {showSection('answers') && <AnswerSection q={q} set={set} error={answersError} mode={sections ? 'answer' : 'all'} readOnly={readOnly} />}
      {sections?.includes('rubric') && RUBRIC_TYPES.includes(q.type) && <RubricAnswers q={q} set={set} error={answersError} readOnly={readOnly} />}

      {showSection('explanation') && <div>
        <label
          htmlFor={`${q.key}-explanation`}
          className="block text-sm font-medium text-content-secondary mb-1"
        >
          Explanation{" "}
          <span className="font-normal text-content-subtle">(optional)</span>
        </label>
        <textarea
          id={`${q.key}-explanation`}
          value={q.explanation}
          readOnly={readOnly}
          onChange={(e) => set({ explanation: e.target.value })}
          className="w-full h-[64px] px-3 py-2 rounded-[10px] border border-line text-sm text-content bg-surface resize-y focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600 transition-all"
          placeholder="Why the answer is correct — shown to students during review."
        />
      </div>}
      </div>
    </section>
  );
}

export function AnswerSection({
  q,
  set,
  error,
  mode = 'all',
  readOnly = false,
}: {
  q: QuestionDraft;
  set: (patch: Partial<QuestionDraft>) => void;
  error?: string;
  mode?: 'all' | 'answer';
  readOnly?: boolean;
}) {
  switch (q.type) {
    case "SINGLE_CHOICE":
    case "MULTIPLE_CHOICE":
    case "TRUE_FALSE":
      return <ChoiceAnswers q={q} set={set} error={error} readOnly={readOnly} />;
    case "MATCHING":
      return <MatchingAnswers q={q} set={set} error={error} readOnly={readOnly} />;
    case "FILL_BLANK":
      return <BlankAnswers q={q} set={set} error={error} readOnly={readOnly} />;
    case "ORDERING":
      return <OrderingAnswers q={q} set={set} error={error} readOnly={readOnly} />;
    case "DIAGRAM":
    case "DIAGRAM_ESSAY": {
      if (mode === 'answer') return <DiagramAnswer q={q} set={set} error={error} readOnly={readOnly} />;
      // One answers error for both parts — show it under the part it is about.
      const rubricError =
        error && (error === rubricTotal(q.rubric).error || error === ESSAY_RUBRIC_REQUIRED) ? error : undefined;
      return (
        <div className="space-y-4">
          <DiagramAnswer
            q={q}
            set={set}
            error={rubricError ? undefined : error}
            readOnly={readOnly}
          />
          <RubricAnswers q={q} set={set} error={rubricError} readOnly={readOnly} />
        </div>
      );
    }
    case "ESSAY":
      return mode === 'answer' ? <p className="text-sm text-content-secondary">This question is graded by a rubric. Choose “Rubric Corrected” to edit its scoring criteria.</p> : <RubricAnswers q={q} set={set} error={error} readOnly={readOnly} />;
    case "CODE":
      return <CodeAnswer q={q} set={set} error={error} readOnly={readOnly} />;
  }
}

const MAX_CRITERIA = 20;
/** Name · weight on one line; descriptors spans its own line below. */
const CRITERION_GRID = "grid-cols-[minmax(0,1fr)_5.5rem]";
const CRITERION_LABEL = "block mb-1 text-xs font-medium text-content-subtle";

function RubricAnswers({
  q,
  set,
  error,
  readOnly = false,
}: {
  q: QuestionDraft;
  set: (patch: Partial<QuestionDraft>) => void;
  error?: string;
  readOnly?: boolean;
}) {
  const setCriterion = (i: number, patch: Partial<RubricCriterionDraft>) =>
    set({
      rubric: q.rubric.map((c, ci) => (ci === i ? { ...c, ...patch } : c)),
    });
  const add = () => set({ rubric: [...q.rubric, emptyCriterion()] });
  const remove = (i: number) =>
    set({ rubric: q.rubric.filter((_, ci) => ci !== i) });

  return (
    <div>
      <SectionHeader
        label="Grading Rubric"
          action={
            !readOnly &&
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={<Icon.Plus className="w-3.5 h-3.5" />}
            onClick={add}
            disabled={q.rubric.length >= MAX_CRITERIA}
          >
            Add Criterion
          </Button>
        }
      />
      {q.rubric.length === 0 ? (
        <p className="flex items-start gap-2 rounded-[10px] bg-surface-alt px-3 py-2.5 text-sm text-content-soft">
          <Icon.Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
          {q.type === "ESSAY"
            ? "An essay must have a grading rubric. Add at least one criterion to define how it is scored."
            : q.type === "DIAGRAM_ESSAY"
            ? "A diagram + essay must have a grading rubric. Add criteria for both the diagram and the written explanation."
            : "No rubric — the diagram is worth 1 point and graded without criteria. Add criteria to define how it is scored."}
        </p>
      ) : (
        <div className="space-y-2">
          {q.rubric.map((c, i) => {
            const nameMissing = Boolean(error) && !c.name.trim();
            const weightBad = Boolean(error) && !(Number(c.weight) > 0);
            return (
              <div key={c.key} className="rounded-[10px] border border-line-soft overflow-hidden">
                <div className="flex items-center justify-between gap-2 bg-surface-muted px-3 py-1.5 border-b border-line-soft">
                  <span className="text-xs font-bold text-content-soft">Criterion {i + 1}</span>
                  {!readOnly && <button
                    type="button"
                    onClick={() => remove(i)}
                    aria-label={`Delete criterion ${i + 1}`}
                    title="Delete criterion"
                    className="p-1 text-content-subtle hover:text-danger"
                  >
                    <Icon.Trash className="w-4 h-4" />
                  </button>}
                </div>
                <div className={`grid ${CRITERION_GRID} gap-x-2 gap-y-2.5 p-2.5`}>
                  <label className="block min-w-0">
                    <span className={CRITERION_LABEL}>Name</span>
                    <input
                      value={c.name}
                      readOnly={readOnly}
                      onChange={(e) => setCriterion(i, { name: e.target.value })}
                      placeholder="e.g. Diagram readability"
                      maxLength={200}
                      className={inputCls(nameMissing)}
                    />
                  </label>
                  <label className="block min-w-0">
                    <span className={CRITERION_LABEL}>Weight</span>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      inputMode="decimal"
                      value={c.weight}
                      readOnly={readOnly}
                      onChange={(e) => setCriterion(i, { weight: e.target.value })}
                      placeholder="e.g. 0.1"
                      className={inputCls(weightBad)}
                    />
                  </label>
                  <label className="block min-w-0 col-span-2">
                    <span className={CRITERION_LABEL}>Descriptors</span>
                    <textarea
                      value={c.descriptors}
                      readOnly={readOnly}
                      onChange={(e) => setCriterion(i, { descriptors: e.target.value })}
                      placeholder="Full credit: … Partial credit: … Zero credit: …"
                      rows={3}
                      className={`${inputCls(false)} !h-auto py-2 leading-snug resize-y`}
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {error && <p className="text-xs text-danger mt-1.5">{error}</p>}
    </div>
  );
}

function SectionHeader({
  label,
  action,
}: {
  label: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 mb-1.5">
      <span className="text-sm font-medium text-content-secondary">
        {label}
      </span>
      {action}
    </div>
  );
}

function ChoiceAnswers({
  q,
  set,
  error,
  readOnly = false,
}: {
  q: QuestionDraft;
  set: (patch: Partial<QuestionDraft>) => void;
  error?: string;
  readOnly?: boolean;
}) {
  const multi = q.type === "MULTIPLE_CHOICE";
  const fixed = q.type === "TRUE_FALSE";

  const setText = (i: number, text: string) =>
    set({ options: q.options.map((o, oi) => (oi === i ? { ...o, text } : o)) });
  const toggleCorrect = (i: number) =>
    set({
      options: q.options.map((o, oi) =>
        multi
          ? oi === i
            ? { ...o, isCorrect: !o.isCorrect }
            : o
          : { ...o, isCorrect: oi === i },
      ),
    });
  const remove = (i: number) => {
    const options = q.options.filter((_, oi) => oi !== i);
    // Single choice must keep one key: fall back to the first option.
    if (!multi && !options.some((o) => o.isCorrect) && options[0])
      options[0] = { ...options[0], isCorrect: true };
    set({ options });
  };
  const add = () =>
    set({
      options: [
        ...q.options,
        { key: newKey("opt"), text: "", isCorrect: false },
      ],
    });

  const correct = q.options
    .map((o, i) => (o.isCorrect ? (fixed ? o.text : optionLabel(i)) : null))
    .filter(Boolean);

  return (
    <div>
      <SectionHeader
        label={
          multi
            ? "Answer Options (select all correct answers)"
            : "Answer Options"
        }
        action={
          !fixed && !readOnly && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={<Icon.Plus className="w-3.5 h-3.5" />}
              onClick={add}
              disabled={q.options.length >= MAX_OPTIONS}
            >
              Add Option
            </Button>
          )
        }
      />
      <div
        className="space-y-1.5"
        role={multi ? "group" : "radiogroup"}
        aria-label="Correct answer"
      >
        {q.options.map((o, i) => (
          <div key={o.key} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors ${o.isCorrect ? "border-success-line bg-success-light" : "border-transparent"}`}>
            <span className="w-7 h-7 bg-surface-muted rounded-[6px] flex items-center justify-center text-xs font-bold text-content-soft flex-shrink-0">
              {optionLabel(i)}
            </span>
            <input
              value={o.text}
              readOnly={fixed || readOnly}
              onChange={(e) => setText(i, e.target.value)}
              aria-label={`Option ${optionLabel(i)}`}
              className={`${inputCls(Boolean(error) && !fixed && o.text.trim() === "")} ${fixed ? "bg-surface-alt cursor-default" : ""}`}
              placeholder={`Option ${optionLabel(i)}`}
            />
            <input
              type={multi ? "checkbox" : "radio"}
              name={`correct-${q.key}`}
              checked={o.isCorrect}
              disabled={readOnly}
              onChange={() => toggleCorrect(i)}
              aria-label={`Mark option ${optionLabel(i)} as correct`}
              title="Mark as correct"
              className="accent-success w-4 h-4 flex-shrink-0 cursor-pointer"
            />
            {o.isCorrect && <span className="whitespace-nowrap text-xs font-semibold text-success">Correct</span>}
            {!fixed && !readOnly && (
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={q.options.length <= 2}
                aria-label={`Delete option ${optionLabel(i)}`}
                title="Delete option"
                className="p-1 flex-shrink-0 text-content-subtle hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Icon.Trash className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      {error && <p className="text-xs text-danger mt-1.5">{error}</p>}
      <p className="text-xs font-medium text-success mt-2">
        Correct answer:{" "}
        {correct.length ? (
          correct.join(", ")
        ) : (
          <span className="text-content-subtle">none selected</span>
        )}
      </p>
    </div>
  );
}

function MatchingAnswers({
  q,
  set,
  error,
  readOnly = false,
}: {
  q: QuestionDraft;
  set: (patch: Partial<QuestionDraft>) => void;
  error?: string;
  readOnly?: boolean;
}) {
  const setPair = (i: number, patch: { left?: string; right?: string }) =>
    set({ pairs: q.pairs.map((p, pi) => (pi === i ? { ...p, ...patch } : p)) });
  const add = () =>
    set({ pairs: [...q.pairs, { key: newKey("pair"), left: "", right: "" }] });
  const remove = (i: number) =>
    set({ pairs: q.pairs.filter((_, pi) => pi !== i) });

  return (
    <div>
      <SectionHeader
        label="Matching Pairs"
        action={
          !readOnly &&
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={<Icon.Plus className="w-3.5 h-3.5" />}
            onClick={add}
            disabled={q.pairs.length >= MAX_OPTIONS}
          >
            Add Pair
          </Button>
        }
      />
      <div className="space-y-1.5">
        {q.pairs.map((p, i) => (
          <div key={p.key} className="flex items-center gap-2">
            <span className="w-7 h-7 bg-surface-muted rounded-[6px] flex items-center justify-center text-xs font-bold text-content-soft flex-shrink-0">
              {i + 1}
            </span>
            <input
              value={p.left}
              readOnly={readOnly}
              onChange={(e) => setPair(i, { left: e.target.value })}
              aria-label={`Pair ${i + 1} left item`}
              placeholder="Item"
              className={inputCls(Boolean(error) && !p.left.trim())}
            />
            <Icon.ChevronRight
              className="w-4 h-4 text-content-subtle flex-shrink-0"
              aria-hidden="true"
            />
            <input
              value={p.right}
              readOnly={readOnly}
              onChange={(e) => setPair(i, { right: e.target.value })}
              aria-label={`Pair ${i + 1} matching item`}
              placeholder="Matches with"
              className={inputCls(Boolean(error) && !p.right.trim())}
            />
            {!readOnly && <button
              type="button"
              onClick={() => remove(i)}
              disabled={q.pairs.length <= 2}
              aria-label={`Delete pair ${i + 1}`}
              title="Delete pair"
              className="p-1 flex-shrink-0 text-content-subtle hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Icon.Trash className="w-4 h-4" />
            </button>}
          </div>
        ))}
      </div>
      {error && <p className="text-xs text-danger mt-1.5">{error}</p>}
      <p className="text-xs text-content-subtle mt-2">
        Students see the right-hand items shuffled and match each one to its
        item.
      </p>
    </div>
  );
}

function BlankAnswers({
  q,
  set,
  error,
  readOnly = false,
}: {
  q: QuestionDraft;
  set: (patch: Partial<QuestionDraft>) => void;
  error?: string;
  readOnly?: boolean;
}) {
  const indexes = blankIndexes(q.content);
  const setBlank = (
    n: number,
    patch: Partial<{ accepted: string; caseSensitive: boolean }>,
  ) =>
    set({
      blanks: {
        ...q.blanks,
        [n]: {
          ...(q.blanks[n] ?? { accepted: "", caseSensitive: false }),
          ...patch,
        },
      },
    });

  return (
    <div>
      <SectionHeader label="Accepted Answers" />
      {indexes.length === 0 ? (
        <p className="text-sm text-content-soft">
          Type <code className="px-1 rounded bg-surface-muted">{"{{1}}"}</code>,{" "}
          <code className="px-1 rounded bg-surface-muted">{"{{2}}"}</code>… in
          the question text (or use “Insert blank”) to add blanks.
        </p>
      ) : (
        <div className="space-y-1.5">
          {indexes.map((n) => (
            <div key={n} className="flex items-center gap-2">
              <span className="h-7 px-1.5 bg-surface-muted rounded-[6px] flex items-center justify-center text-xs font-bold text-content-soft flex-shrink-0">{`{{${n}}}`}</span>
              <input
                value={q.blanks[n]?.accepted ?? ""}
                readOnly={readOnly}
                onChange={(e) => setBlank(n, { accepted: e.target.value })}
                aria-label={`Accepted answers for blank ${n}`}
                placeholder="Accepted answers, separated by ;"
                className={inputCls(
                  Boolean(error) && !(q.blanks[n]?.accepted ?? "").trim(),
                )}
              />
              <label className="flex items-center gap-1.5 text-xs text-content-soft whitespace-nowrap cursor-pointer">
                <input
                  type="checkbox"
                  checked={q.blanks[n]?.caseSensitive ?? false}
                  disabled={readOnly}
                  onChange={(e) =>
                    setBlank(n, { caseSensitive: e.target.checked })
                  }
                  className="w-3.5 h-3.5 accent-brand-600"
                />
                Case sensitive
              </label>
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-danger mt-1.5">{error}</p>}
    </div>
  );
}

function OrderingAnswers({
  q,
  set,
  error,
  readOnly = false,
}: {
  q: QuestionDraft;
  set: (patch: Partial<QuestionDraft>) => void;
  error?: string;
  readOnly?: boolean;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const setText = (i: number, text: string) =>
    set({
      ordering: q.ordering.map((o, oi) => (oi === i ? { ...o, text } : o)),
    });
  const add = () =>
    set({ ordering: [...q.ordering, { key: newKey("ord"), text: "" }] });
  const remove = (i: number) =>
    set({ ordering: q.ordering.filter((_, oi) => oi !== i) });
  const moveTo = (from: number, to: number) => {
    if (from === to || to < 0 || to >= q.ordering.length) return;
    const next = [...q.ordering];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    set({ ordering: next });
  };
  const endDrag = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <div>
      <SectionHeader
        label="Correct Order (drag to rearrange)"
          action={
            !readOnly &&
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={<Icon.Plus className="w-3.5 h-3.5" />}
            onClick={add}
            disabled={q.ordering.length >= MAX_OPTIONS}
          >
            Add Item
          </Button>
        }
      />
      <ol className="space-y-1.5">
        {q.ordering.map((o, i) => (
          <li
            key={o.key}
            draggable={!readOnly}
            onDragStart={(e) => {
              if (readOnly) return;
              setDragIndex(i);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (readOnly) return;
              e.preventDefault();
              setOverIndex(i);
            }}
            onDrop={(e) => {
              if (readOnly) return;
              e.preventDefault();
              if (dragIndex != null) moveTo(dragIndex, i);
              endDrag();
            }}
            onDragEnd={readOnly ? undefined : endDrag}
            className={`flex items-center gap-2 rounded-[10px] transition-all ${readOnly ? '' : 'cursor-grab'} ${dragIndex === i ? "opacity-40" : ""} ${overIndex === i && dragIndex !== i ? "ring-2 ring-brand-600/30" : ""}`}
          >
            <span
              className={`${readOnly ? '' : 'cursor-grab active:cursor-grabbing'} text-content-subtle flex-shrink-0`}
              aria-hidden="true"
              title="Drag to reorder"
            >
              <Icon.GripVertical className="w-4 h-4" />
            </span>
            <span className="w-7 h-7 bg-surface-muted rounded-[6px] flex items-center justify-center text-xs font-bold text-content-soft flex-shrink-0">
              {i + 1}
            </span>
            <input
              value={o.text}
              readOnly={readOnly}
              onChange={(e) => setText(i, e.target.value)}
              aria-label={`Item ${i + 1}`}
              placeholder={`Item ${i + 1}`}
              className={inputCls(Boolean(error) && !o.text.trim())}
            />
            {!readOnly && <button
              type="button"
              onClick={() => moveTo(i, i - 1)}
              disabled={i === 0}
              className={iconBtn}
              aria-label={`Move item ${i + 1} up`}
              title="Move up"
            >
              <Icon.ArrowUp className="w-4 h-4" />
            </button>}
            {!readOnly && <button
              type="button"
              onClick={() => moveTo(i, i + 1)}
              disabled={i === q.ordering.length - 1}
              className={iconBtn}
              aria-label={`Move item ${i + 1} down`}
              title="Move down"
            >
              <Icon.ArrowDown className="w-4 h-4" />
            </button>}
            {!readOnly && <button
              type="button"
              onClick={() => remove(i)}
              disabled={q.ordering.length <= 2}
              aria-label={`Delete item ${i + 1}`}
              title="Delete item"
              className="p-1 flex-shrink-0 text-content-subtle hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Icon.Trash className="w-4 h-4" />
            </button>}
          </li>
        ))}
      </ol>
      {error && <p className="text-xs text-danger mt-1.5">{error}</p>}
      <p className="text-xs text-content-subtle mt-2">
        Enter the items in their correct order — students see them shuffled.
      </p>
    </div>
  );
}
