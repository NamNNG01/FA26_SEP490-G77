import { QUESTION_METADATA_KEYS } from '@/services/question.service';
import type {
  AnswerOption,
  FillBlankAnswerKey,
  ImportBlock,
  ImportedQuestionData,
  MatchingAnswerKey,
  OrderingAnswerKey,
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
 * Types the editor offers — all the ones QuestionValidator accepts. DIAGRAM
 * sends its draw.io XML in questionMetadata.drawioXml; ORDERING sends keyed
 * options plus answerKey.correctOrder. CODE has no editor yet.
 */
export type EditableQuestionType = Exclude<QuestionType, 'CODE'>;

export const QUESTION_TYPE_OPTIONS: { label: string; value: EditableQuestionType }[] = [
  { label: 'Single Choice', value: 'SINGLE_CHOICE' },
  { label: 'Multiple Choice', value: 'MULTIPLE_CHOICE' },
  { label: 'True / False', value: 'TRUE_FALSE' },
  { label: 'Matching', value: 'MATCHING' },
  { label: 'Fill in the Blank', value: 'FILL_BLANK' },
  { label: 'Ordering', value: 'ORDERING' },
  { label: 'Essay', value: 'ESSAY' },
  { label: 'Diagram', value: 'DIAGRAM' },
];

/** Types the AI can draft (ExamAiServiceImpl.TYPES) — AI-01 doesn't draft ORDERING yet. */
export const AI_QUESTION_TYPE_OPTIONS = QUESTION_TYPE_OPTIONS.filter(t => t.value !== 'ORDERING') as { label: string; value: QuestionType }[];

/**
 * A question group holds exactly one kind (QuestionTypeUtil): every choice /
 * blank / matching / ordering type is a QUIZ, the others are their own kind.
 */
export type GroupKind = 'QUIZ' | 'ESSAY' | 'CODE' | 'DIAGRAM';

const QUIZ_TYPES: QuestionType[] = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'MATCHING', 'FILL_BLANK', 'ORDERING'];

export const GROUP_KIND_LABELS: Record<GroupKind, string> = { QUIZ: 'Quiz', ESSAY: 'Essay', CODE: 'Code', DIAGRAM: 'Diagram' };

/** Kinds a new group can be created with — CODE has no question editor yet. */
export const GROUP_KIND_OPTIONS: { label: string; value: GroupKind; hint: string }[] = [
  { label: 'Quiz', value: 'QUIZ', hint: 'Single choice, multiple choice, true/false, matching, fill in the blank, ordering' },
  { label: 'Essay', value: 'ESSAY', hint: 'Written answers graded by a rubric' },
  { label: 'Diagram', value: 'DIAGRAM', hint: 'Diagram answers graded by a rubric' },
];

export function kindOf(type: string | null | undefined): GroupKind | null {
  if (!type) return null;
  if (QUIZ_TYPES.includes(type as QuestionType)) return 'QUIZ';
  return type === 'ESSAY' || type === 'CODE' || type === 'DIAGRAM' ? type : null;
}

export const asGroupKind = (v: string | null | undefined): GroupKind | null =>
  v === 'QUIZ' || v === 'ESSAY' || v === 'CODE' || v === 'DIAGRAM' ? v : null;

/** The editor's types a group of `kind` accepts (all of them when the kind is not set). */
export const typesOfKind = (kind: GroupKind | null): EditableQuestionType[] =>
  QUESTION_TYPE_OPTIONS.map(o => o.value).filter(t => !kind || kindOf(t) === kind);

/** QuestionValidator's drawioXml limit (500 KB, counted in UTF-8 bytes). */
export const MAX_DRAWIO_XML_BYTES = 512000;

/** Types graded by a rubric whose total is sent as defaultPoints (E-11: DIAGRAM like ESSAY). */
export const RUBRIC_TYPES: EditableQuestionType[] = ['ESSAY', 'DIAGRAM'];

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
  /** Also sent as the option `key` that correctOrder refers to. */
  key: string;
  optionId?: number | null;
  text: string;
}

