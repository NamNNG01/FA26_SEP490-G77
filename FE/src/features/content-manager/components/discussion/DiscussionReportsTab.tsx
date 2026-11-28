import React from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";
import { Icon } from "@/assets/icons";
import type { AdminReportStatus, DiscussionReportItem } from "@/services/managerDiscussion.service";
import { dateLabel, PAGE_SIZE, REPORT_STATUS_OPTIONS } from "./discussionHelpers";

interface DiscussionReportsTabProps {
  reportStatus: AdminReportStatus;
  onReportStatusChange: (v: AdminReportStatus) => void;
  reports: DiscussionReportItem[];
  reportTotal: number;
  reportPage: number;
  onReportPageChange: (p: number) => void;
  loading: boolean;
  busy: boolean;
  onRefresh: () => void;
  onMuteAuthor: (target: { userId: number; displayName: string }) => void;
  onResolveReport: (reportId: number, action: "HIDE_AND_RESOLVE" | "DISMISS") => void;
}

export function DiscussionReportsTab({
  reportStatus,
  onReportStatusChange,
  reports,
  reportTotal,
  reportPage,
  onReportPageChange,
  loading,
  busy,
  onRefresh,
  onMuteAuthor,
  onResolveReport,
}: DiscussionReportsTabProps) {
  return (
    <>
      <section className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="w-60">
          <Select
            label="Report status"
            value={reportStatus}
            options={REPORT_STATUS_OPTIONS}
            onChange={(value) => onReportStatusChange(value as AdminReportStatus)}
          />
        </div>
        <Button
          size="sm"
          variant="ghost"
          icon={<Icon.RefreshCw className="h-4 w-4" />}
          onClick={onRefresh}
        >
          Refresh
        </Button>
      </section>

      {loading ? (
        <div className="card p-8 text-center text-sm text-content-subtle">Loading reports…</div>
      ) : reports.length === 0 ? (
        <div className="card p-8 text-center text-sm text-content-subtle">
          No reports match this status.
        </div>
      ) : (
        <section className="space-y-3">
          {reports.map((r) => (
            <article key={r.reportId} className="card space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      r.status === "PENDING"
                        ? "warning"
                        : r.status === "RESOLVED"
                          ? "success"
                          : "default"
                    }
                  >
                    {r.status}
                  </Badge>
                  <Badge variant="info">{r.targetType}</Badge>
                  <span className="text-xs text-content-subtle">
                    Reported by {r.reporterName} · {dateLabel(r.createdAt)}
                  </span>
                </div>
                {r.status === "PENDING" && (
                  <div className="flex flex-wrap gap-2">
                    {r.targetAuthorId && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          onMuteAuthor({
                            userId: r.targetAuthorId!,
                            displayName: r.targetAuthorName || "User",
                          })
                        }
                      >
                        Mute author
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => onResolveReport(r.reportId, "DISMISS")}
                    >
                      Dismiss
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busy}
                      onClick={() => onResolveReport(r.reportId, "HIDE_AND_RESOLVE")}
                    >
                      Hide content & Resolve
                    </Button>
                  </div>
                )}
              </div>
              <p className="text-sm font-medium text-content">Post: {r.discussionTitle}</p>
              <p className="rounded-lg bg-surface-muted p-3 text-sm text-content-secondary">
                {r.targetContent}
              </p>
              <p className="text-sm text-danger">Reason: {r.reason}</p>
            </article>
          ))}
          <div className="card">
            <Pagination
              page={reportPage + 1}
              total={reportTotal}
              perPage={PAGE_SIZE}
              onChange={(value) => onReportPageChange(value - 1)}
              unit="reports"
            />
          </div>
        </section>
      )}
    </>
  );
}
