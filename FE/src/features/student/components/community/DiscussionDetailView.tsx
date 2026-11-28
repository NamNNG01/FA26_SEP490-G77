import React, { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Alert } from "@/components/ui/Alert";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { DiscussionImageAttachment } from "@/components/common/DiscussionImageAttachment";
import { ImageViewer } from "@/components/common/ImageViewer";
import { useToast } from "@/components/ui/ToastHost";
import { Icon } from "@/assets/icons";
import { ROUTES } from "@/app/routes";
import {
  studentCommunityService,
  type DiscussionDetail as DiscussionDetailItem,
} from "@/services/studentCommunity.service";
import { getApiErrorMessage } from "@/utils/apiError";
import { LoadError, STUDENT_PAGE_CLASS } from "../studentUi";
import { authorAvatar, formatDate } from "./communityHelpers";
import { CreateDiscussionModal } from "./CreateDiscussionModal";
import { ReportContentModal } from "./ReportContentModal";

export function DiscussionDetailView({ discussionId }: { discussionId: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [item, setItem] = useState<DiscussionDetailItem | null>(null);
  const [comment, setComment] = useState("");
  const [commentImageUrl, setCommentImageUrl] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [resubmitOpen, setResubmitOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<
    { kind: "discussion" } | { kind: "comment"; commentId: number } | null
  >(null);
  const [reportReason, setReportReason] = useState("");

  useEffect(() => {
    let cancelled = false;
    setComment("");
    setCommentImageUrl("");
    setLoading(true);
    setError(null);
    studentCommunityService
      .getDiscussion(discussionId)
      .then((data) => {
        if (!cancelled) setItem(data);
      })
      .catch((err) => {
        if (!cancelled) setError(getApiErrorMessage(err, "Failed to load this discussion."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [discussionId, reload]);

  const update = async (action: "upvote" | "bookmark" | "close") => {
    if (!item) return;
    setBusy(true);
    setActionError(null);
    try {
      if (action === "upvote") {
        const result = await studentCommunityService.toggleUpvote(discussionId);
        setItem((current) =>
          current
            ? { ...current, upvoteCount: result.upvoteCount, isUpvoted: result.isUpvoted }
            : current,
        );
      } else if (action === "bookmark") {
        const result = await studentCommunityService.toggleBookmark(discussionId);
        setItem((current) =>
          current ? { ...current, isBookmarked: result.isBookmarked } : current,
        );
      } else {
        const result = await studentCommunityService.setClosed(discussionId, !item.isClosed);
        setItem((current) =>
          current
            ? { ...current, isClosed: result.isClosed, status: result.isClosed ? "CLOSED" : "OPEN" }
            : current,
        );
      }
    } catch (err) {
      setActionError(getApiErrorMessage(err, "Could not update this discussion."));
    } finally {
      setBusy(false);
    }
  };

  const postComment = async (event: FormEvent) => {
    event.preventDefault();
    if (!comment.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      const created = await studentCommunityService.addComment(discussionId, {
        content: comment.trim(),
        isAnonymous: anonymous,
        imageUrl: commentImageUrl || null,
      });
      setItem((current) =>
        current
          ? {
              ...current,
              comments: [...(current.comments ?? []), created],
              commentCount: current.commentCount + 1,
            }
          : current,
      );
      setComment("");
      setCommentImageUrl("");
    } catch (err) {
      setActionError(getApiErrorMessage(err, "Could not post your comment."));
    } finally {
      setBusy(false);
    }
  };

  const submitReport = async (event: FormEvent) => {
    event.preventDefault();
    if (!reportTarget || reportReason.trim().length < 5) return;
    setBusy(true);
    try {
      if (reportTarget.kind === "discussion") {
        await studentCommunityService.reportDiscussion(discussionId, reportReason.trim());
      } else {
        await studentCommunityService.reportComment(
          discussionId,
          reportTarget.commentId,
          reportReason.trim(),
        );
      }
      toast.success("Report submitted to Admin.");
      setReportTarget(null);
      setReportReason("");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not submit report."));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className={`${STUDENT_PAGE_CLASS}`}>
        <div className="card p-8 text-sm text-content-subtle">Loading discussion…</div>
      </div>
    );
  }

  if (error || !item) {
    const validId = /^\d+$/.test(discussionId) && Number(discussionId) > 0;
    const notFound = !validId || /not found|invalid request parameter/i.test(error ?? "");
    return (
      <div className={`${STUDENT_PAGE_CLASS} space-y-4`}>
        <Button variant="ghost" onClick={() => navigate(ROUTES.studentDiscussions)}>
          ← Community
        </Button>
        {notFound ? (
          <div className="card p-8 text-center">
            <h1 className="font-semibold text-content">Discussion not found</h1>
            <p className="mt-2 text-sm text-content-subtle">
              It may have been removed or the link may be incorrect.
            </p>
            <Button className="mt-4" onClick={() => navigate(ROUTES.studentDiscussions)}>
              Back to Community
            </Button>
          </div>
        ) : (
          <LoadError
            message={error ?? "Failed to load this discussion."}
            onRetry={() => setReload((value) => value + 1)}
          />
        )}
      </div>
    );
  }

  const approved = item.approvalStatus === "APPROVED" && item.status !== "HIDDEN";
  const visibleComments = (item.comments ?? []).filter((reply) => reply.status !== "HIDDEN");

  return (
    <div className={`${STUDENT_PAGE_CLASS} space-y-5`}>
      <Button variant="ghost" onClick={() => navigate(ROUTES.studentDiscussions)}>
        ← Community
      </Button>
      <article className="card space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={
              item.tag === "tip" ? "success" : item.tag === "announcement" ? "warning" : "info"
            }
          >
            {item.tag === "tip" ? "Tip" : item.tag === "announcement" ? "Announcement" : "Question"}
          </Badge>
          {item.status === "HIDDEN" ? (
            <Badge variant="danger">Hidden</Badge>
          ) : (
            <>
              {item.approvalStatus === "PENDING" && (
                <Badge variant="warning">Pending approval</Badge>
              )}
              {item.approvalStatus === "APPROVED" && <Badge variant="success">Approved</Badge>}
              {item.approvalStatus === "REJECTED" && <Badge variant="danger">Rejected</Badge>}
            </>
          )}
          {item.isPinned && <Badge variant="warning">Pinned</Badge>}
          {item.isClosed && <Badge>Closed</Badge>}
        </div>
        {item.approvalStatus === "PENDING" && item.status !== "HIDDEN" && (
          <Alert
            type="info"
            message="This post is waiting for an admin to approve it. It is not visible to other students yet."
          />
        )}
        {item.approvalStatus === "REJECTED" && item.rejectionReason && (
          <div className="space-y-3">
            <Alert type="error" message={`This post was not approved: ${item.rejectionReason}`} />
            {item.isAuthor && (
              <Button size="sm" onClick={() => setResubmitOpen(true)}>
                Edit & resubmit
              </Button>
            )}
          </div>
        )}
        <h1 className="text-2xl font-bold text-content">{item.title}</h1>
        <div className="flex items-center gap-3">
          <Avatar name={item.author.displayName} src={authorAvatar(item.author)} size="md" />
          <p className="text-sm text-content-subtle">
            {item.author.displayName} · {formatDate(item.createdAt)}
          </p>
        </div>
        <div className="whitespace-pre-wrap border-t border-line pt-4 text-sm leading-6 text-content-secondary">
          {item.content}
        </div>
        {item.imageUrl && (
          <ImageViewer
            src={item.imageUrl}
            alt="Discussion attachment"
            imageClassName="max-h-[28rem]"
          />
        )}
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          {approved && (
            <>
              <Button
                size="sm"
                variant={item.isUpvoted ? "primary" : "outline"}
                disabled={busy}
                icon={
                  <Icon.Star
                    className={`h-4 w-4 ${item.isUpvoted ? "fill-current" : "fill-none"}`}
                  />
                }
                onClick={() => update("upvote")}
              >
                {item.isUpvoted ? "Upvoted" : "Upvote"} · {item.upvoteCount}
              </Button>
              <Button
                size="sm"
                variant={item.isBookmarked ? "primary" : "outline"}
                disabled={busy}
                icon={<Icon.Book className="h-4 w-4" />}
                onClick={() => update("bookmark")}
              >
                {item.isBookmarked ? "Saved" : "Save"}
              </Button>
              {item.isAuthor && item.status !== "HIDDEN" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  icon={<Icon.Lock className="h-4 w-4" />}
                  onClick={() => update("close")}
                >
                  {item.isClosed ? "Reopen discussion" : "Close discussion"}
                </Button>
              )}
              {!item.isAuthor && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setReportTarget({ kind: "discussion" });
                    setReportReason("");
                  }}
                >
                  Report
                </Button>
              )}
            </>
          )}
        </div>
      </article>

      <section className="card p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-content">
          Replies{" "}
          <span className="text-sm font-normal text-content-subtle">
            ({visibleComments.length})
          </span>
        </h2>
        <div className="mt-4 divide-y divide-line">
          {visibleComments.map((reply) => (
            <article key={reply.commentId} className="flex gap-3 py-4 first:pt-0 last:pb-0">
              <Avatar
                name={reply.author.displayName}
                src={authorAvatar(reply.author, reply.isAnonymous)}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs text-content-subtle">
                    {reply.author.displayName} · {formatDate(reply.createdAt)}
                  </p>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-content-secondary">
                  {reply.content}
                </p>
                {reply.imageUrl && (
                  <ImageViewer
                    src={reply.imageUrl}
                    alt="Reply attachment"
                    className="mt-3"
                    imageClassName="max-h-64"
                  />
                )}
                {approved && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        setReportTarget({ kind: "comment", commentId: reply.commentId });
                        setReportReason("");
                      }}
                    >
                      Report
                    </Button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
        {visibleComments.length === 0 && (
          <p className="py-4 text-sm text-content-subtle">No replies yet.</p>
        )}
        {!approved ? (
          <p className="mt-4 rounded-lg bg-surface-muted p-3 text-sm text-content-soft">
            {item.status === "HIDDEN"
              ? "This post is hidden and cannot receive replies or reactions."
              : "Replies and reactions are available after an admin approves this post."}
          </p>
        ) : item.isClosed ? (
          <p className="mt-4 rounded-lg bg-surface-muted p-3 text-sm text-content-soft">
            This discussion is closed to new replies.
          </p>
        ) : (
          <form onSubmit={postComment} className="mt-5 space-y-3 border-t border-line pt-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-content-secondary">
              Add a reply
              <textarea
                required
                maxLength={10000}
                rows={3}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                className="w-full rounded-[10px] border border-line bg-surface p-3 text-sm text-content focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
                placeholder="Write a helpful reply…"
              />
            </label>
            <DiscussionImageAttachment
              imageUrl={commentImageUrl}
              onChange={setCommentImageUrl}
              label="Attach image to reply"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Checkbox checked={anonymous} onChange={setAnonymous} label="Reply anonymously" />
              <Button type="submit" disabled={busy || !comment.trim()} loading={busy}>
                Post reply
              </Button>
            </div>
          </form>
        )}
        {actionError && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {actionError}
          </p>
        )}
      </section>

      <CreateDiscussionModal
        open={resubmitOpen}
        defaultTag={item.tag === "tip" ? "tip" : "question"}
        initialItem={item}
        onClose={() => setResubmitOpen(false)}
        onCreated={() => {
          setResubmitOpen(false);
          toast.success("Post resubmitted for admin approval.");
          setReload((value) => value + 1);
        }}
      />

      <ReportContentModal
        open={!!reportTarget}
        busy={busy}
        reason={reportReason}
        onReasonChange={setReportReason}
        onClose={() => setReportTarget(null)}
        onSubmit={submitReport}
      />
    </div>
  );
}
