import React from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import type { Discount, DiscountAssignment, Page } from "@/services/adminDiscount.service";
import { formatVnd } from "../../utils/dashboardFormat";
import { dateLabel, validityLabels } from "../../utils/discountHelpers";

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-content-soft">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-content">{value}</p>
    </div>
  );
}

interface DiscountDetailModalProps {
  detail: Discount | null;
  detailLoading: boolean;
  assignments: Page<DiscountAssignment> | null;
  assignmentPage: number;
  assignmentKeyword: string;
  assignmentUsed: string;
  assignmentLoading: boolean;
  assignmentError: string | null;
  onClose: () => void;
  onAssignmentKeywordChange: (v: string) => void;
  onAssignmentUsedChange: (v: string) => void;
  onAssignmentPageChange: (nextPage: number) => void;
  onRetryAssignments: (discountId: number) => void;
}

export function DiscountDetailModal({
  detail,
  detailLoading,
  assignments,
  assignmentPage,
  assignmentKeyword,
  assignmentUsed,
  assignmentLoading,
  assignmentError,
  onClose,
  onAssignmentKeywordChange,
  onAssignmentUsedChange,
  onAssignmentPageChange,
  onRetryAssignments,
}: DiscountDetailModalProps) {
  return (
    <Modal
      open={detailLoading || !!detail}
      onClose={onClose}
      title={detail ? `${detail.code} · ${detail.name}` : "Discount details"}
      size="2xl"
    >
      {detailLoading || !detail ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Info
              label="Discount"
              value={
                detail.discountType === "PERCENT" ? `${detail.value}%` : formatVnd(detail.value)
              }
            />
            <Info label="Applies to" value={detail.appliesTo} />
            <Info
              label="Access type"
              value={detail.accessType === "CLAIM_REQUIRED" ? "Claim required" : "Public"}
            />
            <Info label="Validity" value={validityLabels[detail.validity] ?? detail.validity} />
            <Info label="Status" value={detail.isActive ? "Active" : "Inactive"} />
            <Info label="Usage" value={`${detail.usedCount} / ${detail.usageLimit}`} />
            <Info label="Assigned" value={String(detail.stats?.assignedCount ?? "—")} />
            <Info
              label="Unused assigned"
              value={String(detail.stats?.unusedAssignedCount ?? "—")}
            />
            <Info
              label="Remaining capacity"
              value={String(detail.stats?.remaining ?? detail.remaining)}
            />
            <Info label="Starts" value={dateLabel(detail.startAt)} />
            <Info label="Expires" value={dateLabel(detail.expiredAt)} />
            <Info label="Created" value={dateLabel(detail.createdAt)} />
            <Info label="Updated" value={dateLabel(detail.updatedAt)} />
          </div>
          {detail.description && (
            <p className="text-sm text-content-secondary">{detail.description}</p>
          )}
          <div>
            <h3 className="mb-2 font-semibold text-content">Contests using this discount</h3>
            {detail.usedInContests?.length ? (
              <ul className="space-y-2">
                {detail.usedInContests.map((contest) => (
                  <li
                    key={`${contest.contestId}-${contest.rankPosition}`}
                    className="flex justify-between rounded-lg border border-line-soft px-3 py-2 text-sm"
                  >
                    <span>
                      {contest.title} · rank {contest.rankPosition}
                    </span>
                    <Badge variant="info">{contest.status}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-content-soft">No contests use this discount.</p>
            )}
          </div>
          <div className="space-y-3 border-t border-line-soft pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold text-content">Assigned users</h3>
              <div className="flex flex-wrap gap-2">
                <Input
                  aria-label="Search assigned users"
                  placeholder="Name or email"
                  value={assignmentKeyword}
                  onChange={(e) => onAssignmentKeywordChange(e.target.value)}
                />
                <Select
                  aria-label="Assignment use status"
                  value={assignmentUsed}
                  onChange={onAssignmentUsedChange}
                  options={[
                    { label: "Used or unused", value: "" },
                    { label: "Unused", value: "false" },
                    { label: "Used", value: "true" },
                  ]}
                />
              </div>
            </div>
            {assignmentError ? (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger-line bg-danger-light p-4 text-sm text-danger"
              >
                <span>{assignmentError}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRetryAssignments(detail.discountId)}
                >
                  Retry
                </Button>
              </div>
            ) : assignmentLoading ? (
              <div className="flex justify-center py-6">
                <Spinner size="sm" />
              </div>
            ) : assignments?.content.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-line-soft text-xs uppercase text-content-soft">
                      <th className="py-2 pr-3">User</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Assigned</th>
                      <th className="py-2 pr-3">Used</th>
                      <th className="py-2">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.content.map((a) => (
                      <tr key={a.userDiscountId} className="border-b border-line-faint">
                        <td className="py-2 pr-3">
                          <p className="font-medium text-content">{a.user.fullName}</p>
                          <p className="text-xs text-content-soft">{a.user.email}</p>
                        </td>
                        <td className="py-2 pr-3">
                          <Badge variant={a.isUsed ? "default" : "success"}>
                            {a.isUsed ? "Used" : "Unused"}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap">{dateLabel(a.assignedAt)}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">{dateLabel(a.usedAt)}</td>
                        <td className="py-2">{a.source?.title ?? a.source?.type ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex justify-end gap-2 pt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!assignments || assignments.first || assignmentLoading}
                    onClick={() => onAssignmentPageChange(Math.max(0, assignmentPage - 1))}
                  >
                    Previous
                  </Button>
                  <span className="self-center text-xs text-content-soft">
                    {assignments.totalElements} users ·{" "}
                    {assignments.totalPages ? assignmentPage + 1 : 0}/{assignments.totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!assignments || assignments.last || assignmentLoading}
                    onClick={() => onAssignmentPageChange(assignmentPage + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-content-soft">No users have been assigned this discount.</p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
