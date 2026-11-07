import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Card";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/ToastHost";
import { Icon } from "@/assets/icons";
import { ROUTES } from "@/app/routes";
import { formatVnd } from "@/services/payment.service";
import {
  studentDiscountService,
  type StudentDiscount,
  type StudentDiscountDetail,
  type StudentDiscountStatus,
} from "@/services/studentDiscount.service";
import { getApiErrorMessage } from "@/utils/apiError";
import {
  LoadError,
  PageTitle,
  STUDENT_PAGE_CLASS,
  formatDate,
  formatDateTime,
} from "../components/studentUi";

const PAGE_SIZE = 10;
const statuses: { label: string; value: string }[] = [
  { label: "All statuses", value: "" },
  { label: "Available", value: "AVAILABLE" },
  { label: "Used", value: "USED" },
  { label: "Expired", value: "EXPIRED" },
  { label: "Revoked", value: "REVOKED" },
];
const sources = [
  { label: "All sources", value: "" },
  { label: "Contest rewards", value: "CONTEST" },
  { label: "Payment discounts", value: "PAYMENT" },
];

export function StudentDiscountsPage() {
  const { discountId } = useParams<{ discountId: string }>();
  return discountId ? (
    <DiscountDetail discountId={discountId} />
  ) : (
    <DiscountList />
  );
}

function DiscountList() {
  const navigate = useNavigate();
  const toast = useToast();
  const [items, setItems] = useState<StudentDiscount[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    studentDiscountService
      .list({ status, source, page: page - 1, size: PAGE_SIZE })
      .then((data) => {
        if (cancelled) return;
        setItems(data.content);
        setTotal(data.totalElements);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = getApiErrorMessage(
          err,
          "Could not load your discounts.",
        );
        setError(message);
        toast.error(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, source, page, reload, toast]);

  const setFilter = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };

  return (
    <div className={`${STUDENT_PAGE_CLASS} space-y-6`}>
      <PageTitle
        title="My Discounts"
        subtitle="Vouchers and rewards assigned to your account, including prizes from contests."
      />
      <section className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        <Select
          aria-label="Discount status"
          value={status}
          onChange={setFilter(setStatus)}
          options={statuses}
        />
        <Select
          aria-label="Discount source"
          value={source}
          onChange={setFilter(setSource)}
          options={sources}
        />
      </section>
      {error ? (
        <LoadError message={error} onRetry={() => setReload((n) => n + 1)} />
      ) : loading ? (
        <div className="card divide-y divide-line" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-24 animate-pulse bg-surface-muted/40" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Icon.Award className="h-7 w-7" />}
            title="No discounts found"
            message="Discounts assigned to you will appear here."
          />
        </div>
      ) : (
        <section className="card overflow-hidden">
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <li key={item.userDiscountId}>
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `${ROUTES.studentDiscounts}/${item.userDiscountId}`,
                    )
                  }
                  className="flex w-full flex-wrap items-center gap-4 px-4 py-4 text-left transition-colors hover:bg-surface-muted/50 sm:px-5"
                >
                  <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
                    <Icon.Award className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 font-semibold text-content">
                      {item.name}
                      <StatusBadge status={item.status} />
                    </span>
                    <span className="mt-1 block truncate font-mono text-xs text-content-subtle">
                      {item.code} · {sourceLabel(item.sourceType)}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-semibold text-content">
                      {discountValue(item)}
                    </span>
                    <span className="mt-1 block text-xs text-content-subtle">
                      {item.expiresAt
                        ? `Expires ${formatDate(item.expiresAt)}`
                        : "No expiry date"}
                    </span>
                  </span>
                  <Icon.ChevronRight className="h-4 w-4 text-content-subtle" />
                </button>
              </li>
            ))}
          </ul>
          <Pagination
            page={page}
            total={total}
            perPage={PAGE_SIZE}
            unit="discounts"
            onChange={setPage}
          />
        </section>
      )}
    </div>
  );
}

