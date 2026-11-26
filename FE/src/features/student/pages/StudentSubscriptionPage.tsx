import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/authContext';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/ToastHost';
import { Icon } from '@/assets/icons';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  isPaidSubscription,
  refreshCurrentSubscription,
  subscriptionService,
  useCurrentSubscription,
  type CurrentSubscription,
  type SubscriptionPlan,
} from '@/services/studentSubscription.service';
import { aiFlashcardService, type AiUsage } from '@/services/aiFlashcard.service';
import { formatVnd } from '@/services/payment.service';
import { adminSubscriptionPlanService } from '@/services/adminSubscriptionPlan.service';
import { planLines } from '@/utils/planDescription';
import { PaymentCheckoutModal, type PaymentItem } from '@/features/payment/components/PaymentCheckoutModal';
import { CardGridSkeleton, LoadError, PageTitle, STUDENT_PAGE_CLASS, formatDate } from '../components/studentUi';

const formatTokens = (n: number) => Math.max(0, n).toLocaleString('en-US');
type PlanWithDescription = SubscriptionPlan & { description: string | null };
type TokenBalance = { status: 'loading' | 'error' } | { status: 'ready'; usage: AiUsage };

/**
 * Subscription — the student's plan (SB-02) with its days and AI tokens left, and every plan on
 * offer (SB-01). A paid plan is bought through PaymentCheckoutModal
 * (PY-01 + PayOS); buying another plan replaces the current one straight away.
 */
