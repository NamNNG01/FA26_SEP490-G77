import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/assets/icons';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  PAYMENT_POLL_MS,
  forgetPendingPayment,
  formatVnd,
  isPaymentFinal,
  paymentService,
  rememberPendingPayment,
  type DiscountCheck,
  type PaymentCheckout,
  type PaymentStatus,
  type PaymentTarget,
  type PaymentType,
} from '@/services/payment.service';

/** The course or plan being bought. */
export interface PaymentItem {
  target: PaymentTarget;
  type: PaymentType;
  refId: number;
  title: string;
  /** e.g. "30 days" or the category of a course. */
  subtitle?: string;
  price: number;
}

const FINAL_MESSAGE: Record<Exclude<PaymentStatus, 'PENDING' | 'SUCCEEDED'>, string> = {
  EXPIRED: 'This payment link has expired. Create a new one to continue.',
  FAILED: 'The payment did not go through. Create a new payment to try again.',
  CANCELLED: 'This payment was cancelled.',
};

type ApiErrorLike = { response?: { status?: number } };
const httpStatus = (err: unknown) => (err as ApiErrorLike)?.response?.status;

/** "Oct 30, 14:05", local time. */
function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Buys a course or a plan with PayOS:
 *   1. optional discount code, checked with PY-05 ("Apply") before anything is created;
 *   2. PY-01 creates the order, the QR stays on screen and PY-04 is polled every 3 s;
 *   3. `onPaid` fires when PY-04 reports SUCCEEDED — access only comes from the verified webhook.
 * Closing the modal leaves the order payable (PY-01 hands the same order back later); "Cancel payment"
 * closes it with PY-02. The order is remembered for /payment/return in case the student pays on the
 * PayOS page instead of scanning.
 */