/** One ESSAY rubric criterion. Weight is a positive numeric allocation. */
export interface RubricCriterionDraft {
  key: string;
  name: string;
  weight: string;
  /** What earns the points — guidance for graders (and AI grading). */
  descriptors: string;
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
  /** ESSAY / DIAGRAM grading rubric; empty = no rubric. */
  rubric: RubricCriterionDraft[];
  rubricNotes: string;
  /** Drafted by AI-03 and accepted into the form. */
  fromAi?: boolean;
  /** A Q-09 import block the backend couldn't read — shown on the question until dismissed. */
  importIssue?: ImportIssue;
}

export interface ImportIssue {
  /** Block number in the file (1-based). */
  block: number;
  /** Line the block starts at (0 = unknown). */
  line: number;
  errors: { line: number; message: string }[];
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

export const emptyCriterion = (): RubricCriterionDraft => ({ key: newKey('crit'), name: '', weight: '', descriptors: '' });

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
    rubric: [],
    rubricNotes: '',
  };
}

/**
 * A new, unsaved copy of a question (Duplicate): fresh keys everywhere, and no
 * saved ids, so it is created as a question of its own.
 */
export function copyDraft(q: QuestionDraft): QuestionDraft {
  return {
    ...q,
    key: newKey('q'),
    questionId: undefined,
    lockVersion: undefined,
    fromAi: undefined,
    importIssue: undefined,
    metadata: { ...q.metadata },
    options: q.options.map(o => ({ ...o, key: newKey('opt'), optionId: undefined })),
    pairs: q.pairs.map(p => ({ ...p, key: newKey('pair') })),
    blanks: Object.fromEntries(Object.entries(q.blanks).map(([n, b]) => [n, { ...b }])),
    ordering: q.ordering.map(o => ({ ...o, key: newKey('ord'), optionId: undefined })),
    rubric: q.rubric.map(c => ({ ...c, key: newKey('crit') })),
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
  // A new essay / diagram starts with one criterion to fill in; removing it saves the question without a rubric.
  const startsRubric = RUBRIC_TYPES.includes(type) && !RUBRIC_TYPES.includes(q.type) && q.rubric.length === 0 && !q.rubricNotes;
  const rubric = startsRubric ? [emptyCriterion()] : q.rubric;
  return { ...q, type, options, rubric };
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
  /** Shown under the type / skill tag row. */
  type?: string;
  content?: string;
  answers?: string;
}

/** Same text once whitespace and case are ignored (QuestionValidator's duplicate check). */
const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const hasDuplicates = (texts: string[]) => new Set(texts.map(normalize)).size !== texts.length;

export function validateDraft(q: QuestionDraft): QuestionErrors {
  const errors: QuestionErrors = {};
  if (q.content.trim() === '') errors.content = 'Question text is required.';
  else if (q.content.trim().length > MAX_CONTENT_LENGTH) errors.content = `Question text can be at most ${MAX_CONTENT_LENGTH.toLocaleString()} characters.`;
  if (q.skillTag.trim().length > MAX_SKILL_TAG_LENGTH) errors.type = `Skill tag can be at most ${MAX_SKILL_TAG_LENGTH} characters.`;

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
      if (filled.length < MIN_OPTIONS) errors.answers = `Add at least ${MIN_OPTIONS} items to order.`;
      else if (q.ordering.length > MAX_OPTIONS) errors.answers = `A question can have at most ${MAX_OPTIONS} items.`;
      else if (filled.length !== q.ordering.length) errors.answers = 'Fill in every item or remove the empty ones.';
      else if (hasDuplicates(filled.map(o => o.text))) errors.answers = 'Items must be different from each other.';
      break;
    }
    case 'DIAGRAM': {
      const xml = q.diagramXml.trim();
      const { error } = rubricTotal(q.rubric);
      if (!hasDiagramContent(xml)) errors.answers = 'Draw the model answer diagram.';
      else if (!/^<(mxfile|mxGraphModel)\b/i.test(xml)) errors.answers = 'The diagram isn’t valid draw.io XML — open it in draw.io and save again.';
      else if (new TextEncoder().encode(xml).length > MAX_DRAWIO_XML_BYTES) errors.answers = 'The diagram is too large (max 500 KB) — simplify it or remove embedded images.';
      else if (error) errors.answers = error;
      break;
    }
    case 'ESSAY': {
      const { error } = rubricTotal(q.rubric);
      if (error) errors.answers = error;
      break;
    }
  }
  return errors;
}

/**
 * Checks the ESSAY rubric the way QuestionValidator does. Criterion weights
 * are independent values and do not need to total 100.
 * No criteria means no rubric, which is allowed.
 */
