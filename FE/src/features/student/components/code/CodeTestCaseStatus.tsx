import { Badge } from '@/components/ui/Badge';
import type { CodeSubmission } from '@/services/studentCodeExam.service';

/**
 * Newest CD-07 submission of a question made in one attempt. CD-07 lists every attempt of the exam:
 * a submission carrying `attemptId` is matched on it, an older one on the attempt's
 * `startTime` … `submittedAt` window, so another attempt's verdict never shows.
 */
export function latestSubmissionOfAttempt(
  subs: CodeSubmission[],
  questionId: number,
  attempt: { attemptId: number; startTime: string; submittedAt: string | null },
): CodeSubmission | null {
  const from = Date.parse(attempt.startTime);
  const until = attempt.submittedAt ? Date.parse(attempt.submittedAt) : Infinity;
  let best: CodeSubmission | null = null;
  for (const s of subs) {
    if (s.questionId !== questionId) continue;
    const at = Date.parse(s.createdAt);
    if (s.attemptId != null ? s.attemptId !== attempt.attemptId : at < from || at > until) continue;
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
                <Badge size="sm" variant={testCase.passed ? 'success' : 'danger'}>
                  {testCase.passed ? 'Passed' : 'Failed'}
                </Badge>
              </div>
              {/* A failed case shows the student's own output, never the expected one, so the answer can't be read off it. */}
              {testCase.passed
                ? (testCase.inputData != null || testCase.expectedOutput != null) && (
                    <p className="mt-1 break-words font-mono text-xs leading-relaxed text-content-soft">
                      in: {previewText(testCase.inputData ?? '')} → out: {previewText(testCase.expectedOutput ?? '')}
                    </p>
                  )
                : (testCase.inputData != null || testCase.actualOutput != null) && (
                    <p className="mt-1 break-words font-mono text-xs leading-relaxed text-content-soft">
                      in: {previewText(testCase.inputData ?? '')} → your output:{' '}
                      {testCase.actualOutput != null ? previewText(testCase.actualOutput) : '(not recorded)'}
                    </p>
                  )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
