import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ImageViewer } from "@/components/common/ImageViewer";
import { QuestionContent } from "@/components/common/QuestionContent";
import { QuestionForm } from "@/features/question/components/QuestionForm";
import { issueLabel } from "@/services/questionIssue.service";
import type { IssueReview } from "./useIssueReview";

const REPORTS_SHOWN = 3;
const fieldCls =
  "rounded-lg border border-line bg-surface p-3 text-sm text-content focus:outline-none focus:ring-2 focus:ring-brand-600/20 focus:border-brand-600";

const studentName = (report: any) =>
  report.student?.fullName ||
  report.studentName ||
  `Student #${report.userId ?? "—"}`;

/** What the ticket needs next, in one place, so the manager never has to guess the workflow. */
function NextStep({ review }: { review: IssueReview }) {
  const { detail, assignedToMe, busy } = review;
  const status = detail.status;
  const owner = detail.assignedTo?.fullName || "another manager";

  if (status === "PENDING") {
    return (
      <section
        aria-labelledby="next-step"
        className="rounded-xl border border-brand-line bg-primary-light p-4"
      >
        <h3 id="next-step" className="text-sm font-semibold text-content">
          {assignedToMe
            ? "You own this ticket. Start the review when you are ready."
            : "Take ownership to begin"}
        </h3>
        <p className="mt-1 text-sm text-content-secondary">
          {assignedToMe
            ? "Starting the review unlocks corrections. You can add a note about why you are taking it."
            : "Assign this ticket to yourself, then start the review. Corrections stay locked until the review starts."}
        </p>
        <label className="mt-3 grid gap-1.5 text-sm font-medium text-content-secondary">
          <span>
            Review note{" "}
            <span className="font-normal text-content-subtle">(optional)</span>
          </span>
          <textarea
            rows={2}
            className={fieldCls}
            value={review.startNote}
            onChange={(event) => review.setStartNote(event.target.value)}
            placeholder="Add a note while taking ownership"
            disabled={busy}
          />
        </label>
      </section>
    );
  }

  if (status === "IN_PROGRESS") {
    return (
      <section
        aria-labelledby="next-step"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-line bg-primary-light p-4"
      >
        <div className="min-w-0">
          <h3 id="next-step" className="text-sm font-semibold text-content">
            Review in progress
          </h3>
          <p className="mt-1 text-sm text-content-secondary">
            {assignedToMe
              ? "Read the reports, then choose what to correct on the Resolve tab."
              : `Assigned to ${owner}. You can still take it over before resolving.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!assignedToMe && (
            <Button
              size="sm"
              variant="outline"
              loading={busy}
              onClick={() => void review.assignToMe()}
            >
              Assign to me
            </Button>
          )}
          <Button size="sm" onClick={() => review.setTab("resolve")}>
            Go to resolution
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="next-step"
      className="rounded-xl border border-line bg-surface-muted p-4"
    >
      <h3 id="next-step" className="text-sm font-semibold text-content">
        This ticket is {issueLabel(status).toLowerCase()}
      </h3>
      <p className="mt-1 text-sm text-content-secondary">
        No further actions are available. Regrade jobs and history stay open on
        the Insights and history tab.
      </p>
    </section>
  );
}

function ReportCard({ report }: { report: any }) {
  const name = studentName(report);
  return (
    <article className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 text-xs text-content-secondary">
        <span className="font-medium text-content">{name}</span>
        <time>
          {report.createdAt ? new Date(report.createdAt).toLocaleString() : ""}
        </time>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge size="sm" variant="default">
          {issueLabel(report.source || "OTHER")}
        </Badge>
        {report.questionNumber != null && (
          <Badge size="sm" variant="default">
            Question {report.questionNumber}
          </Badge>
        )}
        {report.outdated && (
          <Badge size="sm" variant="warning">
            Refers to an older version
          </Badge>
        )}
      </div>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-content">
        {report.description}
      </p>
      {report.context?.selectedOptions?.length > 0 && (
        <p className="mt-2 text-sm text-content-secondary">
          Student selected:{" "}
          {report.context.selectedOptions
            .map((option: any) => option.optionText)
            .join(", ")}
        </p>
      )}
      {report.suggestedOptions?.length > 0 && (
        <p className="mt-1 text-sm text-content-secondary">
          Suggested option:{" "}
          {report.suggestedOptions
            .map((option: any) => option.optionText)
            .join(", ")}
        </p>
      )}
      {report.suggestedAnswer && (
        <p className="mt-1 text-sm text-content-secondary">
          Suggested answer: {report.suggestedAnswer}
        </p>
      )}
      {report.attachmentUrl && (
        <div className="mt-3">
          <ImageViewer
            src={report.attachmentUrl}
            alt={`Attachment from ${name}`}
          />
        </div>
      )}
    </article>
  );
}

export function ReviewTab({ review }: { review: IssueReview }) {
  const { detail, draft } = review;
  const [showAll, setShowAll] = useState(false);
  const reports: any[] = detail.reports || [];
  const visible = showAll ? reports : reports.slice(0, REPORTS_SHOWN);
  const outdated = reports.filter((report) => report.outdated).length;

  return (
    <div className="space-y-5">
      <NextStep review={review} />
      <div className="grid gap-5 xl:grid-cols-2">
        <section
          aria-labelledby="reported-question"
          className="min-w-0 space-y-3"
        >
          <h3
            id="reported-question"
            className="text-sm font-semibold text-content"
          >
            Reported question
          </h3>
          <div className="rounded-xl border border-line bg-surface-muted p-4">
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-content">
              {detail.question?.content ? (
                <QuestionContent text={detail.question.content} />
              ) : (
                "Question content unavailable"
              )}
            </p>
            <details className="mt-4 rounded-lg border border-line bg-surface p-3">
              <summary className="cursor-pointer text-sm font-medium text-content">
                View answers and scoring details
              </summary>
              {draft && (
                <div className="mt-4">
                  <QuestionForm
                    q={draft}
                    index={0}
                    heading="Question"
                    onChange={() => undefined}
                    showErrors={false}
                    readOnly
                  />
                </div>
              )}
            </details>
          </div>
        </section>

        <section
          aria-labelledby="student-reports"
          className="min-w-0 space-y-3 sticky top-4 self-start"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3
              id="student-reports"
              className="text-sm font-semibold text-content"
            >
              Student reports{" "}
              <span className="font-normal text-content-subtle">
                ({reports.length || detail.reportCount || 0})
              </span>
            </h3>
            {outdated > 0 && (
              <Badge size="sm" variant="warning">
                {outdated} on an older version
              </Badge>
            )}
          </div>
          {visible.map((report) => (
            <ReportCard key={report.reportId} report={report} />
          ))}
          {!reports.length && (
            <p className="rounded-lg bg-surface-muted p-4 text-sm text-content-secondary">
              No report details were returned.
            </p>
          )}
          {reports.length > REPORTS_SHOWN && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAll((current) => !current)}
            >
              {showAll
                ? "Show fewer reports"
                : `Show all ${reports.length} reports`}
            </Button>
          )}
        </section>
      </div>
    </div>
  );
}
