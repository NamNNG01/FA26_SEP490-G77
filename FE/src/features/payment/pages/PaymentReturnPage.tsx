import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/assets/icons';
import { ROUTES, coursePath, studentCoursePath } from '@/app/routes';
import { refreshCurrentSubscription } from '@/services/studentSubscription.service';
import {
  PAYMENT_POLL_MS,
  forgetPendingPayment,
  isPaymentFinal,
  paymentService,
  readPendingPayment,
  type PaymentStatus,
} from '@/services/payment.service';
import { STUDENT_PAGE_CLASS } from '@/features/student/components/studentUi';

/** Stop waiting for the webhook after this long and point to the Payments page. */
const MAX_WAIT_MS = 2 * 60 * 1000;

type View = PaymentStatus | 'UNKNOWN' | 'TIMEOUT';

/**
 * Where PayOS sends the student back (BE `app.payos.return-url` / `cancel-url`).
 *
 * PayOS adds its own numeric orderCode and a `status`, but access is only granted by the verified
 * webhook, so the query is not trusted: the order comes from the one remembered when the checkout was
 * created, and its state from PY-04 (polled every 3 s). `/payment/cancel` closes the order with PY-02.
 */
export function PaymentReturnPage({ cancelled = false }: { cancelled?: boolean }) {
  const navigate = useNavigate();
  const [pending] = useState(readPendingPayment);
  const [view, setView] = useState<View>(pending ? 'PENDING' : 'UNKNOWN');

  useEffect(() => {
    if (!pending) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const startedAt = Date.now();

    const finish = (status: PaymentStatus) => {
      forgetPendingPayment();
      if (status === 'SUCCEEDED' && pending.type === 'SUBSCRIPTION') void refreshCurrentSubscription();
      setView(status);
    };

    const poll = async () => {
      try {
        const state = await paymentService.getStatus(pending.orderCode);
        if (stopped) return;
        if (isPaymentFinal(state.status)) return finish(state.status);
      } catch {
        // Retried on the next tick.
      }
      if (stopped) return;
      if (Date.now() - startedAt > MAX_WAIT_MS) return setView('TIMEOUT');
      timer = setTimeout(poll, PAYMENT_POLL_MS);
    };

    const start = async () => {
      if (cancelled) {
        try {
          await paymentService.cancel(pending.orderCode);
          if (!stopped) finish('CANCELLED');
          return;
        } catch {
          // 409: paid after all — or the order is gone; PY-04 tells which.
        }
      }
      if (!stopped) void poll();
    };
    void start();

    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [pending, cancelled]);

  const isCourse = pending?.type === 'COURSE';
  const backToItem = () =>
    navigate(pending ? (isCourse ? coursePath(pending.refId) : ROUTES.studentSubscription) : ROUTES.studentPayments);

  const content: Record<View, { icon: ReactNode; title: string; message: string; actions: ReactNode }> = {
    PENDING: {
      icon: <span className="w-8 h-8 border-[3px] border-brand-600 border-t-transparent rounded-full spinner" />,
      title: 'Confirming your payment…',
      message: 'This usually takes a few seconds. Please keep this page open.',
      actions: null,
    },
    SUCCEEDED: {
      icon: <Icon.CheckCircle className="w-10 h-10 text-success" />,
      title: 'Payment successful',
      message: isCourse ? `You are enrolled in ${pending?.title}.` : `${pending?.title} is now active.`,
      actions: isCourse ? (
        <Button onClick={() => navigate(studentCoursePath(pending!.refId))}>Go to course</Button>
      ) : (
        <Button onClick={() => navigate(ROUTES.studentSubscription)}>View my plan</Button>
      ),
    },
    CANCELLED: {
      icon: <Icon.XCircle className="w-10 h-10 text-content-subtle" />,
      title: 'Payment cancelled',
      message: 'You have not been charged.',
      actions: <Button variant="outline" onClick={backToItem}>{isCourse ? 'Back to course' : 'Back to plans'}</Button>,
    },
    EXPIRED: {
      icon: <Icon.Clock className="w-10 h-10 text-warning" />,
      title: 'Payment link expired',
      message: 'Start a new payment to continue.',
      actions: <Button onClick={backToItem}>Try again</Button>,
    },
    FAILED: {
      icon: <Icon.AlertCircle className="w-10 h-10 text-danger" />,
      title: 'Payment failed',
      message: 'The payment did not go through. You can try again.',
      actions: <Button onClick={backToItem}>Try again</Button>,
    },
    TIMEOUT: {
      icon: <Icon.Clock className="w-10 h-10 text-warning" />,
      title: 'Still waiting for PayOS',
      message: 'We have not received the confirmation yet. Check your payments again in a moment.',
      actions: <Button variant="outline" onClick={() => navigate(ROUTES.studentPayments)}>View payments</Button>,
    },
    UNKNOWN: {
      icon: <Icon.HelpCircle className="w-10 h-10 text-content-subtle" />,
      title: cancelled ? 'Payment cancelled' : 'Payment received by PayOS',
      message: 'We could not match this page to an order. Your payments list shows the latest status.',
      actions: <Button variant="outline" onClick={() => navigate(ROUTES.studentPayments)}>View payments</Button>,
    },
  };

  const c = content[view];
  return (
    <div className={STUDENT_PAGE_CLASS}>
      <div className="card mx-auto max-w-md px-6 py-10 flex flex-col items-center text-center gap-3">
        {c.icon}
        <h1 className="text-lg font-semibold text-content">{c.title}</h1>
        <p className="text-sm text-content-soft">{c.message}</p>
        {c.actions && <div className="mt-2 flex flex-wrap justify-center gap-2">{c.actions}</div>}
        {view !== 'UNKNOWN' && view !== 'TIMEOUT' && view !== 'PENDING' && (
          <button type="button" onClick={() => navigate(ROUTES.studentPayments)} className="text-xs text-content-soft underline">
            Payment history
          </button>
        )}
      </div>
    </div>
  );
}
