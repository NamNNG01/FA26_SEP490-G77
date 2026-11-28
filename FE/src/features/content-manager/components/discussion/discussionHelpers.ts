export const PAGE_SIZE = 20;

export const APPROVAL_OPTIONS = [
  { label: "Pending approval", value: "PENDING" },
  { label: "Approved", value: "APPROVED" },
  { label: "Rejected", value: "REJECTED" },
  { label: "All approval statuses", value: "ALL" },
];

export const POST_STATUS_OPTIONS = [
  { label: "Any post status", value: "ALL" },
  { label: "Open", value: "OPEN" },
  { label: "Closed", value: "CLOSED" },
  { label: "Hidden", value: "HIDDEN" },
];

export const TAG_OPTIONS = [
  { label: "All tags", value: "ALL" },
  { label: "Question", value: "question" },
  { label: "Tip", value: "tip" },
  { label: "Announcement", value: "announcement" },
];

export const IMAGE_FILTER_OPTIONS = [
  { label: "All posts", value: "ALL" },
  { label: "With image", value: "WITH_IMAGE" },
  { label: "Text only", value: "NO_IMAGE" },
];

export const SORT_OPTIONS = [
  { label: "Oldest first (FIFO)", value: "oldest" },
  { label: "Newest first", value: "latest" },
];

export const REPORT_STATUS_OPTIONS = [
  { label: "Pending reports", value: "PENDING" },
  { label: "Resolved", value: "RESOLVED" },
  { label: "Dismissed", value: "DISMISSED" },
  { label: "All reports", value: "ALL" },
];

export const approvalLabel = (status?: string) =>
  ({ PENDING: "Pending approval", APPROVED: "Approved", REJECTED: "Rejected" })[status ?? ""] ??
  status ??
  "—";

export const tagLabel = (tag: string) =>
  ({
    QUESTION: "Question",
    question: "Question",
    TIP: "Tip",
    tip: "Tip",
    ANNOUNCEMENT: "Announcement",
    announcement: "Announcement",
  })[tag] ?? tag;

export const dateLabel = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "—";