export function rubricTotal(rubric: RubricCriterionDraft[]): { total: number | null; error?: string } {
  if (rubric.length === 0) return { total: null };
  const bad = (error: string) => ({ total: null, error: `Grading rubric: ${error}` });
  let total = 0;
  for (const [i, c] of rubric.entries()) {
    if (!c.name.trim()) return bad(`criterion ${i + 1} needs a name.`);
    const weight = Number(c.weight);
    if (c.weight.trim() === '' || !Number.isFinite(weight) || weight <= 0) return bad(`"${c.name.trim()}" needs a weight above 0.`);
    total += weight;
  }
  return { total };
}

export const isDraftValid = (q: QuestionDraft) => Object.keys(validateDraft(q)).length === 0;

// ---- Mapping to / from the backend ---------------------------------------

function toOptions(q: QuestionDraft): AnswerOption[] {
  // Items in their correct order; no isCorrect — the validator rejects one on ORDERING options.
  if (q.type === 'ORDERING') {
    return q.ordering.map((o, i) => ({
      optionId: o.optionId ?? null,
      key: o.key,
      optionText: o.text.trim(),
      orderIndex: i,
    }));
  }
  if (q.type !== 'SINGLE_CHOICE' && q.type !== 'MULTIPLE_CHOICE' && q.type !== 'TRUE_FALSE') return [];
  return q.options.map((o, i) => ({
    optionId: o.optionId ?? null,
    optionText: o.text.trim(),
    isCorrect: o.isCorrect,
    orderIndex: i,
  }));
}

function toAnswerKey(q: QuestionDraft): MatchingAnswerKey | FillBlankAnswerKey | OrderingAnswerKey | null {
  // In answerKey rather than top-level correctOrder: Q-05 only validates it there.
  if (q.type === 'ORDERING') return { correctOrder: q.ordering.map(o => o.key) };
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
    questionType: q.type,
    difficulty: q.difficulty,
    content: q.content.trim(),
    options: toOptions(q),
    answerKey: toAnswerKey(q),
    ...(q.explanation.trim() ? { explanation: q.explanation.trim() } : {}),
    ...(Object.keys(metadata).length ? { questionMetadata: metadata } : {}),
    ...toRubric(q),
  };
}

/**
 * ESSAY / DIAGRAM rubric plus the matching defaultPoints; nothing for other
 * types or without criteria. Same shape as the exam (E-08) rubric: criteria, totalPoints, notes.
 */
function toRubric(q: QuestionDraft): Pick<QuestionCreateRequest, 'essayGradingRubric'> {
  if (!RUBRIC_TYPES.includes(q.type)) return {};
  const { total } = rubricTotal(q.rubric);
  if (total == null) return {};
  const criteria = q.rubric.map(c => ({
    name: c.name.trim(),
    weight: Number(c.weight),
    ...(c.descriptors.trim() ? { descriptors: c.descriptors.trim() } : {}),
  }));
  const notes = q.rubricNotes.trim();
  return { essayGradingRubric: { criteria, ...(notes ? { notes } : {}) } };
}

/** A stored or AI-drafted rubric (object or JSON string) → editor rows. Plain text becomes the notes. */
function fromRubric(raw: unknown): Pick<QuestionDraft, 'rubric' | 'rubricNotes'> {
  const parsed = typeof raw === 'string' ? (safeParse(raw) ?? raw) : raw;
  if (typeof parsed === 'string') return { rubric: [], rubricNotes: parsed.trim() };
  const record = asRecord(parsed);
  const criteria = Array.isArray(record?.criteria) ? record.criteria : [];
  const rubric = criteria.flatMap(item => {
    const c = asRecord(item);
    if (!c) return [];
    return [{
      key: newKey('crit'),
      name: text(c.name),
      weight: c.weight != null && c.weight !== '' ? String(c.weight) : c.maxScore != null && c.maxScore !== '' ? String(c.maxScore) : '',
      descriptors: text(c.descriptors) || text(c.description),
    }];
  });
  return { rubric, rubricNotes: text(record?.notes) };
}

/**
 * Only the keys QuestionValidator allows — anything else (an old `title`, AI
 * extras like plantUmlSource) would fail the whole request. A DIAGRAM also
 * sends its draw.io XML; the validator rejects the SVG snapshot, so it stays local.
 */
