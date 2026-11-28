import React from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ImageViewer } from "@/components/common/ImageViewer";
import { QuestionForm } from "@/features/question/components/QuestionForm";
import type { QuestionDraft } from "@/features/question/model";
import {
  difficultyLabel,
  idOf,
  isPending,
  questionTypeLabel,
  REJECTION_TEMPLATES,
  statusLabel,
  type Kind,
  type Row,
} from "../../utils/contentReviewHelpers";

interface ReviewDetailModalProps {
  kind: Kind;
  detail: Row | null;
  detailLoading: boolean;
  detailStatus: string | null | undefined;
  questionDraft: QuestionDraft | null;
  isOwnSubmission: boolean;
  canReviewDetail: boolean;
  busy: boolean;
  cardsLoading: boolean;
  deckCardPage: number;
  error: string;
  rejecting: boolean;
  confirmingApproval: boolean;
  reason: string;
  approveNote: string;
  studentNames: Map<string, string>;
  courseNameOf: (row: Row) => string;
  moduleNameOf: (row: Row) => string;
  onClose: () => void;
  onReloadItem: (row: Row, cardPage?: number) => void;
  onReview: (decision: "approve" | "reject") => void;
  onStartReject: () => void;
  onCancelReject: () => void;
  onCancelApprove: () => void;
  onReasonChange: (v: string) => void;
  onApproveNoteChange: (v: string) => void;
}

