import {
  ESSAY_RUBRIC_REQUIRED,
  RUBRIC_TYPES,
  isDraftValid,
  rubricTotal,
  toCreateRequest,
  validateDraft,
  type QuestionDraft,
} from '@/features/question/model';
import type { QuestionDetail } from '@/services/question.service';

export type ResolutionType =
  | 'CONTENT_CORRECTED'
  | 'EXPLANATION_CORRECTED'
  | 'ANSWER_CORRECTED'
  | 'RUBRIC_CORRECTED'
  | 'QUESTION_VOIDED'
  | 'OTHER_CORRECTION';

export type ReviewTabId = 'review' | 'resolve' | 'insights';

export const TERMINAL_STATUSES = ['RESOLVED', 'REJECTED', 'DUPLICATE', 'WITHDRAWN'];
export const JOB_NEEDS_ACTION = ['PENDING_CONFIRMATION', 'FAILED', 'PARTIAL_FAILED'];

export interface ResolutionOption {
  value: ResolutionType;
  /** Manager-facing name of the correction. */
  title: string;
  /** One line: what the manager will be able to edit. */
  summary: string;
  /** Heading of the editor that matches this correction. */
  editorTitle: string;
  /** What is (and is not) saved. */
  scope: string;
  /** Primary button text — names the outcome. */
  saveLabel: string;
}

export const RESOLUTION_OPTIONS: ResolutionOption[] = [
  { value: 'CONTENT_CORRECTED', title: 'Question text', summary: 'Fix wording, typos or a missing image in the question.', editorTitle: 'Correct the question text', scope: 'Only the question text is saved.', saveLabel: 'Save text and resolve' },
  { value: 'EXPLANATION_CORRECTED', title: 'Explanation', summary: 'Fix the explanation students see after answering.', editorTitle: 'Correct the explanation', scope: 'Only the explanation is saved.', saveLabel: 'Save explanation and resolve' },
  { value: 'ANSWER_CORRECTED', title: 'Answers', summary: 'Fix the correct answer or the answer choices.', editorTitle: 'Correct the answers', scope: 'Only the answer fields are saved.', saveLabel: 'Save answers and resolve' },
  { value: 'RUBRIC_CORRECTED', title: 'Grading rubric', summary: 'Adjust the scoring criteria of a rubric-graded question.', editorTitle: 'Correct the grading rubric', scope: 'Only the rubric criteria are saved.', saveLabel: 'Save rubric and resolve' },
  { value: 'QUESTION_VOIDED', title: 'Void the question', summary: 'Take the question out of scoring. No edits needed.', editorTitle: 'Void this question', scope: 'The question itself is not edited.', saveLabel: 'Void question and resolve' },
  { value: 'OTHER_CORRECTION', title: 'Something else', summary: 'Edit several fields at once with the full editor.', editorTitle: 'Edit the question', scope: 'Every question field in the editor is saved.', saveLabel: 'Save changes and resolve' },
];

export const resolutionOption = (value: ResolutionType) => RESOLUTION_OPTIONS.find(option => option.value === value) ?? RESOLUTION_OPTIONS[0];

export function unwrapList(value: any): any[] {
  return Array.isArray(value) ? value : value?.content ?? value?.items ?? [];
}

export const isTerminal = (status?: string) => TERMINAL_STATUSES.includes(status ?? '');

export function toQuestionDetail(detail: any): QuestionDetail {
  const question = detail.question;
  return {
    questionId: question.questionId,
    courseId: detail.courseId ?? null,
    moduleId: null,
    groupId: null,
    questionType: question.questionType,
    difficulty: question.difficulty ?? 'MEDIUM',
    content: question.content ?? '',
    questionMetadata: question.questionMetadata ?? null,
    answerKey: question.answerKey ?? null,
    defaultPoints: null,
    source: 'ISSUE_REVIEW',
    creatorRole: '',
    createdBy: null,
    scoringVersion: question.scoringVersion ?? null,
    lockVersion: question.lockVersion ?? null,
    aiExplanation: question.explanation ?? null,
    status: question.status ?? 'ACTIVE',
    approvalStatus: '',
    essayGradingRubric: question.essayGradingRubric ?? null,
    options: question.options ?? [],
    createdAt: null,
    updatedAt: null,
    // CODE settings, when the ticket sends them; without them the editor shows the defaults.
    codeConfig: question.codeConfig ?? null,
    testCases: question.testCases ?? null,
  };
}

/** Why a correction type cannot be chosen for this question, or null when it can. */
export function resolutionUnavailableReason(type: ResolutionType, draft: QuestionDraft | null): string | null {
  if (type === 'RUBRIC_CORRECTED' && draft && !RUBRIC_TYPES.includes(draft.type)) return 'This question type has no grading rubric.';
  return null;
}

