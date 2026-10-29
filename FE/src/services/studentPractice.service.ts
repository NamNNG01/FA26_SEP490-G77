import type { AnswerResponse, AttemptQuestion } from './studentAttempt.service';

/**
 * StudentPracticeService — Material to Quiz Creator: AI drafts questions from an uploaded
 * PDF / DOCX / PPTX, the student edits them, then takes them.
 *
 * The BE has no student endpoint for it yet (docs/notes/student-practice-quiz-be-gaps.md):
 * the questions are demo data. A practice quiz is taken and graded in the browser only —
 * nothing is saved on the BE. (Random practice exams are real: studentPracticeExam.service.ts.)
 */

/**
 * Types of a practice quiz. Every type but ESSAY is graded on the client;
 * ESSAY is not graded (that needs the AI rubric grader) — the review shows a sample answer instead.
 */
export type PracticeQuestionType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'FILL_BLANK' | 'MATCHING' | 'ORDERING' | 'ESSAY';

/** What the grader compares the student's `response` against. */
export interface PracticeAnswerKey {
  correctOptionIds?: number[];
  blanks?: Record<string, string>;
  matches?: { left: string; right: string }[];
  orderedOptionIds?: number[];
  /** ESSAY: shown on the review, not graded. */
  sampleAnswer?: string;
}

export interface PracticeQuestion extends AttemptQuestion {
  questionType: PracticeQuestionType;
  answerKey: PracticeAnswerKey;
  /** Where the question came from: "Course · Module" or the material's name. */
  source: string | null;
  /** Group title from the material creator; null = a single question. */
  groupTitle?: string | null;
}

export interface PracticeQuiz {
  quizId: string;
  title: string;
  origin: 'MATERIAL';
  timeLimitMinutes: number;
  createdAt: string;
  /** Set when the student opens the quiz; the deadline counts from here. */
  startedAt: string | null;
  questions: PracticeQuestion[];
  answers: Record<number, AnswerResponse | null>;
  submittedAt: string | null;
}

/** One question the material creator drafted — edited in the modal, then turned into a PracticeQuestion. */
export type DraftQuestionType = 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'FILL_BLANK' | 'MATCHING' | 'ORDERING';

export interface DraftQuestion {
  key: string;
  type: DraftQuestionType;
  content: string;
  /** MULTIPLE_CHOICE */
  options: { key: string; text: string; correct: boolean }[];
  /** TRUE_FALSE */
  trueFalse: boolean;
  /** FILL_BLANK — answer per {{n}} placeholder. */
  blanks: Record<string, string>;
  /** MATCHING */
  pairs: { key: string; left: string; right: string }[];
  /** ORDERING — in the correct order. */
  items: { key: string; text: string }[];
  /** null = single question (not in a group). */
  groupKey: string | null;
}

export interface DraftGroup {
  key: string;
  title: string;
}

export interface MaterialDraft {
  title: string;
  groups: DraftGroup[];
  questions: DraftQuestion[];
}

export const MATERIAL_ACCEPT = '.pdf,.docx,.pptx';
export const MATERIAL_MAX_BYTES = 10 * 1024 * 1024;
export const PRACTICE_MAX_QUESTIONS = 100;
export const PRACTICE_MAX_MINUTES = 300;

const STORAGE_PREFIX = 'practice-quiz:';
const memoryStore = new Map<string, PracticeQuiz>();

/* ── ids ─────────────────────────────────────────────────────────────────── */

let nextId = 1;
const newId = () => nextId++;
let nextKey = 1;
export const newKey = (prefix = 'k') => `${prefix}${Date.now().toString(36)}${(nextKey++).toString(36)}`;

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const delay = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = window.setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });

/* ── demo question templates ─────────────────────────────────────────────── */

type Template = (topic: string) => DraftQuestion;

const blankDraft = (type: DraftQuestionType): DraftQuestion => ({
  key: newKey('q'),
  type,
  content: '',
  options: [],
  trueFalse: true,
  blanks: {},
  pairs: [],
  items: [],
  groupKey: null,
});

