import { QUESTION_METADATA_KEYS } from '@/services/question.service';
import type {
  AnswerOption,
  FillBlankAnswerKey,
  MatchingAnswerKey,
  QuestionCreateRequest,
  QuestionAiDraft,
  QuestionDetail,
  QuestionDifficulty,
  QuestionType,
  QuestionUpdateRequest,
} from '@/services/question.service';
import { hasDiagramContent, plantUmlToDrawioXml } from './diagram';

/**
 * Editor-side model for one question. It keeps every type's fields side by
 * side so switching the Type dropdown back and forth doesn't lose input; only
 * the fields of the selected type are validated and sent to the backend.
 */

/**
 * Types the editor offers. QuestionValidator accepts SINGLE_CHOICE,
 * MULTIPLE_CHOICE, TRUE_FALSE, MATCHING, FILL_BLANK and ESSAY. DIAGRAM (drawn
 * in draw.io) and ORDERING can be authored in the UI but not saved yet.
 * CODE has no editor yet.
 */
export type EditableQuestionType = Exclude<QuestionType, 'CODE'> | 'ORDERING';

/** Types the editor shows but the backend can't store yet. */
export const UNSAVEABLE_TYPES: EditableQuestionType[] = ['DIAGRAM', 'ORDERING'];

export const QUESTION_TYPE_OPTIONS: { label: string; value: EditableQuestionType }[] = [
  { label: 'Single Choice', value: 'SINGLE_CHOICE' },
  { label: 'Multiple Choice', value: 'MULTIPLE_CHOICE' },
  { label: 'True / False', value: 'TRUE_FALSE' },
  { label: 'Matching', value: 'MATCHING' },
  { label: 'Fill in the Blank', value: 'FILL_BLANK' },
  { label: 'Essay', value: 'ESSAY' },
  { label: 'Diagram (coming soon)', value: 'DIAGRAM' },
  { label: 'Ordering (coming soon)', value: 'ORDERING' },
];

/** Types the AI can draft — the ones the backend can save. */
export const AI_QUESTION_TYPE_OPTIONS = QUESTION_TYPE_OPTIONS.filter(t => !UNSAVEABLE_TYPES.includes(t.value)) as { label: string; value: QuestionType }[];

/** QuestionValidator limits. */
export const MAX_CONTENT_LENGTH = 10000;
export const MAX_SKILL_TAG_LENGTH = 100;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 10;

export const DIFFICULTY_OPTIONS: { label: string; value: QuestionDifficulty }[] = [
  { label: 'Easy', value: 'EASY' },
  { label: 'Medium', value: 'MEDIUM' },
  { label: 'Hard', value: 'HARD' },
];

export interface OptionDraft {
  key: string;
  optionId?: number | null;
  text: string;
  isCorrect: boolean;
}

export interface PairDraft {
  key: string;
  left: string;
  right: string;
}

export interface BlankDraft {
  /** Alternatives separated by ";" — e.g. "colour; color". */
  accepted: string;
  caseSensitive: boolean;
}

export interface OrderItemDraft {
  key: string;
  text: string;
}

export interface QuestionDraft {
  key: string;
  questionId?: number;
  lockVersion?: number | null;
  /** Rationale shown to students during review (ai_explanation). */
  explanation: string;
  /** Kept in questionMetadata.skillTag. */
  skillTag: string;
  groupId: number | null;
  /** Original questionMetadata, so saving keeps keys the editor doesn't know about. */
  metadata: Record<string, unknown>;
  type: EditableQuestionType;
  difficulty: QuestionDifficulty;
  content: string;
  /** SINGLE_CHOICE / MULTIPLE_CHOICE / TRUE_FALSE */
  options: OptionDraft[];
  /** MATCHING */
  pairs: PairDraft[];
  /** FILL_BLANK — keyed by the n in {{n}} */
  blanks: Record<number, BlankDraft>;
  /** ORDERING — items in their correct order. */
  ordering: OrderItemDraft[];
  /** DIAGRAM — model answer as draw.io XML, plus an SVG snapshot for previews. */
  diagramXml: string;
  diagramSvg: string;
  /** ESSAY rubric suggested by AI — passed through untouched; its total becomes defaultPoints. */
  essayGradingRubric?: unknown;
  /** Drafted by AI-03 and accepted into the form. */
  fromAi?: boolean;
}