export function StudentSubscriptionPage() {
  const { user } = useAuth();
  const toast = useToast();
  const current = useCurrentSubscription(user?.userId ?? null);

  const [plans, setPlans] = useState<PlanWithDescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [buying, setBuying] = useState<PaymentItem | null>(null);
  const [switching, setSwitching] = useState<SubscriptionPlan | null>(null);
  const [balance, setBalance] = useState<TokenBalance>({ status: 'loading' });
  const [balanceReload, setBalanceReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // SB-01 has no description, which now holds a plan's lines; API 27 (public, active plans) does.
    Promise.all([subscriptionService.getPlans(), adminSubscriptionPlanService.listPublic().catch(() => [])])
      .then(([data, publicPlans]) => {
        if (cancelled) return;
        const descriptions = new Map(publicPlans.map(p => [p.planId, p.description]));
        setPlans(data.map(plan => ({ ...plan, description: descriptions.get(plan.planId) ?? null })));
      })
      .catch(err => { if (!cancelled) setError(getApiErrorMessage(err, 'Could not load the plans.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    aiFlashcardService.getMyUsage()
      .then(usage => { if (!cancelled) setBalance({ status: 'ready', usage }); })
      .catch(() => { if (!cancelled) setBalance({ status: 'error' }); });
    return () => { cancelled = true; };
  }, [balanceReload, user?.userId]);

  function refreshBalance() {
    setBalance({ status: 'loading' });
    setBalanceReload(r => r + 1);
  }

  function handlePaid(item: PaymentItem) {
    toast.success(`${item.title} is now active`);
    void refreshCurrentSubscription();
    setReload(r => r + 1);
    refreshBalance();
  }

  function choose(plan: SubscriptionPlan) {
    // A new purchase replaces the running paid plan at once — say so before checkout.
    if (isPaidSubscription(current.data) && current.data.daysRemaining > 0) setSwitching(plan);
    else setBuying(planPaymentItem(plan));
  }

  const active = isPaidSubscription(current.data) ? current.data : null;

  return (
    <div className={`${STUDENT_PAGE_CLASS} space-y-6`}>
      <PageTitle title="Subscription" subtitle="Your study plan and the plans you can upgrade to." />

      <CurrentPlanCard loaded={current.loaded} subscription={current.data} balance={balance} onRetryBalance={refreshBalance} />

      <section className="space-y-3">
        {loading ? (
          <CardGridSkeleton count={3} />
        ) : error ? (
          <LoadError message={error} onRetry={() => setReload(r => r + 1)} />
        ) : plans.length === 0 ? (
          <div className="card px-5 py-10 text-center text-sm text-content-soft">No plans are on offer right now.</div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-[clamp(1rem,2vw,1.25rem)]">
            {plans.map(plan => (
              <PlanCard key={plan.planId} plan={plan} onChoose={() => choose(plan)} />
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={!!switching}
        onClose={() => setSwitching(null)}
        onConfirm={() => { if (switching) setBuying(planPaymentItem(switching)); setSwitching(null); }}
        title={`Switch to ${switching?.name ?? 'this plan'}?`}
        description={active && <>
          Your <strong>{active.planName}</strong> plan ends as soon as the payment goes through.
          The {active.daysRemaining} day{active.daysRemaining === 1 ? '' : 's'} left on it and its unused AI tokens are not carried over.
        </>}
        confirmLabel="Continue to payment"
      />

      <PaymentCheckoutModal item={buying} onClose={() => setBuying(null)} onPaid={handlePaid} />
    </div>
  );
}

function planPaymentItem(plan: SubscriptionPlan): PaymentItem {
  return {
    target: { planId: plan.planId },
    type: 'SUBSCRIPTION',
    refId: plan.planId,
    title: plan.name,
    subtitle: `${plan.durationDays} days`,
    price: plan.price,
  };
}

function CurrentPlanCard({ loaded, subscription, balance, onRetryBalance }: {
  loaded: boolean;
  subscription: CurrentSubscription | null;
  balance: TokenBalance;
  onRetryBalance: () => void;
}) {
  if (!loaded) return null;

  const tokenBalance = <TokenBalanceDisplay balance={balance} onRetry={onRetryBalance} />;

  if (!isPaidSubscription(subscription)) {
    // Free Plan (no subscription row): no dates to show, only the monthly free AI allowance.
    return (
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-10 h-10 rounded-[10px] bg-primary-light flex items-center justify-center shrink-0">
            <Icon.Award className="w-5 h-5 text-brand-ink" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-content">{subscription?.planName ?? 'Free Plan'}</p>
              <Badge variant="default">Free</Badge>
            </div>
            <p className="text-sm text-content-soft">Choose a plan below to unlock more AI tokens and features.</p>
          </div>
        </div>
        {tokenBalance}
      </div>
    );
  }

  const totalDays = Math.max(1, Math.ceil((Date.parse(subscription.expiresAt) - Date.parse(subscription.startedAt)) / 86_400_000));
  const left = Math.max(0, subscription.daysRemaining);

  return (
    <div className="card p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-10 h-10 rounded-[10px] bg-primary-light flex items-center justify-center shrink-0">
            <Icon.Award className="w-5 h-5 text-brand-ink" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-content">{subscription.planName}</p>
              <Badge variant="success">{subscription.status === 'ACTIVE' ? 'Active' : subscription.status}</Badge>
            </div>
            <p className="text-sm text-content-soft">
              {formatVnd(subscription.price)} · {formatDate(subscription.startedAt)} – {formatDate(subscription.expiresAt)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <UsageBar
          label={left === 0 ? 'Expired' : `${left} day${left === 1 ? '' : 's'} left`}
          aside={`Expires on ${formatDate(subscription.expiresAt)}`}
          left={left}
          total={totalDays}
        />
        {tokenBalance}
      </div>
    </div>
  );
}

function TokenBalanceDisplay({ balance, onRetry }: { balance: TokenBalance; onRetry: () => void }) {
  if (balance.status !== 'ready') {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-content-soft">
        <span role="status">
          {balance.status === 'loading' ? 'Loading AI token balance…' : 'Could not load AI token balance.'}
        </span>
        {balance.status === 'error' && <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button>}
      </div>
    );
  }

  const { tokenRemaining, tokenLimit, billingSource, periodEnd } = balance.usage;
  return (
    <UsageBar
      label={`${formatTokens(tokenRemaining)} / ${formatTokens(tokenLimit)} AI tokens left`}
      aside={billingSource === 'FREE_QUOTA' ? `Resets on ${formatDate(periodEnd)}` : 'For this plan period'}
      left={tokenRemaining}
      total={tokenLimit}
    />
  );
}

/** A "what is left" bar: it shrinks as the days or tokens are used, and turns amber under 20%. */
function UsageBar({ label, aside, left, total }: { label: string; aside: string; left: number; total: number }) {
  const share = total > 0 ? Math.min(100, Math.max(0, (left / total) * 100)) : 0;
  const low = share <= 20;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap justify-between gap-x-3 text-sm">
        <span className={low ? 'font-medium text-warning' : 'text-content-secondary'}>{label}</span>
        <span className="text-content-soft">{aside}</span>
      </div>
      <div className="h-2 rounded-full bg-fill-strong overflow-hidden">
        <div className={`h-full rounded-full ${low ? 'bg-warning' : 'bg-brand-600'}`} style={{ width: `${share}%` }} />
      </div>
    </div>
  );
}

function PlanCard({ plan, onChoose }: { plan: PlanWithDescription; onChoose: () => void }) {
  const free = plan.price <= 0;
  const lines = planLines(plan);
  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-content">{plan.name}</h3>
        {plan.isCurrent && <Badge variant="success">Current</Badge>}
      </div>

      <div>
        <p className="text-2xl font-bold text-content">{free ? 'Free' : formatVnd(plan.price)}</p>
        {!free && <p className="text-sm text-content-soft">for {plan.durationDays} days</p>}
      </div>

      <ul className="space-y-2 flex-1">
        {lines.length === 0 && (
          <li className="flex items-start gap-2 text-sm text-content-secondary">
            <Icon.Check className="w-4 h-4 mt-0.5 text-success shrink-0" />
            <span>Full access for {plan.durationDays} days</span>
          </li>
        )}
        {lines.map((feature, index) => (
          <li key={index}className="flex items-start gap-2 text-sm text-content-secondary">
            <Icon.Check className="w-4 h-4 mt-0.5 text-success shrink-0" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {plan.isCurrent ? (
        <Button variant="outline" disabled>Current plan</Button>
      ) : free ? (
        <Button variant="outline" disabled>Included</Button>
      ) : (
        <Button onClick={onChoose}>Choose plan</Button>
      )}
    </div>
  );
}
