import type { ExamDifficulty, ExamType, PublicExam } from './mockPublicExams';

/**
 * Question fixtures for the exam detail page.
 *
 * IMPORTANT — the one-type-per-exam rule holds here too: objective exams only
 * ever contain objective question types (mcq, true-false, fill-blank, matching,
 * ordering) and essay exams only contain `essay`. `questionsFor()` branches on
 * `exam.examType` so nothing downstream has to re-check it.
 *
 * Content is a deterministic SAMPLE (4-6 items per exam), not the full bank the
 * card advertises — see `sampleSizeFor()`.
 */

export type QuestionType = 'mcq' | 'true-false' | 'fill-blank' | 'matching' | 'ordering' | 'essay';

/** Which question types each exam format is allowed to use. */
export const ALLOWED_TYPES: Record<ExamType, QuestionType[]> = {
  objective: ['mcq', 'true-false', 'fill-blank', 'matching', 'ordering'],
  essay: ['essay'],
};

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  mcq: 'Multiple Choice',
  'true-false': 'True / False',
  'fill-blank': 'Fill in the Blank',
  matching: 'Matching',
  ordering: 'Ordering',
  essay: 'Essay',
};

export const QUESTION_TYPE_OPTIONS = (Object.keys(QUESTION_TYPE_LABEL) as QuestionType[]).map(type => ({
  label: QUESTION_TYPE_LABEL[type],
  value: type,
}));

export interface QuestionGroup {
  id: string;
  title: string;
  /** Shared stimulus every question in the group reads. */
  passage: string;
}

export interface ExamOption {
  label: string;
  text: string;
  /**
   * Marks the correct option. Author-only: the detail page never renders this
   * for students. Note it is still in the client bundle — a real deployment
   * must keep answers server-side.
   */
  isCorrect: boolean;
}

export interface MatchingPair {
  left: string;
  right: string;
}

export interface OrderingItem {
  text: string;
}

export interface ExamQuestion {
  id: string;
  type: QuestionType;
  /** Per-item difficulty, surfaced as a badge on the question header. */
  difficulty: ExamDifficulty;
  points: number;
  text: string;
  /** mcq / true-false / fill-blank */
  options?: ExamOption[];
  /** Accepted response for fill-blank. Author-only. */
  answer?: string;
  /** matching — left/right ends of the pair. */
  pairs?: MatchingPair[];
  /** ordering — array order IS the correct order. Author-only. */
  ordering?: OrderingItem[];
  /** Shared-passage group this question belongs to. */
  groupId?: string;
}

export interface ExamQuestionSet {
  groups: QuestionGroup[];
  questions: ExamQuestion[];
}

/**
 * How many sample items the detail page shows for an exam: 4-6, but never more
 * than the exam actually advertises (a 3-question essay exam yields 3).
 */
export function sampleSizeFor(exam: PublicExam): number {
  return Math.min(exam.questions, exam.questions >= 6 ? 6 : Math.max(4, exam.questions));
}

const PASSAGE = `A production platform team is migrating a monolith to a containerised architecture across two regions.
Traffic peaks at 400 requests per second during the weekly batch window, and the team must complete the migration
with no planned downtime. Compliance requires that every request be encrypted in transit and that all secrets be
rotated without rebuilding images.`;

const MCQ_STEMS = [
  'Which approach best meets the no-downtime requirement during the cutover?',
  'Which configuration keeps secrets rotatable without rebuilding container images?',
  'What is the most appropriate way to absorb the 400 rps peak during the batch window?',
  'Which design keeps the two regions consistent without introducing a split-brain failure mode?',
];

const TF_STEMS = [
  'Requests between the two regions must be encrypted in transit.',
  'Rebuilding every image is required in order to rotate a database password.',
  'A rolling update can complete before any traffic is shifted to the new architecture.',
];

const BLANK_STEMS = [
  'Complete the sentence: secrets are mounted into the container at runtime from ______.',
  'Complete the sentence: the load balancer health check interval is configured to ______ seconds.',
];

const MATCHING_LEFT = ['Rolling update', 'Blue/green deploy', 'Canary release', ' recreate strategy'];
const MATCHING_RIGHT = ['Replace pods in batches', 'Two identical environments, switch traffic', 'Route a small share of traffic first', 'Restart the pod only on failure'];

const ORDERING_ITEMS = ['Provision storage', 'Deploy the application image', 'Run database migrations', 'Warm the cache', 'Shift production traffic'];

const ESSAY_STEMS = [
  'Describe, in detail, the migration plan you would propose and justify each phase.',
  'Explain how you would configure the platform to satisfy the compliance requirements above.',
];

