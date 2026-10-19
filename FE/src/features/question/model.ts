import type {
  AnswerOption,
  FillBlankAnswerKey,
  MatchingAnswerKey,
  QuestionCreateRequest,
  QuestionDetail,
  QuestionDifficulty,
  QuestionType,
  QuestionUpdateRequest,
} from '@/services/question.service';

/**
 * Editor-side model for one question. It keeps every type's fields side by
 * side so switching the Type dropdown back and forth doesn't lose input; only
 * the fields of the selected type are validated and sent to the backend.
 */

/**
 * Types the editor offers. The backend accepts all but ORDERING today
 * (QuestionValidator rejects CODE / DIAGRAM, the CHECK constraint has no
 * ORDERING) — ORDERING is authored in the UI but cannot be saved yet.
 */
export type EditableQuestionType = Exclude<QuestionType, 'CODE' | 'DIAGRAM'> | 'ORDERING';

/** Types the editor shows but the backend can't store yet. */
export const UNSAVEABLE_TYPES: EditableQuestionType[] = ['ORDERING'];

export const QUESTION_TYPE_OPTIONS: { label: string; value: EditableQuestionType }[] = [
  { label: 'Single Choice', value: 'SINGLE_CHOICE' },
  { label: 'Multiple Choice', value: 'MULTIPLE_CHOICE' },
  { label: 'True / False', value: 'TRUE_FALSE' },
  { label: 'Matching', value: 'MATCHING' },
  { label: 'Fill in the Blank', value: 'FILL_BLANK' },
  { label: 'Essay', value: 'ESSAY' },
  { label: 'Ordering (coming soon)', value: 'ORDERING' },
];

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
  /** Kept in questionMetadata.title — the backend has no title column. */
  title: string;
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
    title: '',
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

export function validateDraft(q: QuestionDraft): QuestionErrors {
  const errors: QuestionErrors = {};
  if (q.content.trim() === '') errors.content = 'Question text is required.';
  if (UNSAVEABLE_TYPES.includes(q.type)) errors.type = "Ordering questions can't be saved yet — pick another type to save.";

  switch (q.type) {
    case 'SINGLE_CHOICE':
    case 'MULTIPLE_CHOICE': {
      if (q.options.length < 2) errors.answers = 'Add at least two answer options.';
      else if (q.options.some(o => o.text.trim() === '')) errors.answers = 'Fill in every option or remove the empty ones.';
      else if (new Set(q.options.map(o => o.text.trim().toLowerCase())).size !== q.options.length) errors.answers = 'Options must be different from each other.';
      else if (!q.options.some(o => o.isCorrect)) errors.answers = 'Mark at least one correct answer.';
      break;
    }
    case 'TRUE_FALSE':
      if (!q.options.some(o => o.isCorrect)) errors.answers = 'Choose whether the statement is true or false.';
      break;
    case 'MATCHING': {
      const filled = q.pairs.filter(p => p.left.trim() || p.right.trim());
      if (filled.length < 2) errors.answers = 'Add at least two matching pairs.';
      else if (filled.some(p => !p.left.trim() || !p.right.trim())) errors.answers = 'Every pair needs both a left and a right item.';
      else if (new Set(filled.map(p => p.left.trim().toLowerCase())).size !== filled.length) errors.answers = 'Left items must be unique.';
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
    case 'ESSAY':
      break;
  }
  return errors;
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
  return {
    courseId,
    moduleId,
    // ORDERING never gets here — validateDraft blocks it.
    questionType: q.type as QuestionType,
    difficulty: q.difficulty,
    content: q.content.trim(),
    options: toOptions(q),
    answerKey: toAnswerKey(q),
  };
}

function toMetadata(q: QuestionDraft): Record<string, unknown> {
  const { title: _t, skillTag: _s, ...rest } = q.metadata;
  return {
    ...rest,
    ...(q.title.trim() ? { title: q.title.trim() } : {}),
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
    title: typeof metadata.title === 'string' ? metadata.title : '',
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
  };
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
