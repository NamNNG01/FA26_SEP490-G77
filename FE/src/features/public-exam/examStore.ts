import { useCallback, useMemo, useRef, useState } from 'react';
import {
  PUBLIC_EXAMS,
  courseMeta,
  type ExamDifficulty,
  type ExamStatus,
  type ExamType,
  type PublicExam,
} from './mockPublicExams';
import { questionsFor, type ExamQuestion, type QuestionGroup } from './mockExamQuestions';

/**
 * Exam editor state — the single source of truth for the detail page.
 *
 * There is no backend for this fixture, so "Save" writes into module-level
 * stores that outlive the component: navigating to the list and back shows the
 * edit. This mirrors the pattern already used in features/admin/mockUsers.ts
 * (setUserStatus mutates MOCK_USERS in place; getUserListState returns a module
 * singleton).
 */

export interface ExamEditorState {
  /** The editable subset of PublicExam. Score is deliberately not editable. */
  title: string;
  course: string;
  module: string;
  duration: number;
  examType: ExamType;
  difficulty: ExamDifficulty;
  status: ExamStatus;
  groups: QuestionGroup[];
  questions: ExamQuestion[];
}

/** Committed overrides, keyed by exam id. Absent = fall back to the fixture. */
const examOverrides = new Map<string, ExamEditorState>();

function toEditorState(exam: PublicExam): ExamEditorState {
  const { groups, questions } = questionsFor(exam);
  return {
    title: exam.title,
    course: exam.course,
    module: exam.module,
    duration: exam.duration,
    examType: exam.examType,
    difficulty: exam.difficulty,
    status: exam.status,
    groups,
    questions,
  };
}

/** Committed state for an exam — the saved value if there is one, else the fixture. */
export function getCommittedExam(id: string): ExamEditorState | undefined {
  const exam = PUBLIC_EXAMS.find(e => e.id === id);
  if (!exam) return undefined;
  return examOverrides.get(id) ?? toEditorState(exam);
}

/** Write a draft through to the shared fixture so the list page reflects it. */
export function commitExam(id: string, draft: ExamEditorState): void {
  const exam = PUBLIC_EXAMS.find(e => e.id === id);
  if (!exam) return;
  exam.title = draft.title;
  exam.course = draft.course;
  exam.module = draft.module;
  exam.duration = draft.duration;
  exam.examType = draft.examType;
  exam.difficulty = draft.difficulty;
  exam.status = draft.status;
  examOverrides.set(id, draft);
}

/** Drop the override so the exam falls back to the original fixture. */
export function resetCommittedExam(id: string): void {
  examOverrides.delete(id);
}

let questionCounter = 0;
/** Fresh id for a newly added question — unique per session, never reused. */
function nextQuestionId(examId: string): string {
  questionCounter += 1;
  return `${examId}-NEW${questionCounter}`;
}

export interface UseExamEditorResult {
  draft: ExamEditorState;
  /** True when the draft differs from the last committed value. */
  dirty: boolean;
  setField: <K extends keyof ExamEditorState>(key: K, value: ExamEditorState[K]) => void;
  setGroup: (groupId: string, patch: Partial<QuestionGroup>) => void;
  setQuestion: (questionId: string, patch: Partial<ExamQuestion>) => void;
  addQuestion: () => void;
  removeQuestion: (questionId: string) => void;
  moveQuestion: (questionId: string, direction: -1 | 1) => void;
  save: () => void;
  cancel: () => void;
}

/**
 * Draft state for one exam. `readOnly` mirrors the caller's permission flag:
 * when true every setter becomes a no-op, so the same component can be handed
 * to a student safely rather than relying on each call site to check the role.
 */
export function useExamEditor(examId: string, readOnly: boolean): UseExamEditorResult {
  const committed = useMemo(() => getCommittedExam(examId), [examId]);
  const committedRef = useRef(committed);

  const [draft, setDraft] = useState<ExamEditorState | undefined>(committed);
  const [dirty, setDirty] = useState(false);

  const mutate = useCallback(
    (fn: (prev: ExamEditorState) => ExamEditorState) => {
      if (readOnly) return;
      setDraft(prev => (prev ? fn(prev) : prev));
      setDirty(true);
    },
    [readOnly],
  );

  const setField: UseExamEditorResult['setField'] = useCallback(
    (key, value) =>
      mutate(prev => {
        // Changing course re-scopes the module list; keep the two consistent.
        if (key === 'course' && value !== prev.course) {
          const modules = courseMeta(value as string).modules;
          return {
            ...prev,
            course: value as string,
            module: modules.includes(prev.module) ? prev.module : (modules[0] ?? 'General'),
          };
        }
        return { ...prev, [key]: value };
      }),
    [mutate],
  );

  const setGroup = useCallback<UseExamEditorResult['setGroup']>(
    (groupId, patch) =>
      mutate(prev => ({
        ...prev,
        groups: prev.groups.map(g => (g.id === groupId ? { ...g, ...patch } : g)),
      })),
    [mutate],
  );

  const setQuestion = useCallback<UseExamEditorResult['setQuestion']>(
    (questionId, patch) =>
      mutate(prev => ({
        ...prev,
        questions: prev.questions.map(q => (q.id === questionId ? { ...q, ...patch } : q)),
      })),
    [mutate],
  );

  const addQuestion = useCallback(
    () =>
      mutate(prev => {
        const type = prev.examType === 'essay' ? 'essay' : 'mcq';
        return {
          ...prev,
          questions: [
            ...prev.questions,
            {
              id: nextQuestionId(examId),
              type,
              difficulty: 'Medium',
              points: 2,
              text: '',
              options:
                type === 'mcq'
                  ? [
                      { label: 'A', text: '', isCorrect: true },
                      { label: 'B', text: '', isCorrect: false },
                      { label: 'C', text: '', isCorrect: false },
                      { label: 'D', text: '', isCorrect: false },
                    ]
                  : undefined,
            },
          ],
        };
      }),
    [mutate, examId],
  );

  const removeQuestion = useCallback<UseExamEditorResult['removeQuestion']>(
    questionId =>
      mutate(prev => ({ ...prev, questions: prev.questions.filter(q => q.id !== questionId) })),
    [mutate],
  );

  const moveQuestion = useCallback<UseExamEditorResult['moveQuestion']>(
    (questionId, direction) =>
      mutate(prev => {
        const index = prev.questions.findIndex(q => q.id === questionId);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= prev.questions.length) return prev;
        const next = [...prev.questions];
        const [row] = next.splice(index, 1);
        next.splice(target, 0, row!);
        return { ...prev, questions: next };
      }),
    [mutate],
  );

  const save = useCallback(() => {
    if (readOnly || !draft) return;
    commitExam(examId, draft);
    committedRef.current = draft;
    setDirty(false);
  }, [draft, examId, readOnly]);

  const cancel = useCallback(() => {
    if (readOnly) return;
    setDraft(committedRef.current);
    setDirty(false);
  }, [readOnly]);

  return {
    draft: draft ?? committed!,
    dirty,
    setField,
    setGroup,
    setQuestion,
    addQuestion,
    removeQuestion,
    moveQuestion,
    save,
    cancel,
  };
}