/** Per-item difficulty cycles off the seed so the mix is varied but stable. */
const DIFFICULTIES: ExamDifficulty[] = ['Easy', 'Medium', 'Hard'];

/**
 * Deterministic sample set for an exam. Seeded from the exam id so the same
 * exam always yields the same questions — the fixture must be stable across
 * renders, navigations and reloads.
 */
export function questionsFor(exam: PublicExam): ExamQuestionSet {
  const seed = [...exam.id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const pick = <T,>(items: T[], i: number): T => items[(seed + i) % items.length]!;
  const size = sampleSizeFor(exam);
  const ids = exam.questions;

  if (exam.examType === 'essay') {
    const groups: QuestionGroup[] = [];
    const questions: ExamQuestion[] = Array.from({ length: size }, (_, i) => ({
      id: `${exam.id}-Q${i + 1}`,
      type: 'essay' as const,
      difficulty: DIFFICULTIES[(seed + i) % DIFFICULTIES.length]!,
      points: 20,
      text: `${pick(ESSAY_STEMS, i)} (Question ${i + 1} of ${ids})`,
    }));
    return { groups, questions };
  }

  // Objective — the first two items share a passage, so the group concept is
  // always exercised. The mix then covers every allowed type at least once.
  const groupId = `${exam.id}-G1`;
  const groups: QuestionGroup[] = [{ id: groupId, title: 'Shared scenario', passage: PASSAGE }];
  /** The two opening items read the shared passage. */
  const groupOf = (i: number) => (i < 2 ? { groupId } : {});

  const questions: ExamQuestion[] = [];
  for (let i = 0; i < size; i++) {
    const id = `${exam.id}-Q${i + 1}`;
    const type: QuestionType = (['mcq', 'true-false', 'matching', 'fill-blank', 'ordering'] as QuestionType[])[i] ?? 'mcq';

    if (type === 'mcq') {
      questions.push({
        id, type, difficulty: DIFFICULTIES[(2 + seed + i) % DIFFICULTIES.length]!, points: 2, ...groupOf(i),
        text: `${pick(MCQ_STEMS, i)} (Question ${i + 1} of ${ids})`,
        options: [
          { label: 'A', text: 'Shift traffic gradually and keep both stacks serving until cutover completes', isCorrect: true },
          { label: 'B', text: 'Take the whole platform offline for the duration of the migration', isCorrect: false },
          { label: 'C', text: 'Migrate each service independently with no coordination window', isCorrect: false },
          { label: 'D', text: 'Replicate the monolith to both regions before any change is made', isCorrect: false },
        ],
      });
    } else if (type === 'true-false') {
      questions.push({
        id, type, difficulty: DIFFICULTIES[(1 + seed + i) % DIFFICULTIES.length]!, points: 1, ...groupOf(i),
        text: `${pick(TF_STEMS, i)} True or false. (Question ${i + 1} of ${ids})`,
        options: [
          { label: 'A', text: 'True', isCorrect: true },
          { label: 'B', text: 'False', isCorrect: false },
        ],
      });
    } else if (type === 'matching') {
      questions.push({
        id, type, difficulty: DIFFICULTIES[(4 + seed + i) % DIFFICULTIES.length]!, points: 4, ...groupOf(i),
        text: `Match each deployment strategy to its description. (Question ${i + 1} of ${ids})`,
        pairs: MATCHING_LEFT.map((left, j) => ({ left, right: MATCHING_RIGHT[j]! })),
      });
    } else if (type === 'fill-blank') {
      questions.push({
        id, type, difficulty: DIFFICULTIES[(2 + seed + i) % DIFFICULTIES.length]!, points: 2, ...groupOf(i),
        text: `${pick(BLANK_STEMS, i)} (Question ${i + 1} of ${ids})`,
        options: [
          { label: 'A', text: 'a Kubernetes Secret mounted as an environment variable', isCorrect: true },
          { label: 'B', text: 'a value compiled into the image at build time', isCorrect: false },
          { label: 'C', text: 'a plain-text file committed to the repository', isCorrect: false },
        ],
        answer: 'a Kubernetes Secret mounted as an environment variable',
      });
    } else {
      questions.push({
        id, type, difficulty: DIFFICULTIES[(3 + seed + i) % DIFFICULTIES.length]!, points: 3, ...groupOf(i),
        text: `Put these deployment steps in the correct order. (Question ${i + 1} of ${ids})`,
        ordering: ORDERING_ITEMS.map(text => ({ text })),
      });
    }
  }

  return { groups, questions };
}
