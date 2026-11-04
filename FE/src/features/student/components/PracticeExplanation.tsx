import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/assets/icons';
import { getApiErrorMessage } from '@/utils/apiError';
import { modulePracticeService, type ExplanationSource, type PracticeExplanation as Explanation } from '@/services/modulePractice.service';

const SOURCE_LABEL: Partial<Record<ExplanationSource, string>> = {
  GENERATED: 'AI',
  CACHED: 'AI',
  MANAGER: 'By the course team',
};

/**
 * MP-09: "Explain" for one practised question. Nothing is asked until the student presses the
 * button — a generated explanation spends AI quota. `practiceAnswerId` null = the latest attempt.
 * A new attempt (another `practiceAnswerId`) clears the shown explanation.
 */
export function PracticeExplanation({
  questionId,
  sessionId,
  sessionQuestionId,
  practiceAnswerId,
}: {
  questionId: number;
  sessionId: number;
  sessionQuestionId: number;
  practiceAnswerId: number | null;
}) {
  const [result, setResult] = useState<Explanation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setResult(null);
    setError(null);
  }, [sessionQuestionId, practiceAnswerId]);

  const explain = async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await modulePracticeService.explain(questionId, { sessionId, sessionQuestionId, practiceAnswerId }));
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not get an explanation.'));
    } finally {
      setLoading(false);
    }
  };

  const text = result?.explanation?.trim();
  const unavailable =
    result && !text
      ? result.source === 'QUOTA_EXCEEDED'
        ? 'You have used up your AI quota. It resets later, or upgrade your plan for more.'
        : result.source === 'NOT_APPLICABLE'
          ? 'An explanation is not available for this question.'
          : result.reason || 'The explanation could not be generated. Please try again.'
      : null;

  if (!result) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" icon={<Icon.Lightbulb className="w-4 h-4" />} loading={loading} disabled={loading} onClick={explain}>
          Explain this question
        </Button>
        {error ? <span className="text-xs text-danger">{error}</span> : <span className="text-xs text-content-subtle">May use your AI quota.</span>}
      </div>
    );
  }

  return (
    <div className="rounded-[10px] bg-primary-light/60 border border-line px-3 py-2.5 space-y-2" role="status">
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-brand-ink uppercase tracking-wide">
        <Icon.Lightbulb className="w-4 h-4 flex-shrink-0" /> Explanation
        {SOURCE_LABEL[result.source] && (
          <Badge variant="info" size="sm">
            {SOURCE_LABEL[result.source]}
          </Badge>
        )}
        {result.quota && (
          <span className="ml-auto normal-case font-normal tracking-normal text-content-subtle">
            {result.quota.totalRemaining} AI request{result.quota.totalRemaining === 1 ? '' : 's'} left
          </span>
        )}
      </div>
      {text ? (
        <p className="text-sm leading-relaxed text-content-secondary whitespace-pre-line break-words">{text}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-content-soft">{unavailable}</p>
          {result.source === 'FAILED' && (
            <Button variant="ghost" size="sm" icon={<Icon.RefreshCw className="w-4 h-4" />} loading={loading} onClick={explain}>
              Try again
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