const TEMPLATES: Record<DraftQuestionType, Template[]> = {
  MULTIPLE_CHOICE: [
    topic => ({
      ...blankDraft('MULTIPLE_CHOICE'),
      content: `Which statement best describes the main goal of "${topic}"?`,
      options: [
        { key: newKey('o'), text: 'It defines the core concepts and how they relate to each other.', correct: true },
        { key: newKey('o'), text: 'It only lists vocabulary without any relationships.', correct: false },
        { key: newKey('o'), text: 'It replaces every earlier topic of the course.', correct: false },
        { key: newKey('o'), text: 'It is optional background with no practical use.', correct: false },
      ],
    }),
    topic => ({
      ...blankDraft('MULTIPLE_CHOICE'),
      content: `Which of the following are key ideas covered in "${topic}"? (Select all that apply.)`,
      options: [
        { key: newKey('o'), text: 'Definitions of the main terms', correct: true },
        { key: newKey('o'), text: 'Worked examples applying the concepts', correct: true },
        { key: newKey('o'), text: 'Unrelated marketing material', correct: false },
        { key: newKey('o'), text: 'Random trivia with no link to the topic', correct: false },
      ],
    }),
    topic => ({
      ...blankDraft('MULTIPLE_CHOICE'),
      content: `When applying "${topic}" in practice, what should be done first?`,
      options: [
        { key: newKey('o'), text: 'Understand the requirements and constraints', correct: true },
        { key: newKey('o'), text: 'Skip directly to optimisation', correct: false },
        { key: newKey('o'), text: 'Ignore the documentation', correct: false },
      ],
    }),
  ],
  TRUE_FALSE: [
    topic => ({ ...blankDraft('TRUE_FALSE'), content: `"${topic}" builds on concepts introduced earlier in the course.`, trueFalse: true }),
    topic => ({ ...blankDraft('TRUE_FALSE'), content: `The ideas in "${topic}" can never be combined with other techniques.`, trueFalse: false }),
    topic => ({ ...blankDraft('TRUE_FALSE'), content: `Reviewing worked examples is a useful way to master "${topic}".`, trueFalse: true }),
  ],
  FILL_BLANK: [
    topic => ({
      ...blankDraft('FILL_BLANK'),
      content: `In "${topic}", a clear {{1}} of each term helps you apply it correctly.`,
      blanks: { '1': 'definition' },
    }),
    topic => ({
      ...blankDraft('FILL_BLANK'),
      content: `The first step of studying "${topic}" is to read the {{1}}, then practise with {{2}}.`,
      blanks: { '1': 'theory', '2': 'examples' },
    }),
  ],
  MATCHING: [
    topic => ({
      ...blankDraft('MATCHING'),
      content: `Match each part of "${topic}" with its description.`,
      pairs: [
        { key: newKey('p'), left: 'Concept', right: 'The idea being explained' },
        { key: newKey('p'), left: 'Example', right: 'A concrete case that shows the idea' },
        { key: newKey('p'), left: 'Exercise', right: 'A task to practise the idea' },
      ],
    }),
  ],
  ORDERING: [
    topic => ({
      ...blankDraft('ORDERING'),
      content: `Put the steps for learning "${topic}" in the right order.`,
      items: [
        { key: newKey('i'), text: 'Read the overview' },
        { key: newKey('i'), text: 'Study the key definitions' },
        { key: newKey('i'), text: 'Work through the examples' },
        { key: newKey('i'), text: 'Take a practice quiz' },
      ],
    }),
  ],
};

function demoDraft(type: DraftQuestionType, topic: string): DraftQuestion {
  const list = TEMPLATES[type];
  return list[Math.floor(Math.random() * list.length)](topic);
}

/* ── draft → practice question ───────────────────────────────────────────── */

const BLANK = /\{\{(\d+)\}\}/g;

export function blankIndices(content: string): string[] {
  return [...new Set([...content.matchAll(BLANK)].map(m => m[1]))].sort((a, b) => Number(a) - Number(b));
}

/** Problems that stop a draft from being taken; empty = ready. */
export function validateDraft(q: DraftQuestion): string[] {
  const errors: string[] = [];
  if (!q.content.trim()) errors.push('Question text is required.');
  switch (q.type) {
    case 'MULTIPLE_CHOICE':
      if (q.options.filter(o => o.text.trim()).length < 2) errors.push('Add at least two options.');
      if (q.options.some(o => !o.text.trim())) errors.push('Every option needs text.');
      if (!q.options.some(o => o.correct)) errors.push('Mark at least one correct option.');
      break;
    case 'FILL_BLANK': {
      const ids = blankIndices(q.content);
      if (ids.length === 0) errors.push('Add at least one blank, e.g. {{1}}.');
      if (ids.some(n => !q.blanks[n]?.trim())) errors.push('Every blank needs an answer.');
      break;
    }
    case 'MATCHING':
      if (q.pairs.length < 2) errors.push('Add at least two pairs.');
      if (q.pairs.some(p => !p.left.trim() || !p.right.trim())) errors.push('Every pair needs both sides.');
      if (new Set(q.pairs.map(p => p.left.trim())).size !== q.pairs.length) errors.push('Left items must be different.');
      break;
    case 'ORDERING':
      if (q.items.length < 2) errors.push('Add at least two items.');
      if (q.items.some(i => !i.text.trim())) errors.push('Every item needs text.');
      break;
  }
  return errors;
}

