import React from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ImageViewer } from "@/components/common/ImageViewer";
import { Icon } from "@/assets/icons";
import type { DiscussionItem } from "@/services/studentCommunity.service";
import { authorAvatar, formatDate } from "./communityHelpers";

export function DiscussionCard({
  item,
  onOpen,
  onUpvote,
  voting,
  showReviewStatus = false,
}: {
  item: DiscussionItem;
  onOpen: () => void;
  onUpvote: () => void;
  voting: boolean;
  showReviewStatus?: boolean;
}) {
  const canReact =
    !showReviewStatus || (item.approvalStatus === "APPROVED" && item.status !== "HIDDEN");

  return (
    <article className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {item.isPinned && <Badge variant="warning">Pinned</Badge>}
            <Badge
              variant={
                item.tag === "tip" ? "success" : item.tag === "announcement" ? "warning" : "info"
              }
            >
              {item.tag === "tip"
                ? "Tip"
                : item.tag === "announcement"
                  ? "Announcement"
                  : "Question"}
            </Badge>
            {showReviewStatus && item.status === "HIDDEN" ? (
              <Badge variant="danger">Hidden</Badge>
            ) : (
              showReviewStatus &&
              item.approvalStatus && (
                <Badge
                  variant={
                    item.approvalStatus === "REJECTED"
                      ? "danger"
                      : item.approvalStatus === "PENDING"
                        ? "warning"
                        : "success"
                  }
                >
                  {item.approvalStatus === "PENDING"
                    ? "Pending approval"
                    : item.approvalStatus === "APPROVED"
                      ? "Approved"
                      : "Rejected"}
                </Badge>
              )
            )}
            {item.isClosed && <Badge variant="default">Closed</Badge>}
          </div>
          <button
            type="button"
            onClick={onOpen}
            className="text-left text-base font-semibold leading-snug text-content hover:text-primary hover:underline"
          >
            {item.title}
          </button>
          <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-content-soft">
            {item.excerpt}
          </p>
          {item.imageUrl && (
            <ImageViewer
              src={item.imageUrl}
              alt="Discussion attachment"
              className="mt-3"
              imageClassName="max-h-52"
            />
          )}
          <div className="mt-3 flex items-center gap-2.5">
            <Avatar name={item.author.displayName} src={authorAvatar(item.author)} size="sm" />
            <p className="text-xs text-content-subtle">
              {item.author.displayName} · {formatDate(item.createdAt)}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onOpen}>
          Open
        </Button>
      </div>
      <div className="mt-4 flex flex-wrap gap-4 border-t border-line pt-3 text-xs text-content-secondary">
        {canReact && (
          <button
            type="button"
            aria-pressed={item.isUpvoted}
            aria-label={`${item.isUpvoted ? "Remove upvote" : "Upvote"} this discussion. ${item.upvoteCount} ${item.upvoteCount === 1 ? "upvote" : "upvotes"}`}
            disabled={voting}
            onClick={onUpvote}
            className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors disabled:cursor-wait disabled:opacity-60 ${item.isUpvoted ? "font-medium text-amber-600 hover:bg-amber-50" : "text-content-secondary hover:bg-surface-hover hover:text-amber-600"}`}
          >
            <Icon.Star className={`h-4 w-4 ${item.isUpvoted ? "fill-current" : "fill-none"}`} />
            {item.upvoteCount} {item.upvoteCount === 1 ? "upvote" : "upvotes"}
          </button>
        )}
        <span className="inline-flex items-center gap-1.5">
          <Icon.Users className="h-4 w-4" />
          {item.commentCount} {item.commentCount === 1 ? "comment" : "comments"}
        </span>
        {item.lastCommentAt && (
          <span className="ml-auto">Last reply {formatDate(item.lastCommentAt)}</span>
        )}
      </div>
    </article>
  );
}
