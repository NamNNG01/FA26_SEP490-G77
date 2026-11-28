import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/assets/icons";
import { ROUTES } from "@/app/routes";
import { getAiError } from "@/services/studentAi.service";
import { studentAttemptService, type DeepExplanation } from "@/services/studentAttempt.service";

/**
 * The body of one explanation box. The stored explanation (manager-written or AI-cached) is free and
 * shows at once; "Deep AI Explanation" (Report-3: Deep AI Explanation / Re-evaluation) sits in the same
 * box and spends AI tokens after a confirm. Its answer replaces the original in place — "View original"
 * switches back without spending more. Asked at most once per question.
 *
 * `resetKey` changes when the question (or attempt) changes, which drops a deep answer of the old one.
 */
export function DeepAiExplanation({
  original,
  initialDeep,
  request,
  resetKey,
  allowDeep = true,
}: {
  original: string | null;
  /** A deep explanation the backend already keeps for this answer. */
  initialDeep?: string | null;
  request: () => Promise<DeepExplanation>;
  resetKey: string | number;
  /** False hides the button (e.g. no answer to look at). */
  allowDeep?: boolean;
}) {
  const [deep, setDeep] = useState<string | null>(initialDeep ?? null);
  const [showDeep, setShowDeep] = useState(Boolean(initialDeep));
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; quota: boolean } | null>(null);
  const [tokensLeft, setTokensLeft] = useState<number | null>(null);

  useEffect(() => {
    setDeep(initialDeep ?? null);
    setShowDeep(Boolean(initialDeep));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset per question, not per render
  }, [resetKey]);

  const openConfirm = () => {
    setError(null);
    setConfirming(true);
    setTokensLeft(null);
    studentAttemptService
      .getAiQuota()
      .then((q) => setTokensLeft(q.free.remaining + (q.plan?.remaining ?? 0)))
      .catch(() => setTokensLeft(null));
  };

  const run = async () => {
    setLoading(true);
    try {
      const res = await request();
      setDeep(res.explanation);
      setShowDeep(true);
      setConfirming(false);
    } catch (err) {
      const e = getAiError(err, "Could not get a deep explanation. Please try again.");
      setError({
        message:
          e.kind === "QUOTA_EXCEEDED"
            ? "You do not have enough AI tokens for a deep explanation."
            : e.message,
        quota: e.kind === "QUOTA_EXCEEDED",
      });
      setConfirming(false);
    } finally {
      setLoading(false);
    }
  };

  const text = showDeep && deep ? deep : original;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {showDeep && deep ? (
          <Badge variant="info" size="sm">
            <Icon.Zap className="w-3 h-3" /> Deep AI Explanation
          </Badge>
        ) : (
          <span />
        )}
        {deep
          ? original && (
              <button
                type="button"
                onClick={() => setShowDeep((v) => !v)}
                className="text-xs font-medium text-brand-ink hover:underline"
              >
                {showDeep ? "View original" : "View deep explanation"}
              </button>
            )
          : allowDeep && (
              <Button
                size="sm"
                variant="outline"
                icon={<Icon.Zap className="w-3.5 h-3.5" />}
                loading={loading}
                disabled={loading}
                onClick={openConfirm}
              >
                Deep AI Explanation
              </Button>
            )}
      </div>

      {text ? (
        <p className="text-sm leading-relaxed text-content-secondary whitespace-pre-line break-words">
          {text}
        </p>
      ) : (
        <p className="text-sm text-content-soft">No explanation for this question yet.</p>
      )}

      {error && (
        <p className="text-xs text-danger">
          {error.message}{" "}
          {error.quota && (
            <Link to={ROUTES.studentSubscription} className="font-medium underline">
              Get more tokens
            </Link>
          )}
        </p>
      )}

      <ConfirmDialog
        open={confirming}
        onClose={() => !loading && setConfirming(false)}
        onConfirm={run}
        loading={loading}
        confirmDisabled={tokensLeft === 0}
        icon={<Icon.Zap className="w-6 h-6" />}
        title="Get a Deep AI Explanation?"
        description={
          <>
            The AI looks at your answer and explains this question in more depth. This uses AI
            tokens
            {tokensLeft != null ? (
              <>
                {" "}
                — you have <strong>{tokensLeft.toLocaleString()}</strong> left.
              </>
            ) : (
              "."
            )}
            {tokensLeft === 0 && (
              <>
                {" "}
                <Link to={ROUTES.studentSubscription} className="font-medium underline">
                  Get more tokens
                </Link>
              </>
            )}
          </>
        }
        confirmLabel="Use AI tokens"
      />
    </div>
  );
}