function toPracticeQuestion(q: DraftQuestion, orderIndex: number, source: string | null, groupTitle: string | null): PracticeQuestion {
  const base = {
    questionId: newId(),
    orderIndex,
    content: q.content.trim(),
    options: null,
    matching: null,
    maxPoints: 1,
    answerSpace: null,
    source,
    groupTitle,
  };
  switch (q.type) {
    case 'MULTIPLE_CHOICE': {
      const options = q.options.map(o => ({ optionId: newId(), optionText: o.text.trim(), isCorrectAnswer: null, correct: o.correct }));
      const correct = options.filter(o => o.correct).map(o => o.optionId);
      return {
        ...base,
        questionType: correct.length > 1 ? 'MULTIPLE_CHOICE' : 'SINGLE_CHOICE',
        options: options.map(({ correct: _c, ...o }) => o),
        answerKey: { correctOptionIds: correct },
      };
    }
    case 'TRUE_FALSE': {
      const t = newId();
      const f = newId();
      return {
        ...base,
        questionType: 'TRUE_FALSE',
        options: [
          { optionId: t, optionText: 'True', isCorrectAnswer: null },
          { optionId: f, optionText: 'False', isCorrectAnswer: null },
        ],
        answerKey: { correctOptionIds: [q.trueFalse ? t : f] },
      };
    }
    case 'FILL_BLANK': {
      const blanks: Record<string, string> = {};
      for (const n of blankIndices(q.content)) blanks[n] = q.blanks[n]?.trim() ?? '';
      return { ...base, questionType: 'FILL_BLANK', answerKey: { blanks } };
    }
    case 'MATCHING': {
      const pairs = q.pairs.map(p => ({ left: p.left.trim(), right: p.right.trim() }));
      return {
        ...base,
        questionType: 'MATCHING',
        matching: { lefts: pairs.map(p => p.left), rights: shuffle([...new Set(pairs.map(p => p.right))]) },
        answerKey: { matches: pairs },
      };
    }
    case 'ORDERING': {
      const options = q.items.map(i => ({ optionId: newId(), optionText: i.text.trim(), isCorrectAnswer: null }));
      return { ...base, questionType: 'ORDERING', options: shuffle(options), answerKey: { orderedOptionIds: options.map(o => o.optionId) } };
    }
  }
}

/* ── grading ─────────────────────────────────────────────────────────────── */

const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const sameSet = (a: number[] = [], b: number[] = []) => a.length === b.length && a.every(x => b.includes(x));

/** False for ESSAY: it is not graded. */
export function isPracticeCorrect(q: PracticeQuestion, r: AnswerResponse | null | undefined): boolean {
  if (!r) return false;
  const key = q.answerKey;
  switch (q.questionType) {
    case 'ESSAY':
      return false;
    case 'SINGLE_CHOICE':
    case 'MULTIPLE_CHOICE':
    case 'TRUE_FALSE':
      return sameSet(r.selectedOptionIds, key.correctOptionIds);
    case 'FILL_BLANK':
      return Object.entries(key.blanks ?? {}).every(([n, v]) => norm(r.blanks?.[n]) === norm(v));
    case 'MATCHING': {
      const given = new Map((r.matches ?? []).map(m => [m.left, m.right]));
      return (key.matches ?? []).every(m => given.get(m.left) === m.right);
    }
    case 'ORDERING': {
      const want = key.orderedOptionIds ?? [];
      const got = r.orderedOptionIds ?? [];
      return want.length === got.length && want.every((id, i) => got[i] === id);
    }
  }
}

/* ── storage ─────────────────────────────────────────────────────────────── */

function save(quiz: PracticeQuiz): PracticeQuiz {
  memoryStore.set(quiz.quizId, quiz);
  try {
    sessionStorage.setItem(STORAGE_PREFIX + quiz.quizId, JSON.stringify(quiz));
  } catch {
    // Storage full or blocked: the in-memory copy still works until a reload.
  }
  return quiz;
}