export function ReviewDetailModal({
  kind,
  detail,
  detailLoading,
  detailStatus,
  questionDraft,
  isOwnSubmission,
  canReviewDetail,
  busy,
  cardsLoading,
  deckCardPage,
  error,
  rejecting,
  confirmingApproval,
  reason,
  approveNote,
  studentNames,
  courseNameOf,
  moduleNameOf,
  onClose,
  onReloadItem,
  onReview,
  onStartReject,
  onCancelReject,
  onCancelApprove,
  onReasonChange,
  onApproveNoteChange,
}: ReviewDetailModalProps) {
  return (
    <Modal
      open={!!detail || detailLoading}
      onClose={onClose}
      title={detail ? detail.title || `Submission #${idOf(detail, kind)}` : "Loading submission…"}
      size="2xl"
      footer={
        detail && (
          <>
            {canReviewDetail && rejecting ? (
              <>
                <Button variant="outline" onClick={onCancelReject} disabled={busy}>
                  Cancel rejection
                </Button>
                <Button
                  variant="danger"
                  onClick={() => onReview("reject")}
                  loading={busy}
                  disabled={reason.trim().length < 5}
                >
                  Confirm rejection
                </Button>
              </>
            ) : canReviewDetail && confirmingApproval ? (
              <>
                <Button variant="outline" onClick={onCancelApprove} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  onClick={() => onReview("approve")}
                  loading={busy}
                  disabled={approveNote.trim().length > 1000}
                >
                  Confirm approval
                </Button>
              </>
            ) : canReviewDetail ? (
              <>
                <Button variant="outline" onClick={onClose} disabled={busy}>
                  Close
                </Button>
                <Button variant="danger" onClick={onStartReject} disabled={busy}>
                  Reject
                </Button>
                <Button onClick={() => onReview("approve")} disabled={busy}>
                  Approve
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            )}
          </>
        )
      }
    >
      {!detail ? (
        <div className="py-12 text-center text-sm text-content-secondary">
          Loading submission details…
        </div>
      ) : (
        <div className="space-y-5">
          {error && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              <span>{error}</span>
              <Button
                size="sm"
                variant="outline"
                disabled={detailLoading || cardsLoading || busy}
                onClick={() => onReloadItem(detail, deckCardPage)}
              >
                Reload item
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isPending(kind, detailStatus) ? "bg-amber-50 text-amber-800" : detailStatus === "REJECTED" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}
            >
              {statusLabel(detailStatus || "")}
            </span>
            <span className="text-xs text-content-secondary">
              {kind === "decks" ? "Flashcard deck" : "Question contribution"}
            </span>
            <span className="ml-auto text-xs text-content-secondary">
              Version {detail.version ?? 0}
            </span>
          </div>

          <div className="grid gap-3 rounded-lg bg-surface-muted p-4 text-sm sm:grid-cols-2">
            <p>
              <span className="text-content-secondary">Contributor</span>
              <br />
              <span className="font-medium text-content">
                {detail.owner?.fullName ||
                  detail.contributor?.fullName ||
                  detail.contributor?.displayName ||
                  detail.contributor?.name ||
                  detail.contributorName ||
                  studentNames.get(
                    String(
                      detail.contributorId ?? detail.contributor?.userId ?? detail.contributor?.id,
                    ),
                  ) ||
                  (detail.contributorId || detail.contributor?.userId || detail.contributor?.id
                    ? `Contributor #${detail.contributorId ?? detail.contributor?.userId ?? detail.contributor?.id}`
                    : "—")}
              </span>
            </p>
            <p>
              <span className="text-content-secondary">Course</span>
              <br />
              <span className="font-medium text-content">{courseNameOf(detail)}</span>
            </p>
            <p>
              <span className="text-content-secondary">Module</span>
              <br />
              <span className="font-medium text-content">{moduleNameOf(detail)}</span>
            </p>
            <p>
              <span className="text-content-secondary">Submitted</span>
              <br />
              <span className="font-medium text-content">
                {detail.submittedAt || detail.createdAt
                  ? new Date(detail.submittedAt || detail.createdAt).toLocaleString()
                  : "—"}
              </span>
            </p>
            <p>
              <span className="text-content-secondary">Submission</span>
              <br />
              <span className="font-medium text-content">
                {detail.resubmissionCount
                  ? `Resubmission ${detail.resubmissionCount}`
                  : "First submission"}
              </span>
            </p>
            {kind === "contributions" && (
              <p>
                <span className="text-content-secondary">Type and difficulty</span>
                <br />
                <span className="font-medium text-content">
                  {questionTypeLabel(detail.questionType || detail.type || "")} ·{" "}
                  {difficultyLabel(detail.difficulty || "MEDIUM")}
                </span>
              </p>
            )}
          </div>

          {kind === "contributions" && detail.contributor?.stats && (
            <section
              aria-label="Contributor history"
              className="grid grid-cols-3 gap-2 text-center text-sm"
            >
              <div className="rounded-lg border border-line p-3">
                <div className="font-semibold text-content">
                  {detail.contributor.stats.approvedCount ?? 0}
                </div>
                <div className="text-xs text-content-secondary">Approved</div>
              </div>
              <div className="rounded-lg border border-line p-3">
                <div className="font-semibold text-content">
                  {detail.contributor.stats.rejectedCount ?? 0}
                </div>
                <div className="text-xs text-content-secondary">Rejected</div>
              </div>
              <div className="rounded-lg border border-line p-3">
                <div className="font-semibold text-content">
                  {detail.contributor.stats.pendingCount ?? 0}
                </div>
                <div className="text-xs text-content-secondary">Pending</div>
              </div>
            </section>
          )}

          {(detail.reviewedBy || detail.reviewNote) && (
            <section className="rounded-lg border border-line bg-surface-muted p-3 text-sm">
              <h3 className="font-semibold text-content">Review result</h3>
              {detail.reviewedBy && (
                <p className="mt-1 text-content-secondary">
                  Reviewed by{" "}
                  {detail.reviewedBy.fullName ||
                    detail.reviewedBy.name ||
                    `#${detail.reviewedBy.id ?? detail.reviewedBy}`}
                  {detail.reviewedAt ? ` · ${new Date(detail.reviewedAt).toLocaleString()}` : ""}
                </p>
              )}
              {detail.reviewNote && (
                <p className="mt-2 whitespace-pre-wrap text-content-secondary">
                  {detail.reviewNote}
                </p>
              )}
            </section>
          )}

          {detail.description && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-content">Description</h3>
              <p className="whitespace-pre-wrap text-sm text-content-secondary">
                {detail.description}
              </p>
            </section>
          )}

          {kind === "decks" ? (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-content">Cards</h3>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-content-secondary">
                    {detail.cardCount ?? detail.cards?.totalElements ?? 0} total
                  </span>
                  {(detail.cards?.totalPages ?? 1) > 1 && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={cardsLoading || deckCardPage <= 0}
                        onClick={() => onReloadItem(detail, deckCardPage - 1)}
                      >
                        Previous
                      </Button>
                      <span className="text-xs text-content-secondary">
                        Page {deckCardPage + 1} of {detail.cards.totalPages}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={cardsLoading || deckCardPage + 1 >= detail.cards.totalPages}
                        onClick={() => onReloadItem(detail, deckCardPage + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              {cardsLoading && (
                <p className="text-sm text-content-secondary" role="status">
                  Loading cards…
                </p>
              )}
              {(detail.cards?.content || []).map((card: Row) => (
                <article key={card.cardId} className="rounded-lg border border-line p-4">
                  <h4 className="mb-3 font-semibold text-content">Card {card.position ?? ""}</h4>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="min-w-0">
                      <h5 className="mb-1 text-xs font-semibold uppercase tracking-wide text-content-secondary">
                        Front
                      </h5>
                      {card.frontText && (
                        <p className="whitespace-pre-wrap break-words text-sm text-content">
                          {card.frontText}
                        </p>
                      )}
                      {card.frontImageUrl && (
                        <ImageViewer
                          src={card.frontImageUrl}
                          alt="Flashcard front"
                          className="mt-2"
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h5 className="mb-1 text-xs font-semibold uppercase tracking-wide text-content-secondary">
                        Back
                      </h5>
                      {card.backText && (
                        <p className="whitespace-pre-wrap break-words text-sm text-content">
                          {card.backText}
                        </p>
                      )}
                      {card.backImageUrl && (
                        <ImageViewer
                          src={card.backImageUrl}
                          alt="Flashcard back"
                          className="mt-2"
                        />
                      )}
                    </div>
                  </div>
                  {card.codeBody && (
                    <div className="mt-3">
                      <p className="mb-1 text-xs font-semibold text-content-secondary">
                        Code{card.codeLanguage ? ` · ${card.codeLanguage}` : ""}
                      </p>
                      <pre className="overflow-auto rounded bg-surface-muted p-3 text-sm">
                        <code>{card.codeBody}</code>
                      </pre>
                    </div>
                  )}
                  {card.hint && (
                    <p className="mt-3 rounded bg-surface-muted p-3 text-sm text-content-secondary">
                      <span className="font-medium text-content">Hint: </span>
                      {card.hint}
                    </p>
                  )}
                </article>
              ))}
            </section>
          ) : (
            <>
              <section>
                <h3 className="mb-2 text-sm font-semibold text-content">Submitted question</h3>
                {questionDraft ? (
                  <QuestionForm
                    q={questionDraft}
                    index={0}
                    heading={detail.title || "Question preview"}
                    onChange={() => undefined}
                    showErrors={false}
                    readOnly
                  />
                ) : (
                  <p className="whitespace-pre-wrap rounded-lg border border-line p-4 text-sm text-content">
                    {detail.question?.content || detail.content || detail.questionText || "—"}
                  </p>
                )}
              </section>
              {detail.mediaUrl && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-content">Question image</h3>
                  <ImageViewer src={detail.mediaUrl} alt="Question attachment" />
                </section>
              )}
              {detail.group && (
                <p className="rounded-lg bg-surface-muted p-3 text-sm text-content-secondary">
                  Question group:{" "}
                  <span className="font-medium text-content">
                    {detail.group.title || detail.group.name || `#${detail.group.id}`}
                  </span>
                </p>
              )}
              {detail.sourceReference && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-content">Source reference</h3>
                  <p className="whitespace-pre-wrap rounded-lg bg-surface-muted p-3 text-sm text-content-secondary">
                    {detail.sourceReference}
                  </p>
                </section>
              )}
            </>
          )}

          {!!detail.history?.length && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-content">Review history</h3>
              <div className="space-y-2">
                {detail.history.map((entry: Row, index: number) => (
                  <div key={index} className="rounded-lg border border-line px-3 py-2 text-sm">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-medium text-content">
                        {statusLabel(entry.decision || "")}
                        {entry.reviewer?.fullName ? ` · ${entry.reviewer.fullName}` : ""}
                      </span>
                      <span className="text-xs text-content-secondary">
                        {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : ""}
                      </span>
                    </div>
                    {(entry.note || entry.reason) && (
                      <p className="mt-1 whitespace-pre-wrap text-content-secondary">
                        {entry.note || entry.reason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {(!detail.canReview || isOwnSubmission) && (
            <p className="rounded-lg bg-surface-muted p-3 text-sm text-content-secondary">
              {isOwnSubmission
                ? "You cannot review your own submission."
                : `This item is ${isPending(kind, detailStatus) ? "not available for review by your account" : statusLabel(detailStatus || "").toLowerCase()}.`}
            </p>
          )}

          {confirmingApproval && (
            <section className="rounded-lg border border-brand-200 bg-brand-50 p-4">
              <label className="grid gap-2 text-sm font-medium text-content">
                Approval note <span className="font-normal text-content-secondary">Optional</span>
                <textarea
                  maxLength={1000}
                  value={approveNote}
                  onChange={(e) => onApproveNoteChange(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && (e.ctrlKey || e.metaKey) && onReview("approve")
                  }
                  rows={3}
                  className="rounded-lg border border-line bg-white p-3 text-content"
                  placeholder="Add a note for the contributor (optional)"
                />
              </label>
              <div className="mt-2 text-right text-xs text-content-secondary">
                {approveNote.length}/1000
              </div>
            </section>
          )}

          {rejecting && (
            <section className="rounded-lg border border-red-200 bg-red-50 p-4">
              <label className="grid gap-2 text-sm font-medium text-red-900">
                Reason for rejection
                <textarea
                  autoFocus
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => onReasonChange(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    (e.ctrlKey || e.metaKey) &&
                    reason.trim().length >= 5 &&
                    onReview("reject")
                  }
                  rows={4}
                  className="rounded-lg border border-line bg-white p-3 text-content"
                  placeholder="Explain why this submission is being rejected"
                />
              </label>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-content-secondary">
                <span>At least 5 characters</span>
                <span>{reason.length}/1000</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {REJECTION_TEMPLATES.map((template) => (
                  <button
                    key={template}
                    type="button"
                    onClick={() => onReasonChange(template)}
                    className="rounded-full border border-red-200 bg-white px-2.5 py-1 text-xs text-red-900 hover:bg-red-100"
                  >
                    {template}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
