import { type QuestionForm } from './components/QuestionForm';

export type QuestionFieldErrors = {
  text?: string;
  options?: string;
};

export function validateQuestion(q: QuestionForm): boolean {
  if (q.text.trim() === '') return false;
  if (q.type === 'essay') return true;
  return q.options.filter(o => o.text.trim() !== '').length >= 2;
}

export function getQuestionErrors(q: QuestionForm): QuestionFieldErrors {
  const errors: QuestionFieldErrors = {};
  if (q.text.trim() === '') {
    errors.text = 'Question text is required.';
  }
  if (q.type !== 'essay' && q.options.filter(o => o.text.trim() !== '').length < 2) {
    errors.options = 'Please fill in at least two answer options.';
  }
  return errors;
}

export const isQuestionComplete = (q: QuestionForm): boolean => validateQuestion(q);