function createQuiz(title: string, origin: PracticeQuiz['origin'], timeLimitMinutes: number, questions: PracticeQuestion[]): PracticeQuiz {
  return save({
    quizId: newKey('pq'),
    title,
    origin,
    timeLimitMinutes,
    createdAt: new Date().toISOString(),
    startedAt: null,
    questions,
    answers: {},
    submittedAt: null,
  });
}

/* ── service ─────────────────────────────────────────────────────────────── */

export const studentPracticeService = {
  /** Material to Quiz Creator — demo: AI drafts from the file name, grouped by question type. */
  async generateFromMaterial(file: File, typeCounts: Partial<Record<DraftQuestionType, number>>, signal?: AbortSignal): Promise<MaterialDraft> {
    await delay(1200, signal);
    const topic = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'the material';
    const groups: DraftGroup[] = [];
    const questions: DraftQuestion[] = [];
    for (const [type, count] of Object.entries(typeCounts) as [DraftQuestionType, number][]) {
      if (!count) continue;
      // Choice questions come grouped (like a reading section); the rest are single questions.
      const group = type === 'MULTIPLE_CHOICE' || type === 'TRUE_FALSE' ? { key: newKey('g'), title: `${DRAFT_TYPE_LABEL[type]} — ${topic}` } : null;
      if (group) groups.push(group);
      for (let i = 0; i < count; i++) questions.push({ ...demoDraft(type, topic), groupKey: group?.key ?? null });
    }
    return { title: `Practice — ${topic}`, groups, questions };
  },

  /** Turns the edited drafts into a quiz to take. Drafts must pass validateDraft. */
  createFromDrafts(draft: MaterialDraft, timeLimitMinutes: number, source: string | null): PracticeQuiz {
    const titles = new Map(draft.groups.map(g => [g.key, g.title.trim() || null]));
    // Questions of a group stay together, in the order the group first appears.
    const order: DraftQuestion[] = [];
    const seen = new Set<string>();
    for (const q of draft.questions) {
      if (!q.groupKey) order.push(q);
      else if (!seen.has(q.groupKey)) {
        seen.add(q.groupKey);
        order.push(...draft.questions.filter(x => x.groupKey === q.groupKey));
      }
    }
    const questions = order.map((q, i) => toPracticeQuestion(q, i, source, q.groupKey ? (titles.get(q.groupKey) ?? null) : null));
    return createQuiz(draft.title.trim() || 'Practice quiz', 'MATERIAL', timeLimitMinutes, questions);
  },

  get(quizId: string): PracticeQuiz | null {
    const cached = memoryStore.get(quizId);
    if (cached) return cached;
    try {
      const raw = sessionStorage.getItem(STORAGE_PREFIX + quizId);
      if (!raw) return null;
      const quiz = JSON.parse(raw) as PracticeQuiz;
      memoryStore.set(quizId, quiz);
      // Ids created after a reload must not collide with the stored ones.
      for (const q of quiz.questions) {
        nextId = Math.max(nextId, q.questionId + 1, ...(q.options ?? []).map(o => o.optionId + 1));
      }
      return quiz;
    } catch {
      return null;
    }
  },

  update(quiz: PracticeQuiz): PracticeQuiz {
    return save(quiz);
  },
};

export const DRAFT_TYPE_LABEL: Record<DraftQuestionType, string> = {
  MULTIPLE_CHOICE: 'Multiple Choice',
  TRUE_FALSE: 'True/False',
  FILL_BLANK: 'Fill in the blank',
  MATCHING: 'Matching',
  ORDERING: 'Ordering',
};

export const DRAFT_TYPES = Object.keys(DRAFT_TYPE_LABEL) as DraftQuestionType[];

/** An empty question of a type, for "switch type" in the editor (keeps text and group). */
export function convertDraft(q: DraftQuestion, type: DraftQuestionType): DraftQuestion {
  const next: DraftQuestion = { ...q, type };
  if (type === 'MULTIPLE_CHOICE' && next.options.length === 0) {
    next.options = [
      { key: newKey('o'), text: '', correct: true },
      { key: newKey('o'), text: '', correct: false },
    ];
  }
  if (type === 'MATCHING' && next.pairs.length === 0) {
    next.pairs = [
      { key: newKey('p'), left: '', right: '' },
      { key: newKey('p'), left: '', right: '' },
    ];
  }
  if (type === 'ORDERING' && next.items.length === 0) {
    next.items = [
      { key: newKey('i'), text: '' },
      { key: newKey('i'), text: '' },
    ];
  }
  return next;
}
