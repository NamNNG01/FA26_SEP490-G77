import type { CodeLanguage } from '@/services/studentCodeExam.service';

/**
 * Per-language code of one CODE question, kept in this browser. The SA-03 draft only holds the
 * `text` of the selected language, so the language itself and the code of the other languages
 * live here. Losing it is harmless: the selected language's code is still in the draft.
 */
export interface CodeDraft {
  language: CodeLanguage;
  sources: Record<string, string>;
}

const key = (attemptId: number, questionId: number) => `code-draft:${attemptId}:${questionId}`;

export function loadCodeDraft(attemptId: number, questionId: number): CodeDraft | null {
  try {
    const raw = localStorage.getItem(key(attemptId, questionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CodeDraft>;
    if (typeof parsed.language !== 'string' || typeof parsed.sources !== 'object' || !parsed.sources) return null;
    return { language: parsed.language, sources: parsed.sources };
  } catch {
    return null;
  }
}

export function saveCodeDraft(attemptId: number, questionId: number, draft: CodeDraft): void {
  try {
    localStorage.setItem(key(attemptId, questionId), JSON.stringify(draft));
  } catch {
    // Private mode / quota: the SA-03 draft still has the selected language's code.
  }
}

/** UTF-8 size, as the BE counts the 100 KB limit. */
export function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}
