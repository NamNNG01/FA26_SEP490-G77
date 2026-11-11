import type { ReactNode } from 'react';
import { QuestionText } from './QuestionAnswerInput';

/**
 * The question of an essay screen. A short question takes just its own height; a long one stops at
 * about a third of the column and scrolls, so the answer box below always stays on screen.
 */
export function EssayQuestionPrompt({ content, children }: { content: string; children?: ReactNode }) {
  return (
    <div className="card flex-shrink-0 px-4 py-3 overflow-y-auto max-h-[30vh] md:max-h-[35vh]">
      <QuestionText content={content} className="text-sm leading-relaxed text-content font-medium" />
      {children}
    </div>
  );
}
