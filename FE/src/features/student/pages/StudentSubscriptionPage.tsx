import { useEffect, useState } from 'react';
import { useAuth } from '@/auth/authContext';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Switch } from '@/components/ui/Switch';
import { useToast } from '@/components/ui/ToastHost';
import { Icon } from '@/assets/icons';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  refreshCurrentSubscription,
  subscriptionService,
  useCurrentSubscription,
  type CurrentSubscription,
  type SubscriptionPlan,
} from '@/services/studentSubscription.service';
import { formatVnd } from '@/services/payment.service';
import { PaymentCheckoutModal, type PaymentItem } from '@/features/payment/components/PaymentCheckoutModal';
import { CardGridSkeleton, LoadError, PageTitle, STUDENT_PAGE_CLASS, formatDate } from '../components/studentUi';

/**
 * Subscription — the student's ACTIVE plan (SB-02) with its auto-renew switch (SB-04), and every
 * plan on offer (SB-01). A paid plan is bought through PaymentCheckoutModal (PY-01 + PayOS).
 */
export function StudentSubscriptionPage() {
  const { user } = useAuth();
  const toast = useToast();
  const current = useCurrentSubscription(user?.userId ?? null);

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [buying, setBuying] = useState<PaymentItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    subscriptionService
      .getPlans()
      .then(data => { if (!cancelled) setPlans(data); })
      .catch(err => { if (!cancelled) setError(getApiErrorMessage(err, 'Could not load the plans.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reload]);

  function handlePaid(item: PaymentItem) {
    toast.success(`${item.title} is now active`);
    void refreshCurrentSubscription();
    setReload(r => r + 1);
  }

  return (
    <div className={`${STUDENT_PAGE_CLASS} space-y-6`}>
      <PageTitle title="Subscription" subtitle="Your study plan and the plans you can upgrade to." />

      <CurrentPlanCard loaded={current.loaded} subscription={current.data} />

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
              <PlanCard key={plan.planId} plan={plan} onChoose={() => setBuying(planPaymentItem(plan))} />
            ))}
          </div>
        )}
      </section>

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

function CurrentPlanCard({ loaded, subscription }: { loaded: boolean; subscription: CurrentSubscription | null }) {
  const toast = useToast();
  const [autoRenew, setAutoRenew] = useState(subscription?.autoRenew ?? false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setAutoRenew(subscription?.autoRenew ?? false); }, [subscription?.subscriptionId, subscription?.autoRenew]);

  async function toggleAutoRenew(next: boolean) {
    setAutoRenew(next);
    setSaving(true);
    try {
      const res = await subscriptionService.setAutoRenew(next);
      setAutoRenew(res.autoRenew);
      toast.success(res.autoRenew ? 'Auto-renew is on' : 'Auto-renew is off — you will not be charged for the next period');
      void refreshCurrentSubscription();
    } catch (err) {
      setAutoRenew(!next);
      toast.error(getApiErrorMessage(err, 'Could not update auto-renew.'));
      void refreshCurrentSubscription();
    } finally {
      setSaving(false);
    }
  }

  // Without an ACTIVE plan the plan grid says it all (no placeholder either, so nothing flashes).
  if (!loaded || !subscription) return null;

  const totalDays = Math.max(1, Math.ceil((Date.parse(subscription.expiresAt) - Date.parse(subscription.startedAt)) / 86_400_000));
  const left = Math.max(0, subscription.daysRemaining);
  const used = Number.isFinite(totalDays) ? Math.min(100, Math.max(0, ((totalDays - left) / totalDays) * 100)) : 0;
  const ending = left <= 7;

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
        <Switch checked={autoRenew} onChange={toggleAutoRenew} disabled={saving} label="Auto-renew" />
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-sm">
          <span className={ending ? 'font-medium text-warning' : 'text-content-soft'}>
            {left === 0 ? 'Expired' : `${left} day${left === 1 ? '' : 's'} left`}
          </span>
          <span className="text-content-soft">
            {autoRenew ? `Renews on ${formatDate(subscription.expiresAt)}` : `Ends on ${formatDate(subscription.expiresAt)}`}
          </span>
        </div>
        <div className="h-2 rounded-full bg-fill-strong overflow-hidden">
          <div className={`h-full rounded-full ${ending ? 'bg-warning' : 'bg-brand-600'}`} style={{ width: `${used}%` }} />
        </div>
      </div>
    </div>
  );
}

function PlanCard({ plan, onChoose }: { plan: SubscriptionPlan; onChoose: () => void }) {
  const free = plan.price <= 0;
  return (
    <div className={`card p-5 flex flex-col gap-4 ${plan.isRecommended ? 'border-brand-600! shadow-lg!' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-content">{plan.name}</h3>
        <div className="flex flex-wrap justify-end gap-1">
          {plan.isCurrent && <Badge variant="success">Current</Badge>}
          {plan.isRecommended && <Badge variant="info">Recommended</Badge>}
        </div>
      </div>

      <div>
        <p className="text-2xl font-bold text-content">{free ? 'Free' : formatVnd(plan.price)}</p>
        {!free && <p className="text-sm text-content-soft">for {plan.durationDays} days</p>}
      </div>

      <ul className="space-y-2 flex-1">
        {plan.features.length === 0 && (
          <li className="flex items-start gap-2 text-sm text-content-secondary">
            <Icon.Check className="w-4 h-4 mt-0.5 text-success shrink-0" />
            <span>Full access for {plan.durationDays} days</span>
          </li>
        )}
        {plan.features.map(feature => (
          <li key={feature} className="flex items-start gap-2 text-sm text-content-secondary">
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
        <Button variant={plan.isRecommended ? 'primary' : 'outline'} onClick={onChoose}>Choose plan</Button>
      )}
    </div>
  );
}