let seq = 0;
export const newKey = (prefix = 'k') => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export const optionLabel = (i: number) => String.fromCharCode(65 + i);

const emptyOptions = (): OptionDraft[] =>
  [0, 1, 2, 3].map(i => ({ key: newKey('opt'), text: '', isCorrect: i === 0 }));

const trueFalseOptions = (): OptionDraft[] => [
  { key: newKey('opt'), text: 'True', isCorrect: true },
  { key: newKey('opt'), text: 'False', isCorrect: false },
];

const emptyPairs = (): PairDraft[] => [0, 1].map(() => ({ key: newKey('pair'), left: '', right: '' }));

const emptyOrdering = (): OrderItemDraft[] => [0, 1, 2].map(() => ({ key: newKey('ord'), text: '' }));

export function emptyDraft(): QuestionDraft {
  return {
    key: newKey('q'),
    explanation: '',
    skillTag: '',
    groupId: null,
    metadata: {},
    type: 'SINGLE_CHOICE',
    difficulty: 'MEDIUM',
    content: '',
    options: emptyOptions(),
    pairs: emptyPairs(),
    blanks: {},
    ordering: emptyOrdering(),
    diagramXml: '',
    diagramSvg: '',
  };
}

const isTrueFalseSet = (options: OptionDraft[]) =>
  options.length === 2 && options[0].text === 'True' && options[1].text === 'False';

