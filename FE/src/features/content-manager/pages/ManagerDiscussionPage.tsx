import React from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { Icon } from "@/assets/icons";
import { useManagerDiscussion } from "../hooks/useManagerDiscussion";
import { DiscussionPostsTab } from "../components/discussion/DiscussionPostsTab";
import { DiscussionReportsTab } from "../components/discussion/DiscussionReportsTab";
import { DiscussionDetailModal } from "../components/discussion/DiscussionDetailModal";
import { CreateManagerDiscussionModal } from "../components/discussion/CreateManagerDiscussionModal";
import { DiscussionActionModals } from "../components/discussion/DiscussionActionModals";

export function ManagerDiscussionPage() {
  const mod = useManagerDiscussion();

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6 p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content">Community Moderation</h1>
          <p className="mt-1 text-sm text-content-subtle">
            Admin moderation queue, violation reports, and official announcements.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {mod.summary && (
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="warning">{mod.summary.pendingDiscussionsCount} pending posts</Badge>
              <Badge variant={mod.summary.pendingReportsCount > 0 ? "danger" : "default"}>
                {mod.summary.pendingReportsCount} pending reports
              </Badge>
            </div>
          )}
          <Button icon={<Icon.Plus className="h-4 w-4" />} onClick={() => mod.setCreateOpen(true)}>
            Create announcement
          </Button>
        </div>
      </header>

      <Tabs
        tabs={["Posts", "Reports"]}
        active={mod.activeTab}
        onChange={(value) => mod.setActiveTab(value as "Posts" | "Reports")}
        variant="underline"
      />

      {mod.activeTab === "Posts" ? (
        <DiscussionPostsTab
          approvalStatus={mod.approvalStatus}
          onApprovalChange={(v) => {
            mod.setApprovalStatus(v);
            mod.setPage(0);
          }}
          postStatus={mod.postStatus}
          onPostStatusChange={(v) => {
            mod.setPostStatus(v);
            mod.setPage(0);
          }}
          tagFilter={mod.tagFilter}
          onTagChange={(v) => {
            mod.setTagFilter(v);
            mod.setPage(0);
          }}
          imageFilter={mod.imageFilter}
          onImageFilterChange={(v) => {
            mod.setImageFilter(v);
            mod.setPage(0);
          }}
          sortOrder={mod.sortOrder}
          onSortChange={(v) => {
            mod.setSortOrder(v);
            mod.setPage(0);
          }}
          search={mod.search}
          onSearchChange={mod.setSearch}
          selectedIds={mod.selectedIds}
          onToggleSelect={mod.toggleSelect}
          busy={mod.busy}
          onBulkApprove={() => void mod.handleBulkApprove()}
          onOpenBulkReject={() => mod.setBulkRejectOpen(true)}
          total={mod.total}
          page={mod.page}
          onPageChange={mod.setPage}
          items={mod.items}
          loading={mod.loading}
          error={mod.error}
          onRefresh={mod.triggerReload}
          onOpenDetail={(item) => void mod.openDetail(item)}
        />
      ) : (
        <DiscussionReportsTab
          reportStatus={mod.reportStatus}
          onReportStatusChange={(v) => {
            mod.setReportStatus(v);
            mod.setReportPage(0);
          }}
          reports={mod.reports}
          reportTotal={mod.reportTotal}
          reportPage={mod.reportPage}
          onReportPageChange={mod.setReportPage}
          loading={mod.reportLoading}
          busy={mod.busy}
          onRefresh={mod.triggerReload}
          onMuteAuthor={mod.setMuteTarget}
          onResolveReport={(reportId, action) => void mod.handleResolveReport(reportId, action)}
        />
      )}

      <DiscussionDetailModal
        detail={mod.detail}
        detailLoading={mod.detailLoading}
        busy={mod.busy}
        rejecting={mod.rejecting}
        rejectReason={mod.rejectReason}
        templates={mod.templates}
        hidingCommentId={mod.hidingCommentId}
        moderationReason={mod.moderationReason}
        onClose={() => mod.setDetail(null)}
        onMuteUser={mod.setMuteTarget}
        onTogglePin={mod.togglePin}
        onStartReject={() => mod.setRejecting(true)}
        onCancelReject={mod.cancelReject}
        onRejectReasonChange={mod.setRejectReason}
        onConfirmReject={() => void mod.reject()}
        onApprove={mod.approve}
        onHideDiscussion={mod.hideDiscussion}
        onRestoreDiscussion={mod.restoreDiscussion}
        onStartHideComment={(commentId) => {
          mod.setHidingCommentId(commentId);
          mod.setModerationReason("");
        }}
        onCancelHideComment={() => {
          mod.setHidingCommentId(null);
          mod.setModerationReason("");
        }}
        onModerationReasonChange={mod.setModerationReason}
        onHideComment={(comment) => void mod.hideComment(comment)}
        onRestoreComment={(comment) => void mod.restoreComment(comment)}
        onDeleteComment={(commentId) => mod.setDeleteTarget({ kind: "comment", id: commentId })}
      />

      <DiscussionActionModals
        busy={mod.busy}
        templates={mod.templates}
        selectedCount={mod.selectedIds.size}
        bulkRejectOpen={mod.bulkRejectOpen}
        bulkRejectReason={mod.bulkRejectReason}
        onCloseBulkReject={() => mod.setBulkRejectOpen(false)}
        onBulkRejectReasonChange={mod.setBulkRejectReason}
        onConfirmBulkReject={() => void mod.handleBulkReject()}
        muteTarget={mod.muteTarget}
        muteDays={mod.muteDays}
        muteReason={mod.muteReason}
        onCloseMute={() => mod.setMuteTarget(null)}
        onMuteDaysChange={mod.setMuteDays}
        onMuteReasonChange={mod.setMuteReason}
        onSubmitMute={mod.handleMuteUser}
        deleteTarget={mod.deleteTarget}
        onCloseDelete={() => mod.setDeleteTarget(null)}
        onConfirmDelete={() => void mod.confirmDelete()}
      />

      <CreateManagerDiscussionModal
        open={mod.createOpen}
        onClose={() => mod.setCreateOpen(false)}
        onSubmit={mod.submitCreate}
      />
    </div>
  );
}
