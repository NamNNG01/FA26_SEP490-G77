import { questionValidationErrors } from '@/services/question.service';
import { optionLabel } from './model';

/** A failed save (Q-03 / Q-05 / Q-08), read into what the editor shows. */
export interface SaveError {
  message: string;
  /** One line per field error from a VALIDATION_ERROR response. */
  details?: string[];
  /** The question changed on the server (lock version mismatch) — reload to continue. */
  conflict?: boolean;
  /** Batch save: index of the first question the backend rejected. */
  questionIndex?: number;
}

const FIELD_LABELS: Record<string, string> = {
  content: 'Question text',
  questionType: 'Type',
  difficulty: 'Difficulty',
  status: 'Status',
  defaultPoints: 'Points',
  questionMetadata: 'Skill tag',
  options: 'Answers',
  answerKey: 'Answers',
  essayGradingRubric: 'Grading rubric',
};

/** "options[2].optionText" → "Option C"; "answerKey.pairs[1].left" → "Answers". */
function fieldLabel(path: string): string {
  const option = /^options\[(\d+)\]/.exec(path);
  if (option) return `Option ${optionLabel(Number(option[1]))}`;
  const field = /^[A-Za-z]+/.exec(path)?.[0] ?? '';
  return FIELD_LABELS[field] ?? (path || 'Question');
}

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);
const httpStatus = (err: unknown) => (err as { response?: { status?: number } })?.response?.status;

export function describeSaveError(err: unknown, fallback: string): SaveError {
  const message = errorMessage(err, fallback);

  const fieldErrors = questionValidationErrors(err);
  if (fieldErrors.length) {
    let questionIndex: number | undefined;
    const details = fieldErrors.map(e => {
      // Batch paths start with "questions[i]."; single saves have none.
      const batch = /^questions\[(\d+)\]\.(.*)$/.exec(e.path);
      if (!batch) return `${fieldLabel(e.path)}: ${e.message}`;
      const index = Number(batch[1]);
      questionIndex ??= index;
      return `Question ${index + 1} · ${fieldLabel(batch[2])}: ${e.message}`;
    });
    return { message: 'Fix these and save again:', details, questionIndex };
  }

  if (httpStatus(err) === 409) {
    const duplicate = /Duplicate content hash with question id: (\d+)/i.exec(message);
    if (duplicate) return { message: `A question with the same content already exists in this course (question #${duplicate[1]}). Change it before saving.` };
    // Other 409s (e.g. "Cannot change question type when student attempts reference this question") say why themselves.
    if (/lock version|modified by another user/i.test(message)) return { message, conflict: true };
  }
  return { message };
}
