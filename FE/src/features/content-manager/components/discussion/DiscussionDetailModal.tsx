import React from "react";
import { Alert } from "@/components/ui/Alert";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ImageViewer } from "@/components/common/ImageViewer";
import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/assets/icons";
import type { DiscussionDetail, DiscussionDetailComment } from "@/services/studentCommunity.service";
import { approvalLabel, dateLabel, tagLabel } from "./discussionHelpers";

function ManagerReply({
  comment,
  busy,
  hiding,
  reason,
  onStartHide,
  onCancelHide,
  onReasonChange,
  onHide,
  onRestore,
  onDelete,
}: {
  comment: DiscussionDetailComment;
  busy: boolean;
  hiding: boolean;
  reason: string;
  onStartHide: () => void;
  onCancelHide: () => void;
  onReasonChange: (reason: string) => void;
  onHide: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const hidden = comment.status === "HIDDEN";
  return (
    <article className={`flex flex-wrap items-start gap-3 p-4 ${hidden ? "bg-surface-muted" : ""}`}>
      <Avatar
        name={comment.author.displayName}
        src={
          comment.isAnonymous || /anonymous/i.test(comment.author.displayName)
            ? "/images/anonymous_student.png"
            : comment.author.avatarUrl || undefined
        }
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-content-subtle">
            {comment.author.displayName} · {dateLabel(comment.createdAt)}
          </p>
          {hidden && <Badge variant="danger">Hidden</Badge>}
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm text-content-secondary">{comment.content}</p>
        {comment.imageUrl && (
          <ImageViewer
            src={comment.imageUrl}
            alt="Reply attachment"
            className="mt-3"
            imageClassName="max-h-52"
          />
        )}
        {hiding && (
          <section className="mt-4 rounded-lg border border-warning-line bg-warning-light p-3">
            <label className="grid gap-1.5 text-sm font-medium text-content">
              Reason for hiding this reply
              <textarea
                maxLength={500}
                rows={2}
                value={reason}
                onChange={(event) => onReasonChange(event.target.value)}
                aria-describedby={`hide-reason-help-${comment.commentId}`}
                className="w-full rounded-lg border border-line bg-surface p-3 text-sm font-normal text-content focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
                placeholder="Explain why this reply should be hidden"
              />
            </label>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p
                id={`hide-reason-help-${comment.commentId}`}
                className="text-xs text-content-subtle"
              >
                A reason of at least 5 characters is required. {reason.length}/500
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={onCancelHide} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={onHide}
                  disabled={busy || reason.trim().length < 5}
                  loading={busy}
                >
                  Hide reply
                </Button>
              </div>
            </div>
          </section>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        {!hiding && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={hidden ? onRestore : onStartHide}
          >
            {hidden ? "Restore" : "Hide"}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          icon={<Icon.Trash className="h-4 w-4" />}
          aria-label="Delete reply"
          disabled={busy}
          onClick={onDelete}
        />
      </div>
    </article>
  );
}

interface DiscussionDetailModalProps {
  detail: DiscussionDetail | null;
  detailLoading: boolean;
  busy: boolean;
  rejecting: boolean;
  rejectReason: string;
  templates: string[];
  hidingCommentId: number | null;
  moderationReason: string;
  onClose: () => void;
  onMuteUser: (target: { userId: number; displayName: string }) => void;
  onTogglePin: () => void;
  onStartReject: () => void;
  onCancelReject: () => void;
  onRejectReasonChange: (v: string) => void;
  onConfirmReject: () => void;
  onApprove: () => void;
  onHideDiscussion: () => void;
  onRestoreDiscussion: () => void;
  onStartHideComment: (commentId: number) => void;
  onCancelHideComment: () => void;
  onModerationReasonChange: (v: string) => void;
  onHideComment: (comment: DiscussionDetailComment) => void;
  onRestoreComment: (comment: DiscussionDetailComment) => void;
  onDeleteComment: (commentId: number) => void;
}

export function DiscussionDetailModal({
  detail,
  detailLoading,
  busy,
  rejecting,
  rejectReason,
  templates,
  hidingCommentId,
  moderationReason,
  onClose,
  onMuteUser,
  onTogglePin,
  onStartReject,
  onCancelReject,
  onRejectReasonChange,
  onConfirmReject,
  onApprove,
  onHideDiscussion,
  onRestoreDiscussion,
  onStartHideComment,
  onCancelHideComment,
  onModerationReasonChange,
  onHideComment,
  onRestoreComment,
  onDeleteComment,
}: DiscussionDetailModalProps) {
  return (
    <Modal
      open={detailLoading || !!detail}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={detail?.title ?? "Loading discussion…"}
      size="2xl"
      footer={
        detail && (
          <>
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Close
            </Button>
            {detail.author?.userId && (
              <Button
                variant="outline"
                onClick={() =>
                  onMuteUser({
                    userId: detail.author.userId,
                    displayName: detail.author.displayName,
                  })
                }
                disabled={busy}
              >
                Mute user
              </Button>
            )}
            {detail.approvalStatus === "APPROVED" && detail.status !== "HIDDEN" && (
              <Button
                variant="outline"
                icon={<Icon.Bookmark className="h-4 w-4" />}
                onClick={onTogglePin}
                disabled={busy}
              >
                {detail.isPinned ? "Unpin" : "Pin"}
              </Button>
            )}
            {detail.approvalStatus === "PENDING" && !rejecting && (
              <>
                <Button variant="danger" onClick={onStartReject} disabled={busy}>
                  Reject
                </Button>
                <Button onClick={onApprove} disabled={busy}>
                  Approve
                </Button>
              </>
            )}
            {rejecting && (
              <>
                <Button variant="outline" onClick={onCancelReject} disabled={busy}>
                  Cancel rejection
                </Button>
                <Button
                  variant="danger"
                  onClick={onConfirmReject}
                  disabled={busy || rejectReason.trim().length < 5}
                  loading={busy}
                >
                  Confirm rejection
                </Button>
              </>
            )}
            {detail.status === "HIDDEN" ? (
              <Button onClick={onRestoreDiscussion} disabled={busy}>
                Restore
              </Button>
            ) : (
              <Button variant="danger" onClick={onHideDiscussion} disabled={busy}>
                Hide
              </Button>
            )}
          </>
        )
      }
    >
      {!detail ? (
        <div className="py-12 text-center text-sm text-content-subtle">
          Loading discussion details…
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            {detail.status === "HIDDEN" ? (
              <Badge variant="danger">Hidden</Badge>
            ) : (
              <Badge
                variant={
                  detail.approvalStatus === "PENDING"
                    ? "warning"
                    : detail.approvalStatus === "REJECTED"
                      ? "danger"
                      : "success"
                }
              >
                {approvalLabel(detail.approvalStatus)}
              </Badge>
            )}
            <Badge>{tagLabel(detail.tag)}</Badge>
            {detail.isPinned && <Badge variant="warning">Pinned</Badge>}
            {detail.isClosed && <Badge>Closed</Badge>}
            <span className="ml-auto text-xs text-content-subtle">
              {dateLabel(detail.createdAt)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Avatar
              name={detail.author.displayName}
              src={detail.author.avatarUrl || undefined}
              size="sm"
            />
            <p className="text-sm text-content-secondary">{detail.author.displayName}</p>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-6 text-content-secondary">
            {detail.content}
          </p>
          {detail.imageUrl && (
            <ImageViewer
              src={detail.imageUrl}
              alt="Discussion attachment"
              imageClassName="max-h-[28rem]"
            />
          )}
          {rejecting && (
            <section className="space-y-3 rounded-lg border border-danger-line bg-danger-light p-4">
              {templates.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {templates.map((tpl) => (
                    <button
                      key={tpl}
                      type="button"
                      onClick={() => onRejectReasonChange(tpl)}
                      className="rounded-full border border-line bg-surface px-3 py-1 text-xs text-content hover:border-brand-500"
                    >
                      {tpl}
                    </button>
                  ))}
                </div>
              )}
              <label className="grid gap-2 text-sm font-medium text-content">
                Reason shown to the student
                <textarea
                  maxLength={1000}
                  rows={3}
                  value={rejectReason}
                  onChange={(event) => onRejectReasonChange(event.target.value)}
                  className="rounded-lg border border-line bg-surface p-3 font-normal text-content"
                  placeholder="Explain why this post was rejected (at least 5 characters)."
                />
              </label>
              <p className="text-right text-xs text-content-subtle">{rejectReason.length}/1000</p>
            </section>
          )}
          {detail.approvalStatus === "REJECTED" && detail.rejectionReason && (
            <Alert type="warning" title="Rejection reason" message={detail.rejectionReason} />
          )}
          <section className="space-y-3 border-t border-line pt-4">
            <div>
              <h3 className="font-semibold text-content">
                Replies{" "}
                <span className="font-normal text-content-subtle">
                  (
                  {
                    (detail.comments ?? []).filter((comment) => comment.status !== "HIDDEN")
                      .length
                  }
                  )
                </span>
              </h3>
              <p className="mt-1 text-xs text-content-subtle">
                Hidden replies remain visible here for moderation (
                {(detail.comments ?? []).filter((comment) => comment.status === "HIDDEN").length}{" "}
                hidden).
              </p>
            </div>
            {(detail.comments ?? []).length === 0 ? (
              <p className="rounded-lg bg-surface-muted p-4 text-sm text-content-subtle">
                No replies yet.
              </p>
            ) : (
              <div className="divide-y divide-line rounded-lg border border-line">
                {[...detail.comments].reverse().map((comment) => (
                  <ManagerReply
                    key={comment.commentId}
                    comment={comment}
                    busy={busy}
                    hiding={hidingCommentId === comment.commentId}
                    reason={moderationReason}
                    onStartHide={() => onStartHideComment(comment.commentId)}
                    onCancelHide={onCancelHideComment}
                    onReasonChange={onModerationReasonChange}
                    onHide={() => onHideComment(comment)}
                    onRestore={() => onRestoreComment(comment)}
                    onDelete={() => onDeleteComment(comment.commentId)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
