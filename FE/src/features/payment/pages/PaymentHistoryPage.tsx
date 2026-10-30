import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Card';
import { Pagination } from '@/components/ui/Pagination';
import { useToast } from '@/components/ui/ToastHost';
import { Icon } from '@/assets/icons';
import { ROUTES, coursePath, studentCoursePath } from '@/app/routes';
import { getApiErrorMessage } from '@/utils/apiError';
import { formatVnd, paymentService, type PaymentHistoryItem, type PaymentStatus } from '@/services/payment.service';
import { ListSkeleton, LoadError, PageTitle, STUDENT_PAGE_CLASS, formatDateTime } from '@/features/student/components/studentUi';

const PAGE_SIZE = 10;

export const PAYMENT_STATUS_BADGE: Record<PaymentStatus, { variant: 'info' | 'success' | 'warning' | 'danger' | 'default'; label: string }> = {
  PENDING: { variant: 'info', label: 'Pending' },
  SUCCEEDED: { variant: 'success', label: 'Paid' },
  FAILED: { variant: 'danger', label: 'Failed' },
  EXPIRED: { variant: 'default', label: 'Expired' },
  CANCELLED: { variant: 'default', label: 'Cancelled' },
};

/**
 * Payments — the student's PayOS orders, newest first (PY-06). A PENDING order can be cancelled (PY-02)
 * or paid from its course / plan page (PY-01 hands the open order back); a paid course opens.
 */
export function PaymentHistoryPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [rows, setRows] = useState<PaymentHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    paymentService
      .getHistory(page - 1, PAGE_SIZE)
      .then(res => {
        if (cancelled) return;
        setRows(res.content);
        setTotal(res.totalElements);
      })
      .catch(err => { if (!cancelled) setError(getApiErrorMessage(err, 'Could not load your payments.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page, reload]);

  async function handleCancel(orderCode: string) {
    setCancelling(orderCode);
    try {
      await paymentService.cancel(orderCode);
      toast.success('Payment cancelled');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not cancel the payment.'));
    } finally {
      setCancelling(null);
      setReload(r => r + 1);
    }
  }

  /** Where the item is bought again — PY-01 there reuses the open order. */
  const itemPath = (row: PaymentHistoryItem) => (row.type === 'COURSE' ? coursePath(row.refId) : ROUTES.studentSubscription);

  return (
    <div className={`${STUDENT_PAGE_CLASS} space-y-6`}>
      <PageTitle title="Payments" subtitle="Your course and plan purchases." />

      {loading ? (
        <ListSkeleton rows={5} />
      ) : error ? (
        <LoadError message={error} onRetry={() => setReload(r => r + 1)} />
      ) : rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Icon.FileText className="w-6 h-6" />}
            title="No payments yet"
            message="Courses and plans you buy will show up here."
            action={<Button variant="outline" onClick={() => navigate(ROUTES.courses)}>Browse courses</Button>}
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-medium uppercase tracking-wide text-content-soft">
                  <th className="px-5 py-3">Item</th>
                  <th className="px-5 py-3 text-right">Amount</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3">Paid</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map(row => {
                  const badge = PAYMENT_STATUS_BADGE[row.status] ?? { variant: 'default' as const, label: row.status };
                  return (
                    <tr key={row.orderCode} className="align-top">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-content">{row.title}</span>
                          <Badge variant={row.type === 'COURSE' ? 'purple' : 'info'}>{row.type === 'COURSE' ? 'Course' : 'Plan'}</Badge>
                        </div>
                        <p className="mt-0.5 font-mono text-2xs text-content-subtle break-all">{row.orderCode}</p>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-content whitespace-nowrap">{formatVnd(row.amount)}</td>
                      <td className="px-5 py-3"><Badge variant={badge.variant}>{badge.label}</Badge></td>
                      <td className="px-5 py-3 text-content-soft whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
                      <td className="px-5 py-3 text-content-soft whitespace-nowrap">{formatDateTime(row.paidAt)}</td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-2">
                          {row.status === 'PENDING' && (
                            <>
                              <Button size="sm" variant="ghost" loading={cancelling === row.orderCode} onClick={() => handleCancel(row.orderCode)}>
                                Cancel
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => navigate(itemPath(row))}>Pay</Button>
                            </>
                          )}
                          {row.status === 'SUCCEEDED' && row.type === 'COURSE' && (
                            <Button size="sm" variant="outline" onClick={() => navigate(studentCoursePath(row.refId))}>Open course</Button>
                          )}
                          {row.status === 'SUCCEEDED' && row.type === 'SUBSCRIPTION' && (
                            <Button size="sm" variant="outline" onClick={() => navigate(ROUTES.studentSubscription)}>View plan</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {total > PAGE_SIZE && (
            <div className="border-t border-line">
              <Pagination page={page} total={total} perPage={PAGE_SIZE} onChange={setPage} unit="payments" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
