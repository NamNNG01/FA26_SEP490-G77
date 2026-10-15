import React from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/assets/icons';
import type { ExamDifficulty } from '../mockPublicExams';
import {
  QUESTION_TYPE_LABEL,
  type ExamOption,
  type ExamQuestion,
  type QuestionGroup,
} from '../mockExamQuestions';

/** Per-item difficulty -> Badge variant. Green / orange / red. */
const DIFFICULTY_VARIANT: Record<ExamDifficulty, 'success' | 'warning' | 'danger'> = {
  Easy: 'success',
  Medium: 'warning',
  Hard: 'danger',
};

/**
 * QuestionEditorCard
 *
 * ONE component renders a question for both roles. `canEdit` alone decides what
 * is editable, which controls exist, and whether correct answers are shown:
 *
 *   canEdit=true  (content manager) â€” type select, editable text, editable
 *                  options/matching/ordering, group assignment, "mark correct"
 *                  markers, move up/down and remove controls.
 *   canEdit=false (student)          â€” every field read-only or disabled, no
 *                  editing controls, and `isCorrect` is never rendered.
 *
 * The `isCorrect` marker is deliberately confined to the `{canEdit && ...}`
 * branches below. It is still present in the client bundle, so this is a UI
 * guarantee, not a security boundary â€” real answers must live server-side.
 */

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function LabelledField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12.5px] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/** Author-only: pick the single correct option. */
function CorrectPicker({ options, onChange }: {
  options: ExamOption[];
  onChange: (label: string) => void;
}) {
  return (
    <span className="flex items-center gap-1.5" title="Mark as the correct answer">
      <span className="text-[11.5px] text-content-subtle">Correct</span>
      {options.map(o => (
        <button
          key={o.label}
          type="button"
          aria-pressed={o.isCorrect}
          aria-label={`Mark option ${o.label} correct`}
          onClick={() => onChange(o.label)}
          className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors ${
            o.isCorrect
              ? 'border-transparent bg-[#16A34A] text-white'
              : 'border-line bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground'
          }`}
        >
          {o.isCorrect ? <Icon.Check className="h-3 w-3" /> : o.label}
        </button>
      ))}
    </span>
  );
}

export function QuestionEditorCard({
  question,
  index,
  total,
  groups,
  canEdit,
  nested,
  onChange,
  onRemove,
  onMove,
}: {
  question: ExamQuestion;
  /** 1-based position, shown to both roles. */
  index: number;
  total: number;
  groups: QuestionGroup[];
  canEdit: boolean;
  /**
   * Rendered inside a QuestionGroupCard (level 2) rather than on its own
   * (level 1): a slightly recessed surface, no border or shadow of its own,
   * since the parent card supplies the container and the divider.
   */
  nested?: boolean;
  onChange: (patch: Partial<ExamQuestion>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const readOnly = !canEdit;
  const grouped = Boolean(question.groupId);
  /** Level 2 inside a group, level 1 on its own. */
  const shell = nested
    ? 'bg-surface-alt px-4 py-4'
    : 'border border-line bg-surface p-5 shadow-sm';

  /** Read-only rendering of one option â€” no correct marker, no radio affordance. */
  const optionRow = (option: ExamOption) => (
    <div
      key={option.label}
      className="flex items-center gap-2.5 rounded-[10px] border border-line bg-surface-alt px-3 py-2"
    >
      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-line bg-surface text-[11px] font-semibold text-muted-foreground">
        {option.label}
      </span>
      {canEdit ? (
        <input
          value={option.text}
          onChange={e => onChange({ options: optionsReplaced(option.label, e.target.value) })}
          className="min-w-0 flex-1 rounded-[6px] border border-transparent bg-transparent px-1 py-0.5 text-[13px] text-foreground outline-none transition-colors hover:border-line focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      ) : (
        <span className="min-w-0 flex-1 text-[13px] text-foreground">{option.text}</span>
      )}
      {canEdit && <CorrectPicker options={question.options ?? []} onChange={markCorrect} />}
    </div>
  );

  /** Replace one option's text, leaving the rest of the array untouched. */
  function optionsReplaced(label: string, text: string): ExamOption[] {
    return (question.options ?? []).map(o => (o.label === label ? { ...o, text } : o));
  }

  function markCorrect(label: string): void {
    onChange({ options: (question.options ?? []).map(o => ({ ...o, isCorrect: o.label === label })) });
  }

  function setOrderingItem(index: number, text: string): void {
    onChange({ ordering: (question.ordering ?? []).map((it, i) => (i === index ? { text } : it)) });
  }

  function moveOrderingItem(index: number, direction: -1 | 1): void {
    const items = [...(question.ordering ?? [])];
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const [row] = items.splice(index, 1);
    items.splice(target, 0, row!);
    onChange({ ordering: items });
  }

  return (
    <article className={nested ? `rounded-[12px] ${shell}` : `rounded-[14px] ${shell}`}>
      {/* Header — position, type/difficulty/scope pills, author-only controls */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-7 min-w-7 items-center justify-center rounded-[8px] bg-accent px-2 text-[12px] font-semibold text-muted-foreground">
          {index}
        </span>

        {canEdit ? (
          <select
            value={question.type}
            onChange={e => onChange({ type: e.target.value as ExamQuestion['type'] })}
            aria-label={`Question ${index} type`}
            className="h-7 rounded-full border border-line bg-surface pl-2.5 pr-7 text-[12px] font-medium text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            {(question.type === 'essay'
              ? ['essay']
              : ['mcq', 'true-false', 'fill-blank', 'matching', 'ordering']
            ).map(t => (
              <option key={t} value={t}>
                {QUESTION_TYPE_LABEL[t as ExamQuestion['type']]}
              </option>
            ))}
          </select>
        ) : (
          <Badge variant="default">{QUESTION_TYPE_LABEL[question.type]}</Badge>
        )}

        <Badge variant={DIFFICULTY_VARIANT[question.difficulty]}>{question.difficulty}</Badge>
        <Badge variant={grouped ? 'info' : 'default'}>{grouped ? 'Group' : 'Single'}</Badge>

        <span className="text-[12.5px] text-content-subtle">{question.points} pts</span>

        {canEdit && (
          <span className="ml-auto flex items-center gap-1">
            <label className="flex items-center gap-1.5">
              <span className="text-[12.5px] text-muted-foreground">Group</span>
              <select
                value={question.groupId ?? ''}
                onChange={e => onChange({ groupId: e.target.value || undefined })}
                aria-label={`Group assignment for question ${index}`}
                className="h-8 max-w-[11rem] rounded-[10px] border border-line bg-surface pl-2.5 pr-8 text-[13px] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="">No group</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              aria-label="Move question up"
              disabled={index === 1}
              onClick={() => onMove(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Icon.ArrowUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Move question down"
              disabled={index === total}
              onClick={() => onMove(1)}
              className="flex h-8 w-8 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Icon.ArrowDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Remove question"
              onClick={onRemove}
              className="flex h-8 w-8 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-[#FEF2F2] hover:text-[#DC2626]"
            >
              <Icon.Trash className="h-4 w-4" />
            </button>
          </span>
        )}
      </div>

      {/* Question text */}
      <div className="mt-3.5">
        {canEdit ? (
          <textarea
            value={question.text}
            onChange={e => onChange({ text: e.target.value })}
            rows={2}
            placeholder="Enter the question text..."
            className="w-full resize-y rounded-[10px] border border-line bg-surface px-3 py-2 text-[14px] leading-relaxed text-foreground outline-none transition-colors placeholder:text-content-subtle focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        ) : (
          <p className="text-[14px] font-medium leading-relaxed text-foreground">{question.text}</p>
        )}
      </div>

      {/* Type-specific body */}
      <div className="mt-4 space-y-2.5">
        {question.type === 'mcq' || question.type === 'true-false' || question.type === 'fill-blank'
          ? (question.options ?? []).map(optionRow)
          : null}

        {question.type === 'fill-blank' && question.answer !== undefined && (
          <LabelledField label={canEdit ? 'Accepted answer' : 'Answer format'}>
            {canEdit ? (
              <input
                value={question.answer}
                onChange={e => onChange({ answer: e.target.value })}
                className="h-9 rounded-[10px] border border-line bg-surface px-3 text-[13px] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            ) : (
              <span className="text-[13px] text-muted-foreground">
                Short answer â€” responses are matched against the expected wording.
              </span>
            )}
          </LabelledField>
        )}

        {question.type === 'matching' &&
          (question.pairs ?? []).map((pair, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2.5">
              {canEdit ? (
                <>
                  <input
                    value={pair.left}
                    onChange={e =>
                      onChange({
                        pairs: (question.pairs ?? []).map((p, j) => (j === i ? { ...p, left: e.target.value } : p)),
                      })
                    }
                    className="min-w-0 flex-1 rounded-[10px] border border-line bg-surface px-3 h-9 text-[13px] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <Icon.ChevronRight className="h-4 w-4 flex-shrink-0 text-content-subtle" />
                  <input
                    value={pair.right}
                    onChange={e =>
                      onChange({
                        pairs: (question.pairs ?? []).map((p, j) => (j === i ? { ...p, right: e.target.value } : p)),
                      })
                    }
                    className="min-w-0 flex-1 rounded-[10px] border border-line bg-surface px-3 h-9 text-[13px] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </>
              ) : (
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5 rounded-[10px] border border-line bg-surface-alt px-3 py-2">
                  <span className="text-[13px] text-foreground">{pair.left}</span>
                  <Icon.ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-content-subtle" />
                  <span className="text-[13px] text-foreground">{pair.right}</span>
                </span>
              )}
            </div>
          ))}

        {question.type === 'ordering' &&
          (question.ordering ?? []).map((item, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-line bg-surface-alt text-[11px] font-semibold text-muted-foreground">
                {i + 1}
              </span>
              {canEdit ? (
                <>
                  <input
                    value={item.text}
                    onChange={e => setOrderingItem(i, e.target.value)}
                    className="min-w-0 flex-1 rounded-[10px] border border-line bg-surface px-3 h-9 text-[13px] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                  <button
                    type="button"
                    aria-label="Move item up"
                    disabled={i === 0}
                    onClick={() => moveOrderingItem(i, -1)}
                    className="flex h-8 w-8 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <Icon.ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Move item down"
                    disabled={i === (question.ordering?.length ?? 0) - 1}
                    onClick={() => moveOrderingItem(i, 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <Icon.ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <span className="min-w-0 flex-1 text-[13px] text-foreground">{item.text}</span>
              )}
            </div>
          ))}

        {question.type === 'essay' && (
          <p className="text-[13px] text-muted-foreground">
            Written response â€” graded against a rubric rather than an answer key.
          </p>
        )}
      </div>
    </article>
  );
}

/**
 * QuestionGroupCard — the level-1 container for a shared-passage group.
 *
 * Background is `bg-surface`, the same neutral token as every other card on the
 * page. It deliberately does NOT use `bg-primary-light`: that token is a plain
 * hex (#EFF6FF) rather than a `var(--surface-*)` reference, so it stays near-white
 * in dark mode and puts #D1D5DB text on it at roughly 1.4:1. Only the Layers icon
 * and the count pill carry the blue accent.
 *
 * Children are the group's questions, rendered as level-2 cards by the parent
 * and separated with a hairline divider rather than a border per question.
 */
export function QuestionGroupCard({
  group,
  count,
  canEdit,
  onChange,
  children,
}: {
  group: QuestionGroup;
  count: number;
  canEdit: boolean;
  onChange: (patch: Partial<QuestionGroup>) => void;
  /** The questions that belong to this group. */
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[14px] border border-line bg-surface p-5 shadow-sm">
      {/* Group header — title, question count, shared passage */}
      <div className="flex items-start gap-2.5">
        <Icon.Layers className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />

        <div className="min-w-0 flex-1">
          {canEdit ? (
            <input
              value={group.title}
              onChange={e => onChange({ title: e.target.value })}
              placeholder="Group title"
              aria-label="Group title"
              className="h-8 w-full rounded-[10px] border border-transparent bg-transparent px-2 text-[15px] font-semibold text-foreground outline-none transition-colors placeholder:text-content-subtle hover:border-line focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          ) : (
            <h3 className="text-[15px] font-semibold leading-snug text-foreground">{group.title}</h3>
          )}

          <p className="mt-0.5 text-[12.5px] font-medium text-primary dark:text-[#93C5FD]">
            {count} Question{count === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {canEdit ? (
        <textarea
          value={group.passage}
          onChange={e => onChange({ passage: e.target.value })}
          rows={4}
          placeholder="Shared passage text..."
          aria-label="Shared passage"
          className="mt-3 w-full resize-y rounded-[10px] border border-transparent bg-transparent px-2 py-1.5 text-[13.5px] leading-relaxed text-muted-foreground outline-none transition-colors placeholder:text-content-subtle hover:border-line focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      ) : (
        <p className="mt-2 border-l-2 border-line pl-3 text-[13.5px] leading-relaxed text-muted-foreground">
          {group.passage}
        </p>
      )}

      {/* Questions in this group — hairline separated, no per-question border. */}
      <div className="mt-4 divide-y divide-line">{children}</div>
    </section>
  );
}

/** Author-only empty state for an exam with no questions left. */
export function NoQuestionsCard({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-[14px] border border-dashed border-line bg-surface px-6 py-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[12px] bg-accent text-content-subtle">
        <Icon.ClipboardList className="h-6 w-6" />
      </div>
      <p className="mt-3 text-[14px] font-semibold text-foreground">No questions yet</p>
      <p className="mx-auto mt-1 max-w-xs text-[13px] text-muted-foreground">
        Add the first question to start building this exam's question bank.
      </p>
      <Button className="mt-4" icon={<Icon.Plus className="h-4 w-4" />} onClick={onAdd}>
        Add Question
      </Button>
    </div>
  );
}