function DiscountDetail({ discountId }: { discountId: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [item, setItem] = useState<StudentDiscountDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    studentDiscountService
      .get(discountId)
      .then((data) => {
        if (!cancelled) setItem(data);
      })
      .catch((err) => {
        if (!cancelled)
          setError(getApiErrorMessage(err, "Could not load this discount."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [discountId, reload]);

  async function copyCode() {
    if (!item) return;
    try {
      await navigator.clipboard.writeText(item.code);
      toast.success("Discount code copied.");
    } catch {
      toast.error("Could not copy the discount code.");
    }
  }

  return (
    <div className={`${STUDENT_PAGE_CLASS} space-y-5`}>
      <Button variant="ghost" onClick={() => navigate(ROUTES.studentDiscounts)}>
        ← My Discounts
      </Button>
      {loading ? (
        <div
          className="card h-72 animate-pulse bg-surface-muted/40"
          aria-busy="true"
        />
      ) : error || !item ? (
        <LoadError
          message={error ?? "Discount not found."}
          onRetry={() => setReload((n) => n + 1)}
        />
      ) : (
        <article className="card mx-auto max-w-3xl overflow-hidden">
          <div className="bg-gradient-to-br from-primary-light to-surface-muted p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge variant="info">{sourceLabel(item.sourceType)}</Badge>
              <StatusBadge status={item.status} />
            </div>
            <h1 className="mt-5 text-2xl font-bold text-content sm:text-3xl">
              {item.name}
            </h1>
            <p className="mt-2 text-content-secondary">
              {item.description || "A discount assigned to your account."}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface/90 p-4">
              <div>
                <p className="text-xs text-content-subtle">Discount code</p>
                <p className="mt-1 font-mono text-lg font-bold tracking-wide text-content">
                  {item.code}
                </p>
              </div>
              <Button
                variant="outline"
                icon={<Icon.Copy className="h-4 w-4" />}
                onClick={() => void copyCode()}
              >
                Copy code
              </Button>
            </div>
          </div>
          <dl className="grid gap-4 p-6 sm:grid-cols-2 sm:p-8">
            <DetailFact label="Value" value={discountValue(item)} />
            <DetailFact
              label="Applies to"
              value={
                item.appliesTo === "ALL"
                  ? "Courses and subscriptions"
                  : item.appliesTo
              }
            />
            <DetailFact
              label="Minimum order"
              value={
                item.minOrderAmount == null
                  ? "No minimum"
                  : formatVnd(item.minOrderAmount)
              }
            />
            <DetailFact
              label="Maximum discount"
              value={
                item.maxDiscountAmount == null
                  ? "No maximum"
                  : formatVnd(item.maxDiscountAmount)
              }
            />
            <DetailFact
              label="Assigned"
              value={formatDateTime(item.assignedAt)}
            />
            <DetailFact label="Starts" value={formatDateTime(item.startAt)} />
            <DetailFact
              label="Expires"
              value={formatDateTime(item.expiresAt)}
            />
            <DetailFact label="Used" value={formatDateTime(item.usedAt)} />
          </dl>
          {item.contestInfo && (
            <div className="border-t border-line bg-surface-muted/40 px-6 py-5 sm:px-8">
              <p className="text-xs font-semibold uppercase tracking-wide text-content-subtle">
                Contest reward
              </p>
              <p className="mt-1 font-semibold text-content">
                {item.contestInfo.title}
              </p>
              <p className="mt-1 text-sm text-content-soft">
                {formatDate(item.contestInfo.startTime)} –{" "}
                {formatDate(item.contestInfo.endTime)}
              </p>
              <Button
                className="mt-3"
                variant="outline"
                size="sm"
                onClick={() =>
                  navigate(
                    `${ROUTES.studentContests}/${item.contestInfo!.contestId}`,
                  )
                }
              >
                View contest
              </Button>
            </div>
          )}
        </article>
      )}
    </div>
  );
}

function DetailFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-content-subtle">{label}</dt>
      <dd className="mt-1 font-medium text-content">{value}</dd>
    </div>
  );
}

function discountValue(item: StudentDiscount) {
  return item.discountType === "PERCENT"
    ? `${item.value}% off`
    : `${formatVnd(item.value)} off`;
}

function sourceLabel(source: string | null) {
  return source === "CONTEST"
    ? "Contest reward"
    : source
      ? source
          .replace(/_/g, " ")
          .toLowerCase()
          .replace(/\b\w/g, (char) => char.toUpperCase())
      : "Assigned discount";
}

function StatusBadge({ status }: { status: StudentDiscountStatus }) {
  const variant =
    status === "AVAILABLE"
      ? "success"
      : status === "USED"
        ? "info"
        : status === "EXPIRED"
          ? "warning"
          : "default";
  const label = status.charAt(0) + status.slice(1).toLowerCase();
  return <Badge variant={variant}>{label}</Badge>;
}
