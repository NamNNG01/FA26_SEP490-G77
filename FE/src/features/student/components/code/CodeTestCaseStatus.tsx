import { Badge } from '@/components/ui/Badge';
import type { CodeSubmission } from '@/services/studentCodeExam.service';

/** Newest CD-07 submission of a question made at or before `before` (the attempt's submit time). */
export function latestSubmissionBefore(subs: CodeSubmission[], questionId: number, before: string | null): CodeSubmission | null {
  const limit = before ? Date.parse(before) : Infinity;
  let best: CodeSubmission | null = null;
  for (const s of subs) {
    if (s.questionId !== questionId) continue;
    const at = Date.parse(s.createdAt);
    if (at > limit) continue;
    if (!best || at > Date.parse(best.createdAt)) best = s;
  }
  return best;
}

/** One-line preview of a fixture's text: whitespace collapsed, long values cut. */
function previewText(text: string, max = 60): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat === '') return '(empty)';
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

/** CD-07 verdict: the counts plus one row per fixture, so the review shows which cases passed. */
export function CodeTestCaseStatus({ submission }: { submission: CodeSubmission }) {
  const passed = submission.status === 'PASSED';
  const cases = submission.testCases ?? [];
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-content">Test cases</span>
        <Badge variant={passed ? 'success' : 'danger'}>
          {submission.status} · {submission.testCasesPassed}/{submission.testCasesTotal} test cases
        </Badge>
      </div>
      {cases.length > 0 && (
        <ul className="space-y-1.5" aria-label="Test case results">
          {cases.map((testCase, index) => (
            <li key={testCase.testCaseId ?? `case-${index}`} className="rounded-[10px] border border-line-soft bg-surface-muted px-3 py-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-xs font-bold text-content-soft">Test case {(testCase.orderIndex ?? index) + 1}</span>
                <Badge size="sm" variant="default">
                  {testCase.hidden ? 'Hidden' : 'Sample'}
                </Badge>
                <Badge size="sm" variant={testCase.passed ? 'success' : 'danger'}>
                  {testCase.passed ? 'Passed' : 'Failed'}
                </Badge>
              </div>
              {(testCase.inputData != null || testCase.expectedOutput != null) && (
                <p className="mt-1 break-words font-mono text-xs leading-relaxed text-content-soft">
                  in: {previewText(testCase.inputData ?? '')} → out: {previewText(testCase.expectedOutput ?? '')}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