/** Why the save button is disabled for the selected correction, or null when it can be pressed. */
export function resolveBlocker(type: ResolutionType, draft: QuestionDraft | null, note: string): string | null {
  if (!draft) return 'The question is still loading.';
  if (type === 'ANSWER_CORRECTED' && draft.type === 'ESSAY') return 'Essay questions are graded by rubric. Choose “Grading rubric” instead.';
  if (!note.trim()) return 'Add a resolution note to save.';
  return null;
}

export type ResolutionResult =
  | { ok: true; changes: Record<string, unknown> }
  | { ok: false; message: string; showFieldErrors: boolean };

/**
 * Validates only what the selected correction can change, and returns exactly the fields to send.
 * Fields outside the correction never block saving.
 */
export function buildResolution(type: ResolutionType, draft: QuestionDraft, courseId: number): ResolutionResult {
  switch (type) {
    case 'CONTENT_CORRECTED': {
      const error = validateDraft(draft).content;
      if (error) return { ok: false, message: error, showFieldErrors: true };
      return { ok: true, changes: { content: draft.content.trim() } };
    }
    case 'EXPLANATION_CORRECTED': {
      if (!draft.explanation.trim()) return { ok: false, message: 'Enter the corrected explanation.', showFieldErrors: false };
      return { ok: true, changes: { explanation: draft.explanation.trim() } };
    }
    case 'ANSWER_CORRECTED': {
      if (draft.type === 'ESSAY') return { ok: false, message: 'This question is graded by a rubric. Choose Grading rubric to edit its scoring criteria.', showFieldErrors: false };
      const answerError = validateDraft(draft).answers;
      // A diagram essay's rubric is corrected separately, so a missing rubric does not block its diagram answer.
      if (answerError && !(draft.type === 'DIAGRAM_ESSAY' && answerError === ESSAY_RUBRIC_REQUIRED)) {
        return { ok: false, message: 'Review the answer fields before resolving this ticket.', showFieldErrors: true };
      }
      const request = toCreateRequest(draft, courseId, null);
      if (draft.type === 'CODE') {
        return {
          ok: true,
          changes: {
            codeConfig: request.codeConfig,
            testCases: request.testCases ?? [],
          },
        };
      }
      return { ok: true, changes: { options: request.options ?? [], answerKey: request.answerKey ?? null } };
    }
    case 'RUBRIC_CORRECTED': {
      const rubric = rubricTotal(draft.rubric);
      if (rubric.error || (['ESSAY', 'DIAGRAM_ESSAY'].includes(draft.type) && !draft.rubric.length)) {
        return { ok: false, message: rubric.error || ESSAY_RUBRIC_REQUIRED, showFieldErrors: true };
      }
      const request = toCreateRequest(draft, courseId, null);
      return { ok: true, changes: { essayGradingRubric: request.essayGradingRubric ?? null } };
    }
    case 'OTHER_CORRECTION': {
      if (!isDraftValid(draft)) return { ok: false, message: 'Review the question fields before resolving this ticket.', showFieldErrors: true };
      const request = toCreateRequest(draft, courseId, null);
      return {
        ok: true,
        changes: {
          content: request.content,
          explanation: request.explanation,
          difficulty: request.difficulty,
          options: request.options ?? [],
          answerKey: request.answerKey ?? null,
          questionMetadata: request.questionMetadata,
          essayGradingRubric: request.essayGradingRubric,
          ...(draft.type === 'CODE' ? { codeConfig: request.codeConfig, testCases: request.testCases ?? [] } : {}),
        },
      };
    }
    case 'QUESTION_VOIDED':
      return { ok: true, changes: {} };
  }
}

export interface RegradeNotice {
  tone: 'warning' | 'info';
  text: string;
  /** The save changes students' scores or removes the question, so ask before submitting. */
  confirm: boolean;
}

/** What saving the selected correction does to existing attempts, from the ticket's insights. */
export function regradeNotice(type: ResolutionType, impact: any): RegradeNotice | null {
  if (!impact) return null;
  if (type === 'ANSWER_CORRECTED') {
    return impact.answerCorrectionRegrades
      ? { tone: 'warning', confirm: true, text: `Saving will regrade ${impact.finishedAnswers} submitted answers. ${impact.inProgressAnswers} active attempts will use the new key.` }
      : { tone: 'info', confirm: false, text: 'Saving this answer correction will not regrade existing attempts.' };
  }
  if (type === 'QUESTION_VOIDED') {
    return { tone: 'warning', confirm: true, text: `Voiding can regrade ${impact.finishedAnswers} submitted answers. A regrade job may need your confirmation afterwards.` };
  }
  return null;
}
