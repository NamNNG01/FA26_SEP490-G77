import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/assets/icons';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  formatVnd,
  isPaymentFinal,
  subscriptionService,
  type PaymentStatus,
  type SubscriptionCheckout,
  type SubscriptionPlan,
} from '@/services/studentSubscription.service';
import { formatDateTime } from './studentUi';

/** How often PY-02 is asked while the QR is on screen. */
const POLL_MS = 3000;

const FINAL_MESSAGE: Record<Exclude<PaymentStatus, 'PENDING' | 'SUCCEEDED'>, string> = {
  EXPIRED: 'This payment link has expired. Create a new one to continue.',
  FAILED: 'The payment did not go through. Create a new payment to try again.',
  CANCELLED: 'This payment was cancelled.',
};

type ApiErrorLike = { response?: { status?: number } };
const httpStatus = (err: unknown) => (err as ApiErrorLike)?.response?.status;

/**
 * Buys a plan: SB-03 creates the PayOS order, then the QR stays on screen while PY-02 is polled.
 * The plan only turns ACTIVE through the PayOS webhook, so `onPaid` fires when PY-02 reports
 * SUCCEEDED. Closing the modal leaves the order payable (SB-03 hands the same order back later);
 * "Cancel payment" closes it with PY-04.
 */
export function SubscriptionCheckoutModal({
  plan,
  onClose,
  onPaid,
}: {
  plan: SubscriptionPlan | null;
  onClose: () => void;
  onPaid: (planName: string) => void;
}) {
  const [discountCode, setDiscountCode] = useState('');
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkout, setCheckout] = useState<SubscriptionCheckout | null>(null);
  const [status, setStatus] = useState<PaymentStatus>('PENDING');
  const [cancelling, setCancelling] = useState(false);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  // A new plan starts from the first step.
  useEffect(() => {
    setDiscountCode('');
    setDiscountError(null);
    setError(null);
    setCheckout(null);
    setStatus('PENDING');
  }, [plan?.planId]);

  useEffect(() => {
    if (!checkout || status !== 'PENDING') return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const state = await subscriptionService.getPaymentStatus(checkout.orderCode);
        if (stopped) return;
        if (isPaymentFinal(state.status)) {
          setStatus(state.status);
          if (state.status === 'SUCCEEDED') onPaidRef.current(checkout.planName);
          return;
        }
      } catch {
        // A failed poll is retried on the next tick.
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };
    timer = setTimeout(poll, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [checkout, status]);

  async function handleCheckout() {
    if (!plan) return;
    setSubmitting(true);
    setError(null);
    setDiscountError(null);
    try {
      const created = await subscriptionService.checkout(plan.planId, discountCode);
      setStatus('PENDING');
      setCheckout(created);
    } catch (err) {
      const code = httpStatus(err);
      if (code === 400 && discountCode.trim()) {
        setDiscountError(getApiErrorMessage(err, 'This discount code is not valid.'));
      } else if (code === 404) {
        setError('This plan is no longer available.');
      } else {
        setError(getApiErrorMessage(err, 'Could not create the payment. Please try again.'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelPayment() {
    if (!checkout) return;
    setCancelling(true);
    try {
      await subscriptionService.cancelPayment(checkout.orderCode);
      setStatus('CANCELLED');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not cancel the payment.'));
    } finally {
      setCancelling(false);
    }
  }

  function startOver() {
    setCheckout(null);
    setStatus('PENDING');
    setError(null);
  }

  if (!plan) return null;

  const paying = checkout != null;
  const footer = !paying ? (
    <>
      <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
      <Button onClick={handleCheckout} loading={submitting}>Continue to payment</Button>
    </>
  ) : status === 'PENDING' ? (
    <>
      <Button variant="ghost" onClick={handleCancelPayment} loading={cancelling}>Cancel payment</Button>
      <Button variant="outline" onClick={onClose}>Pay later</Button>
    </>
  ) : status === 'SUCCEEDED' ? (
    <Button onClick={onClose}>Done</Button>
  ) : (
    <>
      <Button variant="outline" onClick={onClose}>Close</Button>
      <Button onClick={startOver}>New payment</Button>
    </>
  );

  return (
    <Modal open onClose={onClose} title={`Upgrade to ${plan.name}`} footer={footer}>
      <div className="space-y-4">
        {error && <Alert type="error" message={error} />}

        {!paying && (
          <>
            <div className="rounded-[12px] border border-line p-4 flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-content truncate">{plan.name}</p>
                <p className="text-sm text-content-soft">{plan.durationDays} days</p>
              </div>
              <p className="text-lg font-bold text-content whitespace-nowrap">{formatVnd(plan.price)}</p>
            </div>
            <Input
              label="Discount code (optional)"
              placeholder="e.g. SUMMER26"
              value={discountCode}
              onChange={e => { setDiscountCode(e.target.value.toUpperCase()); setDiscountError(null); }}
              onKeyDown={e => { if (e.key === 'Enter' && !submitting) void handleCheckout(); }}
              error={discountError ?? undefined}
              maxLength={50}
            />
            <p className="text-xs text-content-soft">
              Your plan starts as soon as PayOS confirms the payment.
            </p>
          </>
        )}

        {paying && (
          <>
            <PriceBreakdown checkout={checkout} />

            {status === 'PENDING' && (
              <div className="flex flex-col items-center gap-3 text-center">
                <PaymentQr value={checkout.qrCode} />
                <p className="text-sm text-content-soft">
                  Scan with your banking app, or{' '}
                  <a href={checkout.paymentUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-ink underline">
                    open the PayOS page
                  </a>.
                </p>
                <p className="inline-flex items-center gap-1.5 text-xs text-content-soft">
                  <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full spinner" />
                  Waiting for payment · link expires {formatDateTime(checkout.expiresAt)}
                </p>
              </div>
            )}

            {status === 'SUCCEEDED' && (
              <Alert type="success" title="Payment received" message={`${checkout.planName} is now active.`} />
            )}
            {status !== 'PENDING' && status !== 'SUCCEEDED' && (
              <Alert type="warning" message={FINAL_MESSAGE[status]} />
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function PriceBreakdown({ checkout }: { checkout: SubscriptionCheckout }) {
  return (
    <dl className="rounded-[12px] border border-line p-4 space-y-1.5 text-sm">
      <div className="flex justify-between gap-3">
        <dt className="text-content-soft">{checkout.planName}</dt>
        <dd className="text-content">{formatVnd(checkout.originalPrice)}</dd>
      </div>
      {checkout.discountAmount > 0 && (
        <div className="flex justify-between gap-3">
          <dt className="text-content-soft">Discount</dt>
          <dd className="text-success">−{formatVnd(checkout.discountAmount)}</dd>
        </div>
      )}
      <div className="flex justify-between gap-3 border-t border-line-soft pt-1.5 font-semibold">
        <dt className="text-content">Total</dt>
        <dd className="text-content">{formatVnd(checkout.totalPrice)}</dd>
      </div>
    </dl>
  );
}

/** SB-03 `qrCode` is an image (data:/http URL) in the spec, but PayOS hands back the raw VietQR text. */
function PaymentQr({ value }: { value: string | null }) {
  if (!value) {
    return (
      <div className="w-48 h-48 rounded-[12px] border border-dashed border-line flex flex-col items-center justify-center gap-2 text-content-subtle">
        <Icon.Scan className="w-8 h-8" />
        <span className="text-xs">QR not available</span>
      </div>
    );
  }
  const isImage = /^(data:image\/|https?:\/\/)/i.test(value);
  return (
    <div className="rounded-[12px] bg-white p-3 border border-line">
      {isImage
        ? <img src={value} alt="Payment QR code" className="w-48 h-48 object-contain" />
        : <QRCodeSVG value={value} size={192} aria-label="Payment QR code" />}
    </div>
  );
}
