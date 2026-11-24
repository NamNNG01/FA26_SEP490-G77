import { getUser } from '@/auth/storage';
import { emptyGroupContext, type GroupContextValue } from './components/GroupContextCard';
import { normalizeCode, type QuestionDraft } from './model';

/**
 * The New Questions page keeps its unsaved work in localStorage, so a reload
 * (or a crash) doesn't lose it. One draft per signed-in user; it is cleared
 * after Save All succeeds or when the user chooses to leave without saving.
 * AI suggestions that weren't accepted are not kept.
 */
export interface CreateDraftSnapshot {
  version: 1;
  savedAt: string;
  questions: QuestionDraft[];
  courseId: string;
  moduleId: string;
  groupCtx: GroupContextValue;
  /** Keys of questions the user edited (their errors show right away). */
  touched: string[];
}

const storageKey = () => `question-create-draft:${getUser()?.userId ?? 'anonymous'}`;

/** True only when there is actual written question content, flagged import, or new-group title/passage worth restoring. */
export function hasUnsavedCreateWork(
  questions: QuestionDraft[],
  touched: Set<string>,
  groupCtx: GroupContextValue,
): boolean {
  const hasQuestions = questions.some(q => touched.has(q.key) || q.content.trim() !== '' || Boolean(q.importIssue));
  const hasNewGroup = groupCtx.mode === 'new' && Boolean(groupCtx.newTitle.trim() || groupCtx.newPassage.trim());
  return hasQuestions || hasNewGroup;
}

export function loadCreateDraft(): CreateDraftSnapshot | null {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<CreateDraftSnapshot>;
    if (s?.version !== 1 || !Array.isArray(s.questions) || !s.groupCtx) return null;
    const questions = s.questions.map(q => ({
      ...q,
      rubric: Array.isArray(q.rubric) ? q.rubric : [],
      rubricNotes: q.rubricNotes ?? '',
      code: normalizeCode(q.code),
    }));
    const groupCtx = { ...emptyGroupContext(), ...s.groupCtx };
    const hasWrittenQuestion = questions.some(q => q.content.trim() !== '' || Boolean(q.importIssue));
    const hasWrittenNewGroup = groupCtx.mode === 'new' && Boolean(groupCtx.newTitle.trim() || groupCtx.newPassage.trim());
    if (!hasWrittenQuestion && !hasWrittenNewGroup) {
      clearCreateDraft();
      return null;
    }
    return {
      version: 1,
      savedAt: typeof s.savedAt === 'string' ? s.savedAt : new Date().toISOString(),
      questions,
      courseId: typeof s.courseId === 'string' ? s.courseId : '',
      moduleId: typeof s.moduleId === 'string' ? s.moduleId : '',
      groupCtx,
      touched: Array.isArray(s.touched) ? s.touched : [],
    };
  } catch {
    return null;
  }
}

/** False when the browser refused to store it (private mode, quota — e.g. large diagram snapshots). */
export function saveCreateDraft(snapshot: Omit<CreateDraftSnapshot, 'version' | 'savedAt'>): boolean {
  try {
    localStorage.setItem(storageKey(), JSON.stringify({ version: 1, savedAt: new Date().toISOString(), ...snapshot }));
    return true;
  } catch {
    return false;
  }
}

export function clearCreateDraft() {
  try {
    localStorage.removeItem(storageKey());
  } catch {
    // Storage unavailable — nothing to clear.
  }
}
