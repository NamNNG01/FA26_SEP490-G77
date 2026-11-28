import React, { useEffect, useState } from "react";
import { useQuietRefresh } from "@/hooks/useAutoRefresh";
import { useNavigate } from "react-router";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/ToastHost";
import { Icon } from "@/assets/icons";
import { ROUTES } from "@/app/routes";
import {
  studentCommunityService,
  type DiscussionApprovalFilter,
  type DiscussionContentStatus,
  type DiscussionItem,
  type DiscussionSort,
  type DiscussionTag,
} from "@/services/studentCommunity.service";
import { getApiErrorMessage } from "@/utils/apiError";
import { LoadError, PageTitle, STUDENT_PAGE_CLASS } from "../studentUi";
import {
  emptyMessage,
  emptyTitle,
  PAGE_SIZE,
  type CommunityTab,
} from "./communityHelpers";
import { DiscussionCard } from "./DiscussionCard";
import { CreateDiscussionModal } from "./CreateDiscussionModal";

export function DiscussionListView() {
  const navigate = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState<CommunityTab>("Discussions");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<DiscussionSort>("latest");
  const [tagFilter, setTagFilter] = useState<DiscussionTag | "ALL">("ALL");
  const [approvalFilter, setApprovalFilter] = useState<DiscussionApprovalFilter>("ALL");
  const [contentStatusFilter, setContentStatusFilter] = useState<DiscussionContentStatus>("ALL");
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<DiscussionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const takeQuiet = useQuietRefresh(() => setReload((value) => value + 1));
  const [createOpen, setCreateOpen] = useState(false);
  const [votingIds, setVotingIds] = useState<Set<number>>(new Set());
  const [voteError, setVoteError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    const quiet = takeQuiet();
    if (!quiet) {
      setLoading(true);
      setError(null);
    }
    const params = { page, size: PAGE_SIZE };
    const request =
      tab === "Tips"
        ? studentCommunityService.getTips(params)
        : studentCommunityService.getDiscussions(
            tab === "My Discussions"
              ? {
                  ...params,
                  scope: "MINE",
                  tag: tagFilter,
                  approvalStatus: approvalFilter,
                  status: contentStatusFilter,
                  search: debouncedSearch || undefined,
                  sort,
                }
              : {
                  ...params,
                  scope: "PUBLIC",
                  tag: tab === "Announcements" ? "announcement" : "question",
                  search: tab === "Discussions" ? debouncedSearch || undefined : undefined,
                  sort,
                },
          );
    request
      .then((result) => {
        if (cancelled) return;
        setItems(result.content);
        setTotal(result.totalElements);
      })
      .catch((err) => {
        if (!cancelled && !quiet) {
          setError(getApiErrorMessage(err, "Failed to load community posts."));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, debouncedSearch, sort, tagFilter, approvalFilter, contentStatusFilter, page, reload]);

  const chooseTab = (value: string) => {
    setTab(value as CommunityTab);
    setPage(0);
  };

  const hasMyFilters = Boolean(
    debouncedSearch ||
      tagFilter !== "ALL" ||
      approvalFilter !== "ALL" ||
      contentStatusFilter !== "ALL",
  );

  const toggleUpvote = async (discussionId: number) => {
    if (votingIds.has(discussionId)) return;
    setVotingIds((current) => new Set(current).add(discussionId));
    setVoteError(null);
    try {
      const result = await studentCommunityService.toggleUpvote(discussionId);
      setItems((current) =>
        current.map((item) =>
          item.discussionId === discussionId
            ? { ...item, upvoteCount: result.upvoteCount, isUpvoted: result.isUpvoted }
            : item,
        ),
      );
    } catch (err) {
      setVoteError(getApiErrorMessage(err, "Could not update this upvote."));
    } finally {
      setVotingIds((current) => {
        const next = new Set(current);
        next.delete(discussionId);
        return next;
      });
    }
  };

  return (
    <div className={`${STUDENT_PAGE_CLASS} space-y-6`}>
      <PageTitle
        title="Community"
        subtitle="Ask questions, share tips, and learn with the community."
        action={
          tab !== "Announcements" ? (
            <Button icon={<Icon.Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
              Create post
            </Button>
          ) : undefined
        }
      />
      <Tabs
        tabs={["Discussions", "My Discussions", "Tips", "Announcements"]}
        active={tab}
        onChange={chooseTab}
        variant="underline"
      />
      {(tab === "Discussions" || tab === "My Discussions") && (
        <div className="card flex flex-wrap items-center gap-3 p-4">
          <Input
            className="w-full sm:w-72"
            aria-label={tab === "My Discussions" ? "Search my discussions" : "Search discussions"}
            placeholder={tab === "My Discussions" ? "Search my posts…" : "Search discussions…"}
            maxLength={100}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
          {tab === "My Discussions" && (
            <>
              <Select
                aria-label="Filter by tag"
                className="w-full sm:w-48"
                value={tagFilter}
                options={[
                  { label: "All tags", value: "ALL" },
                  { label: "Questions", value: "question" },
                  { label: "Tips", value: "tip" },
                  { label: "Announcements", value: "announcement" },
                ]}
                onChange={(value) => {
                  setTagFilter(value as DiscussionTag | "ALL");
                  setPage(0);
                }}
              />
              <Select
                aria-label="Filter by review status"
                className="w-full sm:w-52"
                value={approvalFilter}
                options={[
                  { label: "All review statuses", value: "ALL" },
                  { label: "Pending approval", value: "PENDING" },
                  { label: "Approved", value: "APPROVED" },
                  { label: "Rejected", value: "REJECTED" },
                ]}
                onChange={(value) => {
                  setApprovalFilter(value as DiscussionApprovalFilter);
                  setPage(0);
                }}
              />
              <Select
                aria-label="Filter by post status"
                className="w-full sm:w-48"
                value={contentStatusFilter}
                options={[
                  { label: "All post statuses", value: "ALL" },
                  { label: "Open", value: "OPEN" },
                  { label: "Closed", value: "CLOSED" },
                  { label: "Hidden", value: "HIDDEN" },
                ]}
                onChange={(value) => {
                  setContentStatusFilter(value as DiscussionContentStatus);
                  setPage(0);
                }}
              />
            </>
          )}
          <Select
            aria-label="Sort discussions"
            className="w-full sm:w-52"
            value={sort}
            options={[
              { label: "Latest", value: "latest" },
              { label: "Most commented", value: "mostCommented" },
              { label: "Most upvoted", value: "mostUpvoted" },
            ]}
            onChange={(value) => {
              setSort(value as DiscussionSort);
              setPage(0);
            }}
          />
        </div>
      )}
      {error ? (
        <LoadError message={error} onRetry={() => setReload((value) => value + 1)} />
      ) : loading ? (
        <div className="card p-8 text-sm text-content-subtle">Loading posts…</div>
      ) : items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={
              tab === "Tips" ? (
                <Icon.Lightbulb className="h-7 w-7" />
              ) : tab === "Announcements" ? (
                <Icon.Bell className="h-7 w-7" />
              ) : (
                <Icon.Book className="h-7 w-7" />
              )
            }
            title={emptyTitle(tab, hasMyFilters)}
            message={emptyMessage(tab, hasMyFilters)}
            action={
              tab !== "Announcements" && !(tab === "My Discussions" && hasMyFilters) ? (
                <Button onClick={() => setCreateOpen(true)}>Create post</Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {voteError && <Alert type="error" message={voteError} />}
          {items.map((item) => (
            <DiscussionCard
              key={item.discussionId}
              item={item}
              showReviewStatus={tab === "My Discussions"}
              voting={votingIds.has(item.discussionId)}
              onUpvote={() => void toggleUpvote(item.discussionId)}
              onOpen={() => navigate(`${ROUTES.studentDiscussions}/${item.discussionId}`)}
            />
          ))}
          <div className="card">
            <Pagination
              page={page + 1}
              total={total}
              perPage={PAGE_SIZE}
              onChange={(value) => setPage(value - 1)}
              unit={tab.toLowerCase()}
            />
          </div>
        </div>
      )}
      <CreateDiscussionModal
        open={createOpen}
        defaultTag={tab === "Tips" ? "tip" : "question"}
        onClose={() => setCreateOpen(false)}
        onCreated={(item) => {
          setCreateOpen(false);
          toast.info(
            item.approvalStatus === "APPROVED"
              ? "Your post is now live in the community."
              : "Your post was submitted and is waiting for an admin to approve it before it becomes public.",
          );
          navigate(`${ROUTES.studentDiscussions}/${item.discussionId}`);
        }}
      />
    </div>
  );
}