export function PaymentCheckoutModal({
  item,
  onClose,
  onPaid,
}: {
  item: PaymentItem | null;
  onClose: () => void;
  onPaid: (item: PaymentItem) => void;
}) {
  const [code, setCode] = useState('');
  const [discount, setDiscount] = useState<(DiscountCheck & { code: string }) | null>(null);
  const [checkingCode, setCheckingCode] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkout, setCheckout] = useState<PaymentCheckout | null>(null);
  const [status, setStatus] = useState<PaymentStatus>('PENDING');
  const [cancelling, setCancelling] = useState(false);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  const itemKey = item ? `${item.type}-${item.refId}` : '';

  // Another item starts from the first step.
  useEffect(() => {
    setCode('');
    setDiscount(null);
    setCodeError(null);
    setError(null);
    setCheckout(null);
    setStatus('PENDING');
  }, [itemKey]);

  useEffect(() => {
    if (!checkout || !item || status !== 'PENDING') return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const state = await paymentService.getStatus(checkout.orderCode);
        if (stopped) return;
        if (isPaymentFinal(state.status)) {
          setStatus(state.status);
          forgetPendingPayment();
          if (state.status === 'SUCCEEDED') onPaidRef.current(item);
          return;
        }
      } catch {
        // A failed poll is retried on the next tick.
      }
      if (!stopped) timer = setTimeout(poll, PAYMENT_POLL_MS);
    };
    timer = setTimeout(poll, PAYMENT_POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [checkout, item, status]);

  const trimmed = code.trim();
  const applied = discount?.valid && discount.code === trimmed ? discount : null;

  /** PY-05 — true when the code can go to PY-01. */
  async function applyCode(): Promise<boolean> {
    if (!item || !trimmed) return true;
    if (discount?.code === trimmed) return discount.valid;
    setCheckingCode(true);
    setCodeError(null);
    try {
      const res = await paymentService.validateDiscount(trimmed, item.target);
      setDiscount({ ...res, code: trimmed });
      if (!res.valid) setCodeError(res.reason || 'This discount code is not valid.');
      return res.valid;
    } catch (err) {
      setDiscount(null);
      setCodeError(getApiErrorMessage(err, 'Could not check the discount code.'));
      return false;
    } finally {
      setCheckingCode(false);
    }
  }

  async function handleCheckout() {
    if (!item) return;
    setError(null);
    // A code typed but not applied yet is checked first.
    if (!(await applyCode())) return;
    setSubmitting(true);
    try {
      const created = await paymentService.checkout(item.target, trimmed || undefined);
      rememberPendingPayment({ orderCode: created.orderCode, type: item.type, refId: item.refId, title: item.title });
      setStatus('PENDING');
      setCheckout(created);
    } catch (err) {
      const statusCode = httpStatus(err);
      if (statusCode === 400 && trimmed) {
        setCodeError(getApiErrorMessage(err, 'This discount code is not valid.'));
      } else if (statusCode === 404) {
        setError(`This ${item.type === 'COURSE' ? 'course' : 'plan'} is no longer available.`);
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
    setError(null);
    try {
      await paymentService.cancel(checkout.orderCode);
      forgetPendingPayment();
      setStatus('CANCELLED');
    } catch (err) {
      if (httpStatus(err) === 409) {
        // Paid in the meantime — the next poll shows it.
        setError('This payment has already been completed.');
      } else {
        setError(getApiErrorMessage(err, 'Could not cancel the payment.'));
      }
    } finally {
      setCancelling(false);
    }
  }

  function startOver() {
    setCheckout(null);
    setStatus('PENDING');
    setError(null);
  }

  if (!item) return null;

  const paying = checkout != null;
  const busy = submitting || checkingCode;
  const footer = !paying ? (
    <>
      <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
      <Button onClick={handleCheckout} loading={submitting} disabled={checkingCode}>Continue to payment</Button>
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
    <Modal open onClose={onClose} title={item.type === 'COURSE' ? 'Buy course' : `Upgrade to ${item.title}`} footer={footer}>
      <div className="space-y-4">
        {error && <Alert type="error" message={error} />}

        {!paying && (
          <>
            <div className="rounded-[12px] border border-line p-4 flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-content truncate">{item.title}</p>
                {item.subtitle && <p className="text-sm text-content-soft">{item.subtitle}</p>}
              </div>
              <p className="text-lg font-bold text-content whitespace-nowrap">{formatVnd(item.price)}</p>
            </div>

            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <Input
                  label="Discount code (optional)"
                  placeholder="e.g. SUMMER26"
                  value={code}
                  onChange={e => { setCode(e.target.value.toUpperCase()); setCodeError(null); }}
                  onKeyDown={e => { if (e.key === 'Enter' && trimmed && !busy) void applyCode(); }}
                  error={codeError ?? undefined}
                  maxLength={50}
                />
              </div>
              <Button
                variant="outline"
                className="mt-6"
                onClick={() => void applyCode()}
                loading={checkingCode}
                disabled={!trimmed || submitting || discount?.code === trimmed}
              >
                Apply
              </Button>
            </div>

            {applied && (
              <dl className="rounded-[12px] bg-success-light/50 border border-success-line p-4 space-y-1.5 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-content-soft">Price</dt>
                  <dd className="text-content">{formatVnd(item.price)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-content-soft">
                    Discount {applied.code}{applied.discountPercent ? ` (−${Number(applied.discountPercent)}%)` : ''}
                  </dt>
                  <dd className="text-success">−{formatVnd(applied.discountAmount)}</dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-line-soft pt-1.5 font-semibold">
                  <dt className="text-content">Total</dt>
                  <dd className="text-content">{formatVnd(applied.finalPrice)}</dd>
                </div>
                {applied.expiresAt && (
                  <p className="text-xs text-content-soft pt-1">Code valid until {formatTime(applied.expiresAt)}</p>
                )}
              </dl>
            )}

            <p className="text-xs text-content-soft">
              {item.type === 'COURSE'
                ? 'You get access to the course as soon as PayOS confirms the payment.'
                : 'Your plan starts as soon as PayOS confirms the payment.'}
            </p>
          </>
        )}

        {paying && (
          <>
            <PriceBreakdown checkout={checkout} title={item.title} />

            {status === 'PENDING' && (
              <div className="flex flex-col items-center gap-3 text-center">
                <PaymentQr value={checkout.qrCode} />
                <p className="text-sm text-content-soft">
                  Scan with your banking app, or{' '}
                  <a href={checkout.paymentUrl} className="font-medium text-brand-ink underline">
                    pay on the PayOS page
                  </a>.
                </p>
                <p className="inline-flex items-center gap-1.5 text-xs text-content-soft">
                  <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full spinner" />
                  Waiting for payment · link expires {formatTime(checkout.expiresAt)}
                </p>
              </div>
            )}

            {status === 'SUCCEEDED' && (
              <Alert
                type="success"
                title="Payment received"
                message={item.type === 'COURSE' ? `You are enrolled in ${item.title}.` : `${item.title} is now active.`}
              />
            )}
            {status !== 'PENDING' && status !== 'SUCCEEDED' && <Alert type="warning" message={FINAL_MESSAGE[status]} />}
          </>
        )}
      </div>
    </Modal>
  );
}

function PriceBreakdown({ checkout, title }: { checkout: PaymentCheckout; title: string }) {
  return (
    <dl className="rounded-[12px] border border-line p-4 space-y-1.5 text-sm">
      <div className="flex justify-between gap-3">
        <dt className="text-content-soft truncate">{checkout.courseTitle ?? checkout.planName ?? title}</dt>
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

/** `qrCode` is an image (data:/http URL) in the spec, but PayOS hands back the raw VietQR text. */
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
