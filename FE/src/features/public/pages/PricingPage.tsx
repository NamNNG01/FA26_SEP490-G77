import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Icon } from '@/assets/icons';
import { ROUTES } from '@/app/routes';
import { useAuth } from '@/auth/authContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { Button } from '@/components/ui/Button';
import { Role } from '@/utils/permissions';
import { getApiErrorMessage } from '@/utils/apiError';
import { formatVnd } from '@/services/payment.service';
import {
  adminSubscriptionPlanService,
  type PublicSubscriptionPlan,
} from '@/services/adminSubscriptionPlan.service';

/**
 * PricingPage (P04)
 *
 * Public list of active subscription plans (API 27, GET /subscription-plans),
 * already sorted by sortOrder on the server. Cards sit four to a row on
 * desktop, two on tablet, one on phone.
 *
 * Plan CTA:
 *  - guest            → /login?redirect=/student/subscription, then checkout there
 *  - signed-in student → /student/subscription (the existing checkout flow)
 *  - other roles      → disabled; plans are bought by student accounts only
 */
export function PricingPage() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const requireAuth = useRequireAuth();
  const [plans, setPlans] = useState<PublicSubscriptionPlan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setPlans(null);
    adminSubscriptionPlanService
      .listPublic()
      .then((rows) => { if (!cancelled) setPlans(rows); })
      .catch((err) => { if (!cancelled) setError(getApiErrorMessage(err, 'Could not load the plans.')); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const canBuy = !isAuthenticated || user?.role === Role.STUDENT;

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-gradient-to-br from-surface-brand to-surface">
      <div className="mx-auto w-full max-w-[1280px] px-4 py-[clamp(2.5rem,6vw,4.5rem)] sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold tracking-[0.08em] text-brand-ink uppercase">Pricing</p>
          <h1 className="mt-3 text-[clamp(1.9rem,1.3rem+2.4vw,3rem)] leading-tight font-bold text-content">
            Pick the plan that fits your exam date
          </h1>
          <p className="mt-3 text-base leading-relaxed text-content-muted">
            Each plan gives full access for its duration plus an AI token allowance. Browsing the course catalog stays free.
          </p>
        </div>

        <div className="mt-[clamp(2rem,4vw,3rem)]">
          {error ? (
            <div className="card mx-auto max-w-md p-8 text-center">
              <p className="text-sm text-danger">{error}</p>
              <Button variant="outline" className="mt-4" onClick={() => setReloadKey((k) => k + 1)}>
                Try again
              </Button>
            </div>
          ) : plans === null ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="card h-[380px] animate-pulse bg-surface-alt" />
              ))}
            </div>
          ) : plans.length === 0 ? (
            <div className="card mx-auto max-w-md p-8 text-center text-sm text-content-soft">
              No plans are on offer right now. You can still browse every course for free.
              <div className="mt-4">
                <Button variant="outline" onClick={() => navigate(ROUTES.courses)}>Browse courses</Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {plans.map((plan) => (
                <PricingCard
                  key={plan.planId}
                  plan={plan}
                  canBuy={canBuy}
                  onChoose={() => requireAuth(ROUTES.studentSubscription)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PricingCard({
  plan,
  canBuy,
  onChoose,
}: {
  plan: PublicSubscriptionPlan;
  canBuy: boolean;
  onChoose: () => void;
}) {
  const free = plan.price <= 0;
  const features = plan.features.length > 0 ? plan.features : [`Full access for ${plan.durationDays} days`];

  return (
    <div className="card flex h-full flex-col gap-5 p-6">
      <div>
        <h2 className="text-lg font-semibold text-content">{plan.planName}</h2>
        {plan.description && (
          <p className="mt-1 text-sm leading-relaxed text-content-soft line-clamp-2">{plan.description}</p>
        )}
      </div>

      <div>
        <p className="font-[family-name:var(--font-display)] text-3xl font-bold text-content">
          {free ? 'Free' : formatVnd(plan.price)}
        </p>
        <p className="mt-1 text-sm text-content-soft">
          {plan.durationDays} days · {plan.aiTokenLimit.toLocaleString('en-US')} AI tokens
        </p>
      </div>

      <ul className="flex-1 space-y-2">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm text-content-secondary">
            <Icon.Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {canBuy ? (
        <Button variant="primary" onClick={onChoose}>
          {free ? 'Get started' : 'Choose plan'}
        </Button>
      ) : (
        <Button variant="outline" disabled>Student accounts only</Button>
      )}
    </div>
  );
}
