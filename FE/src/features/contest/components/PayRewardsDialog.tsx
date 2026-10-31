import React, { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/assets/icons';
import { useToast } from '@/components/ui/ToastHost';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  managerContestService,
  contestErrorCode,
  contestErrorIssues,
  type PayResult,
  type PrizeIssue,
} from '@/services/managerContest.service';
import { CONTEST_ERROR_TEXT, IssueList, issueText } from './contestUi';

/**
 * Confirm → API 9 → winners. A failure (nothing paid: all-or-nothing) is a toast with the reasons.
 * `blockers` are the detail page's live payBlockers, shown before the manager confirms.
 */
export function PayRewardsDialog({ contest, blockers = [], onClose, onPaid }: {
  contest: { contestId: number; title: string } | null;
  blockers?: PrizeIssue[];
  onClose: () => void;
  /** Called after a successful payment (the dialog stays open on the winners list). */
  onPaid: (result: PayResult) => void;
}) {
  const toast = useToast();
  const [result, setResult] = useState<PayResult | null>(null);
  const [paying, setPaying] = useState(false);
  const contestId = contest?.contestId ?? null;

  // Reset only when another contest is opened: the parent reloads (new object, same id) after paying,
  // and that must not bring the confirm step back.
  useEffect(() => { setResult(null); }, [contestId]);

  const pay = async () => {
    if (!contest) return;
    setPaying(true);
    try {
      const paid = await managerContestService.payRewards(contest.contestId);
      setResult(paid);
      onPaid(paid);
    } catch (err) {
      const code = contestErrorCode(err);
      const issues = contestErrorIssues(err).map(issueText);
      toast.error((code && CONTEST_ERROR_TEXT[code]) || getApiErrorMessage(err, 'Could not pay the rewards.'),
        { details: issues, duration: issues.length ? null : undefined });
      onClose();
    } finally {
      setPaying(false);
    }
  };

  const close = () => { if (!paying) { setResult(null); onClose(); } };

  const footer = result
    ? <Button onClick={close}>Close</Button>
    : <>
        <Button variant="outline" disabled={paying} onClick={close}>Cancel</Button>
        <Button loading={paying} disabled={paying} icon={<Icon.Award className="h-4 w-4" />} onClick={() => void pay()}>Pay rewards</Button>
      </>;

  return (
    <Modal open={!!contest} onClose={close} title={result ? 'Rewards paid' : 'Pay rewards?'} footer={footer} dismissible={!paying}>
      {!result ? (
        <div className="space-y-3">
          <p className="text-sm text-content-secondary">
            Grant the prize discounts of <strong>{contest?.title}</strong> to its winners. Ranks without a participant are skipped.
            This cannot be undone.
          </p>
          {blockers.length > 0 && (
            <div className="space-y-2 rounded-[10px] border border-warning-line bg-warning-light p-3">
              <p className="text-sm font-semibold text-warning-strong">Payment will fail right now:</p>
              <IssueList issues={blockers} />
              <p className="text-xs text-content-soft">Change the discount of these ranks (Edit) or ask an admin to fix the discount, then try again.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <Alert type="success" message={result.rewardsGranted
            ? `Granted ${result.rewardsGranted} prize${result.rewardsGranted === 1 ? '' : 's'}.`
            : 'Nobody took part, so no prizes were granted. The contest is now rewarded.'} />
          {result.winners.length > 0 && (
            <ul className="divide-y divide-line-soft rounded-[10px] border border-line-soft">
              {result.winners.map(w => (
                <li key={`${w.rank}-${w.userId}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate"><span className="font-semibold text-content">#{w.rank}</span> {w.fullName}</span>
                  <span className="font-mono text-xs text-content-soft">{w.discount.code}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
