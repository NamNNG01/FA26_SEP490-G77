import { moneyToDigits } from "@/components/ui/MoneyInput";
import type {
  AppliesTo,
  Discount,
  DiscountAccessType,
  DiscountPayload,
  DiscountType,
  Page,
} from "@/services/adminDiscount.service";

export const PAGE_SIZE = 10;

export const EMPTY_PAGE: Page<Discount> = {
  content: [],
  page: 0,
  size: PAGE_SIZE,
  totalElements: 0,
  totalPages: 0,
  first: true,
  last: true,
};

export const validityLabels: Record<string, string> = {
  ACTIVE: "Active",
  UPCOMING: "Upcoming",
  EXPIRED: "Expired",
  EXHAUSTED: "Exhausted",
  INACTIVE: "Inactive",
};

export type FormState = {
  code: string;
  name: string;
  description: string;
  discountType: DiscountType;
  value: string;
  maxDiscountAmount: string;
  minOrderAmount: string;
  appliesTo: AppliesTo;
  accessType: DiscountAccessType;
  usageLimit: string;
  startAt: string;
  expiredAt: string;
  isActive: boolean;
};

export const blankForm = (): FormState => ({
  code: "",
  name: "",
  description: "",
  discountType: "PERCENT",
  value: "",
  maxDiscountAmount: "",
  minOrderAmount: "",
  appliesTo: "ALL",
  accessType: "PUBLIC",
  usageLimit: "100",
  startAt: "",
  expiredAt: "",
  isActive: true,
});

export const toLocalInput = (value?: string | null) => {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
};

export const hcmInputToIso = (value: string) => {
  if (!value) return null;
  const [date, time] = value.split("T");
  return new Date(`${date}T${time}:00+07:00`).toISOString();
};

export const formFromDiscount = (d: Discount): FormState => ({
  code: d.code,
  name: d.name,
  description: d.description ?? "",
  discountType: d.discountType,
  value: d.discountType === "FIXED_AMOUNT" ? moneyToDigits(d.value) : String(d.value),
  maxDiscountAmount: moneyToDigits(d.maxDiscountAmount),
  minOrderAmount: moneyToDigits(d.minOrderAmount),
  appliesTo: d.appliesTo,
  accessType: d.accessType ?? "PUBLIC",
  usageLimit: String(d.usageLimit),
  startAt: toLocalInput(d.startAt),
  expiredAt: toLocalInput(d.expiredAt),
  isActive: d.isActive,
});

export const toPayload = (f: FormState): DiscountPayload => ({
  code: f.code.trim(),
  name: f.name.trim(),
  description: f.description.trim(),
  discountType: f.discountType,
  value: Number(f.value),
  maxDiscountAmount:
    f.discountType === "PERCENT" && f.maxDiscountAmount ? Number(f.maxDiscountAmount) : null,
  minOrderAmount: f.minOrderAmount ? Number(f.minOrderAmount) : null,
  appliesTo: f.appliesTo,
  accessType: f.accessType,
  usageLimit: Number(f.usageLimit),
  startAt: hcmInputToIso(f.startAt),
  expiredAt: hcmInputToIso(f.expiredAt),
  isActive: f.isActive,
});

export const dateLabel = (value?: string | null) =>
  value ? new Date(value).toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }) : "—";

export const badgeVariant = (status: string) =>
  status === "ACTIVE"
    ? "success"
    : status === "UPCOMING"
      ? "info"
      : status === "INACTIVE"
        ? "default"
        : "warning";