/** Switch type, reshaping options where the two types disagree about them. */
export function changeType(q: QuestionDraft, type: EditableQuestionType): QuestionDraft {
  let options = q.options;
  if (type === 'TRUE_FALSE' && !isTrueFalseSet(options)) {
    options = trueFalseOptions();
  } else if (q.type === 'TRUE_FALSE' && (type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE')) {
    options = emptyOptions();
  } else if (type === 'SINGLE_CHOICE' && options.filter(o => o.isCorrect).length !== 1) {
    // Single choice allows exactly one key: keep the first one marked (or A).
    const first = Math.max(0, options.findIndex(o => o.isCorrect));
    options = options.map((o, i) => ({ ...o, isCorrect: i === first }));
  }
  return { ...q, type, options };
}

/** Distinct {{n}} markers in the order they appear. */
export function blankIndexes(content: string): number[] {
  const seen: number[] = [];
  for (const m of content.matchAll(/\{\{(\d+)\}\}/g)) {
    const n = Number(m[1]);
    if (!seen.includes(n)) seen.push(n);
  }
  return seen;
}

export const nextBlankIndex = (content: string) => Math.max(0, ...blankIndexes(content)) + 1;

const splitAccepted = (s: string) => s.split(';').map(a => a.trim()).filter(Boolean);

// ---- Validation -----------------------------------------------------------

export interface QuestionErrors {
  /** The selected type can't be saved yet. */
  type?: string;
  content?: string;
  answers?: string;
}

const typeName = (t: EditableQuestionType) => QUESTION_TYPE_OPTIONS.find(o => o.value === t)?.label.replace(/ \(.*\)$/, '') ?? t;

/** Same text once whitespace and case are ignored (QuestionValidator's duplicate check). */
const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const hasDuplicates = (texts: string[]) => new Set(texts.map(normalize)).size !== texts.length;

export function validateDraft(q: QuestionDraft): QuestionErrors {
  const errors: QuestionErrors = {};
  if (q.content.trim() === '') errors.content = 'Question text is required.';
  else if (q.content.trim().length > MAX_CONTENT_LENGTH) errors.content = `Question text can be at most ${MAX_CONTENT_LENGTH.toLocaleString()} characters.`;
  if (UNSAVEABLE_TYPES.includes(q.type)) errors.type = `${typeName(q.type)} questions can't be saved yet — pick another type to save.`;
  else if (q.skillTag.trim().length > MAX_SKILL_TAG_LENGTH) errors.type = `Skill tag can be at most ${MAX_SKILL_TAG_LENGTH} characters.`;

  switch (q.type) {
    case 'SINGLE_CHOICE':
    case 'MULTIPLE_CHOICE': {
      const correct = q.options.filter(o => o.isCorrect).length;
      if (q.options.length < MIN_OPTIONS) errors.answers = `Add at least ${MIN_OPTIONS} answer options.`;
      else if (q.options.length > MAX_OPTIONS) errors.answers = `A question can have at most ${MAX_OPTIONS} options.`;
      else if (q.options.some(o => o.text.trim() === '')) errors.answers = 'Fill in every option or remove the empty ones.';
      else if (hasDuplicates(q.options.map(o => o.text))) errors.answers = 'Options must be different from each other.';
      else if (q.type === 'SINGLE_CHOICE' && correct !== 1) errors.answers = 'Mark exactly one correct answer.';
      else if (q.type === 'MULTIPLE_CHOICE' && correct < 2) errors.answers = 'Mark at least two correct answers — use Single Choice for one.';
      else if (q.type === 'MULTIPLE_CHOICE' && correct === q.options.length) errors.answers = 'Leave at least one option incorrect.';
      break;
    }
    case 'TRUE_FALSE':
      if (q.options.length !== 2 || q.options.filter(o => o.isCorrect).length !== 1) errors.answers = 'Choose whether the statement is true or false.';
      break;
    case 'MATCHING': {
      const filled = q.pairs.filter(p => p.left.trim() || p.right.trim());
      if (filled.length < 2) errors.answers = 'Add at least two matching pairs.';
      else if (filled.some(p => !p.left.trim() || !p.right.trim())) errors.answers = 'Every pair needs both a left and a right item.';
      else if (hasDuplicates(filled.map(p => p.left))) errors.answers = 'Left items must be unique.';
      else if (hasDuplicates(filled.map(p => p.right))) errors.answers = 'Right items must be unique.';
      break;
    }
    case 'FILL_BLANK': {
      const indexes = blankIndexes(q.content);
      if (indexes.length === 0) errors.answers = 'Add at least one blank, e.g. "The capital of France is {{1}}."';
      else {
        const missing = indexes.filter(n => splitAccepted(q.blanks[n]?.accepted ?? '').length === 0);
        if (missing.length) errors.answers = `Enter an accepted answer for blank ${missing.map(n => `{{${n}}}`).join(', ')}.`;
      }
      break;
    }
    case 'ORDERING': {
      const filled = q.ordering.filter(o => o.text.trim());
      if (filled.length < 2) errors.answers = 'Add at least two items to order.';
      else if (filled.length !== q.ordering.length) errors.answers = 'Fill in every item or remove the empty ones.';
      break;
    }
    case 'DIAGRAM':
      if (!hasDiagramContent(q.diagramXml)) errors.answers = 'Draw the model answer diagram.';
      break;
    case 'ESSAY':
      if (q.essayGradingRubric != null) {
        const { error } = rubricTotal(q.essayGradingRubric);
        if (error) errors.answers = error;
      }
      break;
  }
  return errors;
}

/**
 * Checks an ESSAY rubric the way QuestionValidator does and returns its total
 * maxScore — sent as defaultPoints, which the backend requires to match it.
 */
export function rubricTotal(rubric: unknown): { total: number | null; error?: string } {
  const bad = (error: string) => ({ total: null, error: `Grading rubric: ${error}` });
  const criteria = asRecord(rubric)?.criteria;
  if (!Array.isArray(criteria)) return bad('it needs a list of criteria.');
  let total = 0;
  for (const c of criteria) {
    const item = asRecord(c);
    if (!item || typeof item.name !== 'string' || !item.name.trim()) return bad('every criterion needs a name.');
    const max = Number(item.maxScore);
    if (!Number.isFinite(max) || max <= 0) return bad(`"${item.name}" needs a max score above 0.`);
    total += max;
  }
  if (total <= 0) return bad('add at least one criterion.');
  if (total > 1000) return bad('the total score can be at most 1000.');
  return { total };
}

export const isDraftValid = (q: QuestionDraft) => Object.keys(validateDraft(q)).length === 0;

// ---- Mapping to / from the backend ---------------------------------------

function toOptions(q: QuestionDraft): AnswerOption[] {
  if (q.type !== 'SINGLE_CHOICE' && q.type !== 'MULTIPLE_CHOICE' && q.type !== 'TRUE_FALSE') return [];
  return q.options.map((o, i) => ({
    optionId: o.optionId ?? null,
    optionText: o.text.trim(),
    isCorrect: o.isCorrect,
    orderIndex: i,
  }));
}

function toAnswerKey(q: QuestionDraft): MatchingAnswerKey | FillBlankAnswerKey | null {
  if (q.type === 'MATCHING') {
    return {
      pairs: q.pairs
        .filter(p => p.left.trim() && p.right.trim())
        .map(p => ({ left: p.left.trim(), right: p.right.trim() })),
    };
  }
  if (q.type === 'FILL_BLANK') {
    return {
      blanks: blankIndexes(q.content).map(index => ({
        index,
        accepted: splitAccepted(q.blanks[index]?.accepted ?? ''),
        caseSensitive: q.blanks[index]?.caseSensitive ?? false,
      })),
    };
  }
  return null;
}

export function toCreateRequest(q: QuestionDraft, courseId: number, moduleId: number | null): QuestionCreateRequest {
  const metadata = toMetadata(q);
  return {
    courseId,
    moduleId,
    // ORDERING never gets here — validateDraft blocks it.
    questionType: q.type as QuestionType,
    difficulty: q.difficulty,
    content: q.content.trim(),
    options: toOptions(q),
    answerKey: toAnswerKey(q),
    ...(q.explanation.trim() ? { explanation: q.explanation.trim() } : {}),
    ...(Object.keys(metadata).length ? { questionMetadata: metadata } : {}),
    ...toRubric(q),
  };
}

/** ESSAY rubric plus the matching defaultPoints; nothing for other types or without a rubric. */
function toRubric(q: QuestionDraft): Pick<QuestionCreateRequest, 'essayGradingRubric' | 'defaultPoints'> {
  if (q.type !== 'ESSAY' || q.essayGradingRubric == null) return {};
  const { total } = rubricTotal(q.essayGradingRubric);
  return { essayGradingRubric: q.essayGradingRubric, ...(total != null ? { defaultPoints: total } : {}) };
}

/**
 * Only the keys QuestionValidator allows — anything else (an old `title`, AI
 * extras, draw.io XML) would fail the whole request.
 */
function toMetadata(q: QuestionDraft): Record<string, unknown> {
  const allowed: readonly string[] = QUESTION_METADATA_KEYS;
  const kept = Object.fromEntries(Object.entries(q.metadata).filter(([k, v]) => k !== 'skillTag' && v != null && allowed.includes(k)));
  return {
    ...kept,
    ...(q.skillTag.trim() ? { skillTag: q.skillTag.trim() } : {}),
  };
}

export function toUpdateRequest(q: QuestionDraft, moduleId: number | null, extra: Pick<QuestionUpdateRequest, 'status'> = {}): QuestionUpdateRequest {
  return {
    ...extra,
    moduleId,
    groupId: q.groupId,
    explanation: q.explanation.trim(),
    questionMetadata: toMetadata(q),
    questionType: q.type as QuestionType,
    difficulty: q.difficulty,
    content: q.content.trim(),
    // Sending [] for non-choice types tells the backend to drop old options.
    options: toOptions(q),
    answerKey: toAnswerKey(q),
    ...toRubric(q),
    lockVersion: q.lockVersion ?? null,
  };
}

const safeParse = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

export function fromDetail(d: QuestionDetail): QuestionDraft {
  const base = emptyDraft();
  const type = (QUESTION_TYPE_OPTIONS.some(t => t.value === d.questionType) ? d.questionType : 'SINGLE_CHOICE') as EditableQuestionType;
  const options = [...(d.options ?? [])]
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
    .map(o => ({ key: newKey('opt'), optionId: o.optionId, text: o.optionText ?? '', isCorrect: Boolean(o.isCorrect) }));

  const key = asRecord(d.answerKey);
  const metadata = asRecord(typeof d.questionMetadata === 'string' ? safeParse(d.questionMetadata) : d.questionMetadata) ?? {};
  const rawPairs = Array.isArray(key?.pairs) ? (key.pairs as { left?: unknown; right?: unknown }[]) : [];
  const rawBlanks = Array.isArray(key?.blanks) ? (key.blanks as { index?: unknown; accepted?: unknown; caseSensitive?: unknown }[]) : [];

  const blanks: Record<number, BlankDraft> = {};
  rawBlanks.forEach(b => {
    const index = Number(b.index);
    if (!Number.isFinite(index)) return;
    blanks[index] = {
      accepted: Array.isArray(b.accepted) ? b.accepted.map(String).join('; ') : '',
      caseSensitive: Boolean(b.caseSensitive),
    };
  });

  return {
    ...base,
    questionId: d.questionId,
    lockVersion: d.lockVersion,
    skillTag: typeof metadata.skillTag === 'string' ? metadata.skillTag : '',
    explanation: d.aiExplanation ?? '',
    groupId: d.groupId ?? null,
    metadata,
    type,
    difficulty: (d.difficulty as QuestionDifficulty) ?? 'MEDIUM',
    content: d.content ?? '',
    options: options.length ? options : type === 'TRUE_FALSE' ? trueFalseOptions() : base.options,
    pairs: rawPairs.length
      ? rawPairs.map(p => ({ key: newKey('pair'), left: String(p.left ?? ''), right: String(p.right ?? '') }))
      : base.pairs,
    blanks,
    diagramXml: typeof metadata.drawioXml === 'string' ? metadata.drawioXml : '',
    diagramSvg: typeof metadata.drawioSvg === 'string' ? metadata.drawioSvg : '',
    essayGradingRubric: d.essayGradingRubric ?? undefined,
  };
}

/** An AI-03 preview question, accepted into the editor. */
export function fromAiDraft(a: QuestionAiDraft): QuestionDraft {
  const draft = fromDetail({
    questionId: 0,
    courseId: null,
    moduleId: null,
    groupId: null,
    questionType: a.questionType,
    difficulty: a.difficulty,
    content: a.content ?? '',
    questionMetadata: a.questionMetadata ?? {},
    answerKey: a.answerKey ?? null,
    defaultPoints: null,
    source: 'AI',
    creatorRole: '',
    createdBy: null,
    scoringVersion: null,
    lockVersion: null,
    aiExplanation: a.explanation ?? null,
    status: 'ACTIVE',
    approvalStatus: '',
    essayGradingRubric: a.essayGradingRubric ?? null,
    options: (a.options ?? []).map(o => ({ ...o, optionId: null })),
    createdAt: null,
    updatedAt: null,
  });
  const plantUml = typeof draft.metadata.plantUmlSource === 'string' ? draft.metadata.plantUmlSource : '';
  const diagramXml = draft.type === 'DIAGRAM' && !draft.diagramXml && plantUml.trim() ? plantUmlToDrawioXml(plantUml) : draft.diagramXml;
  // The editor can't fix a rubric, and ESSAY saves fine without one — drop a malformed AI rubric.
  const essayGradingRubric = draft.essayGradingRubric != null && rubricTotal(draft.essayGradingRubric).error ? undefined : draft.essayGradingRubric;
  return { ...draft, questionId: undefined, lockVersion: undefined, diagramXml, essayGradingRubric, fromAi: true };
}

/** Shape produced by the (still mocked) PDF import. */
export interface ExtractedQuestion {
  text: string;
  difficulty: string;
  type: string;
  options: { label: string; text: string }[];
  correct: string;
}

export function fromExtracted(x: ExtractedQuestion): QuestionDraft {
  const draft = emptyDraft();
  const difficulty = (x.difficulty.toUpperCase() as QuestionDifficulty) ?? 'MEDIUM';
  const type: EditableQuestionType = x.type === 'essay' ? 'ESSAY' : x.type === 'tf' ? 'TRUE_FALSE' : 'SINGLE_CHOICE';
  const options =
    type === 'TRUE_FALSE'
      ? trueFalseOptions()
      : x.options.map(o => ({ key: newKey('opt'), text: o.text, isCorrect: o.label === x.correct }));
  return { ...draft, type, difficulty: DIFFICULTY_OPTIONS.some(d => d.value === difficulty) ? difficulty : 'MEDIUM', content: x.text, options };
}
