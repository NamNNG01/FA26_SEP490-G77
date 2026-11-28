import React from "react";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { ImageViewer } from "@/components/common/ImageViewer";
import { Pagination } from "@/components/ui/Pagination";
import { SearchInput } from "@/components/common/SearchInput";
import { Select } from "@/components/ui/Select";
import { Icon } from "@/assets/icons";
import type {
  ManagerDiscussionStatus,
  ManagerPostStatus,
} from "@/services/managerDiscussion.service";
import type { DiscussionItem, DiscussionTag } from "@/services/studentCommunity.service";
import {
  APPROVAL_OPTIONS,
  approvalLabel,
  dateLabel,
  IMAGE_FILTER_OPTIONS,
  PAGE_SIZE,
  POST_STATUS_OPTIONS,
  SORT_OPTIONS,
  TAG_OPTIONS,
  tagLabel,
} from "./discussionHelpers";

interface DiscussionPostsTabProps {
  approvalStatus: ManagerDiscussionStatus;
  onApprovalChange: (v: ManagerDiscussionStatus) => void;
  postStatus: ManagerPostStatus;
  onPostStatusChange: (v: ManagerPostStatus) => void;
  tagFilter: DiscussionTag | "ALL";
  onTagChange: (v: DiscussionTag | "ALL") => void;
  imageFilter: "ALL" | "WITH_IMAGE" | "NO_IMAGE";
  onImageFilterChange: (v: "ALL" | "WITH_IMAGE" | "NO_IMAGE") => void;
  sortOrder: "oldest" | "latest";
  onSortChange: (v: "oldest" | "latest") => void;
  search: string;
  onSearchChange: (v: string) => void;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  busy: boolean;
  onBulkApprove: () => void;
  onOpenBulkReject: () => void;
  total: number;
  page: number;
  onPageChange: (p: number) => void;
  items: DiscussionItem[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onOpenDetail: (item: DiscussionItem) => void;
}

export function DiscussionPostsTab({
  approvalStatus,
  onApprovalChange,
  postStatus,
  onPostStatusChange,
  tagFilter,
  onTagChange,
  imageFilter,
  onImageFilterChange,
  sortOrder,
  onSortChange,
  search,
  onSearchChange,
  selectedIds,
  onToggleSelect,
  busy,
  onBulkApprove,
  onOpenBulkReject,
  total,
  page,
  onPageChange,
  items,
  loading,
  error,
  onRefresh,
  onOpenDetail,
}: DiscussionPostsTabProps) {
  return (
    <>
      <section className="card space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Select
            label="Approval"
            value={approvalStatus}
            options={APPROVAL_OPTIONS}
            onChange={(value) => onApprovalChange(value as ManagerDiscussionStatus)}
          />
          <Select
            label="Post status"
            value={postStatus}
            options={POST_STATUS_OPTIONS}
            onChange={(value) => onPostStatusChange(value as ManagerPostStatus)}
          />
          <Select
            label="Tag"
            value={tagFilter}
            options={TAG_OPTIONS}
            onChange={(value) => onTagChange(value as DiscussionTag | "ALL")}
          />
          <Select
            label="Attachment"
            value={imageFilter}
            options={IMAGE_FILTER_OPTIONS}
            onChange={(value) => onImageFilterChange(value as "ALL" | "WITH_IMAGE" | "NO_IMAGE")}
          />
          <Select
            label="Queue order"
            value={sortOrder}
            options={SORT_OPTIONS}
            onChange={(value) => onSortChange(value as "oldest" | "latest")}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <div className="min-w-0 flex-1 sm:max-w-md">
            <SearchInput
              className="w-full"
              aria-label="Search discussions"
              placeholder="Search posts…"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </div>
          <div className="flex items-center gap-3 text-sm text-content-subtle">
            {selectedIds.size > 0 && (
              <>
                <span className="font-medium text-content">{selectedIds.size} selected</span>
                <Button size="sm" onClick={onBulkApprove} disabled={busy}>
                  Bulk approve
                </Button>
                <Button size="sm" variant="danger" onClick={onOpenBulkReject} disabled={busy}>
                  Bulk reject
                </Button>
              </>
            )}
            <span>
              {total} {total === 1 ? "post" : "posts"}
            </span>
            <Button
              size="sm"
              variant="ghost"
              icon={<Icon.RefreshCw className="h-4 w-4" />}
              onClick={onRefresh}
            >
              Refresh
            </Button>
          </div>
        </div>
      </section>

      {error ? (
        <Alert type="error" message={error} />
      ) : loading ? (
        <div className="card p-8 text-center text-sm text-content-subtle">
          Loading discussions…
        </div>
      ) : items.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="font-medium text-content">No discussions match these filters</p>
          <p className="mt-1 text-sm text-content-subtle">
            Try a different status or search term.
          </p>
        </div>
      ) : (
        <section className="space-y-3">
          {items.map((item) => (
            <article
              key={item.discussionId}
              className="card p-4 transition-colors hover:border-brand-300 hover:bg-surface-hover"
            >
              <div className="flex flex-wrap items-start gap-4">
                {item.approvalStatus === "PENDING" && (
                  <div className="pt-1">
                    <Checkbox
                      checked={selectedIds.has(item.discussionId)}
                      onChange={() => onToggleSelect(item.discussionId)}
                      aria-label={`Select ${item.title}`}
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => onOpenDetail(item)}
                  className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {item.status === "HIDDEN" ? (
                      <Badge variant="danger">Hidden</Badge>
                    ) : (
                      <Badge
                        variant={
                          item.approvalStatus === "PENDING"
                            ? "warning"
                            : item.approvalStatus === "REJECTED"
                              ? "danger"
                              : "success"
                        }
                      >
                        {approvalLabel(item.approvalStatus)}
                      </Badge>
                    )}
                    <Badge>{tagLabel(item.tag)}</Badge>
                    {item.isPinned && <Badge variant="warning">Pinned</Badge>}
                    {item.isClosed && <Badge>Closed</Badge>}
                  </div>
                  <h2 className="font-semibold text-content">{item.title}</h2>
                  <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-content-secondary">
                    {item.excerpt}
                  </p>
                  <p className="mt-3 text-xs text-content-subtle">
                    {item.author.displayName} · {dateLabel(item.createdAt)} · {item.commentCount}{" "}
                    replies
                  </p>
                </button>
                {item.imageUrl && (
                  <ImageViewer
                    src={item.imageUrl}
                    alt="Discussion attachment"
                    imageClassName="max-h-28"
                  />
                )}
                <button
                  type="button"
                  onClick={() => onOpenDetail(item)}
                  className="mt-1 shrink-0 rounded-md p-1 text-content-subtle hover:bg-surface-muted"
                  aria-label={`Review ${item.title}`}
                >
                  <Icon.ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </article>
          ))}
          <div className="card">
            <Pagination
              page={page + 1}
              total={total}
              perPage={PAGE_SIZE}
              onChange={(value) => onPageChange(value - 1)}
              unit="posts"
            />
          </div>
        </section>
      )}
    </>
  );
}
