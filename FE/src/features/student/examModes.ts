/**
 * How the take-exam and result screens treat an attempt, read from the exam's `mode` in the DB
 * (`examMode` of SA-01 / SA-02 / SA-05). There are two kinds:
 *  - EXAM (course exam, contest): runs against the clock; the answers are only scored after submitting.
 *  - PRACTICE (an exam the student made: random, AI, material quiz): untimed by default; every answer is
 *    checked at once (key + explanation, the question locks). Its home is Exam History, not an exam page.
 * Either way the result shows right / wrong, the key and the explanations once submitted.
 *
 * A self-made exam can also be taken as an EXAM (timer, no instant check): the student picks it when
 * starting (TakeModeModal), see `takeExamBehavior`.
 *
 * A new DB mode is one line in EXAM_MODES. A mode missing from it is treated as EXAM, so a paper
 * never shows its answers early.
 */
export type ExamKind = 'EXAM' | 'PRACTICE';

export interface ExamModeBehavior {
  kind: ExamKind;
  /** Timer shown and auto-submitted at the deadline. */
  timed: boolean;
  /** Each answer is checked right away: correct answer and explanation show, the question locks. */
  instantCheck: boolean;
  /** Exam History filter (`?type=`) the paper is listed under; null for the unfiltered list. */
  historyType: string | null;
}

const EXAM: ExamModeBehavior = { kind: 'EXAM', timed: true, instantCheck: false, historyType: null };
const PRACTICE: ExamModeBehavior = { kind: 'PRACTICE', timed: false, instantCheck: true, historyType: 'PRACTICE' };

export const EXAM_MODES: Readonly<Record<string, ExamModeBehavior>> = {
  EXAM,
  CONTEST: EXAM,
  PRACTICE,
  PRACTICE_EXAM: PRACTICE,
  SMART_PRACTICE: PRACTICE,
  MATERIAL_QUIZ: PRACTICE,
};

const warned = new Set<string>();

export function examModeBehavior(mode: string | null | undefined): ExamModeBehavior {
  const behavior = mode ? EXAM_MODES[mode] : undefined;
  if (behavior) return behavior;
  if (mode && !warned.has(mode)) {
    warned.add(mode);
    console.warn(`Exam mode "${mode}" is not in EXAM_MODES (features/student/examModes.ts); treated as EXAM.`);
  }
  return EXAM;
}

/** How the student chose to take a self-made exam. */
export type TakeAs = 'EXAM' | 'PRACTICE';

/**
 * Self-made exams offer the Exam / Practice choice; a course exam or contest is always an exam.
 * PRACTICE (notebook review) is one too, and is what attempts of PQ-01 exams made before V75 still carry.
 */
export const SELF_MADE_MODES: ReadonlySet<string> = new Set(['PRACTICE', 'PRACTICE_EXAM', 'SMART_PRACTICE', 'MATERIAL_QUIZ']);

export const canChooseTakeMode = (mode: string | null | undefined) => mode != null && SELF_MADE_MODES.has(mode);

/** `?as=` of the take-exam URL. */
export const parseTakeAs = (value: string | null | undefined): TakeAs | null =>
  value === 'exam' ? 'EXAM' : value === 'practice' ? 'PRACTICE' : null;

const TAKE_AS_PREFIX = 'take-as:';

/**
 * The choice is the FE's only (SA-01 has no mode yet: docs/notes), so it is kept per attempt here and a
 * reload or a resume keeps it. Lost with the browser storage: the attempt then falls back to its DB mode.
 */
export function rememberTakeAs(attemptId: number, takeAs: TakeAs) {
  try {
    localStorage.setItem(TAKE_AS_PREFIX + attemptId, takeAs);
  } catch {
    // Storage blocked: the choice holds until a reload.
  }
}

export function takeAsOf(attemptId: number): TakeAs | null {
  try {
    return parseTakeAs(localStorage.getItem(TAKE_AS_PREFIX + attemptId)?.toLowerCase());
  } catch {
    return null;
  }
}

export function forgetTakeAs(attemptId: number) {
  try {
    localStorage.removeItem(TAKE_AS_PREFIX + attemptId);
  } catch {
    // Storage blocked: nothing was stored.
  }
}

/**
 * The take screen's behaviour: the DB mode's, except a self-made exam taken as an EXAM runs on the clock
 * without instant check. It keeps its PRACTICE kind, so leaving it still leads to Exam History.
 */
export function takeExamBehavior(mode: string | null | undefined, takeAs: TakeAs | null): ExamModeBehavior {
  const behavior = examModeBehavior(mode);
  if (takeAs === 'EXAM' && canChooseTakeMode(mode)) return { ...behavior, timed: true, instantCheck: false };
  return behavior;
}
