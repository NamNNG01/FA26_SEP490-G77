import type { ExamQuestionPreview } from '@/services/studentAttempt.service';

/**
 * MOCK — stands in for the missing `GET /api/v1/student/exams/{examId}/questions`
 * (see docs/notes/student-exam-question-preview-be-gap.md). Delete once the BE ships it.
 */
const SAMPLES: Omit<ExamQuestionPreview, 'questionId' | 'orderIndex'>[] = [
  {
    questionType: 'SINGLE_CHOICE',
    content: 'Which keyword is used to inherit a class in Java?',
    maxPoints: 1,
    options: [
      { optionId: 1, optionText: 'implements' },
      { optionId: 2, optionText: 'extends' },
      { optionId: 3, optionText: 'inherits' },
      { optionId: 4, optionText: 'super' },
    ],
    matching: null,
  },
  {
    questionType: 'MULTIPLE_CHOICE',
    content: 'Which of the following are primitive types in Java?',
    maxPoints: 2,
    options: [
      { optionId: 1, optionText: 'int' },
      { optionId: 2, optionText: 'String' },
      { optionId: 3, optionText: 'boolean' },
      { optionId: 4, optionText: 'Integer' },
    ],
    matching: null,
  },
  {
    questionType: 'TRUE_FALSE',
    content: 'Java is a statically typed language.',
    maxPoints: 1,
    options: [
      { optionId: 1, optionText: 'True' },
      { optionId: 2, optionText: 'False' },
    ],
    matching: null,
  },
  {
    questionType: 'FILL_BLANK',
    content: 'The entry point of a Java program is the {{1}} method, declared as public static {{2}}.',
    maxPoints: 2,
    options: null,
    matching: null,
  },
  {
    questionType: 'MATCHING',
    content: 'Match each collection with its main property.',
    maxPoints: 3,
    options: null,
    matching: {
      lefts: ['ArrayList', 'HashSet', 'TreeMap'],
      rights: ['Keys kept sorted', 'No duplicate elements', 'Index-based access'],
    },
  },
  {
    questionType: 'ORDERING',
    content: 'Put the stages of compiling and running a Java program in order.',
    maxPoints: 2,
    options: [
      { optionId: 1, optionText: 'Write the .java source file' },
      { optionId: 2, optionText: 'Compile with javac' },
      { optionId: 3, optionText: 'Bytecode (.class) is produced' },
      { optionId: 4, optionText: 'The JVM runs the bytecode' },
    ],
    matching: null,
  },
  {
    questionType: 'ESSAY',
    content: 'Explain the difference between an abstract class and an interface in Java. Give one example of when you would choose each.',
    maxPoints: 5,
    options: null,
    matching: null,
  },
  {
    questionType: 'CODE',
    content: 'Write a method `int sum(int[] values)` that returns the sum of every element of the array.',
    maxPoints: 4,
    options: null,
    matching: null,
  },
];

export function mockExamQuestions(count: number): ExamQuestionPreview[] {
  const n = Math.max(0, count);
  return Array.from({ length: n }, (_, i) => ({
    ...SAMPLES[i % SAMPLES.length],
    questionId: i + 1,
    orderIndex: i + 1,
  }));
}
