import React, { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/assets/icons';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  managerContestService,
  contestErrorCode,
  contestErrorIssues,
  type PayResult,
  type PrizeIssue,
} from '@/services/managerContest.service';
import { CONTEST_ERROR_TEXT, IssueList } from './contestUi';

type Phase =
  | { kind: 'confirm' }
  | { kind: 'paid'; result: PayResult }
  | { kind: 'failed'; message: string; issues: PrizeIssue[] };

/**
 * Confirm → API 9 → winners, or the reasons nothing was paid (all-or-nothing).
 * `blockers` are the detail page's live payBlockers, shown before the manager confirms.
 */
export function PayRewardsDialog({ contest, blockers = [], onClose, onPaid }: {
  contest: { contestId: number; title: string } | null;
  blockers?: PrizeIssue[];
  onClose: () => void;
  /** Called after a successful payment (the dialog stays open on the winners list). */
  onPaid: (result: PayResult) => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'confirm' });
  const [paying, setPaying] = useState(false);

  useEffect(() => { if (contest) setPhase({ kind: 'confirm' }); }, [contest]);

  const pay = async () => {
    if (!contest) return;
    setPaying(true);
    try {
      const result = await managerContestService.payRewards(contest.contestId);
      setPhase({ kind: 'paid', result });
      onPaid(result);
    } catch (err) {
      const code = contestErrorCode(err);
      setPhase({
        kind: 'failed',
        message: (code && CONTEST_ERROR_TEXT[code]) || getApiErrorMessage(err, 'Could not pay the rewards.'),
        issues: contestErrorIssues(err),
      });
    } finally {
      setPaying(false);
    }
  };

  const close = () => { if (!paying) onClose(); };

  const footer = phase.kind === 'confirm'
    ? <>
        <Button variant="outline" disabled={paying} onClick={close}>Cancel</Button>
        <Button loading={paying} disabled={paying} icon={<Icon.Award className="h-4 w-4" />} onClick={() => void pay()}>Pay rewards</Button>
      </>
    : <Button onClick={close}>Close</Button>;

  return (
    <Modal open={!!contest} onClose={close} title={phase.kind === 'paid' ? 'Rewards paid' : 'Pay rewards?'} footer={footer} dismissible={!paying}>
      {phase.kind === 'confirm' && (
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
      )}

      {phase.kind === 'paid' && (
        <div className="space-y-3">
          <Alert type="success" message={phase.result.rewardsGranted
            ? `Granted ${phase.result.rewardsGranted} prize${phase.result.rewardsGranted === 1 ? '' : 's'}.`
            : 'Nobody took part, so no prizes were granted. The contest is now rewarded.'} />
          {phase.result.winners.length > 0 && (
            <ul className="divide-y divide-line-soft rounded-[10px] border border-line-soft">
              {phase.result.winners.map(w => (
                <li key={`${w.rank}-${w.userId}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate"><span className="font-semibold text-content">#{w.rank}</span> {w.fullName}</span>
                  <span className="font-mono text-xs text-content-soft">{w.discount.code}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {phase.kind === 'failed' && (
        <div className="space-y-3">
          <Alert type="error" message={phase.message} />
          <IssueList issues={phase.issues} />
        </div>
      )}
    </Modal>
  );
}