function toMetadata(q: QuestionDraft): Record<string, unknown> {
  const allowed: readonly string[] = QUESTION_METADATA_KEYS;
  const kept = Object.fromEntries(Object.entries(q.metadata).filter(([k, v]) => k !== 'skillTag' && v != null && allowed.includes(k)));
  return {
    ...kept,
    ...(q.skillTag.trim() ? { skillTag: q.skillTag.trim() } : {}),
    ...(q.type === 'DIAGRAM' ? { drawioXml: q.diagramXml } : {}),
  };
}

export function toUpdateRequest(q: QuestionDraft, moduleId: number | null, extra: Pick<QuestionUpdateRequest, 'status'> = {}): QuestionUpdateRequest {
  return {
    ...extra,
    moduleId,
    groupId: q.groupId,
    explanation: q.explanation.trim(),
    questionMetadata: toMetadata(q),
    questionType: q.type,
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

const text = (v: unknown) => (typeof v === 'string' ? v : '');

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

  // ORDERING: correctOrder lists optionIds once saved (option keys in an AI draft); else trust orderIndex.
  const rawOrder = Array.isArray(key?.correctOrder) ? key.correctOrder.map(String) : [];
  const rank = (o: AnswerOption, i: number) => {
    const at = rawOrder.indexOf(String(o.optionId ?? o.key ?? ''));
    return at >= 0 ? at : rawOrder.length + (o.orderIndex ?? i);
  };
  const ordering = type === 'ORDERING'
    ? (d.options ?? [])
        .map((o, i) => ({ o, r: rank(o, i) }))
        .sort((a, b) => a.r - b.r)
        .map(({ o }) => ({ key: newKey('ord'), optionId: o.optionId ?? null, text: o.optionText ?? '' }))
    : [];

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
    ordering: ordering.length ? ordering : base.ordering,
    diagramXml: typeof metadata.drawioXml === 'string' ? metadata.drawioXml : '',
    diagramSvg: typeof metadata.drawioSvg === 'string' ? metadata.drawioSvg : '',
    ...fromRubric(d.essayGradingRubric),
  };
}

/** A previewed question (AI-03 draft or Q-09 import block) → editor draft. */
function fromPreviewed(a: QuestionAiDraft): QuestionDraft {
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
  return { ...draft, questionId: undefined, lockVersion: undefined };
}

/** An AI-03 preview question, accepted into the editor. */
export function fromAiDraft(a: QuestionAiDraft): QuestionDraft {
  const draft = fromPreviewed(a);
  const plantUml = typeof draft.metadata.plantUmlSource === 'string' ? draft.metadata.plantUmlSource : '';
  const diagramXml = draft.type === 'DIAGRAM' && !draft.diagramXml && plantUml.trim() ? plantUmlToDrawioXml(plantUml) : draft.diagramXml;
  return { ...draft, diagramXml, fromAi: true };
}

/**
 * A valid Q-09 import block, added to the form. ORDERING sends the option keys
 * in a top-level `correctOrder`; fromDetail reads them from answerKey.
 */
export function fromImported(q: ImportedQuestionData): QuestionDraft {
  const key = asRecord(q.answerKey);
  const answerKey = q.questionType === 'ORDERING' && Array.isArray(q.correctOrder) && !key?.correctOrder
    ? { ...key, correctOrder: q.correctOrder }
    : q.answerKey;
  return fromPreviewed({ ...q, answerKey });
}

/**
 * Any Q-09 import block → editor draft. The backend sends no question data for
 * a block with errors, so that one becomes a blank question of its type
 * carrying the errors, for the manager to fill in or remove.
 */
export function fromImportBlock(b: ImportBlock, difficulty: QuestionDifficulty): QuestionDraft {
  if (!b.errors?.length && b.questionData) return fromImported(b.questionData);
  const type = QUESTION_TYPE_OPTIONS.find(o => o.value === b.questionType)?.value;
  const blank = { ...emptyDraft(), difficulty };
  return {
    ...(type ? changeType(blank, type) : blank),
    importIssue: {
      block: b.index,
      line: b.startLine,
      errors: b.errors?.length
        ? b.errors.map(e => ({ line: e.line, message: e.message }))
        : [{ line: 0, message: 'This block could not be read.' }],
    },
  };
}
