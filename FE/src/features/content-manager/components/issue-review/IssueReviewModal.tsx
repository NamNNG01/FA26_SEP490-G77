import { useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import { issueLabel } from "@/services/questionIssue.service";
import { ConfirmActionModal } from "./ConfirmActionModal";
import { InsightsTab } from "./InsightsTab";
import { ResolveTab } from "./ResolveTab";
import { ReviewTab } from "./ReviewTab";
import { PriorityBadge, Status } from "./StatusBadges";
import {
  JOB_NEEDS_ACTION,
  regradeNotice,
  resolutionOption,
  resolveBlocker,
  type ResolutionType,
  type ReviewTabId,
} from "./issueReviewModel";
import type { IssueReview } from "./useIssueReview";

const TAB_LABELS: Record<ReviewTabId, string> = {
  review: "Review",
  resolve: "Resolve",
  insights: "Insights and history",
};
const TAB_IDS = Object.keys(TAB_LABELS) as ReviewTabId[];

interface PendingConfirm {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  variant?: "primary" | "danger";
  run: () => Promise<unknown>;
}

function TicketSummary({
  review,
  courseNames,
}: {
  review: IssueReview;
  courseNames: Map<string, string>;
}) {
  const { detail, assignedToMe } = review;
  const owner = detail.assignedTo
    ? assignedToMe
      ? "Assigned to you"
      : `Assigned to ${detail.assignedTo.fullName || "another manager"}`
    : "Unassigned";
  const course =
    detail.location?.courseName ||
    detail.courseName ||
    courseNames.get(String(detail.courseId)) ||
    `Course #${detail.courseId ?? "—"}`;
  return (
    <header className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Status value={detail.status} />
        <PriorityBadge
          priority={detail.priority}
          score={detail.priorityScore ?? 0}
        />
        <Badge variant={assignedToMe ? "info" : "default"}>{owner}</Badge>
        <span className="text-sm font-medium text-content">
          {issueLabel(detail.issueType || detail.reports?.[0]?.issueType)}
        </span>
      </div>
      <p className="text-sm text-content-secondary">
        {course} · {detail.location?.moduleTitle || "Module unavailable"} ·
        Question version {detail.question?.lockVersion ?? "—"}
        {detail.lastReportedAt && (
          <>
            {" "}
            · Latest report {new Date(detail.lastReportedAt).toLocaleString()}
          </>
        )}
      </p>
    </header>
  );
}

export function IssueReviewModal({
  review,
  courseNames,
}: {
  review: IssueReview;
  courseNames: Map<string, string>;
}) {
  const { detail, tab, busy } = review;
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function runConfirmed() {
    if (!confirm) return;
    setConfirming(true);
    try {
      await confirm.run();
    } finally {
      setConfirming(false);
      setConfirm(null);
    }
  }

  function requestTypeChange(type: ResolutionType) {
    if (type === review.resolutionType) return;
    if (!review.isDirty) {
      review.selectResolution(type);
      return;
    }
    setConfirm({
      title: "Switch correction type?",
      body: (
        <p>
          You have unsaved edits to this question. Switching to “
          {resolutionOption(type).title}” discards them. Your resolution note is
          kept.
        </p>
      ),
      confirmLabel: "Discard edits and switch",
      run: async () => review.selectResolution(type, true),
    });
  }

  function requestSave() {
    if (!review.validateResolution()) return;
    const option = resolutionOption(review.resolutionType);
    const notice = regradeNotice(
      review.resolutionType,
      detail?.insights?.regradeImpact,
    );
    if (!notice?.confirm) {
      void review.submitResolution();
      return;
    }
    setConfirm({
      title:
        review.resolutionType === "QUESTION_VOIDED"
          ? "Void this question?"
          : "Save the corrected answer?",
      body: (
        <>
          <p>{notice.text}</p>
          <p>The ticket will be marked as resolved with your note.</p>
        </>
      ),
      confirmLabel: option.saveLabel,
      variant:
        review.resolutionType === "QUESTION_VOIDED" ? "danger" : "primary",
      run: review.submitResolution,
    });
  }

  function requestReject() {
    setConfirm({
      title: "Reject this ticket?",
      body: (
        <>
          <p>The ticket is closed without changing the question.</p>
          <p className="whitespace-pre-wrap break-words rounded-lg bg-surface-muted p-2 text-xs">
            {review.rejectReason.trim()}
          </p>
        </>
      ),
      confirmLabel: "Reject ticket",
      variant: "danger",
      run: review.reject,
    });
  }

  function requestDuplicate() {
    setConfirm({
      title: "Mark as a duplicate?",
      body: (
        <p>
          This ticket is closed and linked to ticket #{review.duplicateId}. The
          question is not changed.
        </p>
      ),
      confirmLabel: "Mark duplicate",
      run: review.markDuplicate,
    });
  }

  function requestRegrade(job: any) {
    setConfirm({
      title: "Confirm this regrade?",
      body: (
        <>
          <p>
            Job #{job.jobId} will recalculate{" "}
            {job.totalAnswers ?? "the affected"} submitted answers. Student
            scores may change.
          </p>
          <p className="text-xs">
            Reason: {(review.jobReasons[String(job.jobId)] ?? "").trim()}
          </p>
        </>
      ),
      confirmLabel: "Confirm regrade",
      run: () => review.confirmRegrade(job.jobId),
    });
  }

  // The footer always offers the next step for the ticket's status, and says why it is unavailable.
  let primary: ReactNode = null;
  let helper = "";
  if (detail?.status === "PENDING") {
    helper = review.assignedToMe
      ? "Start the review to unlock corrections."
      : "Assign the ticket to yourself, then start the review.";
    primary = review.assignedToMe ? (
      <Button loading={busy} onClick={() => void review.startReview()}>
        Start review
      </Button>
    ) : (
      <Button loading={busy} onClick={() => void review.assignToMe()}>
        Assign to me
      </Button>
    );
  } else if (detail?.status === "IN_PROGRESS") {
    if (tab === "resolve") {
      const blocker = resolveBlocker(
        review.resolutionType,
        review.draft,
        review.resolutionNote,
      );
      helper = blocker ?? "";
      primary = (
        <Button
          loading={busy}
          disabled={!!blocker || review.loading}
          onClick={requestSave}
        >
          {resolutionOption(review.resolutionType).saveLabel}
        </Button>
      );
    } else {
      primary = (
        <Button onClick={() => review.setTab("resolve")}>
          Continue to resolution
        </Button>
      );
    }
  }

  const waitingJobs = review.jobs.filter((job: any) =>
    JOB_NEEDS_ACTION.includes(job.status),
  ).length;

  return (
    <>
      <Modal
        open={!!review.row}
        onClose={review.close}
        title={
          detail
            ? `Ticket #${detail.issueId} · Question #${detail.questionId}`
            : "Loading ticket…"
        }
        size="screen"
        error={
          review.error ? (
            <Alert type="error" message={review.error} />
          ) : undefined
        }
        footer={
          detail && (
            <>
              {helper && (
                <p
                  role="status"
                  className="basis-full text-sm text-content-secondary sm:mr-auto sm:basis-auto"
                >
                  {helper}
                </p>
              )}
              <Button variant="outline" onClick={review.close} disabled={busy}>
                Close
              </Button>
              {primary}
            </>
          )
        }
      >
        {!detail ? (
          <div
            role="status"
            className="py-16 text-center text-sm text-content-secondary"
          >
            {review.loading
              ? "Loading ticket details…"
              : "Ticket details are unavailable."}
          </div>
        ) : (
          <div className="space-y-4">
            <Tabs
              variant="underline"
              tabs={TAB_IDS.map((id) => TAB_LABELS[id])}
              active={TAB_LABELS[tab]}
              onChange={(label) =>
                review.setTab(
                  TAB_IDS.find((id) => TAB_LABELS[id] === label) ?? "review",
                )
              }
            />

            <TicketSummary review={review} courseNames={courseNames} />

            {review.notice && (
              <div role="status">
                <Alert type="success" message={review.notice} />
              </div>
            )}

            {waitingJobs > 0 && tab !== "insights" && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-warning-line bg-warning-light p-3 text-sm text-warning-strong">
                <span>
                  {waitingJobs === 1
                    ? "A regrade job needs your attention."
                    : `${waitingJobs} regrade jobs need your attention.`}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => review.setTab("insights")}
                >
                  Open regrade jobs
                </Button>
              </div>
            )}

            <div role="tabpanel" aria-label={TAB_LABELS[tab]} className="pt-1">
              {tab === "review" && <ReviewTab review={review} />}
              {tab === "resolve" && (
                <ResolveTab
                  review={review}
                  onRequestTypeChange={requestTypeChange}
                  onRequestReject={requestReject}
                  onRequestDuplicate={requestDuplicate}
                />
              )}
              {tab === "insights" && (
                <InsightsTab
                  review={review}
                  onRequestConfirmRegrade={requestRegrade}
                />
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmActionModal
        open={!!confirm}
        title={confirm?.title ?? ""}
        confirmLabel={confirm?.confirmLabel ?? "Confirm"}
        variant={confirm?.variant}
        busy={confirming}
        onConfirm={() => void runConfirmed()}
        onCancel={() => setConfirm(null)}
      >
        {confirm?.body}
      </ConfirmActionModal>
    </>
  );
}
